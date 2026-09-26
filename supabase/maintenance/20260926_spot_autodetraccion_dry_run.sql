\set ON_ERROR_STOP on
\pset pager off
\pset format aligned
\pset null '[NULL]'
\echo '--- SPOT Bloque 2 / autodetraccion: dry run ---'
begin;
\ir 20260926_spot_autodetraccion_body.sql

create or replace function pg_temp.fixture_spot2(
  p_tag text,
  p_moneda text default 'PEN',
  p_estado text default 'pendiente',
  p_fecha date default date '2026-09-24'
) returns jsonb
language plpgsql
as $fixture$
declare
  v_factura text := 'fac_spot2_' || p_tag;
  v_cxc text := 'cxc_spot2_' || p_tag;
  v_detraccion uuid;
  v_catalogo uuid;
  v_tc numeric := case when p_moneda = 'USD' then 3.38 else null end;
  v_base numeric := case when p_moneda = 'USD' then round(1000 * v_tc, 2) else 1000 end;
  v_origen numeric := 120;
  v_soles numeric := case when p_moneda = 'USD' then round(v_base * 12 / 100, 0) else 120 end;
begin
  select s.id into v_catalogo
  from public.spot_catalogo s
  where s.codigo = '012'
    and s.vigencia_desde <= p_fecha
    and (s.vigencia_hasta is null or s.vigencia_hasta >= p_fecha)
  order by s.vigencia_desde desc
  limit 1;
  if v_catalogo is null then
    raise exception 'FIXTURE|spot_catalogo_012_ausente';
  end if;

  insert into public.facturas (
    id, empresa_id, cuenta_id, centro_beneficio_id, sociedad_id, numero,
    tipo_documento, fecha_emision, fecha_vencimiento, subtotal, igv, total,
    moneda, estado, items, aplica_retencion, monto_retencion,
    monto_neto_cobrable, aplica_detraccion, porcentaje_detraccion, monto_detraccion
  ) values (
    v_factura, 'emp_2000000000', 'cta_108241', 'cebe_1fd8d3d7f35a445c92',
    '609a2f33-d057-411f-a001-4e3e83f700d0', 'F-SPOT2-' || p_tag,
    'factura', p_fecha, p_fecha + 30, round(1000 / 1.18, 2),
    round(1000 - round(1000 / 1.18, 2), 2), 1000, p_moneda, 'emitida',
    '[]'::jsonb, false, 0, 1000, p_estado is not null,
    case when p_estado is null then null else 12 end,
    case when p_estado is null then null else v_origen end
  );

  insert into public.cxc (
    id, empresa_id, cuenta_id, factura_id, sociedad_id, fecha_emision,
    fecha_vencimiento, monto_total, monto_pagado, saldo, moneda, estado,
    monto_retencion
  ) values (
    v_cxc, 'emp_2000000000', 'cta_108241', v_factura,
    '609a2f33-d057-411f-a001-4e3e83f700d0', p_fecha, p_fecha + 30,
    1000, 0, 1000, p_moneda, 'por_cobrar', 0
  );

  if p_estado is not null then
    insert into public.detracciones (
      direccion, factura_id, cxc_id, empresa_id, sociedad_id, spot_catalogo_id,
      codigo_spot, porcentaje, base_soles, monto_detraccion_soles,
      monto_detraccion_origen, moneda_origen, tipo_cambio, tipo_cambio_fuente,
      origen, estado
    ) values (
      'venta', v_factura, v_cxc, 'emp_2000000000',
      '609a2f33-d057-411f-a001-4e3e83f700d0', v_catalogo, '012', 12, v_base,
      v_soles, v_origen, p_moneda, v_tc,
      case when p_moneda = 'USD' then 'manual' else null end,
      'emision', p_estado
    ) returning id into v_detraccion;
  end if;

  return jsonb_build_object(
    'factura_id', v_factura,
    'cxc_id', v_cxc,
    'detraccion_id', v_detraccion,
    'monto_soles', v_soles
  );
