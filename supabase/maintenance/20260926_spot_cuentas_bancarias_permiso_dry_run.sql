\set ON_ERROR_STOP on
\pset pager off
\pset format aligned
\pset null '[NULL]'
\echo '--- Bloque 1 / R2: dry run ---'
begin;
\ir 20260926_spot_cuentas_bancarias_permiso_body.sql

do $fixture$
declare
  v_sociedad_id uuid := '609a2f33-d057-411f-a001-4e3e83f700d0';
  v_tenant text := 'emp_2000000000';
begin
  insert into public.roles (id, empresa_id, nombre, descripcion, categoria, nivel_jerarquico, es_superadmin, es_admin_empresa, activo)
  values
    ('spot_r2_teso_full', v_tenant, 'R2 PRUEBA TESORERIA CRUD', 'Fixture temporal del dry run R2', 'otro', 'operativo', false, false, true),
    ('spot_r2_param_edit', v_tenant, 'R2 PRUEBA PARAMETROS EDITAR', 'Fixture temporal del dry run R2', 'otro', 'operativo', false, false, true),
    ('spot_r2_no_access', v_tenant, 'R2 PRUEBA SIN CUENTAS', 'Fixture temporal del dry run R2', 'otro', 'operativo', false, false, true),
    ('spot_r2_teso_create', v_tenant, 'R2 PRUEBA TESORERIA CREAR', 'Fixture temporal del dry run R2', 'otro', 'operativo', false, false, true);

  insert into public.permisos_roles (rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular)
  values
    ('spot_r2_teso_full', 'tesoreria', true, true, true, false),
    ('spot_r2_param_edit', 'parametros', true, false, true, false),
    ('spot_r2_no_access', 'parametros', false, false, false, false),
    ('spot_r2_no_access', 'tesoreria', false, false, false, false),
    ('spot_r2_teso_create', 'tesoreria', true, true, false, false);

  update public.usuarios_empresas set rol_id = 'spot_r2_teso_full'
  where user_id = '67b0e438-8712-40c0-ae60-006fbdd3c577' and empresa_id = v_tenant;
  if not found then raise exception 'R2_FIXTURE|usuario teso full no encontrado'; end if;
  update public.usuarios_empresas set rol_id = 'spot_r2_param_edit'
  where user_id = '5a3ce730-df30-4e7a-a8ce-55802549e012' and empresa_id = v_tenant;
  if not found then raise exception 'R2_FIXTURE|usuario parametros edit no encontrado'; end if;
  update public.usuarios_empresas set rol_id = 'spot_r2_no_access'
  where user_id = 'b312121e-1fd1-4163-88ef-2e50ada7ca96' and empresa_id = v_tenant;
  if not found then raise exception 'R2_FIXTURE|usuario sin permisos no encontrado'; end if;
  update public.usuarios_empresas set rol_id = 'spot_r2_teso_create'
  where user_id = '65b066ad-a2c1-441a-ad37-5ce198882c6c' and empresa_id = v_tenant;
  if not found then raise exception 'R2_FIXTURE|usuario teso create no encontrado'; end if;

  insert into public.cuentas_bancarias (id, empresa_id, nombre, banco, moneda, tipo, estado, saldo_inicial, sociedad_id, es_cuenta_detracciones)
  values
    ('cb_spot_r2_a', v_tenant, 'R2 cuenta tesoreria', 'Banco de la Nacion', 'PEN', 'corriente', 'activo', 0, v_sociedad_id, false),
    ('cb_spot_r2_bn', v_tenant, 'R2 cuenta BN detracciones', 'Banco de la Nacion', 'PEN', 'corriente', 'activo', 0, v_sociedad_id, true),
    ('cb_spot_r2_d', v_tenant, 'R2 cuenta tesoreria crear', 'Banco de la Nacion', 'PEN', 'corriente', 'activo', 0, v_sociedad_id, false);

  insert into public.facturas (id, empresa_id, cuenta_id, centro_beneficio_id, sociedad_id, numero, tipo_documento, fecha_emision, fecha_vencimiento, subtotal, igv, total, moneda, estado, items, aplica_retencion, monto_retencion, monto_neto_cobrable, aplica_detraccion, porcentaje_detraccion, monto_detraccion)
  values ('fac_spot_r2_cobro', v_tenant, 'cta_108241', 'cebe_1fd8d3b7f35a445c92', v_sociedad_id, 'F-SPOT-R2-COBRO', 'factura', date '2026-09-26', date '2026-10-26', 847.46, 152.54, 1000, 'PEN', 'emitida', '[]'::jsonb, false, 0, null, true, 12, 120);
  insert into public.cxc (id, empresa_id, cuenta_id, factura_id, sociedad_id, fecha_emision, fecha_vencimiento, monto_total, monto_pagado, saldo, moneda, estado, monto_retencion)
  values ('cxc_spot_r2_cobro', v_tenant, 'cta_108241', 'fac_spot_r2_cobro', v_sociedad_id, date '2026-09-26', date '2026-10-26', 1000, 0, 1000, 'PEN', 'por_cobrar', 0);
  insert into public.detracciones (direccion, factura_id, cxc_id, empresa_id, sociedad_id, codigo_spot, porcentaje, base_soles, monto_detraccion_soles, monto_detraccion_origen, moneda_origen, origen, estado)
  values ('venta', 'fac_spot_r2_cobro', 'cxc_spot_r2_cobro', null, null, '012', 12, 1000, 120, 120, 'PEN', 'emision', 'pendiente');
