-- Regresion transaccional para generar_cxp_centralizado.
-- Ejecutar con un BEGIN externo que incluya la migracion candidata, o ejecutar
-- este archivo tal cual cuando la migracion ya este aplicada.
-- Este archivo nunca debe terminar en COMMIT.

begin;

select set_config('request.jwt.claim.sub', '30bc196b-808f-4f4b-a3ec-9bfe6b8f7837', true);

create temporary table _cxp_regression_results (
  caso integer,
  nombre text,
  resultado text,
  detalle text
) on commit drop;

do $$
declare
  v_empresa text := 'emp_2000000000';
  v_base jsonb;
  v_oc_pago_parcial text := 'oc_reg_pago_parcial';
  v_oc_pago_total text := 'oc_reg_pago_total';
  v_oc_partes text := 'oc_reg_partes';
  v_proveedor text := 'prv_imp_a16911dd5cbf4efa97db';
  v_cxp_pago text := 'cxp_reg_pago';
  v_cxp_partes_1 text := 'cxp_reg_parte_1';
  v_cxp_partes_2 text := 'cxp_reg_parte_2';
  v_cxp_sin_oc text := 'cxp_reg_sin_oc';
  v_cxp_recep_anulada text := 'cxp_reg_recep_anulada';
  v_cxp_recep_activa text := 'cxp_reg_recep_activa';
  v_cxp_liq_alias_en text := 'cxp_reg_liq_en';
  v_cxp_liq_alias_es text := 'cxp_reg_liq_es';
  v_gasto text := 'gasto_reg_nuevo_egreso';
  v_cxp_gasto text;
  v_result jsonb;
  v_error text;
  v_count integer;
  v_estado text;