end;
$fixture$;

insert into public.cuentas_bancarias (
  id, empresa_id, nombre, banco, moneda, tipo, estado, sociedad_id,
  es_cuenta_detracciones
) values
  ('cb_spot2_origen', 'emp_2000000000', 'Cuenta origen SPOT2', 'Banco de prueba', 'PEN', 'corriente', 'activo', '609a2f33-d057-411f-a001-4e3e83f700d0', false),
  ('cb_spot2_destino', 'emp_2000000000', 'Cuenta BN SPOT2', 'Banco de la Nación', 'PEN', 'corriente', 'activo', '609a2f33-d057-411f-a001-4e3e83f700d0', true),
  ('cb_spot2_destino_other', 'emp_2000000000', 'Cuenta BN otra sociedad SPOT2', 'Banco de la Nación', 'PEN', 'corriente', 'activo', 'b03f3bda-d4be-4acb-891c-07f36b731fd5', true),
  ('cb_spot2_usd', 'emp_2000000000', 'Cuenta USD SPOT2', 'Banco de prueba', 'USD', 'corriente', 'activo', '609a2f33-d057-411f-a001-4e3e83f700d0', false)
on conflict (id) do update set
  moneda = excluded.moneda,
  estado = excluded.estado,
  sociedad_id = excluded.sociedad_id,
  es_cuenta_detracciones = excluded.es_cuenta_detracciones;

select set_config('request.jwt.claims', '{"sub":"94c60fcb-8818-42e4-b395-31a8ff8635b1","role":"authenticated"}', true);

\echo '--- caso 1: cobro normal sin detraccion, parcial ---'
do $test$
declare f jsonb; r jsonb;
begin
  f := pg_temp.fixture_spot2('normal_parcial', 'PEN', null);
  r := public.registrar_cobro_cxc_atomico('emp_2000000000', f->>'cxc_id',
    jsonb_build_object('id','cob_spot2_1','monto_capital',300,'fecha_cobro','2026-09-24'),
    jsonb_build_object('id','tes_spot2_1','monto',300,'moneda','PEN','fecha','2026-09-24','cuenta_bancaria_id','cb_spot2_origen'), null);
  if r->'cxc'->>'saldo' <> '700.00' then raise exception 'CASO_1|saldo_incorrecto'; end if;
  raise notice 'CASO_1|cobro_normal_parcial=aceptado';
end;
$test$;

\echo '--- caso 2: cobro normal sin detraccion, total ---'
do $test$
declare f jsonb; r jsonb;
begin
  f := pg_temp.fixture_spot2('normal_total', 'PEN', null);
  r := public.registrar_cobro_cxc_atomico('emp_2000000000', f->>'cxc_id',
    jsonb_build_object('id','cob_spot2_2','monto_capital',1000,'fecha_cobro','2026-09-24'),
    jsonb_build_object('id','tes_spot2_2','monto',1000,'moneda','PEN','fecha','2026-09-24','cuenta_bancaria_id','cb_spot2_origen'), null);
  if r->'cxc'->>'estado' <> 'cobrada' then raise exception 'CASO_2|estado_incorrecto'; end if;
  raise notice 'CASO_2|cobro_normal_total=aceptado';
end;
$test$;

\echo '--- caso 3: limite normal con detraccion pendiente ---'
do $test$
declare f jsonb; e text; r jsonb;
begin
  f := pg_temp.fixture_spot2('limite_normal', 'PEN', 'pendiente');
  begin
    r := public.registrar_cobro_cxc_atomico('emp_2000000000', f->>'cxc_id',
      jsonb_build_object('id','cob_spot2_3a','monto_capital',881),
      jsonb_build_object('id','tes_spot2_3a','monto',881,'moneda','PEN','cuenta_bancaria_id','cb_spot2_origen'), null);
  exception when others then e := sqlerrm; end;
  if e not like 'El cobro normal no puede invadir%' then raise exception 'CASO_3|rechazo_incorrecto=%', e; end if;
  r := public.registrar_cobro_cxc_atomico('emp_2000000000', f->>'cxc_id',
    jsonb_build_object('id','cob_spot2_3b','monto_capital',880),
    jsonb_build_object('id','tes_spot2_3b','monto',880,'moneda','PEN','cuenta_bancaria_id','cb_spot2_origen'), null);
  raise notice 'CASO_3|881=rechazado|880=aceptado|limite_preservado';
