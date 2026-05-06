-- TIDEO ERP - Roles predefinidos propios para el tenant plataforma TIDEO.
-- TIDEO conserva su rol Superadmin y tambien recibe roles operativos/admin
-- para poder crear usuarios internos sin usar roles de otros tenants.

create or replace function public.asignar_permisos_default_a_rol(p_rol_id text, p_tipo_rol text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_tipo_rol = 'admin' then
    insert into public.permisos_roles (
      rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular,
      puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas
    )
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
      puede_ver = excluded.puede_ver,
      puede_crear = excluded.puede_crear,
      puede_editar = excluded.puede_editar,
      puede_anular = excluded.puede_anular,
      puede_aprobar = excluded.puede_aprobar,
      puede_exportar = excluded.puede_exportar,
      puede_ver_costos = excluded.puede_ver_costos,
      puede_ver_finanzas = excluded.puede_ver_finanzas,
      updated_at = now();

  elsif p_tipo_rol = 'comercial_jefe' then
    insert into public.permisos_roles (
      rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular,
      puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas
    )
    select p_rol_id, x.pantalla, true, true, true, false, true, true, false, false
    from (
      values ('bi_comercial'), ('cuentas'), ('leads'), ('pipeline'),
      ('actividades'), ('agenda_comercial'), ('hoja_costeo'), ('cotizaciones'), ('os_cliente')
    ) as x(pantalla)
    on conflict (rol_id, pantalla) do update set
      puede_ver = excluded.puede_ver,
      puede_crear = excluded.puede_crear,
      puede_editar = excluded.puede_editar,
      puede_anular = excluded.puede_anular,
      puede_aprobar = excluded.puede_aprobar,
      puede_exportar = excluded.puede_exportar,
      puede_ver_costos = excluded.puede_ver_costos,
      puede_ver_finanzas = excluded.puede_ver_finanzas,
      updated_at = now();

  elsif p_tipo_rol = 'comercial_asesor' then
    insert into public.permisos_roles (
      rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular,
      puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas
    )
    select p_rol_id, x.pantalla, true, true, true, false, false, false, false, false
    from (
      values ('bi_comercial'), ('cuentas'), ('leads'), ('pipeline'),
      ('actividades'), ('agenda_comercial'), ('cotizaciones')
    ) as x(pantalla)
    on conflict (rol_id, pantalla) do update set
      puede_ver = excluded.puede_ver,
      puede_crear = excluded.puede_crear,
      puede_editar = excluded.puede_editar,
      puede_anular = excluded.puede_anular,
      puede_aprobar = excluded.puede_aprobar,
      puede_exportar = excluded.puede_exportar,
      puede_ver_costos = excluded.puede_ver_costos,
      puede_ver_finanzas = excluded.puede_ver_finanzas,
      updated_at = now();

  elsif p_tipo_rol = 'ops_jefe' then
    insert into public.permisos_roles (
      rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular,
      puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas
    )
    select p_rol_id, x.pantalla, true, true, true, false, true, true, true, false
    from (
      values ('bi_operativo'), ('planner'), ('backlog'), ('ot'),
      ('partes'), ('cierre'), ('tickets'), ('inventario'),
      ('solpe'), ('remision'), ('recepciones')
    ) as x(pantalla)
    on conflict (rol_id, pantalla) do update set
      puede_ver = excluded.puede_ver,
      puede_crear = excluded.puede_crear,
      puede_editar = excluded.puede_editar,
      puede_anular = excluded.puede_anular,
      puede_aprobar = excluded.puede_aprobar,
      puede_exportar = excluded.puede_exportar,
      puede_ver_costos = excluded.puede_ver_costos,
      puede_ver_finanzas = excluded.puede_ver_finanzas,
      updated_at = now();

  elsif p_tipo_rol = 'ops_tecnico' then
    insert into public.permisos_roles (
      rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular,
      puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas
    )
    select p_rol_id, x.pantalla, true, true, true, false, false, false, false, false
    from (values ('ot'), ('partes')) as x(pantalla)
    on conflict (rol_id, pantalla) do update set
      puede_ver = excluded.puede_ver,
      puede_crear = excluded.puede_crear,
      puede_editar = excluded.puede_editar,
      puede_anular = excluded.puede_anular,
      puede_aprobar = excluded.puede_aprobar,
      puede_exportar = excluded.puede_exportar,
      puede_ver_costos = excluded.puede_ver_costos,
      puede_ver_finanzas = excluded.puede_ver_finanzas,
      updated_at = now();

  elsif p_tipo_rol = 'finanzas' then
    insert into public.permisos_roles (
      rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular,
      puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas
    )
    select p_rol_id, x.pantalla, true, true, true, false, true, true, true, true
    from (
      values ('bi_financiero'), ('proveedores'), ('cot_compras'), ('ordenes_compra'),
      ('ordenes_servicio'), ('recepciones'), ('nomina'), ('financiamiento'), ('ventas'),
      ('cxc'), ('cxp'), ('tesoreria'), ('resultados')
    ) as x(pantalla)
    on conflict (rol_id, pantalla) do update set
      puede_ver = excluded.puede_ver,
      puede_crear = excluded.puede_crear,
      puede_editar = excluded.puede_editar,
      puede_anular = excluded.puede_anular,
      puede_aprobar = excluded.puede_aprobar,
      puede_exportar = excluded.puede_exportar,
      puede_ver_costos = excluded.puede_ver_costos,
      puede_ver_finanzas = excluded.puede_ver_finanzas,
      updated_at = now();
  end if;
end;
$$;

do $$
begin
  if exists (select 1 from public.empresas where id = 'emp_tideo') then
    insert into public.roles (id, empresa_id, nombre, descripcion, es_superadmin, es_admin_empresa, activo)
    values
      ('rol_emp_tideo_admin', 'emp_tideo', 'Administrador del tenant', 'Admin Empresa del tenant plataforma TIDEO', false, true, true),
      ('rol_emp_tideo_comercial_jefe', 'emp_tideo', 'Jefe Comercial', 'Responsable del area comercial y CRM', false, false, true),
      ('rol_emp_tideo_comercial_asesor', 'emp_tideo', 'Asesor Comercial', 'Gestión de Leads y Cotizaciones', false, false, true),
      ('rol_emp_tideo_ops_jefe', 'emp_tideo', 'Jefe de Operaciones', 'Gestión de Operaciones, OTs y Logística', false, false, true),
      ('rol_emp_tideo_ops_tecnico', 'emp_tideo', 'Técnico Operativo', 'Personal de campo y ejecución', false, false, true),
      ('rol_emp_tideo_finanzas', 'emp_tideo', 'Finanzas y Admin', 'Control de Facturación, Compras y Tesorería', false, false, true)
    on conflict (id) do update set
      empresa_id = excluded.empresa_id,
      nombre = excluded.nombre,
      descripcion = excluded.descripcion,
      es_superadmin = false,
      es_admin_empresa = excluded.es_admin_empresa,
      activo = true,
      updated_at = now();

    perform public.asignar_permisos_default_a_rol('rol_emp_tideo_admin', 'admin');
    perform public.asignar_permisos_default_a_rol('rol_emp_tideo_comercial_jefe', 'comercial_jefe');
    perform public.asignar_permisos_default_a_rol('rol_emp_tideo_comercial_asesor', 'comercial_asesor');
    perform public.asignar_permisos_default_a_rol('rol_emp_tideo_ops_jefe', 'ops_jefe');
    perform public.asignar_permisos_default_a_rol('rol_emp_tideo_ops_tecnico', 'ops_tecnico');
    perform public.asignar_permisos_default_a_rol('rol_emp_tideo_finanzas', 'finanzas');
  end if;
end;
$$;

drop function public.asignar_permisos_default_a_rol;

select pg_notify('pgrst', 'reload schema');
