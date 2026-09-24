\set ON_ERROR_STOP on
\pset pager off
\pset format aligned
\pset null '[NULL]'
\echo '--- Paso redondeo SPOT PEN: dry run ---'
begin;
\ir 20260924_spot_redondeo_pen_body.sql

create or replace function pg_temp.spot_emit_round(
  p_id text, p_num text, p_tipo text, p_sub numeric, p_igv numeric,
  p_total numeric, p_moneda text, p_items jsonb, p_extra jsonb default '{}'::jsonb
) returns jsonb language sql as $$
  select public.emitir_factura_cxc_atomico(
    jsonb_build_object(
      'empresa_id','emp_2000000000','factura_id',p_id,
      'cxc_id','cxc_' || replace(p_id,'fac_',''),'cuenta_id','cta_108241',
      'centro_beneficio_id','cebe_1fd8d3b7f35a445c92',
      'sociedad_id','609a2f33-d057-411f-a001-4e3e83f700d0','numero',p_num,
      'tipo_documento',p_tipo,'fecha_emision','2026-09-24',
      'fecha_vencimiento','2026-10-24','subtotal',p_sub,'igv',p_igv,
      'total',p_total,'moneda',p_moneda,'items',p_items
    ) || p_extra
  );
$$;

create or replace function pg_temp.fixture_round(
  p_tag text, p_total numeric, p_estado text default null,
  p_moneda text default 'PEN', p_tc numeric default null
) returns jsonb language plpgsql as $fixture$
declare
  v_factura text := 'fac_round_' || p_tag;
  v_cxc text := 'cxc_round_' || p_tag;
  v_detraccion uuid; v_catalogo uuid; v_base numeric; v_origen numeric; v_soles numeric;
begin
  v_base := case when p_moneda='USD' then round(p_total*p_tc,2) else round(p_total,2) end;
  v_origen := case when p_moneda='PEN' then round(p_total*12/100,0) else round(p_total*12/100,2) end;
  v_soles := round(v_base*12/100,0);
  insert into public.facturas(
    id,empresa_id,cuenta_id,centro_beneficio_id,sociedad_id,numero,tipo_documento,
    fecha_emision,fecha_vencimiento,subtotal,igv,total,moneda,estado,items,
    aplica_retencion,monto_retencion,monto_neto_cobrable,aplica_detraccion,
    porcentaje_detraccion,monto_detraccion
  ) values (
    v_factura,'emp_2000000000','cta_108241','cebe_1fd8d3b7f35a445c92',
    '609a2f33-d057-411f-a001-4e3e83f700d0','F-ROUND-'||p_tag,'factura',
    date '2026-09-24',date '2026-10-24',round(p_total/1.18,2),
    round(p_total-round(p_total/1.18,2),2),p_total,p_moneda,'emitida','[]'::jsonb,
    false,0,null,p_estado is not null,case when p_estado is null then null else 12 end,
    case when p_estado is null then null else v_origen end
  );
  insert into public.cxc(
    id,empresa_id,cuenta_id,factura_id,sociedad_id,fecha_emision,fecha_vencimiento,
    monto_total,monto_pagado,saldo,moneda,estado,monto_retencion
  ) values (
    v_cxc,'emp_2000000000','cta_108241',v_factura,
    '609a2f33-d057-411f-a001-4e3e83f700d0',date '2026-09-24',date '2026-10-24',
    p_total,0,p_total,p_moneda,'por_cobrar',0
  );
  if p_estado is not null then
    select id into v_catalogo from public.spot_catalogo where codigo='012'
      order by vigencia_desde desc limit 1;
    insert into public.detracciones(
      direccion,factura_id,cxc_id,empresa_id,sociedad_id,spot_catalogo_id,codigo_spot,
      porcentaje,base_soles,monto_detraccion_soles,monto_detraccion_origen,moneda_origen,
      tipo_cambio,tipo_cambio_fuente,origen,estado
    ) values (
      'venta',v_factura,v_cxc,null,null,v_catalogo,'012',12,v_base,v_soles,v_origen,
      p_moneda,case when p_moneda='USD' then p_tc else null end,
      case when p_moneda='USD' then 'manual' else null end,'emision',p_estado
    ) returning id into v_detraccion;
  end if;
  return jsonb_build_object('factura_id',v_factura,'cxc_id',v_cxc,'detraccion_id',v_detraccion);
end;
$fixture$;

