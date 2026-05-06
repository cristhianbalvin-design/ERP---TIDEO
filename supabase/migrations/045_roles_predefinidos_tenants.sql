-- TIDEO ERP - Creacion de Roles Predefinidos y Asignacion de Permisos
-- 1. Actualiza la funcion crear_tenant_con_admin para que futuros tenants tengan roles y permisos por defecto.
-- 2. Inserta roles y permisos en los tenants que ya fueron creados previamente (ej. INGETEC, MIC).

-- ==============================================================================
-- FUNCION AUXILIAR: ASIGNAR PERMISOS POR DEFECTO A UN ROL
-- ==============================================================================
create or replace function public.asignar_permisos_default_a_rol(p_rol_id text, p_tipo_rol text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_tipo_rol = 'admin' then
    -- Admin: Todo
    insert into public.permisos_roles (rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular, puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas)
    select p_rol_id, x.pantalla, true, true, true, true, true, true, true, true
    from (
      values
        ('dashboard'), ('bi_comercial'), ('bi_operativo'), ('bi_financiero'),
        ('tenants'), ('planes'), ('metricas_saas'),
        ('cuentas'), ('leads'), ('pipeline'), ('actividades'),
        ('agenda_comercial'), ('hoja_costeo'), ('cotizaciones'), ('os_cliente'),
        ('planner'), ('backlog'), ('ot'), ('partes'),
        ('cierre'), ('tickets'), ('inventario'),
        ('solpe'), ('remision'), ('proveedores'), ('cot_compras'),
        ('ordenes_compra'), ('ordenes_servicio'), ('recepciones'), ('rrhh_operativo'),
        ('rrhh_admin'), ('asistencia'), ('turnos'),
        ('nomina'), ('prestamos_personal'), ('financiamiento'), ('ventas'),
        ('cxc'), ('cxp'), ('tesoreria'),
        ('resultados'), ('roles'), ('usuarios'), ('maestros'),
        ('parametros')
    ) as x(pantalla)
    on conflict (rol_id, pantalla) do update set
      puede_ver = excluded.puede_ver, puede_crear = excluded.puede_crear, puede_editar = excluded.puede_editar, puede_anular = excluded.puede_anular, puede_aprobar = excluded.puede_aprobar, puede_exportar = excluded.puede_exportar, puede_ver_costos = excluded.puede_ver_costos, puede_ver_finanzas = excluded.puede_ver_finanzas;

  elsif p_tipo_rol = 'comercial_jefe' then
    -- Jefe Comercial
    insert into public.permisos_roles (rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular, puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas)
    select p_rol_id, x.pantalla, true, true, true, false, true, true, false, false
    from (
      values ('bi_comercial'), ('cuentas'), ('leads'), ('pipeline'),
      ('actividades'), ('agenda_comercial'), ('hoja_costeo'), ('cotizaciones'), ('os_cliente')
    ) as x(pantalla)
    on conflict (rol_id, pantalla) do update set
      puede_ver = excluded.puede_ver, puede_crear = excluded.puede_crear, puede_editar = excluded.puede_editar, puede_anular = excluded.puede_anular, puede_aprobar = excluded.puede_aprobar, puede_exportar = excluded.puede_exportar, puede_ver_costos = excluded.puede_ver_costos, puede_ver_finanzas = excluded.puede_ver_finanzas;

  elsif p_tipo_rol = 'comercial_asesor' then
    -- Asesor Comercial
    insert into public.permisos_roles (rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular, puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas)
    select p_rol_id, x.pantalla, true, true, true, false, false, false, false, false
    from (
      values ('bi_comercial'), ('cuentas'), ('leads'), ('pipeline'),
      ('actividades'), ('agenda_comercial'), ('cotizaciones')
    ) as x(pantalla)
    on conflict (rol_id, pantalla) do update set
      puede_ver = excluded.puede_ver, puede_crear = excluded.puede_crear, puede_editar = excluded.puede_editar, puede_anular = excluded.puede_anular, puede_aprobar = excluded.puede_aprobar, puede_exportar = excluded.puede_exportar, puede_ver_costos = excluded.puede_ver_costos, puede_ver_finanzas = excluded.puede_ver_finanzas;

  elsif p_tipo_rol = 'ops_jefe' then
    -- Jefe de Operaciones
    insert into public.permisos_roles (rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular, puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas)
    select p_rol_id, x.pantalla, true, true, true, false, true, true, true, false
    from (
      values ('bi_operativo'), ('planner'), ('backlog'), ('ot'),
      ('partes'), ('cierre'), ('tickets'), ('inventario'),
      ('solpe'), ('remision'), ('recepciones')
    ) as x(pantalla)
    on conflict (rol_id, pantalla) do update set
      puede_ver = excluded.puede_ver, puede_crear = excluded.puede_crear, puede_editar = excluded.puede_editar, puede_anular = excluded.puede_anular, puede_aprobar = excluded.puede_aprobar, puede_exportar = excluded.puede_exportar, puede_ver_costos = excluded.puede_ver_costos, puede_ver_finanzas = excluded.puede_ver_finanzas;

  elsif p_tipo_rol = 'ops_tecnico' then
    -- Técnico Operativo
    insert into public.permisos_roles (rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular, puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas)
    select p_rol_id, x.pantalla, true, true, true, false, false, false, false, false
    from (
      values ('ot'), ('partes')
    ) as x(pantalla)
    on conflict (rol_id, pantalla) do update set
      puede_ver = excluded.puede_ver, puede_crear = excluded.puede_crear, puede_editar = excluded.puede_editar, puede_anular = excluded.puede_anular, puede_aprobar = excluded.puede_aprobar, puede_exportar = excluded.puede_exportar, puede_ver_costos = excluded.puede_ver_costos, puede_ver_finanzas = excluded.puede_ver_finanzas;

  elsif p_tipo_rol = 'finanzas' then
    -- Finanzas / Admin
    insert into public.permisos_roles (rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular, puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas)
    select p_rol_id, x.pantalla, true, true, true, false, true, true, true, true
    from (
      values ('bi_financiero'), ('proveedores'), ('cot_compras'), ('ordenes_compra'),
      ('ordenes_servicio'), ('recepciones'), ('nomina'), ('financiamiento'), ('ventas'),
      ('cxc'), ('cxp'), ('tesoreria'), ('resultados')
    ) as x(pantalla)
    on conflict (rol_id, pantalla) do update set
      puede_ver = excluded.puede_ver, puede_crear = excluded.puede_crear, puede_editar = excluded.puede_editar, puede_anular = excluded.puede_anular, puede_aprobar = excluded.puede_aprobar, puede_exportar = excluded.puede_exportar, puede_ver_costos = excluded.puede_ver_costos, puede_ver_finanzas = excluded.puede_ver_finanzas;
  end if;
end;
$$;

-- ==============================================================================
-- Parte 1: Actualizar la creacion de tenants para nuevos clientes
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
  insert into public.roles (id, empresa_id, nombre, descripcion, es_superadmin, es_admin_empresa, activo)
  values (v_rol_id, v_empresa_id, coalesce(nullif(trim(p_admin_nombre), ''), 'Administrador del tenant'),
    'Admin Empresa creado desde Plataforma TIDEO', false, true, true);
  perform public.asignar_permisos_default_a_rol(v_rol_id, 'admin');

  -- 2. Roles Predefinidos Estandar
  insert into public.roles (id, empresa_id, nombre, descripcion, es_superadmin, es_admin_empresa, activo)
  values 
    ('rol_' || v_empresa_id || '_comercial_jefe', v_empresa_id, 'Jefe Comercial', 'Responsable del area comercial y CRM', false, false, true),
    ('rol_' || v_empresa_id || '_comercial_asesor', v_empresa_id, 'Asesor Comercial', 'Gestión de Leads y Cotizaciones', false, false, true),
    ('rol_' || v_empresa_id || '_ops_jefe', v_empresa_id, 'Jefe de Operaciones', 'Gestión de Operaciones, OTs y Logística', false, false, true),
    ('rol_' || v_empresa_id || '_ops_tecnico', v_empresa_id, 'Técnico Operativo', 'Personal de campo y ejecución', false, false, true),
    ('rol_' || v_empresa_id || '_finanzas', v_empresa_id, 'Finanzas y Admin', 'Control de Facturación, Compras y Tesorería', false, false, true);

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
-- Parte 2: Insercion retroactiva para tenants existentes (INGETEC, MIC, YURAQ UMA)
-- ==============================================================================
do $$
declare
  r record;
begin
  for r in select id from public.empresas where id != 'emp_tideo' loop
    -- Administrador del tenant
    if not exists (select 1 from public.roles where id = 'rol_' || r.id || '_admin') then
      insert into public.roles (id, empresa_id, nombre, descripcion, es_superadmin, es_admin_empresa, activo)
      values ('rol_' || r.id || '_admin', r.id, 'Administrador del tenant', 'Admin Empresa creado desde Plataforma TIDEO', false, true, true);
    end if;
    perform public.asignar_permisos_default_a_rol('rol_' || r.id || '_admin', 'admin');

    -- Jefe Comercial
    if not exists (select 1 from public.roles where id = 'rol_' || r.id || '_comercial_jefe') then
      insert into public.roles (id, empresa_id, nombre, descripcion, es_superadmin, es_admin_empresa, activo)
      values ('rol_' || r.id || '_comercial_jefe', r.id, 'Jefe Comercial', 'Responsable del area comercial y CRM', false, false, true);
    end if;
    perform public.asignar_permisos_default_a_rol('rol_' || r.id || '_comercial_jefe', 'comercial_jefe');
    
    -- Asesor Comercial
    if not exists (select 1 from public.roles where id = 'rol_' || r.id || '_comercial_asesor') then
      insert into public.roles (id, empresa_id, nombre, descripcion, es_superadmin, es_admin_empresa, activo)
      values ('rol_' || r.id || '_comercial_asesor', r.id, 'Asesor Comercial', 'Gestión de Leads y Cotizaciones', false, false, true);
    end if;
    perform public.asignar_permisos_default_a_rol('rol_' || r.id || '_comercial_asesor', 'comercial_asesor');

    -- Jefe de Operaciones
    if not exists (select 1 from public.roles where id = 'rol_' || r.id || '_ops_jefe') then
      insert into public.roles (id, empresa_id, nombre, descripcion, es_superadmin, es_admin_empresa, activo)
      values ('rol_' || r.id || '_ops_jefe', r.id, 'Jefe de Operaciones', 'Gestión de Operaciones, OTs y Logística', false, false, true);
    end if;
    perform public.asignar_permisos_default_a_rol('rol_' || r.id || '_ops_jefe', 'ops_jefe');

    -- Técnico Operativo
    if not exists (select 1 from public.roles where id = 'rol_' || r.id || '_ops_tecnico') then
      insert into public.roles (id, empresa_id, nombre, descripcion, es_superadmin, es_admin_empresa, activo)
      values ('rol_' || r.id || '_ops_tecnico', r.id, 'Técnico Operativo', 'Personal de campo y ejecución', false, false, true);
    end if;
    perform public.asignar_permisos_default_a_rol('rol_' || r.id || '_ops_tecnico', 'ops_tecnico');

    -- Finanzas y Admin
    if not exists (select 1 from public.roles where id = 'rol_' || r.id || '_finanzas') then
      insert into public.roles (id, empresa_id, nombre, descripcion, es_superadmin, es_admin_empresa, activo)
      values ('rol_' || r.id || '_finanzas', r.id, 'Finanzas y Admin', 'Control de Facturación, Compras y Tesorería', false, false, true);
    end if;
    perform public.asignar_permisos_default_a_rol('rol_' || r.id || '_finanzas', 'finanzas');
  end loop;
end;
$$;

-- Limpieza
drop function public.asignar_permisos_default_a_rol;

-- Refrescar cache PostgREST
select pg_notify('pgrst', 'reload schema');
