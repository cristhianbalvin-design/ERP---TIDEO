-- 327 — Catálogo administrable de Niveles Jerárquicos.
--
-- "Nivel jerárquico" (roles.nivel_jerarquico) era un enum fijo de 6 valores
-- resuelto por texto ('direccion','jefatura','supervisor','asesor','operativo',
-- 'soporte') dentro de usuario_alcance_jerarquico() y usuario_puede_ver_usuario()
-- (migración 069). Esta migración lo convierte en un catálogo por tenant con un
-- campo "alcance" explícito (tenant/equipo/propio), para poder crear niveles
-- nuevos (ej. "Practicante") sin tocar SQL. Los 6 valores actuales se siembran
-- con el mismo alcance que ya tenían hardcodeado, así que el comportamiento no
-- cambia para nadie existente.
--
-- Alcance no cubierto a propósito: otras 4 políticas RLS (comisiones personal
-- admin, aprobación jerárquica de hoja de costeo, RLS de posiciones —
-- migraciones 070, 126, 128, 297) siguen comparando el string literal
-- 'jefatura'/'supervisor' para permisos específicos de esas áreas, no solo
-- visibilidad de datos. Un nivel nuevo con alcance 'equipo'/'tenant' tendría el
-- alcance de datos correcto vía este cambio, pero no heredaría automáticamente
-- esos permisos puntuales salvo que se actualicen aparte.

-- ── 1. Tabla del catálogo ─────────────────────────────────────────────────────
create table if not exists public.niveles_jerarquicos (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  codigo text not null,
  nombre text not null,
  alcance text not null default 'propio' check (alcance in ('tenant','equipo','propio')),
  orden integer default 100,
  estado text default 'activo',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (empresa_id, codigo)
);

comment on column public.niveles_jerarquicos.codigo is
  'Slug estable — es el valor que se guarda en roles.nivel_jerarquico. No se edita tras crear el nivel.';
comment on column public.niveles_jerarquicos.alcance is
  'Alcance de datos que otorga este nivel: tenant (ve toda la empresa), equipo (ve a quienes le reportan) o propio (solo lo suyo).';

create index if not exists idx_niveles_jerarquicos_emp on public.niveles_jerarquicos(empresa_id, estado);

alter table public.niveles_jerarquicos enable row level security;
drop policy if exists tenant_niveles_jerarquicos_isolation on public.niveles_jerarquicos;
create policy tenant_niveles_jerarquicos_isolation on public.niveles_jerarquicos
  for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));

-- ── 2. Backfill: los 6 niveles actuales para cada tenant existente ───────────
insert into public.niveles_jerarquicos (id, empresa_id, codigo, nombre, alcance, orden)
select 'nj_' || e.id || '_' || v.codigo, e.id, v.codigo, v.nombre, v.alcance, v.orden
from public.empresas e
cross join (values
  ('direccion',  'Dirección / gerencia',       'tenant', 10),
  ('jefatura',   'Jefatura',                   'equipo', 20),
  ('supervisor', 'Supervisor / coordinador',   'equipo', 30),
  ('asesor',     'Asesor / analista',          'propio', 40),
  ('operativo',  'Operativo',                  'propio', 50),
  ('soporte',    'Soporte',                    'propio', 60)
) as v(codigo, nombre, alcance, orden)
on conflict (empresa_id, codigo) do nothing;

