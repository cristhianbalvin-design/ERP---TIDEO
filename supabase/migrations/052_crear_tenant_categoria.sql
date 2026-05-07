-- TIDEO ERP - Agrega categoria a los roles que crea crear_tenant_con_admin
-- Tanto para futuros tenants como para roles existentes sin categoria.

-- ==============================================================================
-- 1. Actualizar funcion crear_tenant_con_admin para que incluya categoria
-- ==============================================================================
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

-- ==============================================================================
-- 2. Parchar roles existentes de todos los tenants que aun esten en 'otro'
--    (complementa migration 051 que ya parcheó emp_tideo y los predefinidos
--     via LIKE, pero por si quedó alguno)
-- ==============================================================================
update public.roles set categoria = 'admin'
  where categoria = 'otro' and (es_admin_empresa = true or id like '%_admin%' or id like '%_superadmin%');

update public.roles set categoria = 'comercial'
  where categoria = 'otro' and (id like '%_comercial%');

update public.roles set categoria = 'operaciones'
  where categoria = 'otro' and (id like '%_ops%' or id like '%_tecnico%');

update public.roles set categoria = 'finanzas'
  where categoria = 'otro' and (id like '%_finanzas%');

select pg_notify('pgrst', 'reload schema');
notify pgrst, 'reload schema';
