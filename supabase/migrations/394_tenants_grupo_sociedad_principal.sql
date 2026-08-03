-- TIDEO ERP - Alta de tenants como grupos y sociedad principal obligatoria.

alter table public.sociedades
  add column if not exists es_principal boolean not null default false;

create unique index if not exists sociedades_una_principal_por_tenant
  on public.sociedades (empresa_id)
  where es_principal = true;

comment on column public.sociedades.es_principal is
  'Identifica la sociedad principal del tenant. Solo puede existir una por empresa_id.';

create or replace function public.normalizar_slug_tideo(
  p_valor text,
  p_maximo integer default 20,
  p_quitar_sufijo_legal boolean default false
)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_slug text;
begin
  v_slug := lower(translate(
    coalesce(p_valor, ''),
    'ÁÉÍÓÚÜÑáéíóúüñ',
    'AEIOUUNaeiouun'
  ));
  v_slug := trim(both '-' from regexp_replace(v_slug, '[^a-z0-9]+', '-', 'g'));

  if p_quitar_sufijo_legal then
    v_slug := regexp_replace(
      v_slug,
      '-(s-a-c|sac|s-a|sa|s-r-l|srl|e-i-r-l|eirl)$',
      ''
    );
  end if;

  v_slug := rtrim(substr(v_slug, 1, greatest(coalesce(p_maximo, 20), 1)), '-');
  return nullif(v_slug, '');
end;
$$;

create or replace function public.generar_codigo_tenant(p_nombre_grupo text)
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v_slug text := coalesce(public.normalizar_slug_tideo(p_nombre_grupo, 20, false), 'grupo');
  v_codigo text;
begin
  loop
    v_codigo := 'grp_' || v_slug || '_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
    exit when not exists (select 1 from public.empresas where id = v_codigo);
  end loop;
  return v_codigo;
end;
$$;

create or replace function public.generar_codigo_sociedad_unico(
  p_empresa_id text,
  p_nombre text
)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_base text := coalesce(public.normalizar_slug_tideo(p_nombre, 30, true), 'sociedad');
  v_codigo text := v_base;
  v_sufijo integer := 2;
begin
  while exists (
    select 1
    from public.sociedades
    where empresa_id = p_empresa_id
      and codigo = v_codigo
  ) loop
    v_codigo := v_base || '-' || v_sufijo::text;
    v_sufijo := v_sufijo + 1;
  end loop;

  return v_codigo;
end;
$$;

create or replace function public.preparar_multisociedad_empresa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_sociedades integer;
  v_sociedades_activas integer;
  v_nombre_sociedad text;
  v_codigo_sociedad text;
begin
  if new.multisociedad_habilitado = true
     and (tg_op = 'INSERT' or old.multisociedad_habilitado is distinct from true) then
    select count(*), count(*) filter (where activa = true)
      into v_total_sociedades, v_sociedades_activas
    from public.sociedades
    where empresa_id = new.id;

    if tg_op = 'UPDATE' and v_total_sociedades = 0 then
      v_nombre_sociedad := coalesce(
        nullif(trim(new.nombre_comercial), ''),
        nullif(trim(new.razon_social), ''),
        new.id
      );
      v_codigo_sociedad := public.generar_codigo_sociedad_unico(new.id, v_nombre_sociedad);

      insert into public.sociedades (
        empresa_id, codigo, nombre, razon_social, ruc, activa, es_principal
      ) values (
        new.id,
        v_codigo_sociedad,
        v_nombre_sociedad,
        new.razon_social,
        new.ruc,
        true,
        true
      );
      v_sociedades_activas := 1;
    end if;

    if tg_op = 'UPDATE' and v_sociedades_activas = 0 then
      raise exception 'No se puede activar multisociedad: el tenant debe tener al menos una sociedad activa.';
    end if;
  end if;

  if new.multisociedad_habilitado = true
     and new.estado in ('activa', 'demo')
     and not exists (
       select 1 from public.sociedades
       where empresa_id = new.id and activa = true
     ) then
    raise exception 'No se puede activar el tenant: debe tener al menos una sociedad activa.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_empresas_preparar_multisociedad on public.empresas;
create trigger trg_empresas_preparar_multisociedad
  before insert or update of multisociedad_habilitado, estado
  on public.empresas
  for each row execute function public.preparar_multisociedad_empresa();

create or replace function public.impedir_ultima_sociedad_activa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id text := old.empresa_id;
  v_deja_de_ser_activa boolean;
