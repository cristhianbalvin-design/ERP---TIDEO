\set ON_ERROR_STOP on
\pset pager off
\pset null '[NULL]'
\echo '--- Paso 6 constancia: dry run ---'
begin;
\ir 20260924_spot_cobro_constancia_body.sql

select set_config('request.jwt.claims','{"sub":"94c60fcb-8818-42e4-b395-31a8ff8635b1","role":"authenticated"}',true);

create or replace function pg_temp.fixture_constancia(
  p_tag text, p_moneda text, p_total numeric, p_tipo_cambio numeric default null
) returns jsonb
language plpgsql
as $fixture$
declare
  v_factura text := 'fac_const_' || p_tag;
  v_cxc text := 'cxc_const_' || p_tag;
  v_detraccion uuid;
  v_catalogo uuid;
  v_base numeric(18,2);
  v_origen numeric(18,2);
  v_soles numeric(18,2);
begin
  v_base := case when p_moneda = 'USD' then round(p_total * p_tipo_cambio, 2) else round(p_total, 2) end;
  v_origen := case when p_moneda = 'USD' then round(p_total * 12 / 100, 2) else round(p_total * 12 / 100, 0) end;
  v_soles := round(v_base * 12 / 100, 0);
  insert into public.facturas(
    id, empresa_id, cuenta_id, centro_beneficio_id, sociedad_id, numero,
    tipo_documento, fecha_emision, fecha_vencimiento, subtotal, igv, total,
    moneda, estado, items, aplica_retencion, monto_retencion,
    monto_neto_cobrable, aplica_detraccion, porcentaje_detraccion, monto_detraccion
  ) values (
    v_factura, 'emp_2000000000', 'cta_108241', 'cebe_1fd8d3b7f35a445c92',
    '609a2f33-d057-411f-a001-4e3e83f700d0', 'F-CONST-' || p_tag, 'factura',
    date '2026-09-24', date '2026-10-24', round(p_total / 1.18, 2),
    round(p_total - round(p_total / 1.18, 2), 2), p_total, p_moneda, 'emitida',
    '[]'::jsonb, false, 0, null, true, 12, v_origen
  );
  insert into public.cxc(
    id, empresa_id, cuenta_id, factura_id, sociedad_id, fecha_emision,
    fecha_vencimiento, monto_total, monto_pagado, saldo, moneda, estado,
    monto_retencion
  ) values (
    v_cxc, 'emp_2000000000', 'cta_108241', v_factura,
    '609a2f33-d057-411f-a001-4e3e83f700d0', date '2026-09-24', date '2026-10-24',
    p_total, 0, p_total, p_moneda, 'por_cobrar', 0
  );
  select id into v_catalogo from public.spot_catalogo where codigo = '012' order by vigencia_desde desc limit 1;
  insert into public.detracciones(
    direccion, factura_id, cxc_id, empresa_id, sociedad_id, spot_catalogo_id,
    codigo_spot, porcentaje, base_soles, monto_detraccion_soles,
    monto_detraccion_origen, moneda_origen, tipo_cambio, tipo_cambio_fuente,
    origen, estado
  ) values (
    'venta', v_factura, v_cxc, 'emp_2000000000',
    '609a2f33-d057-411f-a001-4e3e83f700d0', v_catalogo, '012', 12, v_base,
    v_soles, v_origen, p_moneda,
    case when p_moneda = 'USD' then p_tipo_cambio else null end,
    case when p_moneda = 'USD' then 'manual' else null end,
    'emision', 'pendiente'
  ) returning id into v_detraccion;
  return jsonb_build_object('factura_id', v_factura, 'cxc_id', v_cxc, 'detraccion_id', v_detraccion);
end;
$fixture$;

insert into public.cuentas_bancarias(
  id, empresa_id, nombre, banco, moneda, tipo, estado, sociedad_id, es_cuenta_detracciones
) values (
  'cb_const_bn', 'emp_2000000000', 'Cuenta BN temporal constancia', 'Banco de la Nacion',
  'PEN', 'corriente', 'activo', '609a2f33-d057-411f-a001-4e3e83f700d0', true
) on conflict (id) do update set es_cuenta_detracciones = excluded.es_cuenta_detracciones;

\echo '--- caso A: cobro normal sin cambios ---'
do $test$
declare f jsonb; r jsonb;
begin
  f := pg_temp.fixture_constancia('normal', 'PEN', 1000);
  delete from public.detracciones where cxc_id = f->>'cxc_id';
  update public.facturas set aplica_detraccion = false, monto_detraccion = null where id = f->>'factura_id';
  r := public.registrar_cobro_cxc_atomico(
    'emp_2000000000', f->>'cxc_id',
    jsonb_build_object('id','cob_const_a','monto_capital',1000,'monto_mora',0,'medio_pago','Transferencia','cuenta_bancaria','cb_299412','fecha_cobro','2026-09-24'),
    jsonb_build_object('id','tes_const_a','descripcion','Cobro normal','monto',1000,'moneda','PEN','fecha','2026-09-24','cuenta_bancaria_id','cb_299412','tc_aplicado',1,'monto_en_moneda_cuenta',1000,'referencia','CONST-A'),
    jsonb_build_object('id','com_const_a','monto_cobrado',1000,'porcentaje_comision',10,'monto_comision',100,'bonificacion',0,'monto_total',100,'modalidad_pago','Planilla','periodo','2026-09','estado','pendiente_aprobacion')
  );
  if r->'cxc'->>'saldo' <> '0.00' or r->'cobro'->>'monto_capital' <> '1000.00' or r->'movimiento'->>'monto' <> '1000.00' then
    raise exception 'CASO_A|no_regresion|resultado_incorrecto';
  end if;
  raise notice 'CASO_A|normal|saldo=0|cobro=1000|movimiento=1000_PEN|comision=1';