end;
$fixture$;

set local role authenticated;

do $test$
declare
  v_error text;
  v_rows integer;
begin
  -- a) Tesoreria crear/editar: alta y saldo permitidos; flag rechazado por trigger.
  perform set_config('request.jwt.claims', '{"sub":"67b0e438-8712-40c0-ae60-006fbdd3c577","role":"authenticated"}', true);
  insert into public.cuentas_bancarias (id, empresa_id, nombre, banco, moneda, tipo, estado, saldo_inicial, sociedad_id, es_cuenta_detracciones)
  values ('cb_spot_r2_teso_insert', 'emp_2000000000', 'R2 teso insert', 'Banco de la Nacion', 'PEN', 'corriente', 'activo', 0, '609a2f33-d057-411f-a001-4e3e83f700d0', false);
  update public.cuentas_bancarias set saldo_inicial = 25 where id = 'cb_spot_r2_teso_insert';
  begin
    update public.cuentas_bancarias set es_cuenta_detracciones = true where id = 'cb_spot_r2_teso_insert';
    raise exception 'R2_CASO_A|marcar_flag_no_rechazado';
  exception when others then
    v_error := sqlerrm;
  end;
  if v_error is distinct from 'Solo un usuario con permiso de edición en Parámetros puede cambiar Cuenta de detracciones.' then
    raise exception 'R2_CASO_A|mensaje_update=%', v_error;
  end if;
  begin
    insert into public.cuentas_bancarias (id, empresa_id, nombre, banco, moneda, tipo, estado, saldo_inicial, sociedad_id, es_cuenta_detracciones)
    values ('cb_spot_r2_teso_flagged', 'emp_2000000000', 'R2 teso flagged', 'Banco de la Nacion', 'PEN', 'corriente', 'activo', 0, '609a2f33-d057-411f-a001-4e3e83f700d0', true);
    raise exception 'R2_CASO_A|alta_flag_no_rechazada';
  exception when others then
    v_error := sqlerrm;
  end;
  if v_error is distinct from 'Solo un usuario con permiso de edición en Parámetros puede cambiar Cuenta de detracciones.' then
    raise exception 'R2_CASO_A|mensaje_insert=%', v_error;
  end if;
  raise notice 'R2_CASO_A|tesoreria_crear_editar|insert_sin_flag=ok|saldo_inicial=ok|marcar=rechazado|alta_flag=rechazada';

  -- b) Parametros editar: puede marcar y desmarcar el flag.
  perform set_config('request.jwt.claims', '{"sub":"5a3ce730-df30-4e7a-a8ce-55802549e012","role":"authenticated"}', true);
  update public.cuentas_bancarias set es_cuenta_detracciones = true where id = 'cb_spot_r2_a';
  update public.cuentas_bancarias set es_cuenta_detracciones = false where id = 'cb_spot_r2_a';
  raise notice 'R2_CASO_B|parametros_editar|marcar=ok|desmarcar=ok';

  -- c) Sin permisos: las tres operaciones deben caer en RLS.
  perform set_config('request.jwt.claims', '{"sub":"b312121e-1fd1-4163-88ef-2e50ada7ca96","role":"authenticated"}', true);
  v_error := null;
  begin
    insert into public.cuentas_bancarias (id, empresa_id, nombre, banco, moneda, tipo, estado, saldo_inicial, sociedad_id, es_cuenta_detracciones)
    values ('cb_spot_r2_no_access', 'emp_2000000000', 'R2 no access', 'Banco de la Nacion', 'PEN', 'corriente', 'activo', 0, '609a2f33-d057-411f-a001-4e3e83f700d0', false);
    raise exception 'R2_CASO_C|insert_no_bloqueado';
  exception when others then v_error := sqlerrm; end;
  if v_error not like '%row-level security%' then raise exception 'R2_CASO_C|insert_no_RLS=%', v_error; end if;
  v_error := null;
  v_rows := null;
  begin
    update public.cuentas_bancarias set saldo_inicial = 26 where id = 'cb_spot_r2_a';
    get diagnostics v_rows = row_count;
  exception when others then v_error := sqlerrm; end;
  if coalesce(v_rows, 0) <> 0 or (v_error is not null and v_error not like '%row-level security%') then raise exception 'R2_CASO_C|update_no_RLS|rows=%|error=%', v_rows, v_error; end if;
  v_error := null;
  v_rows := null;
  begin
    delete from public.cuentas_bancarias where id = 'cb_spot_r2_a';
    get diagnostics v_rows = row_count;
  exception when others then v_error := sqlerrm; end;
  if coalesce(v_rows, 0) <> 0 or (v_error is not null and v_error not like '%row-level security%') then raise exception 'R2_CASO_C|delete_no_RLS|rows=%|error=%', v_rows, v_error; end if;
  raise notice 'R2_CASO_C|sin_parametros_ni_tesoreria|insert=RLS|update=RLS|delete=RLS';

  -- d) Tesoreria crear sin editar: insert permitido, update rechazado por RLS.
  perform set_config('request.jwt.claims', '{"sub":"65b066ad-a2c1-441a-ad37-5ce198882c6c","role":"authenticated"}', true);
  insert into public.cuentas_bancarias (id, empresa_id, nombre, banco, moneda, tipo, estado, saldo_inicial, sociedad_id, es_cuenta_detracciones)
  values ('cb_spot_r2_teso_create', 'emp_2000000000', 'R2 teso create', 'Banco de la Nacion', 'PEN', 'corriente', 'activo', 0, '609a2f33-d057-411f-a001-4e3e83f700d0', false);
  v_error := null;
  v_rows := null;
  begin
    update public.cuentas_bancarias set saldo_inicial = 30 where id = 'cb_spot_r2_teso_create';
    get diagnostics v_rows = row_count;
  exception when others then v_error := sqlerrm; end;
  if coalesce(v_rows, 0) <> 0 or (v_error is not null and v_error not like '%row-level security%') then raise exception 'R2_CASO_D|update_no_RLS|rows=%|error=%', v_rows, v_error; end if;
  raise notice 'R2_CASO_D|tesoreria_crear_sin_editar|insert=ok|update=RLS';

  -- e) No-regresion: el RPC de cobro acepta el deposito en cuenta marcada.
  perform set_config('request.jwt.claims', '{"sub":"94c60fcb-8818-42e4-b395-31a8ff8635b1","role":"authenticated"}', true);
  perform public.registrar_cobro_cxc_atomico(
    'emp_2000000000',
    'cxc_spot_r2_cobro',
    jsonb_build_object('id', 'cob_spot_r2_det', 'tipo_cobro', 'detraccion', 'detraccion_id', (select id::text from public.detracciones where cxc_id = 'cxc_spot_r2_cobro'), 'monto_capital', 120, 'medio_pago', 'Detraccion', 'numero_constancia', 'R2-DET'),
    jsonb_build_object('id', 'tes_spot_r2_det', 'descripcion', 'R2 deposito detraccion', 'monto', 120, 'moneda', 'PEN', 'cuenta_bancaria_id', 'cb_spot_r2_bn', 'tc_aplicado', 1, 'monto_en_moneda_cuenta', 120, 'referencia', 'R2-DET'),
    null
  );
  if not exists (select 1 from public.detracciones where cxc_id = 'cxc_spot_r2_cobro' and estado = 'depositada') then
    raise exception 'R2_CASO_E|deposito_no_aceptado';
  end if;
  raise notice 'R2_CASO_E|registrar_cobro_cxc_atomico|cuenta_marcada=aceptada|detraccion=depositada';
end;
$test$;

rollback;
\echo 'R2_DRY_RUN_ROLLBACK_COMPLETED'
