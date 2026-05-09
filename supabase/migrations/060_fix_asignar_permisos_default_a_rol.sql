-- TIDEO ERP - Restaurar funcion asignar_permisos_default_a_rol como permanente
-- Las migraciones 045 y 046 la creaban y eliminaban como helper temporal.
-- La migracion 052 actualizo crear_tenant_con_admin para llamarla permanentemente,
-- pero la funcion ya no existia. Esta migracion la restaura sin eliminarla.

create or replace function public.asignar_permisos_default_a_rol(p_rol_id text, p_tipo_rol text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_tipo_rol = 'admin' then
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
    insert into public.permisos_roles (rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular, puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas)
    select p_rol_id, x.pantalla, true, true, true, false, true, true, false, false
    from (
      values ('bi_comercial'), ('cuentas'), ('leads'), ('pipeline'),
      ('actividades'), ('agenda_comercial'), ('hoja_costeo'), ('cotizaciones'), ('os_cliente')
    ) as x(pantalla)
    on conflict (rol_id, pantalla) do update set
      puede_ver = excluded.puede_ver, puede_crear = excluded.puede_crear, puede_editar = excluded.puede_editar, puede_anular = excluded.puede_anular, puede_aprobar = excluded.puede_aprobar, puede_exportar = excluded.puede_exportar, puede_ver_costos = excluded.puede_ver_costos, puede_ver_finanzas = excluded.puede_ver_finanzas;

  elsif p_tipo_rol = 'comercial_asesor' then
    insert into public.permisos_roles (rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular, puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas)
    select p_rol_id, x.pantalla, true, true, true, false, false, false, false, false
    from (
      values ('bi_comercial'), ('cuentas'), ('leads'), ('pipeline'),
      ('actividades'), ('agenda_comercial'), ('cotizaciones')
    ) as x(pantalla)
    on conflict (rol_id, pantalla) do update set
      puede_ver = excluded.puede_ver, puede_crear = excluded.puede_crear, puede_editar = excluded.puede_editar, puede_anular = excluded.puede_anular, puede_aprobar = excluded.puede_aprobar, puede_exportar = excluded.puede_exportar, puede_ver_costos = excluded.puede_ver_costos, puede_ver_finanzas = excluded.puede_ver_finanzas;

  elsif p_tipo_rol = 'ops_jefe' then
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
    insert into public.permisos_roles (rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular, puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas)
    select p_rol_id, x.pantalla, true, true, true, false, false, false, false, false
    from (
      values ('ot'), ('partes')
    ) as x(pantalla)
    on conflict (rol_id, pantalla) do update set
      puede_ver = excluded.puede_ver, puede_crear = excluded.puede_crear, puede_editar = excluded.puede_editar, puede_anular = excluded.puede_anular, puede_aprobar = excluded.puede_aprobar, puede_exportar = excluded.puede_exportar, puede_ver_costos = excluded.puede_ver_costos, puede_ver_finanzas = excluded.puede_ver_finanzas;

  elsif p_tipo_rol = 'finanzas' then
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

select pg_notify('pgrst', 'reload schema');
notify pgrst, 'reload schema';