end;
$test$;

\echo '--- caso B: PEN 142 con constancia ---'
do $test$
declare f jsonb; r jsonb; d public.detracciones%rowtype;
begin
  f := pg_temp.fixture_constancia('pen_constancia', 'PEN', 1180);
  r := public.registrar_cobro_cxc_atomico(
    'emp_2000000000', f->>'cxc_id',
    jsonb_build_object('id','cob_const_b','tipo_cobro','detraccion','detraccion_id',f->>'detraccion_id','monto_capital',142,'monto_deposito_soles',142,'medio_pago','Detraccion','cuenta_bancaria','cb_const_bn','numero_constancia','CONST-PEN-142','fecha_cobro','2026-09-24'),
    jsonb_build_object('id','tes_const_b','descripcion','Deposito detraccion','monto',142,'moneda','PEN','fecha','2026-09-24','cuenta_bancaria_id','cb_const_bn','tc_aplicado',1,'monto_en_moneda_cuenta',142,'referencia','CONST-PEN-142'),
    jsonb_build_object('id','com_const_b','monto_cobrado',142,'porcentaje_comision',10,'monto_comision',14.2,'bonificacion',0,'monto_total',14.2,'modalidad_pago','Planilla','periodo','2026-09','estado','pendiente_aprobacion')
  );
  select * into d from public.detracciones where id = (f->>'detraccion_id')::uuid;
  if d.estado <> 'depositada' or d.cuenta_destino_id <> 'cb_const_bn' or d.numero_constancia <> 'CONST-PEN-142' or d.fecha_constancia <> date '2026-09-24' then
    raise exception 'CASO_B|trazabilidad_incompleta';
  end if;
  raise notice 'CASO_B|PEN|cuenta=cb_const_bn|constancia=CONST-PEN-142|fecha=2026-09-24|estado=depositada';
end;
$test$;

\echo '--- caso C: PEN sin constancia ---'
do $test$
declare f jsonb; r jsonb; d public.detracciones%rowtype;
begin
  f := pg_temp.fixture_constancia('pen_sin_constancia', 'PEN', 1180);
  r := public.registrar_cobro_cxc_atomico(
    'emp_2000000000', f->>'cxc_id',
    jsonb_build_object('id','cob_const_c','tipo_cobro','detraccion','detraccion_id',f->>'detraccion_id','monto_capital',142,'monto_deposito_soles',142,'medio_pago','Detraccion','cuenta_bancaria','cb_const_bn','fecha_cobro','2026-09-24'),
    jsonb_build_object('id','tes_const_c','descripcion','Deposito detraccion','monto',142,'moneda','PEN','fecha','2026-09-24','cuenta_bancaria_id','cb_const_bn','tc_aplicado',1,'monto_en_moneda_cuenta',142),
    null
  );
  select * into d from public.detracciones where id = (f->>'detraccion_id')::uuid;
  if d.estado <> 'depositada' or d.cuenta_destino_id <> 'cb_const_bn' or d.numero_constancia is not null or d.fecha_constancia <> date '2026-09-24' then
    raise exception 'CASO_C|trazabilidad_incompleta';
  end if;
  raise notice 'CASO_C|PEN|cuenta=cb_const_bn|constancia=NULL|fecha=2026-09-24|estado=depositada';
end;
$test$;

\echo '--- caso D: USD origen 141.60 y deposito 479 PEN ---'
do $test$
declare f jsonb; r jsonb; d public.detracciones%rowtype; co public.comisiones%rowtype;
begin
  f := pg_temp.fixture_constancia('usd_constancia', 'USD', 1180, 3.382768);
  r := public.registrar_cobro_cxc_atomico(
    'emp_2000000000', f->>'cxc_id',
    jsonb_build_object('id','cob_const_d','tipo_cobro','detraccion','detraccion_id',f->>'detraccion_id','monto_capital',141.60,'monto_deposito_soles',479,'medio_pago','Detraccion','cuenta_bancaria','cb_const_bn','numero_constancia','CONST-USD-479','fecha_cobro','2026-09-24'),
    jsonb_build_object('id','tes_const_d','descripcion','Deposito detraccion USD','monto',479,'moneda','PEN','fecha','2026-09-24','cuenta_bancaria_id','cb_const_bn','tc_aplicado',3.382768,'monto_en_moneda_cuenta',479,'referencia','CONST-USD-479'),
    jsonb_build_object('id','com_const_d','monto_cobrado',141.60,'porcentaje_comision',10,'monto_comision',14.16,'bonificacion',0,'monto_total',14.16,'modalidad_pago','Planilla','periodo','2026-09','estado','pendiente_aprobacion')
  );
  select * into d from public.detracciones where id = (f->>'detraccion_id')::uuid;
  select * into co from public.comisiones where cobro_cxc_id = 'cob_const_d';
  if r->'cxc'->>'saldo' <> '1038.40' or r->'movimiento'->>'monto' <> '479.00' or r->'movimiento'->>'moneda' <> 'PEN' or co.monto_cobrado <> 141.60 or d.cuenta_destino_id <> 'cb_const_bn' then
    raise exception 'CASO_D|resultado_incorrecto';
  end if;
  raise notice 'CASO_D|USD|cxc_saldo=1038.40|movimiento=479_PEN|tc=3.382768|base_comision=141.60_USD|cuenta=cb_const_bn';
end;
$test$;

rollback;
\echo 'STEP6_CONSTANCIA_DRY_RUN_ROLLBACK_COMPLETED'