end;
$test$;

\echo '--- caso 4: deposito de detraccion del cliente ---'
do $test$
declare f jsonb; r jsonb; d text;
begin
  f := pg_temp.fixture_spot2('deposito_cliente', 'PEN', 'pendiente');
  r := public.registrar_cobro_cxc_atomico('emp_2000000000', f->>'cxc_id',
    jsonb_build_object('id','cob_spot2_4','tipo_cobro','detraccion','detraccion_id',f->>'detraccion_id','monto_capital',120,'numero_constancia','CONST-SPOT2-4','fecha_cobro','2026-09-24'),
    jsonb_build_object('id','tes_spot2_4','monto',120,'moneda','PEN','fecha','2026-09-24','cuenta_bancaria_id','cb_spot2_destino'), null);
  select estado into d from public.detracciones where id=(f->>'detraccion_id')::uuid;
  if d <> 'depositada' then raise exception 'CASO_4|estado=%', d; end if;
  raise notice 'CASO_4|deposito_cliente=aceptado|estado=depositada';
end;
$test$;

\echo '--- caso 5: indicador total sin detraer con monto corto ---'
do $test$
declare f jsonb; e text; r jsonb;
begin
  f := pg_temp.fixture_spot2('autocorto', 'PEN', 'pendiente');
  begin
    r := public.registrar_cobro_cxc_atomico('emp_2000000000', f->>'cxc_id',
      jsonb_build_object('id','cob_spot2_5','monto_capital',999,'cliente_pago_total_sin_detraer',true),
      jsonb_build_object('id','tes_spot2_5','monto',999,'moneda','PEN','cuenta_bancaria_id','cb_spot2_origen'), null);
  exception when others then e := sqlerrm; end;
  if e not like 'El pago total sin detraccion debe cubrir exactamente%' then raise exception 'CASO_5|mensaje=%',e; end if;
  raise notice 'CASO_5|pago_total_sin_detraer_monto_corto=rechazado';
end;
$test$;

\echo '--- caso 6: indicador total sin detraer sin obligacion ---'
do $test$
declare f jsonb; e text; r jsonb;
begin
  f := pg_temp.fixture_spot2('autosinobligacion', 'PEN', null);
  delete from public.detracciones where id=(f->>'detraccion_id')::uuid;
  begin
    r := public.registrar_cobro_cxc_atomico('emp_2000000000', f->>'cxc_id',
      jsonb_build_object('id','cob_spot2_6','monto_capital',1000,'cliente_pago_total_sin_detraer',true),
      jsonb_build_object('id','tes_spot2_6','monto',1000,'moneda','PEN','cuenta_bancaria_id','cb_spot2_origen'), null);
  exception when others then e := sqlerrm; end;
  if e not like 'El pago total sin detraccion requiere%' then raise exception 'CASO_6|mensaje=%',e; end if;
  raise notice 'CASO_6|sin_obligacion_pendiente=rechazado';
end;
$test$;

