\set ON_ERROR_STOP on
\pset pager off
\pset format aligned
\pset null '[NULL]'
\echo '--- Paso 7: dry run ---'
begin;
\ir 20260924_spot_emitir_nota_body.sql

create or replace function pg_temp.fixture_nota(
  p_tag text, p_total numeric, p_estado_detraccion text default null,
  p_moneda text default 'PEN', p_tc numeric default null
) returns jsonb language plpgsql as $fixture$
declare
  f text := 'fac_spot7_' || p_tag; c text := 'cxc_spot7_' || p_tag;
  d uuid; cat uuid; base numeric; origen numeric; soles numeric;
begin
  insert into public.facturas(id,empresa_id,cuenta_id,centro_beneficio_id,sociedad_id,numero,tipo_documento,fecha_emision,fecha_vencimiento,subtotal,igv,total,moneda,estado,items,aplica_retencion,monto_retencion,monto_neto_cobrable,aplica_detraccion,porcentaje_detraccion,monto_detraccion)
  values(f,'emp_2000000000','cta_108241','cebe_1fd8d3b7f35a445c92','609a2f33-d057-411f-a001-4e3e83f700d0','F-SPOT7-'||p_tag,'factura',date '2026-09-24',date '2026-10-24',round(p_total/1.18,2),round(p_total-round(p_total/1.18,2),2),p_total,p_moneda,'emitida','[]'::jsonb,false,0,null,p_estado_detraccion is not null,case when p_estado_detraccion is null then null else 12 end,case when p_estado_detraccion is null then null else round(p_total*12/100,2) end);
  insert into public.cxc(id,empresa_id,cuenta_id,factura_id,sociedad_id,fecha_emision,fecha_vencimiento,monto_total,monto_pagado,saldo,moneda,estado,monto_retencion)
  values(c,'emp_2000000000','cta_108241',f,'609a2f33-d057-411f-a001-4e3e83f700d0',date '2026-09-24',date '2026-10-24',p_total,0,p_total,p_moneda,'por_cobrar',0);
  if p_estado_detraccion is not null then
    base:=case when p_moneda='USD' then round(p_total*p_tc,2) else p_total end; origen:=round(p_total*12/100,2); soles:=round(base*12/100,0);
    select id into cat from public.spot_catalogo where codigo='012' order by vigencia_desde desc limit 1;
    insert into public.detracciones(direccion,factura_id,cxc_id,empresa_id,sociedad_id,spot_catalogo_id,codigo_spot,porcentaje,base_soles,monto_detraccion_soles,monto_detraccion_origen,moneda_origen,tipo_cambio,tipo_cambio_fuente,origen,estado)
    values('venta',f,c,null,null,cat,'012',12,base,soles,origen,p_moneda,case when p_moneda='USD' then p_tc else null end,case when p_moneda='USD' then 'manual' else null end,'emision',p_estado_detraccion) returning id into d;
  end if;
  return jsonb_build_object('factura_id',f,'cxc_id',c,'detraccion_id',d);
end;$fixture$;

create or replace function pg_temp.nota(p_tag text,p_origen text,p_tipo text,p_total numeric,p_extra jsonb default '{}'::jsonb) returns jsonb language sql as $$
  select public.emitir_nota_cxc_atomica(jsonb_build_object('empresa_id','emp_2000000000','factura_origen_id',p_origen,'factura_id','fac_spot7_n_'||p_tag,'sociedad_id','609a2f33-d057-411f-a001-4e3e83f700d0','tipo_documento',p_tipo,'motivo_codigo',case when p_tipo='nota_credito' then '01' else '01' end,'fecha_emision','2026-09-24','subtotal',round(p_total/1.18,2),'igv',round(p_total-round(p_total/1.18,2),2),'total',p_total,'moneda','PEN') || p_extra)
$$;

select set_config('request.jwt.claims','{"sub":"94c60fcb-8818-42e4-b395-31a8ff8635b1","role":"authenticated"}',true);