-- ── 3. Seed para tenants nuevos: crear_tenant_con_admin ──────────────────────
create or replace function public.crear_tenant_con_admin(
  p_razon_social text,
  p_nombre_comercial text default null,
  p_ruc text default null,
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
  v_estado text;
begin
  if not public.usuario_es_superadmin_plataforma() then
    raise exception 'Solo Superadmin TIDEO puede crear tenants.';
  end if;

  if nullif(trim(p_razon_social), '') is null then
    raise exception 'La razon social es obligatoria.';
  end if;

  v_estado := case lower(coalesce(p_estado, 'activa'))
    when 'activo' then 'activa'
    when 'activa' then 'activa'
    when 'en prueba' then 'demo'
    when 'demo' then 'demo'
    when 'suspendido' then 'suspendida'
    when 'suspendida' then 'suspendida'
    else 'activa'
  end;

  v_empresa_id := 'emp_' || lower(substr(regexp_replace(coalesce(nullif(p_ruc, ''), p_razon_social), '[^a-zA-Z0-9]+', '', 'g'), 1, 18));
  if v_empresa_id = 'emp_' then
    v_empresa_id := 'emp_' || substr(md5(p_razon_social || clock_timestamp()::text), 1, 10);
  end if;

  while exists (select 1 from public.empresas where id = v_empresa_id) loop
    v_empresa_id := 'emp_' || substr(md5(p_razon_social || clock_timestamp()::text), 1, 10);
  end loop;

  insert into public.empresas (
    id, razon_social, nombre_comercial, ruc, pais, moneda_base, zona_horaria, plan_id, estado
  )
  values (
    v_empresa_id,
    trim(p_razon_social),
    coalesce(nullif(trim(p_nombre_comercial), ''), trim(p_razon_social)),
    nullif(trim(coalesce(p_ruc, '')), ''),
    coalesce(nullif(trim(p_pais), ''), 'PE'),
    coalesce(nullif(trim(p_moneda_base), ''), 'PEN'),
    coalesce(nullif(trim(p_zona_horaria), ''), 'America/Lima'),
    null,
    v_estado
  );

  insert into public.niveles_jerarquicos (id, empresa_id, codigo, nombre, alcance, orden)
  values
    ('nj_' || v_empresa_id || '_direccion',  v_empresa_id, 'direccion',  'Dirección / gerencia',     'tenant', 10),
    ('nj_' || v_empresa_id || '_jefatura',   v_empresa_id, 'jefatura',   'Jefatura',                 'equipo', 20),
    ('nj_' || v_empresa_id || '_supervisor', v_empresa_id, 'supervisor', 'Supervisor / coordinador', 'equipo', 30),
    ('nj_' || v_empresa_id || '_asesor',     v_empresa_id, 'asesor',     'Asesor / analista',        'propio', 40),
    ('nj_' || v_empresa_id || '_operativo',  v_empresa_id, 'operativo',  'Operativo',                'propio', 50),
    ('nj_' || v_empresa_id || '_soporte',    v_empresa_id, 'soporte',    'Soporte',                  'propio', 60);

  -- 1. Rol Admin Principal
  v_rol_id := 'rol_' || v_empresa_id || '_admin';
  insert into public.roles (id, empresa_id, nombre, descripcion, categoria, es_superadmin, es_admin_empresa, activo)
  values (v_rol_id, v_empresa_id,
    coalesce(nullif(trim(p_admin_nombre), ''), 'Administrador del tenant'),
    'Admin Empresa creado desde Plataforma TIDEO',
    'admin', false, true, true);
  perform public.asignar_permisos_default_a_rol(v_rol_id, 'admin');

  -- 2. Roles Predefinidos Estandar
  insert into public.roles (id, empresa_id, nombre, descripcion, categoria, es_superadmin, es_admin_empresa, activo)
  values
    ('rol_' || v_empresa_id || '_comercial_jefe',   v_empresa_id, 'Jefe Comercial',       'Responsable del area comercial y CRM',          'comercial',    false, false, true),
    ('rol_' || v_empresa_id || '_comercial_asesor',  v_empresa_id, 'Asesor Comercial',     'Gestión de Leads y Cotizaciones',               'comercial',    false, false, true),
    ('rol_' || v_empresa_id || '_ops_jefe',          v_empresa_id, 'Jefe de Operaciones',  'Gestión de Operaciones, OTs y Logística',       'operaciones',  false, false, true),
    ('rol_' || v_empresa_id || '_ops_tecnico',       v_empresa_id, 'Técnico Operativo',    'Personal de campo y ejecución',                 'operaciones',  false, false, true),
    ('rol_' || v_empresa_id || '_finanzas',          v_empresa_id, 'Finanzas y Admin',     'Control de Facturación, Compras y Tesorería',   'finanzas',     false, false, true);

  perform public.asignar_permisos_default_a_rol('rol_' || v_empresa_id || '_comercial_jefe',  'comercial_jefe');
  perform public.asignar_permisos_default_a_rol('rol_' || v_empresa_id || '_comercial_asesor', 'comercial_asesor');
  perform public.asignar_permisos_default_a_rol('rol_' || v_empresa_id || '_ops_jefe',         'ops_jefe');
  perform public.asignar_permisos_default_a_rol('rol_' || v_empresa_id || '_ops_tecnico',      'ops_tecnico');
  perform public.asignar_permisos_default_a_rol('rol_' || v_empresa_id || '_finanzas',         'finanzas');

  if nullif(trim(coalesce(p_admin_email, '')), '') is not null then
    select u.id into v_user_id
    from auth.users u
    where lower(u.email) = lower(trim(p_admin_email))
    limit 1;

    if v_user_id is not null then
      insert into public.usuarios_empresas (
        user_id, empresa_id, rol_id, acceso_campo, perfil_campo, estado
      )
      values (
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
  )
  values (
    v_empresa_id, auth.uid(), 'plataforma', 'empresas', v_empresa_id, 'crear_tenant',
    jsonb_build_object('razon_social', p_razon_social, 'admin_email', p_admin_email, 'admin_vinculado', v_user_id is not null)
  );

  return jsonb_build_object('empresa_id', v_empresa_id, 'rol_id', v_rol_id, 'admin_user_id', v_user_id, 'admin_vinculado', v_user_id is not null);
end;
$$;

-- ── 4. Núcleo de visibilidad: leer alcance desde el catálogo ─────────────────
create or replace function public.usuario_alcance_jerarquico(target_empresa_id text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case
      when r.es_superadmin = true or r.es_admin_empresa = true then 'tenant'
      else coalesce(nj.alcance, 'propio')
    end
    from public.usuarios_empresas ue
    join public.roles r on r.id = ue.rol_id
    left join public.niveles_jerarquicos nj
      on nj.empresa_id = target_empresa_id and nj.codigo = r.nivel_jerarquico
    where ue.user_id = auth.uid()
      and ue.empresa_id = target_empresa_id
      and ue.estado = 'activo'
      and r.activo = true
    limit 1
  ), 'propio');
$$;

create or replace function public.usuario_puede_ver_usuario(target_empresa_id text, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with recursive equipo(user_id) as (
    select auth.uid()
    union
    select ue.user_id
    from public.usuarios_empresas ue
    join equipo e on ue.jefe_user_id = e.user_id
    where ue.empresa_id = target_empresa_id
      and ue.estado = 'activo'
  )
  select exists (
    select 1
    from public.usuarios_empresas caller
    join public.roles r on r.id = caller.rol_id
    left join public.niveles_jerarquicos nj
      on nj.empresa_id = target_empresa_id and nj.codigo = r.nivel_jerarquico
    where caller.user_id = auth.uid()
      and caller.empresa_id = target_empresa_id
      and caller.estado = 'activo'
      and r.activo = true
      and (
        r.es_superadmin = true
        or r.es_admin_empresa = true
        or target_user_id = auth.uid()
        or coalesce(nj.alcance, 'propio') = 'tenant'
        or (
          coalesce(nj.alcance, 'propio') = 'equipo'
          and target_user_id in (select user_id from equipo)
        )
      )
  );
$$;

select pg_notify('pgrst', 'reload schema');