\echo '--- caso 7: cobro total sin detraer, transicion y comision unica ---'
do $test$
declare f jsonb; r jsonb; d record; n integer;
begin
  f := pg_temp.fixture_spot2('autopago', 'PEN', 'pendiente');
  r := public.registrar_cobro_cxc_atomico('emp_2000000000', f->>'cxc_id',
    jsonb_build_object('id','cob_spot2_7','monto_capital',1000,'cliente_pago_total_sin_detraer',true,'fecha_cobro','2026-09-24'),
    jsonb_build_object('id','tes_spot2_7','monto',1000,'moneda','PEN','fecha','2026-09-24','cuenta_bancaria_id','cb_spot2_origen'),
    jsonb_build_object('id','com_spot2_7','monto_cobrado',1000,'porcentaje_comision',10,'monto_comision',100,'bonificacion',0,'monto_total',100,'modalidad_pago','Planilla','periodo','2026-09','estado','pendiente_aprobacion'));
  select * into d from public.detracciones where id=(f->>'detraccion_id')::uuid;
  select count(*) into n from public.comisiones where cobro_cxc_id='cob_spot2_7';
  if r->'cxc'->>'estado' <> 'cobrada' or d.estado <> 'por_autodetraer' or d.fecha_limite_deposito is null or n <> 1 then raise exception 'CASO_7|resultado_incorrecto'; end if;
  raise notice 'CASO_7|cxc=cobrada|obligacion=por_autodetraer|fecha_limite=true|comisiones=1';
end;
$test$;

\echo '--- caso 8: autodetraccion atomica valida ---'
do $test$
declare f jsonb; r jsonb; d record; n integer; vinculo text;
begin
  f := pg_temp.fixture_spot2('autovalida', 'PEN', 'por_autodetraer');
  r := public.registrar_autodetraccion('emp_2000000000',(f->>'detraccion_id')::uuid,'cb_spot2_origen','cb_spot2_destino',date '2026-09-30','CONST-AUTO-8','OP-AUTO-8');
  select * into d from public.detracciones where id=(f->>'detraccion_id')::uuid;
  select count(*), min(vinculo_id) into n, vinculo from public.movimientos_tesoreria where detraccion_id=(f->>'detraccion_id')::uuid and vinculo_tipo='autodetraccion';
  if d.estado <> 'autodetraida' or n <> 2 or vinculo is null or r->'movimiento_egreso'->>'tipo' <> 'egreso' or r->'movimiento_ingreso'->>'tipo' <> 'ingreso' then raise exception 'CASO_8|resultado_incorrecto'; end if;
  raise notice 'CASO_8|egreso_ingreso=2|monto=120_PEN|estado=autodetraida|constancia=obligatoria';
end;
$test$;

\echo '--- caso 9: rechazo atomico por sociedad de destino ---'
do $test$
declare f jsonb; e text; r jsonb; n integer;
begin
  f := pg_temp.fixture_spot2('autoinvalida', 'PEN', 'por_autodetraer');
  begin
    r := public.registrar_autodetraccion('emp_2000000000',(f->>'detraccion_id')::uuid,'cb_spot2_origen','cb_spot2_destino_other',date '2026-09-30','CONST-AUTO-9',null);
  exception when others then e := sqlerrm; end;
  select count(*) into n from public.movimientos_tesoreria where detraccion_id=(f->>'detraccion_id')::uuid;
  if e not like 'La cuenta destino debe ser%' or n <> 0 then raise exception 'CASO_9|rollback_incorrecto|mensaje=%|movimientos=%',e,n; end if;
  raise notice 'CASO_9|sociedad_distinta=rechazado|movimientos=0';
end;
$test$;

\echo '--- caso 10: reintento sin duplicar ni cobrar ---'
do $test$
declare f jsonb; e text; r jsonb; n integer; c integer; m integer;
begin
  f := pg_temp.fixture_spot2('autoreintento', 'PEN', 'por_autodetraer');
  r := public.registrar_autodetraccion('emp_2000000000',(f->>'detraccion_id')::uuid,'cb_spot2_origen','cb_spot2_destino',date '2026-09-30','CONST-AUTO-10',null);
  begin
    r := public.registrar_autodetraccion('emp_2000000000',(f->>'detraccion_id')::uuid,'cb_spot2_origen','cb_spot2_destino',date '2026-09-30','CONST-AUTO-10',null);
  exception when others then e := sqlerrm; end;
  select count(*) into n from public.movimientos_tesoreria where detraccion_id=(f->>'detraccion_id')::uuid;
  select count(*) into c from public.cobros_cxc where cxc_id=f->>'cxc_id';
  select count(*) into m from public.comisiones where cxc_id=f->>'cxc_id';
  if e not like 'La obligación SPOT no está pendiente%' or n <> 2 or c <> 0 or m <> 0 then raise exception 'CASO_10|idempotencia_incorrecta'; end if;
  raise notice 'CASO_10|reintento=rechazado|movimientos=2|cobros=0|comisiones=0';