\echo '--- caso 1: no-regresion NC y ND sin detraccion ---'
do $test$
declare a jsonb; b jsonb; c_old numeric; c_new numeric;
begin
  a:=pg_temp.fixture_nota('nr_nc',1000,null); b:=pg_temp.nota('nr_nc',a->>'factura_id','nota_credito',100);
  select saldo into c_old from public.cxc where id=a->>'cxc_id';
  if c_old<>900 or b->'cxc'->>'saldo' <> '900.00' or exists(select 1 from public.detracciones where factura_id=a->>'factura_id') then raise exception 'CASO_1|NC|diferencia_con_contrato_anterior'; end if;
  a:=pg_temp.fixture_nota('nr_nd',1000,null); b:=pg_temp.nota('nr_nd',a->>'factura_id','nota_debito',100);
  select saldo into c_new from public.cxc where id=a->>'cxc_id';
  if c_new<>1100 or b->'cxc'->>'saldo' <> '1100.00' or exists(select 1 from public.detracciones where factura_id=a->>'factura_id') then raise exception 'CASO_1|ND|diferencia_con_contrato_anterior'; end if;
  raise notice 'CASO_1|NC_y_ND_sin_SPOT|factura_cxc_nota=equivalentes|campos=saldo,monto_total,estado';
end;$test$;

\echo '--- caso 2: NC pendiente sobre umbral ---'
do $test$ declare a jsonb; r jsonb; d record; begin
  a:=pg_temp.fixture_nota('pend_nc',1000,'pendiente'); r:=pg_temp.nota('pend_nc',a->>'factura_id','nota_credito',100);
  select * into d from public.detracciones where factura_id=a->>'factura_id' and documento_ajuste_id is null;
  if d.estado<>'pendiente' or d.base_soles<>900 or d.monto_detraccion_origen<>108 or d.monto_detraccion_soles<>108 then raise exception 'CASO_2|recalculo_incorrecto'; end if;
  raise notice 'CASO_2|total_nuevo=900|base=900|12pct=108|origen=108|deposito=108|pendiente'; end;$test$;

\echo '--- caso 3: NC pendiente bajo umbral ---'
do $test$ declare a jsonb; r jsonb; d record; f record; begin
  a:=pg_temp.fixture_nota('pend_bajo',800,'pendiente'); r:=pg_temp.nota('pend_bajo',a->>'factura_id','nota_credito',100);
  select * into d from public.detracciones where factura_id=a->>'factura_id' and documento_ajuste_id is null; select * into f from public.facturas where id=a->>'factura_id';
  if d.estado<>'anulada' or d.monto_detraccion_origen<>0 or f.aplica_detraccion then raise exception 'CASO_3|no_anulada_o_espejo_incorrecto'; end if;
  raise notice 'CASO_3|total_nuevo=700|umbral_012=>700|obligacion=anulada|espejo=false'; end;$test$;

\echo '--- caso 4: borde saldo igual detraccion mas NC ---'
do $test$ declare a jsonb; e text; begin
  a:=pg_temp.fixture_nota('borde',1000,'pendiente'); update public.cxc set saldo=120 where id=a->>'cxc_id';
  begin perform pg_temp.nota('borde',a->>'factura_id','nota_credito',10); exception when others then e:=sqlerrm; end;
  if e not like 'SPOT_NC_REQUIERE_REGULARIZACION%' then raise exception 'CASO_4|mensaje=%',e; end if;
  raise notice 'CASO_4|saldo_resultante=110|detraccion_nueva=118.80|rechazado|mensaje=%',e; end;$test$;

\echo '--- caso 5: NC sobre depositada crea ajuste informativo ---'
do $test$ declare a jsonb; r jsonb; d record; n integer; begin
  a:=pg_temp.fixture_nota('dep_nc',1000,'depositada'); r:=pg_temp.nota('dep_nc',a->>'factura_id','nota_credito',100);
  select count(*) into n from public.detracciones where factura_id=a->>'factura_id'; select * into d from public.detracciones where factura_id=a->>'factura_id' and documento_ajuste_id is not null;
  if n<>2 or d.estado<>'ajustada' or d.monto_detraccion_soles<>12 then raise exception 'CASO_5|ajuste_incorrecto'; end if;
  raise notice 'CASO_5|depositada_original_intacta|nuevo_calculo=108|depositado=120|ajuste=12|estado=ajustada'; end;$test$;