create or replace function pg_temp.round_note(
  p_tag text,p_origen text,p_tipo text,p_total numeric,p_extra jsonb default '{}'::jsonb
) returns jsonb language sql as $$
  select public.emitir_nota_cxc_atomica(jsonb_build_object(
    'empresa_id','emp_2000000000','factura_origen_id',p_origen,
    'factura_id','fac_round_n_'||p_tag,
    'sociedad_id','609a2f33-d057-411f-a001-4e3e83f700d0',
    'tipo_documento',p_tipo,'motivo_codigo','01','fecha_emision','2026-09-24',
    'subtotal',round(p_total/1.18,2),
    'igv',round(p_total-round(p_total/1.18,2),2),
    'total',p_total,'moneda','PEN'
  ) || p_extra)
$$;

select set_config('request.jwt.claims','{"sub":"94c60fcb-8818-42e4-b395-31a8ff8635b1","role":"authenticated"}',true);

update public.familia_servicio
set spot_catalogo_id=null where id='fam_d781ee8c60ae024eea';
update public.servicios
set spot_catalogo_id=null where id='srv_c529a00515fe4defb6';

\echo '--- caso 1: no regresion PEN sin codigo y USD con detraccion ---'
do $test$
declare r jsonb; d record; v_cat uuid;
begin
  r:=pg_temp.spot_emit_round('fac_round_1pen','F-ROUND-1P','factura',100,18,118,'PEN',
    jsonb_build_array(jsonb_build_object('descripcion','sin codigo','cantidad',1,'precio_unitario',118)));
  if (r->'factura'->>'aplica_detraccion')<>'false' or exists(select 1 from public.detracciones where factura_id='fac_round_1pen') or r->'cxc'->>'saldo'<>'118.00' then raise exception 'CASO_1|PEN_sin_codigo'; end if;
  select id into v_cat from public.spot_catalogo where codigo='012' order by vigencia_desde desc limit 1;
  update public.familia_servicio set spot_catalogo_id=v_cat where id='fam_d781ee8c60ae024eea';
  r:=pg_temp.spot_emit_round('fac_round_1usd','F-ROUND-1U','factura',847.46,152.54,1000,'USD',
    jsonb_build_array(jsonb_build_object('servicio_id','srv_c529a00515fe4defb6')),
    jsonb_build_object('tipo_cambio_detraccion',3.40,'tipo_cambio_fuente','manual'));
  select * into d from public.detracciones where factura_id='fac_round_1usd';
  if d.monto_detraccion_origen<>120 or d.monto_detraccion_soles<>408 then raise exception 'CASO_1|USD'; end if;
  raise notice 'CASO_1|PEN_sin_codigo=sin_obligacion|USD=origen_120.00_deposito_408.00|campo_a_campo_contrato_preservado';
end;$test$;

\echo '--- caso 2: PEN 1180 con 012 ---'
do $test$
declare r jsonb; d record; f record;
begin
  r:=pg_temp.spot_emit_round('fac_round_2','F-ROUND-2','factura',1000,180,1180,'PEN',jsonb_build_array(jsonb_build_object('servicio_id','srv_c529a00515fe4defb6')));
  select * into d from public.detracciones where factura_id='fac_round_2'; select * into f from public.facturas where id='fac_round_2';
  if d.monto_detraccion_origen<>142 or d.monto_detraccion_soles<>142 or f.monto_detraccion<>142 then raise exception 'CASO_2|esperado_142'; end if;
  raise notice 'CASO_2|1180_x_12pct=141.60|origen=142|deposito=142|espejo=142|maximo_normal=1038';
end;$test$;

\echo '--- caso 3: PEN 1000 con 012 ---'
do $test$
declare r jsonb; d record;
begin
  r:=pg_temp.spot_emit_round('fac_round_3','F-ROUND-3','factura',847.46,152.54,1000,'PEN',jsonb_build_array(jsonb_build_object('servicio_id','srv_c529a00515fe4defb6')));
  select * into d from public.detracciones where factura_id='fac_round_3';
  if d.monto_detraccion_origen<>120 or d.monto_detraccion_soles<>120 then raise exception 'CASO_3|esperado_120'; end if;
  raise notice 'CASO_3|1000_x_12pct=120.00|origen=120|deposito=120';
end;$test$;

\echo '--- caso 4: medio arriba exacto ---'
do $test$
declare r jsonb; d record; v_cat uuid;
begin
  select id into v_cat from public.spot_catalogo where codigo='004' order by vigencia_desde desc limit 1;
  update public.familia_servicio set spot_catalogo_id=v_cat where id='fam_d781ee8c60ae024eea';
  r:=pg_temp.spot_emit_round('fac_round_4','F-ROUND-4','factura',858.90,153.60,1012.50,'PEN',jsonb_build_array(jsonb_build_object('servicio_id','srv_c529a00515fe4defb6')));
  select * into d from public.detracciones where factura_id='fac_round_4';
  if d.monto_detraccion_origen<>41 or d.monto_detraccion_soles<>41 then raise exception 'CASO_4|esperado_41'; end if;
  raise notice 'CASO_4|1012.50_x_4pct=40.50|medio_arriba=41';