begin
  insert into public.ordenes_compra (id, empresa_id, codigo, proveedor_id, descripcion, items, subtotal, igv, total, moneda, estado, sociedad_id)
  values
    (v_oc_pago_parcial, v_empresa, 'OC-REG-PAGO-PARCIAL', v_proveedor, 'Regresion pago parcial', '[]'::jsonb, 100, 0, 100, 'PEN', 'pendiente', '609a2f33-d057-411f-a001-4e3e83f700d0'),
    (v_oc_pago_total, v_empresa, 'OC-REG-PAGO-TOTAL', v_proveedor, 'Regresion pago total', '[]'::jsonb, 50, 0, 50, 'PEN', 'pendiente', '609a2f33-d057-411f-a001-4e3e83f700d0'),
    (v_oc_partes, v_empresa, 'OC-REG-PARTES', v_proveedor, 'Regresion CxP parciales', '[]'::jsonb, 100, 0, 100, 'PEN', 'pendiente', '609a2f33-d057-411f-a001-4e3e83f700d0');

  perform public.generar_cxp_centralizado(jsonb_build_object('id', v_cxp_pago, 'empresa_id', v_empresa, 'fecha_emision', current_date, 'fecha_vencimiento', current_date + 30, 'monto_total', 100, 'saldo', 100, 'tipo_beneficiario', 'proveedor', 'sociedad_id', '609a2f33-d057-411f-a001-4e3e83f700d0', 'orden_compra_id', v_oc_pago_parcial), 'cxp_manual', 'crear');
  perform public.generar_cxp_centralizado(jsonb_build_object('id', 'cxp_reg_pago_total', 'empresa_id', v_empresa, 'fecha_emision', current_date, 'fecha_vencimiento', current_date + 30, 'monto_total', 50, 'saldo', 50, 'tipo_beneficiario', 'proveedor', 'sociedad_id', '609a2f33-d057-411f-a001-4e3e83f700d0', 'orden_compra_id', v_oc_pago_total), 'cxp_manual', 'crear');

  -- 1. Pago parcial: CxP y movimiento creados; OC no se cierra.
  v_result := public.registrar_pago_cxp_atomico(
    v_cxp_pago, 40,
    jsonb_build_object('id', 'cxpp_reg_parcial', 'fecha_pago', current_date, 'monto', 40, 'referencia', 'REG-PARCIAL'),
    jsonb_build_object('id', 'tes_reg_parcial', 'descripcion', 'REG-PARCIAL', 'monto', 40, 'fecha', current_date, 'referencia', 'REG-PARCIAL')
  );
  select count(*) into v_count from public.cxp_pagos where id = 'cxpp_reg_parcial';
  select count(*) + (select count(*) from public.movimientos_tesoreria where id = 'tes_reg_parcial') into v_count from public.cxp_pagos where id = 'cxpp_reg_parcial';
  select estado into v_estado from public.ordenes_compra where id = v_oc_pago_parcial;
  insert into _cxp_regression_results values (1, 'pago parcial', case when v_count = 2 and v_estado <> 'cerrada' then 'ACEPTADO' else 'FALLO' end, format('cxp_pagos=1 movimientos_tesoreria=1 oc_estado=%s cxp_estado=%s', v_estado, v_result->'cxp'->>'estado'));

  -- 2. Pago que completa la OC: OC cerrada.
  v_result := public.registrar_pago_cxp_atomico(
    'cxp_reg_pago_total', 50,
    jsonb_build_object('id', 'cxpp_reg_total', 'fecha_pago', current_date, 'monto', 50, 'referencia', 'REG-TOTAL'),
    jsonb_build_object('id', 'tes_reg_total', 'descripcion', 'REG-TOTAL', 'monto', 50, 'fecha', current_date, 'referencia', 'REG-TOTAL')
  );
  select estado into v_estado from public.ordenes_compra where id = v_oc_pago_total;
  insert into _cxp_regression_results values (2, 'pago total y cierre OC', case when v_estado = 'cerrada' then 'ACEPTADO' else 'FALLO' end, format('oc_estado=%s cxp_estado=%s', v_estado, v_result->'cxp'->>'estado'));

  -- 3. Dos CxP parciales que completan exactamente la OC.
  perform public.generar_cxp_centralizado(jsonb_build_object('id', v_cxp_partes_1, 'empresa_id', v_empresa, 'fecha_emision', current_date, 'fecha_vencimiento', current_date + 30, 'monto_total', 40, 'saldo', 40, 'tipo_beneficiario', 'proveedor', 'sociedad_id', '609a2f33-d057-411f-a001-4e3e83f700d0', 'orden_compra_id', v_oc_partes), 'cxp_manual', 'crear');
  perform public.generar_cxp_centralizado(jsonb_build_object('id', v_cxp_partes_2, 'empresa_id', v_empresa, 'fecha_emision', current_date, 'fecha_vencimiento', current_date + 30, 'monto_total', 60, 'saldo', 60, 'tipo_beneficiario', 'proveedor', 'sociedad_id', '609a2f33-d057-411f-a001-4e3e83f700d0', 'orden_compra_id', v_oc_partes), 'cxp_manual', 'crear');
  select count(*) into v_count from public.cxp where orden_compra_id = v_oc_partes and estado <> 'anulada';
  insert into _cxp_regression_results values (3, 'dos CxP parciales exactas', case when v_count = 2 then 'ACEPTADAS' else 'FALLO' end, format('cxp_activas=%s suma=100.00 oc_total=100.00', v_count));

  -- 4. Tercera CxP excedente: rechazada.
  begin
    perform public.generar_cxp_centralizado(jsonb_build_object('id', 'cxp_reg_exceso', 'empresa_id', v_empresa, 'fecha_emision', current_date, 'fecha_vencimiento', current_date + 30, 'monto_total', 0.01, 'saldo', 0.01, 'tipo_beneficiario', 'proveedor', 'sociedad_id', '609a2f33-d057-411f-a001-4e3e83f700d0', 'orden_compra_id', v_oc_partes), 'cxp_manual', 'crear');
    insert into _cxp_regression_results values (4, 'tercera CxP excedente', 'FALLO', 'la llamada no fue rechazada');
  exception when others then
    get stacked diagnostics v_error = message_text;
    insert into _cxp_regression_results values (4, 'tercera CxP excedente', 'RECHAZADA', v_error);
  end;

  -- 5. CxP sin OC: aceptada.
  v_result := public.generar_cxp_centralizado(jsonb_build_object('id', v_cxp_sin_oc, 'empresa_id', v_empresa, 'fecha_emision', current_date, 'fecha_vencimiento', current_date + 30, 'monto_total', 12, 'saldo', 12, 'tipo_beneficiario', 'proveedor', 'sociedad_id', '609a2f33-d057-411f-a001-4e3e83f700d0'), 'cxp_manual', 'crear');
  insert into _cxp_regression_results values (5, 'CxP sin OC', case when v_result->>'id' = v_cxp_sin_oc then 'ACEPTADA' else 'FALLO' end, format('cxp_id=%s', v_result->>'id'));

  -- 6. Recepcion con anterior anulada: se recrea.
  insert into public.recepciones (id, empresa_id, estado) values ('rec_reg_anulada', v_empresa, 'confirmada');
  perform public.generar_cxp_centralizado(jsonb_build_object('id', v_cxp_recep_anulada, 'empresa_id', v_empresa, 'fecha_emision', current_date, 'fecha_vencimiento', current_date + 30, 'monto_total', 10, 'saldo', 10, 'tipo_beneficiario', 'proveedor', 'sociedad_id', '609a2f33-d057-411f-a001-4e3e83f700d0', 'recepcion_id', 'rec_reg_anulada'), 'recepcion_create', 'crear');
  update public.cxp set estado = 'anulada' where id = v_cxp_recep_anulada;
  v_result := public.generar_cxp_centralizado(jsonb_build_object('id', 'cxp_reg_recep_recreada', 'empresa_id', v_empresa, 'fecha_emision', current_date, 'fecha_vencimiento', current_date + 30, 'monto_total', 10, 'saldo', 10, 'tipo_beneficiario', 'proveedor', 'sociedad_id', '609a2f33-d057-411f-a001-4e3e83f700d0', 'recepcion_id', 'rec_reg_anulada'), 'recepcion_create', 'crear');
  insert into _cxp_regression_results values (6, 'recepcion anterior anulada', case when v_result->>'id' = 'cxp_reg_recep_recreada' then 'ACEPTADA / RECREADA' else 'FALLO' end, format('cxp_id=%s anterior_estado=anulada', v_result->>'id'));

  -- 7. Recepcion con anterior no anulada: bloqueada.
  insert into public.recepciones (id, empresa_id, estado) values ('rec_reg_activa', v_empresa, 'confirmada');
  perform public.generar_cxp_centralizado(jsonb_build_object('id', v_cxp_recep_activa, 'empresa_id', v_empresa, 'fecha_emision', current_date, 'fecha_vencimiento', current_date + 30, 'monto_total', 10, 'saldo', 10, 'tipo_beneficiario', 'proveedor', 'sociedad_id', '609a2f33-d057-411f-a001-4e3e83f700d0', 'recepcion_id', 'rec_reg_activa'), 'recepcion_create', 'crear');
  begin
    perform public.generar_cxp_centralizado(jsonb_build_object('id', 'cxp_reg_recep_bloqueada', 'empresa_id', v_empresa, 'fecha_emision', current_date, 'fecha_vencimiento', current_date + 30, 'monto_total', 10, 'saldo', 10, 'tipo_beneficiario', 'proveedor', 'sociedad_id', '609a2f33-d057-411f-a001-4e3e83f700d0', 'recepcion_id', 'rec_reg_activa'), 'recepcion_create', 'crear');
    insert into _cxp_regression_results values (7, 'recepcion anterior no anulada', 'FALLO', 'la llamada no fue bloqueada');
  exception when others then
    get stacked diagnostics v_error = message_text;
    insert into _cxp_regression_results values (7, 'recepcion anterior no anulada', 'BLOQUEADA', v_error);
  end;

  -- 8. Alias ingles de anulacion.
  v_result := public.generar_cxp_centralizado(jsonb_build_object('id', v_cxp_liq_alias_en, 'empresa_id', v_empresa, 'fecha_emision', current_date, 'fecha_vencimiento', current_date + 30, 'monto_total', 10, 'saldo', 10, 'tipo_beneficiario', 'proveedor', 'sociedad_id', '609a2f33-d057-411f-a001-4e3e83f700d0'), 'cxp_manual', 'crear');
  v_result := public.generar_cxp_centralizado(jsonb_build_object('id', v_cxp_liq_alias_en, 'estado', 'anulada', 'saldo', 0), 'liquidation_anular', 'actualizar');
  insert into _cxp_regression_results values (8, 'anulacion liquidation_anular', case when v_result->>'estado' = 'anulada' then 'ACEPTADA' else 'FALLO' end, format('estado=%s', v_result->>'estado'));

  -- 9. Alias espanol de anulacion.
  v_result := public.generar_cxp_centralizado(jsonb_build_object('id', v_cxp_liq_alias_es, 'empresa_id', v_empresa, 'fecha_emision', current_date, 'fecha_vencimiento', current_date + 30, 'monto_total', 10, 'saldo', 10, 'tipo_beneficiario', 'proveedor', 'sociedad_id', '609a2f33-d057-411f-a001-4e3e83f700d0'), 'cxp_manual', 'crear');
  v_result := public.generar_cxp_centralizado(jsonb_build_object('id', v_cxp_liq_alias_es, 'estado', 'anulada', 'saldo', 0), 'liquidacion_anular', 'actualizar');
  insert into _cxp_regression_results values (9, 'anulacion liquidacion_anular', case when v_result->>'estado' = 'anulada' then 'ACEPTADA' else 'FALLO' end, format('estado=%s', v_result->>'estado'));

  -- 10. Origen inexistente.
  begin
    perform public.generar_cxp_centralizado(jsonb_build_object('id', 'cxp_reg_origen_invalido', 'empresa_id', v_empresa, 'fecha_emision', current_date, 'fecha_vencimiento', current_date + 30, 'monto_total', 1, 'saldo', 1, 'tipo_beneficiario', 'proveedor', 'sociedad_id', '609a2f33-d057-411f-a001-4e3e83f700d0'), 'origen_inexistente', 'crear');
    insert into _cxp_regression_results values (10, 'origen inexistente', 'FALLO', 'la llamada no fue rechazada');
  exception when others then
    get stacked diagnostics v_error = message_text;
    insert into _cxp_regression_results values (10, 'origen inexistente', 'RECHAZADO', v_error);
  end;

  -- 11. registrar_gasto_pagado_auto conserva nuevo_egreso.
  insert into public.compras_gastos (id, empresa_id, tipo, descripcion, categoria, monto, moneda, fecha, origen_registro, estado, estado_pago, es_activo_fijo, sociedad_id)
  values (v_gasto, v_empresa, 'gasto', 'Regresion nuevo egreso', 'Regresion', 25, 'PEN', current_date, 'backoffice', 'registrado', 'pendiente', false, '609a2f33-d057-411f-a001-4e3e83f700d0');
  v_result := public.registrar_gasto_pagado_auto(jsonb_build_object(
    'gasto_id', v_gasto,
    'cxp', jsonb_build_object('id', 'cxp_reg_nuevo_egreso', 'empresa_id', v_empresa, 'fecha_emision', current_date, 'fecha_vencimiento', current_date + 30, 'monto_total', 25, 'saldo', 0, 'monto_pagado', 25, 'tipo_beneficiario', 'proveedor', 'sociedad_id', '609a2f33-d057-411f-a001-4e3e83f700d0', 'gasto_id', v_gasto, 'estado', 'pagada'),
    'pago', jsonb_build_object('id', 'cxpp_reg_nuevo_egreso', 'empresa_id', v_empresa, 'cxp_id', 'cxp_reg_nuevo_egreso', 'fecha_pago', current_date, 'monto', 25, 'referencia', 'REG-NUEVO-EGRESO', 'creado_en', now()),
    'movimiento', jsonb_build_object('id', 'tes_reg_nuevo_egreso', 'empresa_id', v_empresa, 'tipo', 'egreso', 'descripcion', 'REG-NUEVO-EGRESO', 'monto', 25, 'moneda', 'PEN', 'fecha', current_date, 'referencia', 'REG-NUEVO-EGRESO', 'vinculo_tipo', 'cxp', 'vinculo_id', 'cxp_reg_nuevo_egreso', 'estado', 'registrado', 'es_manual', false)
  ));
  select cxp_id into v_cxp_gasto from public.compras_gastos where id = v_gasto;
  insert into _cxp_regression_results values (11, 'registrar_gasto_pagado_auto / nuevo_egreso', case when v_result->>'created' = 'true' and v_cxp_gasto = 'cxp_reg_nuevo_egreso' then 'ACEPTADO' else 'FALLO' end, format('created=%s cxp_id=%s', v_result->>'created', v_cxp_gasto));
end;
$$;

select caso, nombre, resultado, detalle
from _cxp_regression_results
order by caso;

rollback;