end;
$test$;

\echo '--- caso 11: origen USD rechazado ---'
do $test$
declare f jsonb; e text; r jsonb;
begin
  f := pg_temp.fixture_spot2('autousd', 'USD', 'por_autodetraer');
  begin
    r := public.registrar_autodetraccion('emp_2000000000',(f->>'detraccion_id')::uuid,'cb_spot2_usd','cb_spot2_destino',date '2026-09-30','CONST-AUTO-11',null);
  exception when others then e := sqlerrm; end;
  if e not like 'La cuenta origen debe ser%' then raise exception 'CASO_11|mensaje=%',e; end if;
  raise notice 'CASO_11|cuenta_origen_USD=rechazada|regla=PEN_only';
end;
$test$;

\echo '--- caso 12: trigger defensivo ---'
do $test$
declare e text;
begin
  begin
    insert into public.movimientos_tesoreria(id,empresa_id,tipo,descripcion,monto,moneda,fecha,cuenta_bancaria_id,vinculo_tipo,vinculo_id,estado,detraccion_id)
    values('tes_spot2_12a','emp_2000000000','egreso','Movimiento no SPOT',10,'PEN',date '2026-09-24','cb_spot2_origen','otro','spot2-12','registrado',gen_random_uuid());
  exception when others then e := sqlerrm; end;
  if e not like 'La cuenta bancaria del movimiento no es%' then raise exception 'CASO_12|egreso_no_autodetraccion=%',e; end if;
  begin
    insert into public.movimientos_tesoreria(id,empresa_id,tipo,descripcion,monto,moneda,fecha,cuenta_bancaria_id,vinculo_tipo,vinculo_id,estado)
    values('tes_spot2_12b','emp_2000000000','ingreso','Cobro normal BN',10,'PEN',date '2026-09-24','cb_spot2_destino','cxc','spot2-12b','registrado');
  exception when others then e := sqlerrm; end;
  if e not like 'Un cobro normal%' then raise exception 'CASO_12|ingreso_BN=%',e; end if;
  raise notice 'CASO_12|egreso_sin_vinculo=rechazado|cobro_normal_BN=rechazado';
end;
$test$;

\echo '--- caso 13: por_autodetraer no acepta deposito del cliente ---'
do $test$
declare f jsonb; e text; r jsonb;
begin
  f := pg_temp.fixture_spot2('autodeposito_cliente', 'PEN', 'por_autodetraer');
  begin
    r := public.registrar_cobro_cxc_atomico('emp_2000000000',f->>'cxc_id',jsonb_build_object('id','cob_spot2_13','tipo_cobro','detraccion','detraccion_id',f->>'detraccion_id','monto_capital',120),jsonb_build_object('id','tes_spot2_13','monto',120,'moneda','PEN','cuenta_bancaria_id','cb_spot2_destino'),null);
  exception when others then e := sqlerrm; end;
  if e not like 'No existe una obligacion SPOT pendiente%' then raise exception 'CASO_13|mensaje=%',e; end if;
  raise notice 'CASO_13|deposito_cliente_sobre_por_autodetraer=rechazado';
end;
$test$;