begin
  v_deja_de_ser_activa := old.activa = true and (
    tg_op = 'DELETE'
    or new.activa = false
    or new.empresa_id is distinct from old.empresa_id
  );

  if v_deja_de_ser_activa
     and exists (
       select 1 from public.empresas
       where id = v_empresa_id and multisociedad_habilitado = true
     )
     and not exists (
       select 1 from public.sociedades
       where empresa_id = v_empresa_id
         and activa = true
         and id <> old.id
     ) then
    raise exception 'No se puede desactivar ni eliminar la última sociedad activa del tenant.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sociedades_impedir_ultima_activa on public.sociedades;
create trigger trg_sociedades_impedir_ultima_activa
  before update of activa, empresa_id or delete
  on public.sociedades
  for each row execute function public.impedir_ultima_sociedad_activa();

create or replace function public.activar_multisociedad_legacy(p_empresa_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa public.empresas%rowtype;
  v_sociedades_antes integer;
  v_principal public.sociedades%rowtype;
begin
  if not public.usuario_es_superadmin_plataforma() then
    raise exception 'Solo Superadmin TIDEO puede activar multisociedad.';
  end if;

  select * into v_empresa
  from public.empresas
  where id = p_empresa_id
  for update;

  if not found then
    raise exception 'Tenant no encontrado: %', p_empresa_id;
  end if;

  select count(*) into v_sociedades_antes
  from public.sociedades
  where empresa_id = p_empresa_id;

  update public.empresas
  set multisociedad_habilitado = true,
      updated_at = now()
  where id = p_empresa_id;

  select * into v_principal
  from public.sociedades
  where empresa_id = p_empresa_id
  order by es_principal desc, created_at, id
  limit 1;

  return jsonb_build_object(
    'empresa_id', p_empresa_id,
    'multisociedad_habilitado', true,
    'sociedad_autocreada', v_sociedades_antes = 0,
    'sociedad_id', v_principal.id,
    'sociedad_codigo', v_principal.codigo
  );
end;
$$;

-- Reemplaza la firma legacy, cuyo ID se derivaba del RUC.
drop function if exists public.crear_tenant_con_admin(
  text, text, text, text, text, text, text, text, text
);

create function public.crear_tenant_con_admin(
  p_nombre_grupo text,
  p_codigo_tenant text default null,
  p_nombre_comercial text default null,
  p_pais text default 'PE',
  p_moneda_base text default 'PEN',
  p_zona_horaria text default 'America/Lima',
  p_estado text default 'activa',
  p_admin_email text default null,
  p_admin_nombre text default 'Administrador del tenant'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id text;
  v_rol_id text;
  v_user_id uuid;
  v_estado_solicitado text;
begin
  if not public.usuario_es_superadmin_plataforma() then
    raise exception 'Solo Superadmin TIDEO puede crear tenants.';
  end if;

  if nullif(trim(p_nombre_grupo), '') is null then
    raise exception 'El nombre del grupo es obligatorio.';
  end if;

  v_estado_solicitado := case lower(coalesce(p_estado, 'activa'))
    when 'activo' then 'activa'
    when 'activa' then 'activa'
    when 'en prueba' then 'demo'
    when 'demo' then 'demo'
    when 'suspendido' then 'suspendida'
    when 'suspendida' then 'suspendida'
    else 'activa'
  end;

  v_empresa_id := coalesce(
    nullif(trim(p_codigo_tenant), ''),
    public.generar_codigo_tenant(p_nombre_grupo)
  );

  if v_empresa_id !~ '^grp_[a-z0-9-]{1,20}_[a-z0-9]{6}$' then
    raise exception 'Código de tenant inválido. Debe usar el formato grp_{slug}_{hash6}.';
  end if;

  if exists (select 1 from public.empresas where id = v_empresa_id) then
    raise exception using
      errcode = '23505',
      message = 'El código de tenant generado ya existe; genera uno nuevo.';
  end if;

  insert into public.empresas (
    id, razon_social, nombre_comercial, ruc, pais, moneda_base,
    zona_horaria, plan_id, estado, multisociedad_habilitado
  ) values (
    v_empresa_id,
    trim(p_nombre_grupo),
    coalesce(nullif(trim(p_nombre_comercial), ''), trim(p_nombre_grupo)),
    null,
    coalesce(nullif(trim(p_pais), ''), 'PE'),
    coalesce(nullif(trim(p_moneda_base), ''), 'PEN'),
    coalesce(nullif(trim(p_zona_horaria), ''), 'America/Lima'),
    null,
    'suspendida',
    true
  );

  insert into public.niveles_jerarquicos (id, empresa_id, codigo, nombre, alcance, orden)
  values
    ('nj_' || v_empresa_id || '_direccion',  v_empresa_id, 'direccion',  'Dirección / gerencia',     'tenant', 10),
    ('nj_' || v_empresa_id || '_jefatura',   v_empresa_id, 'jefatura',   'Jefatura',                 'equipo', 20),
    ('nj_' || v_empresa_id || '_supervisor', v_empresa_id, 'supervisor', 'Supervisor / coordinador', 'equipo', 30),
    ('nj_' || v_empresa_id || '_asesor',     v_empresa_id, 'asesor',     'Asesor / analista',        'propio', 40),
    ('nj_' || v_empresa_id || '_operativo',  v_empresa_id, 'operativo',  'Operativo',                'propio', 50),
    ('nj_' || v_empresa_id || '_soporte',    v_empresa_id, 'soporte',    'Soporte',                  'propio', 60);

  v_rol_id := 'rol_' || v_empresa_id || '_admin';
  insert into public.roles (
    id, empresa_id, nombre, descripcion, categoria,
    es_superadmin, es_admin_empresa, activo
  ) values (
    v_rol_id, v_empresa_id,
    coalesce(nullif(trim(p_admin_nombre), ''), 'Administrador del tenant'),
    'Admin Empresa creado desde Plataforma TIDEO',
    'admin', false, true, true
  );
  perform public.asignar_permisos_default_a_rol(v_rol_id, 'admin');

  insert into public.roles (
    id, empresa_id, nombre, descripcion, categoria,
    es_superadmin, es_admin_empresa, activo
  ) values
    ('rol_' || v_empresa_id || '_comercial_jefe',   v_empresa_id, 'Jefe Comercial',       'Responsable del área comercial y CRM',    'comercial',   false, false, true),
    ('rol_' || v_empresa_id || '_comercial_asesor', v_empresa_id, 'Asesor Comercial',     'Gestión de Leads y Cotizaciones',         'comercial',   false, false, true),
    ('rol_' || v_empresa_id || '_ops_jefe',         v_empresa_id, 'Jefe de Operaciones',  'Gestión de Operaciones, OTs y Logística', 'operaciones', false, false, true),
    ('rol_' || v_empresa_id || '_ops_tecnico',      v_empresa_id, 'Técnico Operativo',    'Personal de campo y ejecución',           'operaciones', false, false, true),
    ('rol_' || v_empresa_id || '_finanzas',         v_empresa_id, 'Finanzas y Admin',      'Control de Facturación, Compras y Tesorería', 'finanzas', false, false, true);

  perform public.asignar_permisos_default_a_rol('rol_' || v_empresa_id || '_comercial_jefe', 'comercial_jefe');
  perform public.asignar_permisos_default_a_rol('rol_' || v_empresa_id || '_comercial_asesor', 'comercial_asesor');
  perform public.asignar_permisos_default_a_rol('rol_' || v_empresa_id || '_ops_jefe', 'ops_jefe');
  perform public.asignar_permisos_default_a_rol('rol_' || v_empresa_id || '_ops_tecnico', 'ops_tecnico');
  perform public.asignar_permisos_default_a_rol('rol_' || v_empresa_id || '_finanzas', 'finanzas');

  if nullif(trim(coalesce(p_admin_email, '')), '') is not null then
    select u.id into v_user_id
    from auth.users u
    where lower(u.email) = lower(trim(p_admin_email))
    limit 1;

    if v_user_id is not null then
      insert into public.usuarios_empresas (
        user_id, empresa_id, rol_id, acceso_campo, perfil_campo, estado
      ) values (
        v_user_id, v_empresa_id, v_rol_id, true, 'gerencia', 'activo'
      )
      on conflict (user_id, empresa_id) do update set
        rol_id = excluded.rol_id,
        acceso_campo = excluded.acceso_campo,
        perfil_campo = excluded.perfil_campo,
        estado = 'activo',
        updated_at = now();
    end if;
  end if;

  insert into public.auditoria (
    empresa_id, user_id, modulo, entidad, entidad_id, accion, valor_nuevo
  ) values (
    v_empresa_id, auth.uid(), 'plataforma', 'empresas', v_empresa_id, 'crear_tenant_grupo',
    jsonb_build_object(
      'nombre_grupo', p_nombre_grupo,
      'estado_solicitado', v_estado_solicitado,
      'admin_email', p_admin_email,
      'admin_vinculado', v_user_id is not null
    )
  );

  return jsonb_build_object(
    'empresa_id', v_empresa_id,
    'rol_id', v_rol_id,
    'admin_user_id', v_user_id,
    'admin_vinculado', v_user_id is not null,
    'estado_solicitado', v_estado_solicitado,
    'estado', 'suspendida',
    'multisociedad_habilitado', true
  );
end;
$$;

grant execute on function public.crear_tenant_con_admin(
  text, text, text, text, text, text, text, text, text
) to authenticated;
grant execute on function public.activar_multisociedad_legacy(text) to authenticated;

select pg_notify('pgrst', 'reload schema');
