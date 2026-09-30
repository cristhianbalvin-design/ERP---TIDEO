-- Reversion manual de 20260929100000_diagnostico_tecnico_fase2.sql.
-- No contiene BEGIN, COMMIT ni ROLLBACK. Ejecutar solo despues de aprobacion.
-- La definicion de asignar_permisos_default_a_rol fue capturada remotamente
-- con pg_get_functiondef antes de preparar esta reversion.

delete from public.permisos_roles
where pantalla = 'diagnostico_tecnico';

drop table if exists public.diagnostico_tecnico_linea_materiales;
drop table if exists public.diagnostico_tecnico_lineas;
drop table if exists public.plantillas_actividad;
drop table if exists public.diagnosticos_tecnicos;

drop function if exists public.buscar_o_crear_tipo_servicio_interno(text,text);
drop function if exists public.buscar_o_crear_familia_trabajo(text,text);
drop function if exists public.usuario_puede_ver_diagnostico_padre(text,text,text,text);
drop function if exists public.validar_plantilla_actividad_referencias();
drop function if exists public.validar_diagnostico_tecnico_referencias();
drop function if exists public.bloquear_diagnostico_tecnico_cabecera_emitido();
drop function if exists public.validar_diagnostico_tecnico_linea_referencias();
drop function if exists public.validar_diagnostico_tecnico_material_referencias();
drop function if exists public.bloquear_diagnostico_tecnico_linea_emitido();
drop function if exists public.bloquear_diagnostico_tecnico_material_emitido();

-- Definicion remota previa, literal.
CREATE OR REPLACE FUNCTION public.asignar_permisos_default_a_rol(p_rol_id text, p_tipo_rol text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_tipo_rol = 'admin' then
    insert into public.permisos_roles (
      rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular,
      puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas
    )
    select p_rol_id, x.pantalla, true, true, true, true, true, true, true, true
    from unnest(array[
      'dashboard', 'bi_comercial', 'bi_operativo', 'bi_financiero',
      'tenants', 'planes', 'metricas_saas',
      'cuentas', 'leads', 'pipeline', 'actividades',
      'agenda_comercial', 'hoja_costeo', 'cotizaciones', 'os_cliente',
      'planner', 'backlog', 'ot', 'partes',
      'cierre', 'tickets', 'inventario',
      'solpe', 'remision', 'proveedores', 'cot_compras',
      'ordenes_compra', 'ordenes_servicio', 'recepciones', 'rrhh_operativo',
      'rrhh_admin', 'asistencia', 'turnos',
      'nomina', 'prestamos_personal', 'financiamiento', 'ventas',
      'cxc', 'cxp', 'tesoreria',
      'resultados', 'roles', 'usuarios', 'maestros',
      'parametros'
    ]) as x(pantalla)
    on conflict (rol_id, pantalla) do update set
      puede_ver = excluded.puede_ver,
      puede_crear = excluded.puede_crear,
      puede_editar = excluded.puede_editar,
      puede_anular = excluded.puede_anular,
      puede_aprobar = excluded.puede_aprobar,
      puede_exportar = excluded.puede_exportar,
      puede_ver_costos = excluded.puede_ver_costos,
      puede_ver_finanzas = excluded.puede_ver_finanzas;

  elsif p_tipo_rol = 'comercial_jefe' then
    insert into public.permisos_roles (
      rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular,
      puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas
    )
    select p_rol_id, x.pantalla, true, true, true, false, true, true, false, false
    from unnest(array[
      'bi_comercial', 'cuentas', 'leads', 'pipeline',
      'actividades', 'agenda_comercial', 'hoja_costeo', 'cotizaciones', 'os_cliente'
    ]) as x(pantalla)
    on conflict (rol_id, pantalla) do update set
      puede_ver = excluded.puede_ver,
      puede_crear = excluded.puede_crear,
      puede_editar = excluded.puede_editar,
      puede_anular = excluded.puede_anular,
      puede_aprobar = excluded.puede_aprobar,
      puede_exportar = excluded.puede_exportar,
      puede_ver_costos = excluded.puede_ver_costos,
      puede_ver_finanzas = excluded.puede_ver_finanzas;

  elsif p_tipo_rol = 'comercial_asesor' then
    insert into public.permisos_roles (
      rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular,
      puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas
    )
    select p_rol_id, x.pantalla, true, true, true, false, false, false, false, false
    from unnest(array[
      'bi_comercial', 'cuentas', 'leads', 'pipeline',
      'actividades', 'agenda_comercial', 'hoja_costeo', 'cotizaciones'
    ]) as x(pantalla)
    on conflict (rol_id, pantalla) do update set
      puede_ver = excluded.puede_ver,
      puede_crear = excluded.puede_crear,
      puede_editar = excluded.puede_editar,
      puede_anular = excluded.puede_anular,
      puede_aprobar = excluded.puede_aprobar,
      puede_exportar = excluded.puede_exportar,
      puede_ver_costos = excluded.puede_ver_costos,
      puede_ver_finanzas = excluded.puede_ver_finanzas;

  elsif p_tipo_rol = 'ops_jefe' then
    insert into public.permisos_roles (
      rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular,
      puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas
    )
    select p_rol_id, x.pantalla, true, true, true, false, true, true, true, false
    from unnest(array[
      'bi_operativo', 'planner', 'backlog', 'ot',
      'partes', 'cierre', 'tickets', 'inventario',
      'solpe', 'remision', 'recepciones'
    ]) as x(pantalla)
    on conflict (rol_id, pantalla) do update set
      puede_ver = excluded.puede_ver,
      puede_crear = excluded.puede_crear,
      puede_editar = excluded.puede_editar,
      puede_anular = excluded.puede_anular,
      puede_aprobar = excluded.puede_aprobar,
      puede_exportar = excluded.puede_exportar,
      puede_ver_costos = excluded.puede_ver_costos,
      puede_ver_finanzas = excluded.puede_ver_finanzas;

  elsif p_tipo_rol = 'ops_tecnico' then
    insert into public.permisos_roles (
      rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular,
      puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas
    )
    select p_rol_id, x.pantalla, true, true, true, false, false, false, false, false
    from unnest(array['ot', 'partes']) as x(pantalla)
    on conflict (rol_id, pantalla) do update set
      puede_ver = excluded.puede_ver,
      puede_crear = excluded.puede_crear,
      puede_editar = excluded.puede_editar,
      puede_anular = excluded.puede_anular,
      puede_aprobar = excluded.puede_aprobar,
      puede_exportar = excluded.puede_exportar,
      puede_ver_costos = excluded.puede_ver_costos,
      puede_ver_finanzas = excluded.puede_ver_finanzas;

  elsif p_tipo_rol = 'finanzas' then
    insert into public.permisos_roles (
      rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular,
      puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas
    )
    select p_rol_id, x.pantalla, true, true, true, false, true, true, true, true
    from unnest(array[
      'bi_financiero', 'proveedores', 'cot_compras', 'ordenes_compra',
      'ordenes_servicio', 'recepciones', 'nomina', 'financiamiento', 'ventas',
      'cxc', 'cxp', 'tesoreria', 'resultados'
    ]) as x(pantalla)
    on conflict (rol_id, pantalla) do update set
      puede_ver = excluded.puede_ver,
      puede_crear = excluded.puede_crear,
      puede_editar = excluded.puede_editar,
      puede_anular = excluded.puede_anular,
      puede_aprobar = excluded.puede_aprobar,
      puede_exportar = excluded.puede_exportar,
      puede_ver_costos = excluded.puede_ver_costos,
      puede_ver_finanzas = excluded.puede_ver_finanzas;
  end if;
end;
$function$;