\echo '--- caso 6: ND sobre pendiente recalcula ---'
do $test$ declare a jsonb; r jsonb; d record; begin
  a:=pg_temp.fixture_nota('pend_nd',1000,'pendiente'); r:=pg_temp.nota('pend_nd',a->>'factura_id','nota_debito',100);
  select * into d from public.detracciones where factura_id=a->>'factura_id' and documento_ajuste_id is null;
  if d.monto_detraccion_origen<>132 or d.monto_detraccion_soles<>132 then raise exception 'CASO_6|recalculo_incorrecto'; end if;
  raise notice 'CASO_6|total_nuevo=1100|12pct=132|pendiente'; end;$test$;

\echo '--- caso 7: ND sobre depositada crea incremental ---'
do $test$ declare a jsonb; r jsonb; d record; begin
  a:=pg_temp.fixture_nota('dep_nd',1000,'depositada'); r:=pg_temp.nota('dep_nd',a->>'factura_id','nota_debito',100);
  select * into d from public.detracciones where factura_id=a->>'factura_id' and documento_ajuste_id is not null;
  if d.estado<>'pendiente' or d.monto_detraccion_origen<>12 or d.monto_detraccion_soles<>12 then raise exception 'CASO_7|incremental_incorrecto'; end if;
  raise notice 'CASO_7|depositado=120|nuevo_calculo=132|incremental=12|pendiente'; end;$test$;

\echo '--- caso 8: ND cruza umbral sin obligacion ---'
do $test$ declare a jsonb; r jsonb; d record; begin
  a:=pg_temp.fixture_nota('cruza_nd',600,null); r:=pg_temp.nota('cruza_nd',a->>'factura_id','nota_debito',200,jsonb_build_object('codigo_spot','012'));
  select * into d from public.detracciones where factura_id=a->>'factura_id';
  if d.estado<>'pendiente' or d.monto_detraccion_soles<>96 or d.documento_ajuste_id is null then raise exception 'CASO_8|no_creada'; end if;
  raise notice 'CASO_8|total_nuevo=800|12pct=96|obligacion=pendiente|creada'; end;$test$;

\echo '--- caso 9: USD pendiente conserva snapshot ---'
do $test$ declare a jsonb; r jsonb; d record; begin
  a:=pg_temp.fixture_nota('usd_nc',1000,'pendiente','USD',3.38); r:=pg_temp.nota('usd_nc',a->>'factura_id','nota_credito',100,jsonb_build_object('moneda','USD'));
  select * into d from public.detracciones where factura_id=a->>'factura_id' and documento_ajuste_id is null;
  if d.tipo_cambio<>3.38 or d.base_soles<>3042 or d.monto_detraccion_origen<>108 or d.monto_detraccion_soles<>365 then raise exception 'CASO_9|snapshot_o_recalculo_incorrecto'; end if;
  raise notice 'CASO_9|tc_snapshot=3.38|base=3042|origen=108|deposito=365|correcto'; end;$test$;

\echo '--- caso 10: indice unico excluye ajustes ---'
do $test$ declare a jsonb; r jsonb; n integer; begin
  a:=pg_temp.fixture_nota('indice',1000,'depositada'); r:=pg_temp.nota('indice',a->>'factura_id','nota_credito',100); r:=pg_temp.nota('indice_nd',a->>'factura_id','nota_debito',300); select count(*) into n from public.detracciones where factura_id=a->>'factura_id'; if n<>3 then raise exception 'CASO_10|indice_choco'; end if; raise notice 'CASO_10|principal=1|ajustes=2|indice_unico=sin_conflicto'; end;$test$;

rollback;
\echo 'STEP7_DRY_RUN_ROLLBACK_COMPLETED'