\echo '--- caso 14: NC y ND bloqueadas ---'
do $test$
declare f jsonb; e_nc text; e_nd text; r jsonb;
begin
  f := pg_temp.fixture_spot2('autonotas', 'PEN', 'por_autodetraer');
  begin
    r := public.emitir_nota_cxc_atomica(jsonb_build_object('empresa_id','emp_2000000000','factura_origen_id',f->>'factura_id','factura_id','fac_spot2_14_nc','sociedad_id','609a2f33-d057-411f-a001-4e3e83f700d0','tipo_documento','nota_credito','motivo_codigo','01','fecha_emision','2026-09-24','subtotal',84.75,'igv',15.25,'total',100,'moneda','PEN'));
  exception when others then e_nc := sqlerrm; end;
  begin
    r := public.emitir_nota_cxc_atomica(jsonb_build_object('empresa_id','emp_2000000000','factura_origen_id',f->>'factura_id','factura_id','fac_spot2_14_nd','sociedad_id','609a2f33-d057-411f-a001-4e3e83f700d0','tipo_documento','nota_debito','motivo_codigo','01','fecha_emision','2026-09-24','subtotal',84.75,'igv',15.25,'total',100,'moneda','PEN'));
  exception when others then e_nd := sqlerrm; end;
  if e_nc <> 'La factura tiene una autodetracción pendiente; regístrala antes de emitir notas.' or e_nd <> 'La factura tiene una autodetracción pendiente; regístrala antes de emitir notas.' then raise exception 'CASO_14|mensajes_no_coinciden'; end if;
  raise notice 'CASO_14|NC=rechazada|ND=rechazada|mensaje_D7=exacto';
end;
$test$;

\echo '--- caso 15: no-regresion resumida ---'
do $test$
declare f jsonb; r jsonb; d text;
begin
  f := pg_temp.fixture_spot2('noregresion_det', 'PEN', 'pendiente');
  r := public.registrar_cobro_cxc_atomico('emp_2000000000',f->>'cxc_id',jsonb_build_object('id','cob_spot2_15n','monto_capital',880),jsonb_build_object('id','tes_spot2_15n','monto',880,'moneda','PEN','cuenta_bancaria_id','cb_spot2_origen'),null);
  r := public.registrar_cobro_cxc_atomico('emp_2000000000',f->>'cxc_id',jsonb_build_object('id','cob_spot2_15d','tipo_cobro','detraccion','detraccion_id',f->>'detraccion_id','monto_capital',120),jsonb_build_object('id','tes_spot2_15d','monto',120,'moneda','PEN','cuenta_bancaria_id','cb_spot2_destino'),null);
  select estado into d from public.detracciones where id=(f->>'detraccion_id')::uuid;
  if r->'cxc'->>'estado' <> 'cobrada' or d <> 'depositada' then raise exception 'CASO_15|no_regresion_fallo'; end if;
  raise notice 'CASO_15|normal=preservado|limite=preservado|deposito=preservado|nota_pendiente=preservada';
end;
$test$;

\echo '--- caso 16: quinto dia habil con feriado nacional temporal ---'
do $test$
declare f jsonb; r jsonb; d date;
begin
  insert into public.feriados(empresa_id,fecha,nombre,origen,ambito)
  values('emp_2000000000',date '2026-09-28','Feriado nacional de prueba SPOT2','manual','nacional')
  on conflict (empresa_id,fecha) do update set ambito='nacional';
  f := pg_temp.fixture_spot2('fecha_habil', 'PEN', 'pendiente', date '2026-09-24');
  r := public.registrar_cobro_cxc_atomico('emp_2000000000',f->>'cxc_id',jsonb_build_object('id','cob_spot2_16','monto_capital',1000,'cliente_pago_total_sin_detraer',true,'fecha_cobro','2026-09-24'),jsonb_build_object('id','tes_spot2_16','monto',1000,'moneda','PEN','fecha','2026-09-24','cuenta_bancaria_id','cb_spot2_origen'),null);
  select fecha_limite_deposito into d from public.detracciones where id=(f->>'detraccion_id')::uuid;
  if d <> date '2026-10-02' then raise exception 'CASO_16|fecha=%|esperada=2026-10-02',d; end if;
  raise notice 'CASO_16|cobro=2026-09-24|feriado=2026-09-28|quinto_habil=2026-10-02';
end;
$test$;

rollback;
\echo 'SPOT2_DRY_RUN_ROLLBACK_COMPLETED'
