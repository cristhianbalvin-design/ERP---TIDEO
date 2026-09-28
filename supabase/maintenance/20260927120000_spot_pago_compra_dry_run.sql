\set ON_ERROR_STOP on
\pset pager off
\pset format aligned
\pset null '[NULL]'
\echo '--- SPOT / Bloque 3b-2: dry run ---'
begin;
\ir 20260927120000_spot_pago_compra_body.sql

create temp table b3b2_context (clave text primary key, valor text) on commit drop;
create or replace function pg_temp.b3b2_ctx(p_clave text)
returns text language sql stable as $$ select valor from b3b2_context where clave = p_clave $$;

create or replace function pg_temp.b3b2_cxp(
  p_tag text,
  p_moneda text default 'PEN',
  p_monto numeric default 1000,
  p_retencion numeric default 0
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fixture$
declare
  v_id text := 'cxp_b3b2_' || p_tag || '_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);
begin
  insert into public.cxp (
    id, empresa_id, proveedor_id, factura_numero, fecha_emision, fecha_vencimiento,
    monto_total, monto_pagado, saldo, moneda, estado, tipo_beneficiario, tipo_comprobante,
    origen, sociedad_id, retencion_ir, created_at, updated_at
  ) values (
    v_id, pg_temp.b3b2_ctx('empresa_id'), pg_temp.b3b2_ctx('proveedor_id'), 'F-B3B2-' || p_tag,
    date '2026-09-24', date '2026-10-24', p_monto, 0, p_monto, p_moneda, 'por_pagar',
    'proveedor', 'Factura', 'manual', pg_temp.b3b2_ctx('sociedad_id')::uuid, p_retencion, now(), now()
  );
  return v_id;
end;
$fixture$;

grant select on b3b2_context to public;
grant execute on function pg_temp.b3b2_ctx(text) to public;
grant execute on function pg_temp.b3b2_cxp(text,text,numeric,numeric) to public;

do $fixture$
declare
  v_empresa text := 'emp_2000000000';
  v_sociedad uuid;
  v_sociedad_otra uuid;
  v_catalogo text;
  v_proveedor text := 'prv_spot_b3b2_fixture';
  v_proveedor_otro text := 'prv_spot_b3b2_otro';
  v_user_full uuid := '67b0e438-8712-40c0-ae60-006fbdd3c577';
begin
  select s.id into v_sociedad from public.sociedades s where s.empresa_id = v_empresa order by s.id limit 1;
  select s.id into v_sociedad_otra from public.sociedades s where s.empresa_id = v_empresa and s.id <> v_sociedad order by s.id limit 1;
  if v_sociedad is null then raise exception 'B3B2_FIXTURE|sociedad_no_encontrada'; end if;
  if v_sociedad_otra is null then v_sociedad_otra := v_sociedad; end if;
  select c.codigo into v_catalogo
  from public.spot_catalogo c
  where c.estado = 'activo' and c.vigencia_desde <= date '2026-09-24'
    and (c.vigencia_hasta is null or c.vigencia_hasta >= date '2026-09-24')
  order by c.codigo limit 1;
  if v_catalogo is null then raise exception 'B3B2_FIXTURE|catalogo_no_encontrado'; end if;

  insert into public.proveedores (id, empresa_id, razon_social, nombre_comercial, ruc, codigo, tipo, estado, created_at, updated_at)
  values
    (v_proveedor, v_empresa, 'B3B2 Proveedor SPOT', 'B3B2 Proveedor SPOT', '20999999211', 'B3B2-PRV', 'empresa', 'potencial', now(), now()),
    (v_proveedor_otro, v_empresa, 'B3B2 Otro Proveedor', 'B3B2 Otro Proveedor', '20999999212', 'B3B2-OTR', 'empresa', 'potencial', now(), now());

  insert into public.cuentas_bancarias (id, empresa_id, nombre, banco, numero_cuenta, moneda, tipo, estado, sociedad_id, es_cuenta_detracciones)
  values
    ('cb_b3b2_origen', v_empresa, 'B3B2 Origen', 'Banco Fixture', '111111', 'PEN', 'corriente', 'activo', v_sociedad, false),
    ('cb_b3b2_usd', v_empresa, 'B3B2 USD', 'Banco Fixture', '222222', 'USD', 'corriente', 'activo', v_sociedad, false),
    ('cb_b3b2_inactiva', v_empresa, 'B3B2 Inactiva', 'Banco Fixture', '333333', 'PEN', 'corriente', 'inactivo', v_sociedad, false),
    ('cb_b3b2_otra_soc', v_empresa, 'B3B2 Otra Sociedad', 'Banco Fixture', '444444', 'PEN', 'corriente', 'activo', v_sociedad_otra, false);

  insert into public.proveedor_cuentas_bancarias (id, empresa_id, proveedor_id, alias, banco, tipo_cuenta, numero_cuenta, moneda, es_cuenta_banco_nacion, estado)
  values
    ('pcb_b3b2_bn', v_empresa, v_proveedor, 'BN activa', 'Banco de la Nación', 'corriente', '555555', 'PEN', true, 'activo'),
    ('pcb_b3b2_nonbn', v_empresa, v_proveedor, 'Cuenta no BN', 'Banco Fixture', 'corriente', '666666', 'PEN', false, 'activo'),
    ('pcb_b3b2_inactiva', v_empresa, v_proveedor, 'BN inactiva', 'Banco de la Nación', 'corriente', '777777', 'PEN', true, 'inactivo'),
    ('pcb_b3b2_otro', v_empresa, v_proveedor_otro, 'BN otro proveedor', 'Banco de la Nación', 'corriente', '888888', 'PEN', true, 'activo');

  insert into b3b2_context values
    ('empresa_id', v_empresa), ('sociedad_id', v_sociedad::text), ('sociedad_otra_id', v_sociedad_otra::text),
    ('proveedor_id', v_proveedor), ('catalogo', v_catalogo), ('user_full', v_user_full::text),
    ('cuenta_origen', 'cb_b3b2_origen'), ('cuenta_usd', 'cb_b3b2_usd'),
    ('cuenta_inactiva', 'cb_b3b2_inactiva'), ('cuenta_otra_soc', 'cb_b3b2_otra_soc'),
    ('proveedor_bn', 'pcb_b3b2_bn'), ('proveedor_nonbn', 'pcb_b3b2_nonbn'),
    ('proveedor_inactivo', 'pcb_b3b2_inactiva'), ('proveedor_otro', 'pcb_b3b2_otro');
end;
$fixture$;

set local role authenticated;

do $test$
declare
  v_cxp text;
  v_d uuid;
  v_r jsonb;
  v_error text;
  v_state text;
  v_count integer;
  v_monto numeric;
  v_det numeric;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.b3b2_ctx('user_full'), 'role', 'authenticated')::text, true);

  -- 1) PEN: neto 960 + deposito 40 en una sola transaccion.
  v_cxp := pg_temp.b3b2_cxp('pen', 'PEN');
  v_r := public.registrar_detraccion_compra(v_cxp, jsonb_build_object('codigo_spot', pg_temp.b3b2_ctx('catalogo')));
  v_d := (v_r->'detraccion'->>'id')::uuid;
  v_r := public.registrar_pago_cxp_atomico(v_cxp, 960, jsonb_build_object(
    'con_deposito_spot', true, 'cuenta_origen_spot_id', pg_temp.b3b2_ctx('cuenta_origen'),
    'proveedor_cuenta_id', pg_temp.b3b2_ctx('proveedor_bn'), 'numero_constancia', 'CONST-B3B2-PEN',
    'fecha_constancia', '2026-09-24', 'fecha_pago', '2026-09-24', 'metodo_pago', 'Transferencia'
  ), jsonb_build_object('cuenta_bancaria_id', pg_temp.b3b2_ctx('cuenta_origen'), 'moneda', 'PEN', 'fecha', '2026-09-24'));
  select estado, monto_detraccion_soles into v_state, v_det from public.detracciones where id = v_d;
  select count(*) into v_count from public.movimientos_tesoreria where vinculo_id = v_cxp;
  if v_state <> 'depositada' or v_det <> 40 or v_count <> 2 or (v_r->'cxp'->>'estado') <> 'pagada' then
    raise exception 'B3B2_CASO_1|PEN_pago_atomico_incorrecto';
  end if;
  raise notice 'B3B2_CASO_1|pago_neto_PEN=960|deposito_PEN=40|movimientos=2';

  -- 2) USD: el neto se compara en USD (960) y el egreso SPOT es PEN (138).
  v_cxp := pg_temp.b3b2_cxp('usd', 'USD');
  v_r := public.registrar_detraccion_compra(v_cxp, jsonb_build_object('codigo_spot', pg_temp.b3b2_ctx('catalogo'), 'tipo_cambio_detraccion', 3.45, 'tipo_cambio_fuente', 'manual'));
  v_d := (v_r->'detraccion'->>'id')::uuid;
  v_r := public.registrar_pago_cxp_atomico(v_cxp, 960, jsonb_build_object(
    'con_deposito_spot', true, 'cuenta_origen_spot_id', pg_temp.b3b2_ctx('cuenta_origen'),
    'proveedor_cuenta_id', pg_temp.b3b2_ctx('proveedor_bn'), 'numero_constancia', 'CONST-B3B2-USD',
    'fecha_constancia', '2026-09-24', 'fecha_pago', '2026-09-24', 'metodo_pago', 'Transferencia'
  ), jsonb_build_object('cuenta_bancaria_id', pg_temp.b3b2_ctx('cuenta_origen'), 'moneda', 'USD', 'fecha', '2026-09-24'));
  select estado, monto_detraccion_soles into v_state, v_det from public.detracciones where id = v_d;
  if v_state <> 'depositada' or v_det <> 138 or (v_r->'cxp'->>'estado') <> 'pagada' then
    raise exception 'B3B2_CASO_2|USD_pago_atomico_incorrecto';
  end if;
  raise notice 'B3B2_CASO_2|pago_neto_USD=960|deposito_PEN=138';

  -- 3) Monto distinto al neto exacto y 4) reintento de CxP pagada.
  v_cxp := pg_temp.b3b2_cxp('monto_incorrecto', 'PEN');
  perform public.registrar_detraccion_compra(v_cxp, jsonb_build_object('codigo_spot', pg_temp.b3b2_ctx('catalogo')));
  v_error := null;
  begin perform public.registrar_pago_cxp_atomico(v_cxp, 959, jsonb_build_object('con_deposito_spot', true, 'cuenta_origen_spot_id', pg_temp.b3b2_ctx('cuenta_origen'), 'proveedor_cuenta_id', pg_temp.b3b2_ctx('proveedor_bn'), 'numero_constancia', 'BAD', 'fecha_constancia', '2026-09-24'), jsonb_build_object('cuenta_bancaria_id', pg_temp.b3b2_ctx('cuenta_origen'), 'moneda', 'PEN')); exception when others then v_error := sqlerrm; end;
  if v_error is null then raise exception 'B3B2_CASO_3|monto_distinto_aceptado'; end if;
  raise notice 'B3B2_CASO_3|monto_distinto_al_neto=rechazado';

  v_cxp := pg_temp.b3b2_cxp('reintento', 'PEN');
  perform public.registrar_detraccion_compra(v_cxp, jsonb_build_object('codigo_spot', pg_temp.b3b2_ctx('catalogo')));
  perform public.registrar_pago_cxp_atomico(v_cxp, 960, jsonb_build_object('con_deposito_spot', true, 'cuenta_origen_spot_id', pg_temp.b3b2_ctx('cuenta_origen'), 'proveedor_cuenta_id', pg_temp.b3b2_ctx('proveedor_bn'), 'numero_constancia', 'RETRY', 'fecha_constancia', '2026-09-24'), jsonb_build_object('cuenta_bancaria_id', pg_temp.b3b2_ctx('cuenta_origen'), 'moneda', 'PEN'));
  v_error := null;
  begin perform public.registrar_pago_cxp_atomico(v_cxp, 960, jsonb_build_object('con_deposito_spot', true, 'cuenta_origen_spot_id', pg_temp.b3b2_ctx('cuenta_origen'), 'proveedor_cuenta_id', pg_temp.b3b2_ctx('proveedor_bn'), 'numero_constancia', 'RETRY', 'fecha_constancia', '2026-09-24'), jsonb_build_object('cuenta_bancaria_id', pg_temp.b3b2_ctx('cuenta_origen'), 'moneda', 'PEN')); exception when others then v_error := sqlerrm; end;
  select count(*) into v_count from public.movimientos_tesoreria where vinculo_id = v_cxp;
  if v_error is null or v_count <> 2 then raise exception 'B3B2_CASO_4|reintento_duplica_o_acepta'; end if;
  raise notice 'B3B2_CASO_4|CxP_pagada=reintento_rechazado|movimientos=2';

  -- 5) Cuenta origen no PEN, inactiva o de otra sociedad.
  v_cxp := pg_temp.b3b2_cxp('cuenta_origen', 'PEN');
  perform public.registrar_detraccion_compra(v_cxp, jsonb_build_object('codigo_spot', pg_temp.b3b2_ctx('catalogo')));
  foreach v_state in array array['cuenta_usd','cuenta_inactiva','cuenta_otra_soc'] loop
    v_error := null;
    begin perform public.registrar_pago_cxp_atomico(v_cxp, 960, jsonb_build_object('con_deposito_spot', true, 'cuenta_origen_spot_id', pg_temp.b3b2_ctx(v_state), 'proveedor_cuenta_id', pg_temp.b3b2_ctx('proveedor_bn'), 'numero_constancia', 'BAD-CB', 'fecha_constancia', '2026-09-24'), jsonb_build_object('cuenta_bancaria_id', pg_temp.b3b2_ctx('cuenta_origen'), 'moneda', 'PEN')); exception when others then v_error := sqlerrm; end;
    if v_error is null then raise exception 'B3B2_CASO_5|%_aceptada', v_state; end if;
  end loop;
  raise notice 'B3B2_CASO_5|origen_USD=inactiva=otra_sociedad_rechazadas';

  -- 6) Cuenta proveedor no BN, inactiva o de otro proveedor.
  v_cxp := pg_temp.b3b2_cxp('cuenta_proveedor', 'PEN');
  perform public.registrar_detraccion_compra(v_cxp, jsonb_build_object('codigo_spot', pg_temp.b3b2_ctx('catalogo')));
  foreach v_state in array array['proveedor_nonbn','proveedor_inactivo','proveedor_otro'] loop
    v_error := null;
    begin perform public.registrar_pago_cxp_atomico(v_cxp, 960, jsonb_build_object('con_deposito_spot', true, 'cuenta_origen_spot_id', pg_temp.b3b2_ctx('cuenta_origen'), 'proveedor_cuenta_id', pg_temp.b3b2_ctx(v_state), 'numero_constancia', 'BAD-PRV', 'fecha_constancia', '2026-09-24'), jsonb_build_object('cuenta_bancaria_id', pg_temp.b3b2_ctx('cuenta_origen'), 'moneda', 'PEN')); exception when others then v_error := sqlerrm; end;
    if v_error is null then raise exception 'B3B2_CASO_6|%_aceptada', v_state; end if;
  end loop;
  raise notice 'B3B2_CASO_6|proveedor_no_BN=inactivo=otro_proveedor_rechazados';

  -- 7) Trigger: vinculo correcto permite el egreso SPOT; sin vinculo lo rechaza.
  v_cxp := pg_temp.b3b2_cxp('trigger', 'PEN');
  v_r := public.registrar_detraccion_compra(v_cxp, jsonb_build_object('codigo_spot', pg_temp.b3b2_ctx('catalogo')));
  v_d := (v_r->'detraccion'->>'id')::uuid;
  insert into public.movimientos_tesoreria (id, empresa_id, tipo, descripcion, monto, moneda, fecha, cuenta_bancaria_id, vinculo_tipo, vinculo_id, estado, detraccion_id)
  values ('mov_b3b2_ok', pg_temp.b3b2_ctx('empresa_id'), 'egreso', 'B3B2 trigger ok', 40, 'PEN', date '2026-09-24', pg_temp.b3b2_ctx('cuenta_origen'), 'pago_spot_compra', v_cxp, 'registrado', v_d);
  v_error := null;
  begin
    insert into public.movimientos_tesoreria (id, empresa_id, tipo, descripcion, monto, moneda, fecha, cuenta_bancaria_id, vinculo_tipo, vinculo_id, estado, detraccion_id)
    values ('mov_b3b2_bad', pg_temp.b3b2_ctx('empresa_id'), 'egreso', 'B3B2 trigger bad', 40, 'PEN', date '2026-09-24', pg_temp.b3b2_ctx('cuenta_origen'), null, v_cxp, 'registrado', v_d);
  exception when others then v_error := sqlerrm; end;
  if v_error is null then raise exception 'B3B2_CASO_7|egreso_sin_vinculo_aceptado'; end if;
  raise notice 'B3B2_CASO_7|vinculo_correcto=permitido|sin_vinculo=rechazado';

  -- 8) Pago sin SPOT conserva el comportamiento normal e IR.
  v_cxp := pg_temp.b3b2_cxp('sin_spot_ir', 'PEN', 1000, 80);
  v_r := public.registrar_pago_cxp_atomico(v_cxp, 1000, jsonb_build_object('fecha_pago', '2026-09-24'), jsonb_build_object('cuenta_bancaria_id', pg_temp.b3b2_ctx('cuenta_origen'), 'moneda', 'PEN'));
  if (v_r->'cxp'->>'estado') <> 'pagada' or exists (select 1 from public.detracciones where cxp_id = v_cxp) then
    raise exception 'B3B2_CASO_8|no_spot_ir_regresion';
  end if;
  raise notice 'B3B2_CASO_8|sin_spot_con_IR=preservado';

  -- 9) Pago parcial del neto: rechazado.
  v_cxp := pg_temp.b3b2_cxp('parcial_neto', 'PEN');
  perform public.registrar_detraccion_compra(v_cxp, jsonb_build_object('codigo_spot', pg_temp.b3b2_ctx('catalogo')));
  v_error := null;
  begin perform public.registrar_pago_cxp_atomico(v_cxp, 500, jsonb_build_object('con_deposito_spot', true, 'cuenta_origen_spot_id', pg_temp.b3b2_ctx('cuenta_origen'), 'proveedor_cuenta_id', pg_temp.b3b2_ctx('proveedor_bn'), 'numero_constancia', 'BAD-PARCIAL', 'fecha_constancia', '2026-09-24'), jsonb_build_object('cuenta_bancaria_id', pg_temp.b3b2_ctx('cuenta_origen'), 'moneda', 'PEN')); exception when others then v_error := sqlerrm; end;
  if v_error is null then raise exception 'B3B2_CASO_9|pago_parcial_aceptado'; end if;
  raise notice 'B3B2_CASO_9|pago_parcial_neto=rechazado';

  -- 10) Sin indicador explícito: sigue la ruta normal vigente.
  v_cxp := pg_temp.b3b2_cxp('sin_indicador', 'PEN');
  perform public.registrar_detraccion_compra(v_cxp, jsonb_build_object('codigo_spot', pg_temp.b3b2_ctx('catalogo')));
  v_r := public.registrar_pago_cxp_atomico(v_cxp, 1000, '{}'::jsonb, jsonb_build_object('moneda', 'PEN'));
  select estado into v_state from public.detracciones where cxp_id = v_cxp and direccion = 'compra';
  if (v_r->'cxp'->>'estado') <> 'pagada' or v_state <> 'pendiente' then
    raise exception 'B3B2_CASO_10|ruta_sin_indicador_cambio';
  end if;
  raise notice 'B3B2_CASO_10|sin_indicador=ruta_normal_preservada';
end;
$test$;

rollback;
\echo 'B3B2_DRY_RUN_ROLLBACK_COMPLETED'
