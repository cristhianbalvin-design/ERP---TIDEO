\set ON_ERROR_STOP on
\pset pager off
\pset format aligned
\pset null '[NULL]'
\echo '--- Bloque 1 / R1: dry run ---'
begin;
\ir 20260926_spot_facturacion_permiso_body.sql

do $test$
declare
  v_result jsonb;
  v_error text;
  v_tmp_role_id text := 'spot_r1_tmp_no_facturacion';
  v_authorized_user uuid := '67b0e438-8712-40c0-ae60-006fbdd3c577';
  v_denied_user uuid := 'b312121e-1fd1-4163-88ef-2e50ada7ca96';
  v_sociedad_id uuid := '609a2f33-d057-411f-a001-4e3e83f700d0';
  v_service_id text := 'srv_c529a00515fe4defb6';
begin
  if not exists (select 1 from public.servicios where id = v_service_id and codigo = 'SRV-001') then
    raise exception 'R1_FIXTURE|servicio SRV-001 no encontrado: %', v_service_id;
  end if;

  -- Caso 1: usuario real no administrador con facturacion.crear.
  perform set_config('request.jwt.claims', json_build_object('sub', v_authorized_user::text, 'role', 'authenticated')::text, true);
  v_result := public.emitir_factura_cxc_atomico(jsonb_build_object(
    'empresa_id', 'emp_2000000000',
    'factura_id', 'fac_spot_r1_srv001',
    'cxc_id', 'cxc_spot_r1_srv001',
    'cuenta_id', 'cta_108241',
    'centro_beneficio_id', 'cebe_1fd8d3b7f35a445c92',
    'sociedad_id', v_sociedad_id,
    'numero', 'F-SPOT-R1-SRV001',
    'tipo_documento', 'factura',
    'fecha_emision', '2026-09-26',
    'fecha_vencimiento', '2026-10-26',
    'subtotal', 847.46,
    'igv', 152.54,
    'total', 1000,
    'moneda', 'PEN',
    'items', jsonb_build_array(jsonb_build_object('servicio_id', v_service_id, 'cantidad', 1, 'precio_unitario', 1000))
  ));
  if not exists (select 1 from public.facturas where id = 'fac_spot_r1_srv001')
     or not exists (select 1 from public.cxc where id = 'cxc_spot_r1_srv001')
     or not exists (select 1 from public.detracciones where factura_id = 'fac_spot_r1_srv001' and estado = 'pendiente') then
    raise exception 'R1_NO_REGRESION|SRV-001 no creo factura, CxC y obligacion SPOT.';
  end if;
  raise notice 'R1_CASO_1|usuario_con_facturacion_crear=aceptado|SRV-001|obligacion_SPOT=creada';

  -- Caso 2: rol temporal sin facturacion.crear. Todo se revierte con ROLLBACK.
  insert into public.roles (id, empresa_id, nombre, descripcion, categoria, nivel_jerarquico, es_superadmin, es_admin_empresa, activo)
  values (v_tmp_role_id, 'emp_2000000000', 'R1 PRUEBA SIN FACTURACION', 'Fixture temporal del dry run R1', 'otro', 'operativo', false, false, true);
  insert into public.permisos_roles (rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular)
  values (v_tmp_role_id, 'facturacion', false, false, false, false);
  update public.usuarios_empresas
  set rol_id = v_tmp_role_id
  where empresa_id = 'emp_2000000000' and user_id = v_denied_user;
  if not found then
    raise exception 'R1_FIXTURE|usuario temporal no encontrado en emp_2000000000.';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_denied_user::text, 'role', 'authenticated')::text, true);
  begin
    v_result := public.emitir_factura_cxc_atomico(jsonb_build_object(
      'empresa_id', 'emp_2000000000',
      'factura_id', 'fac_spot_r1_denied',
      'cxc_id', 'cxc_spot_r1_denied',
      'cuenta_id', 'cta_108241',
      'centro_beneficio_id', 'cebe_1fd8d3b7f35a445c92',
      'sociedad_id', v_sociedad_id,
      'numero', 'F-SPOT-R1-DENIED',
      'tipo_documento', 'factura',
      'fecha_emision', '2026-09-26',
      'fecha_vencimiento', '2026-10-26',
      'subtotal', 847.46,
      'igv', 152.54,
      'total', 1000,
      'moneda', 'PEN',
      'items', jsonb_build_array(jsonb_build_object('servicio_id', v_service_id, 'cantidad', 1, 'precio_unitario', 1000))
    ));
    raise exception 'R1_CASO_2|no_rechazo';
  exception when others then
    v_error := sqlerrm;
  end;
  if v_error is distinct from 'No tienes permiso para crear facturas en este tenant.' then
    raise exception 'R1_CASO_2|mensaje_inesperado=%', v_error;
  end if;
  if exists (select 1 from public.facturas where id = 'fac_spot_r1_denied')
     or exists (select 1 from public.cxc where id = 'cxc_spot_r1_denied')
     or exists (select 1 from public.detracciones where factura_id = 'fac_spot_r1_denied') then
    raise exception 'R1_CASO_2|hubo_escrituras_antes_del_rechazo';
  end if;
  raise notice 'R1_CASO_2|rol_temporal_sin_facturacion_crear=rechazado|mensaje=%', v_error;
end;
$test$;

rollback;
\echo 'R1_DRY_RUN_ROLLBACK_COMPLETED'