end;$test$;

\echo '--- casos 5 a 7: NC/ND PEN recalculados ---'
do $test$
declare a jsonb; r jsonb; d record;
begin
  a:=pg_temp.fixture_round('5',1180,'pendiente'); r:=pg_temp.round_note('5',a->>'factura_id','nota_credito',100);
  select * into d from public.detracciones where factura_id=a->>'factura_id' and documento_ajuste_id is null;
  if d.monto_detraccion_origen<>130 or d.monto_detraccion_soles<>130 then raise exception 'CASO_5|esperado_130'; end if;
  raise notice 'CASO_5|NC_100|total=1080|129.60|nuevo_origen=130|nuevo_deposito=130';

  a:=pg_temp.fixture_round('6',1180,'depositada'); r:=pg_temp.round_note('6',a->>'factura_id','nota_debito',100);
  select * into d from public.detracciones where factura_id=a->>'factura_id' and documento_ajuste_id is not null;
  if d.monto_detraccion_origen<>12 or d.monto_detraccion_soles<>12 then raise exception 'CASO_6|esperado_incremental_12'; end if;
  raise notice 'CASO_6|ND_100|total=1280|153.60|nuevo_deposito=154|incremental=12';

  a:=pg_temp.fixture_round('7',1180,'depositada'); r:=pg_temp.round_note('7',a->>'factura_id','nota_credito',100);
  select * into d from public.detracciones where factura_id=a->>'factura_id' and documento_ajuste_id is not null;
  if d.monto_detraccion_origen<>12 or d.monto_detraccion_soles<>12 or d.estado<>'ajustada' then raise exception 'CASO_7|esperado_ajuste_12'; end if;
  raise notice 'CASO_7|NC_100|nuevo_deposito=130|depositado=142|exceso_ajustado=12';
end;$test$;

\echo '--- caso 8: flujo completo PEN 1180 ---'
insert into public.cuentas_bancarias(id,empresa_id,nombre,banco,moneda,tipo,estado,sociedad_id,es_cuenta_detracciones)
values('cb_round_bn','emp_2000000000','Cuenta BN temporal redondeo','BN','PEN','corriente','activo','609a2f33-d057-411f-a001-4e3e83f700d0',true)
on conflict (id) do update set es_cuenta_detracciones=true, estado='activo';
do $test$
declare r jsonb; f record; d record; n integer; v_cat uuid;
begin
  update public.familia_servicio set spot_catalogo_id=(select id from public.spot_catalogo where codigo='012' order by vigencia_desde desc limit 1) where id='fam_d781ee8c60ae024eea';
  r:=pg_temp.spot_emit_round('fac_round_8','F-ROUND-8','factura',1000,180,1180,'PEN',jsonb_build_array(jsonb_build_object('servicio_id','srv_c529a00515fe4defb6')));
  perform public.registrar_cobro_cxc_atomico('emp_2000000000','cxc_round_8',jsonb_build_object('id','cob_round_8n','monto_capital',1038,'medio_pago','Transferencia','cuenta_bancaria','cb_299412'),jsonb_build_object('id','tes_round_8n','monto',1038,'moneda','PEN','cuenta_bancaria_id','cb_299412'),jsonb_build_object('id','com_round_8n','monto_cobrado',1038,'porcentaje_comision',10,'monto_comision',103.8,'monto_total',103.8));
  r:=public.registrar_cobro_cxc_atomico('emp_2000000000','cxc_round_8',jsonb_build_object('id','cob_round_8d','tipo_cobro','detraccion','detraccion_id',(select id::text from public.detracciones where factura_id='fac_round_8' and estado='pendiente'),'monto_capital',142,'medio_pago','Detraccion'),jsonb_build_object('id','tes_round_8d','monto',142,'moneda','PEN','cuenta_bancaria_id','cb_round_bn','tc_aplicado',1,'monto_en_moneda_cuenta',142),jsonb_build_object('id','com_round_8d','monto_cobrado',142,'porcentaje_comision',10,'monto_comision',14.2,'monto_total',14.2));
  select * into f from public.cxc where id='cxc_round_8'; select * into d from public.detracciones where factura_id='fac_round_8'; select count(*) into n from public.comisiones where cxc_id='cxc_round_8';
  if f.saldo<>0 or f.estado not in ('cobrada','pagada') or d.estado<>'depositada' or n<>2 then raise exception 'CASO_8|flujo_incompleto'; end if;
  raise notice 'CASO_8|normal=1038+detraccion=142|cxc_saldo=0|obligacion=depositada|comisiones=2';
end;$test$;

rollback;
\echo '--- ROLLBACK completado: sin cambios persistentes ---'
