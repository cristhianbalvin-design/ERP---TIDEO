  -- 127 - Defaults del rol Asesor Comercial
  -- Asegura que tenants nuevos y existentes reciban el mismo set base:
  -- BI Comercial, CRM comercial, Hoja de Costeo y Cotizaciones con ver/crear/editar.

  alter table public.permisos_roles enable row level security;

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
  $$;

  with asesor_roles as (
    select r.id
    from public.roles r
    where r.empresa_id is not null
      and (
        r.id like 'rol\_%\_comercial\_asesor' escape '\'
        or lower(trim(r.nombre)) = 'asesor comercial'
      )
  ),
  permisos_default as (
    select x.pantalla
    from unnest(array[
      'bi_comercial', 'cuentas', 'leads', 'pipeline',
      'actividades', 'agenda_comercial', 'hoja_costeo', 'cotizaciones'
    ]) as x(pantalla)
  )
  insert into public.permisos_roles (
    rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular,
    puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas
  )
  select ar.id, pd.pantalla, true, true, true, false, false, false, false, false
  from asesor_roles ar
  cross join permisos_default pd
  on conflict (rol_id, pantalla) do update set
    puede_ver = excluded.puede_ver,
    puede_crear = excluded.puede_crear,
    puede_editar = excluded.puede_editar,
    puede_anular = excluded.puede_anular,
    puede_aprobar = excluded.puede_aprobar,
    puede_exportar = excluded.puede_exportar,
    puede_ver_costos = excluded.puede_ver_costos,
    puede_ver_finanzas = excluded.puede_ver_finanzas;

  select pg_notify('pgrst', 'reload schema');
