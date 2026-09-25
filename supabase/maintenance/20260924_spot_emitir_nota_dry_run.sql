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

-- Copia temporal de la versión vigente anterior, usada únicamente para la
-- comparación de no-regresión. No se persiste ni reemplaza la función pública.
create or replace function pg_temp.nota_anterior(p_payload jsonb) returns jsonb language plpgsql as $old$
declare
  v_empresa_id text := nullif(btrim(p_payload ->> 'empresa_id'), ''); v_factura_id text := nullif(btrim(p_payload ->> 'factura_id'), ''); v_origen_id text := nullif(btrim(p_payload ->> 'factura_origen_id'), ''); v_tipo text := lower(nullif(btrim(p_payload ->> 'tipo_documento'), '')); v_motivo_codigo text := nullif(btrim(p_payload ->> 'motivo_codigo'), ''); v_sociedad_id uuid := nullif(btrim(p_payload ->> 'sociedad_id'), '')::uuid; v_serie text; v_numero integer; v_numero_completo text; v_total numeric(14,2):=coalesce(nullif(p_payload->>'total','')::numeric,0); v_subtotal numeric(14,2):=coalesce(nullif(p_payload->>'subtotal','')::numeric,0); v_igv numeric(14,2):=coalesce(nullif(p_payload->>'igv','')::numeric,0); v_fecha date:=coalesce(nullif(p_payload->>'fecha_emision','')::date,current_date); v_moneda text:=upper(coalesce(nullif(btrim(p_payload->>'moneda'),''),'PEN')); v_factura public.facturas%rowtype; v_cxc public.cxc%rowtype; v_nueva_total numeric(14,2); v_nuevo_saldo numeric(14,2); v_estado text; v_corr public.correlativos_documentos%rowtype;
begin
  if v_empresa_id is null or not public.usuario_tiene_empresa(v_empresa_id) then raise exception 'No tienes acceso al tenant indicado.'; end if;
  if v_tipo not in ('nota_credito','nota_debito') then raise exception 'TIPO_NOTA_INVALIDO: solo se permite nota_credito o nota_debito.'; end if;
  if v_origen_id is null then raise exception 'FACTURA_ORIGEN_OBLIGATORIA: selecciona el comprobante afectado.'; end if;
  if v_motivo_codigo is null then raise exception 'MOTIVO_SUNAT_OBLIGATORIO: selecciona un motivo oficial.'; end if;
  if v_total<=0 or v_subtotal<0 or v_igv<0 or abs(round(v_subtotal+v_igv,2)-round(v_total,2))>0.01 then raise exception 'IMPORTES_NOTA_INVALIDOS: total invalido.'; end if;
  if not exists(select 1 from public.catalogo_motivos_comprobante where tipo_documento=v_tipo and codigo_sunat=v_motivo_codigo and activo) then raise exception 'MOTIVO_SUNAT_INVALIDO'; end if;
  select * into v_factura from public.facturas where id=v_origen_id and empresa_id=v_empresa_id for update; if not found then raise exception 'FACTURA_ORIGEN_NO_ENCONTRADA'; end if;
  if v_factura.tipo_documento not in ('factura','boleta') or v_factura.estado='anulada' then raise exception 'FACTURA_ORIGEN_NO_AFECTABLE'; end if;
  if v_factura.sociedad_id is distinct from v_sociedad_id then raise exception 'SOCIEDAD_ORIGEN_INVALIDA'; end if;
  select * into v_cxc from public.cxc where factura_id=v_origen_id and empresa_id=v_empresa_id for update; if not found then raise exception 'CXC_ORIGEN_NO_ENCONTRADA'; end if;
  if v_tipo='nota_credito' and v_total>coalesce(v_cxc.monto_total,0) then raise exception 'MONTO_NC_EXCEDE_SALDO'; end if;
  v_serie:=case when v_tipo='nota_credito' then 'NC01' else 'ND01' end;
  select * into v_corr from public.correlativos_documentos where empresa_id=v_empresa_id and tipo_documento=v_tipo and serie=v_serie and sociedad_id is not distinct from v_sociedad_id for update;
  if not found then insert into public.correlativos_documentos(id,empresa_id,tipo_documento,serie,ultimo_numero,sociedad_id) values('corr_old_'||md5(clock_timestamp()::text),v_empresa_id,v_tipo,v_serie,0,v_sociedad_id) returning * into v_corr; end if;
  v_numero:=v_corr.ultimo_numero+1; v_numero_completo:=v_serie||'-'||lpad(v_numero::text,4,'0'); update public.correlativos_documentos set ultimo_numero=v_numero,updated_at=now() where id=v_corr.id;
  v_factura_id:=coalesce(v_factura_id,'fac_old_'||md5(clock_timestamp()::text));
  insert into public.facturas(id,empresa_id,cuenta_id,os_cliente_id,valorizacion_id,centro_beneficio_id,sociedad_id,numero,tipo_documento,fecha_emision,subtotal,igv,total,moneda,estado,items,factura_origen_id,motivo,motivo_codigo,notas,concepto)
  values(v_factura_id,v_empresa_id,v_factura.cuenta_id,v_factura.os_cliente_id,v_factura.valorizacion_id,v_factura.centro_beneficio_id,v_sociedad_id,v_numero_completo,v_tipo,v_fecha,v_subtotal,v_igv,v_total,v_moneda,'emitida',coalesce(p_payload->'items','[]'::jsonb),v_origen_id,v_motivo_codigo,v_motivo_codigo,nullif(btrim(p_payload->>'notas'),''),nullif(btrim(p_payload->>'concepto'),'')) returning * into v_factura;
  if v_tipo='nota_credito' then v_nueva_total:=greatest(0,v_cxc.monto_total-v_total); v_nuevo_saldo:=greatest(0,v_cxc.saldo-v_total); else v_nueva_total:=v_cxc.monto_total+v_total; v_nuevo_saldo:=v_cxc.saldo+v_total; end if;
  v_estado:=case when v_nuevo_saldo<=0 then 'cancelada' else v_cxc.estado end;
  update public.cxc set monto_total=v_nueva_total,saldo=v_nuevo_saldo,estado=v_estado,updated_at=now() where id=v_cxc.id;
  return jsonb_build_object('factura',to_jsonb(v_factura),'cxc',to_jsonb((select c from public.cxc c where c.id=v_cxc.id)),'numero',v_numero_completo);
end;$old$;

create or replace function pg_temp.nota_normalizada(p_result jsonb) returns jsonb language sql as $$
  select jsonb_build_object(
    'factura', (p_result->'factura') - array['id','numero','factura_origen_id','created_at','updated_at'],
    'cxc', (p_result->'cxc') - array['id','factura_id','created_at','updated_at'],
    'numero','GENERATED')
$$;

select set_config('request.jwt.claims','{"sub":"94c60fcb-8818-42e4-b395-31a8ff8635b1","role":"authenticated"}',true);

insert into public.cuentas_bancarias(id,empresa_id,nombre,banco,moneda,tipo,estado,sociedad_id,es_cuenta_detracciones)
values('cb_spot7_bn','emp_2000000000','Cuenta BN temporal Paso 7','Banco de la Nacion','PEN','corriente','activo','609a2f33-d057-411f-a001-4e3e83f700d0',true)
on conflict (id) do update set es_cuenta_detracciones=excluded.es_cuenta_detracciones,estado=excluded.estado;

\echo '--- caso 1: no-regresion NC y ND sin detraccion ---'
do $test$
declare a jsonb; b jsonb; old_r jsonb; new_r jsonb;
begin
  a:=pg_temp.fixture_nota('nr_old_nc',1000,null); old_r:=pg_temp.nota_anterior(jsonb_build_object('empresa_id','emp_2000000000','factura_origen_id',a->>'factura_id','factura_id','fac_spot7_old_nc','sociedad_id','609a2f33-d057-411f-a001-4e3e83f700d0','tipo_documento','nota_credito','motivo_codigo','01','fecha_emision','2026-09-24','subtotal',84.75,'igv',15.25,'total',100,'moneda','PEN'));
  a:=pg_temp.fixture_nota('nr_new_nc',1000,null); new_r:=pg_temp.nota('nr_new_nc',a->>'factura_id','nota_credito',100);
  if pg_temp.nota_normalizada(old_r) is distinct from pg_temp.nota_normalizada(new_r) then raise exception 'CASO_1|NC|diferencia_campo_a_campo'; end if;
  a:=pg_temp.fixture_nota('nr_old_nd',1000,null); old_r:=pg_temp.nota_anterior(jsonb_build_object('empresa_id','emp_2000000000','factura_origen_id',a->>'factura_id','factura_id','fac_spot7_old_nd','sociedad_id','609a2f33-d057-411f-a001-4e3e83f700d0','tipo_documento','nota_debito','motivo_codigo','01','fecha_emision','2026-09-24','subtotal',84.75,'igv',15.25,'total',100,'moneda','PEN'));
  a:=pg_temp.fixture_nota('nr_new_nd',1000,null); new_r:=pg_temp.nota('nr_new_nd',a->>'factura_id','nota_debito',100);
  if pg_temp.nota_normalizada(old_r) is distinct from pg_temp.nota_normalizada(new_r) then raise exception 'CASO_1|ND|diferencia_campo_a_campo'; end if;
  raise notice 'CASO_1|NC_y_ND_sin_SPOT|version_anterior_vs_nueva=campo_a_campo_coinciden|cxc=saldo,monto_total,estado|factura=campos_persistidos|nota=campos_persistidos';
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

\echo '--- caso 11: cobro de ajuste pendiente y limite normal ---'
do $test$
declare a jsonb; r jsonb; d record; original record; e text; ajuste_id uuid;
begin
  a:=pg_temp.fixture_nota('cobro_ajuste',1000,'depositada'); r:=pg_temp.nota('cobro_ajuste',a->>'factura_id','nota_debito',100);
  select * into d from public.detracciones where factura_id=a->>'factura_id' and estado='pendiente';
  ajuste_id:=d.id;
  begin
    perform public.registrar_cobro_cxc_atomico('emp_2000000000',a->>'cxc_id',jsonb_build_object('id','cob_spot7_11n','monto_capital',1089),jsonb_build_object('id','tes_spot7_11n','monto',1089,'moneda','PEN','cuenta_bancaria_id','cb_299412'),null);
  exception when others then e:=sqlerrm; end;
  if e is null or e not like '%maximo cobrable ahora: 1088%' then raise exception 'CASO_11|limite_normal|mensaje=%',e; end if;
  r:=public.registrar_cobro_cxc_atomico('emp_2000000000',a->>'cxc_id',jsonb_build_object('id','cob_spot7_11d','tipo_cobro','detraccion','detraccion_id',ajuste_id::text,'monto_capital',12),jsonb_build_object('id','tes_spot7_11d','monto',12,'moneda','PEN','cuenta_bancaria_id','cb_spot7_bn','tc_aplicado',1,'monto_en_moneda_cuenta',12),null);
  select * into original from public.detracciones where id=(a->>'detraccion_id')::uuid;
  select * into d from public.detracciones where id=ajuste_id;
  if d.estado<>'depositada' or original.estado<>'depositada' then raise exception 'CASO_11|estados_incorrectos'; end if;
  raise notice 'CASO_11|pendiente_ajuste=12|normal_max=1088|invasion=rechazada|cobro_detraccion=12|ajuste=depositada|original=depositada';
end;$test$;

\echo '--- caso 12: cobro exige el monto recalculado ---'
do $test$
declare a jsonb; r jsonb; d record; e text; obligacion_id uuid;
begin
  a:=pg_temp.fixture_nota('cobro_recalc',1000,'pendiente'); r:=pg_temp.nota('cobro_recalc',a->>'factura_id','nota_debito',100);
  select * into d from public.detracciones where factura_id=a->>'factura_id' and documento_ajuste_id is null;
  obligacion_id:=d.id;
  begin
    perform public.registrar_cobro_cxc_atomico('emp_2000000000',a->>'cxc_id',jsonb_build_object('id','cob_spot7_12x','tipo_cobro','detraccion','detraccion_id',obligacion_id::text,'monto_capital',120),jsonb_build_object('id','tes_spot7_12x','monto',120,'moneda','PEN','cuenta_bancaria_id','cb_spot7_bn'),null);
  exception when others then e:=sqlerrm; end;
  if e is null or e not like '%debe ser 132.00%' then raise exception 'CASO_12|monto_anterior_no_rechazado|mensaje=%',e; end if;
  r:=public.registrar_cobro_cxc_atomico('emp_2000000000',a->>'cxc_id',jsonb_build_object('id','cob_spot7_12','tipo_cobro','detraccion','detraccion_id',obligacion_id::text,'monto_capital',132),jsonb_build_object('id','tes_spot7_12','monto',132,'moneda','PEN','cuenta_bancaria_id','cb_spot7_bn','tc_aplicado',1,'monto_en_moneda_cuenta',132),null);
  select * into d from public.detracciones where id=obligacion_id;
  if d.estado<>'depositada' then raise exception 'CASO_12|monto_recalculado_no_aceptado'; end if;
  raise notice 'CASO_12|pendiente_recalculada=132|cobro=120|rechazado|cobro=132|depositada';
end;$test$;

\echo '--- caso 13: ND actualiza la pendiente existente ---'
do $test$
declare a jsonb; r jsonb; d record; n integer;
begin
  a:=pg_temp.fixture_nota('recalc_pendiente',1000,'depositada'); r:=pg_temp.nota('recalc_pendiente_a',a->>'factura_id','nota_debito',100); r:=pg_temp.nota('recalc_pendiente_b',a->>'factura_id','nota_debito',100);
  select count(*) into n from public.detracciones where cxc_id=a->>'cxc_id' and direccion='venta' and estado='pendiente';
  select * into d from public.detracciones where cxc_id=a->>'cxc_id' and estado='pendiente';
  if n<>1 or d.monto_detraccion_origen<>24 then raise exception 'CASO_13|pendientes=%|origen=%',n,d.monto_detraccion_origen; end if;
  raise notice 'CASO_13|segunda_ND=recalcula_la_existente|pendientes=1|incremental=24';
end;$test$;

\echo '--- caso 14: indice rechaza segunda pendiente directa ---'
do $test$
declare a jsonb; cat uuid; e text;
begin
  a:=pg_temp.fixture_nota('indice_directo',1000,'pendiente'); select id into cat from public.spot_catalogo where codigo='012' order by vigencia_desde desc limit 1;
  begin
    insert into public.detracciones(direccion,factura_id,cxc_id,documento_ajuste_id,empresa_id,sociedad_id,spot_catalogo_id,codigo_spot,porcentaje,base_soles,monto_detraccion_soles,monto_detraccion_origen,moneda_origen,origen,estado)
    values('venta',a->>'factura_id',a->>'cxc_id','doc_spot7_direct','emp_2000000000','609a2f33-d057-411f-a001-4e3e83f700d0',cat,'012',12,1000,120,120,'PEN','emision','pendiente');
  exception when others then e:=sqlerrm; end;
  if e is null or e not like '%detracciones_venta_cxc_pendiente_unq%' then raise exception 'CASO_14|indice_no_rechazo|mensaje=%',e; end if;
  raise notice 'CASO_14|actor=postgres|segunda_pendiente=rechazada|indice=detracciones_venta_cxc_pendiente_unq';
end;$test$;

\echo '--- caso 15: NC anulada libera el tramo ---'
do $test$
declare a jsonb; r jsonb; d record; c record;
begin
  a:=pg_temp.fixture_nota('libera_tramo',800,'pendiente'); r:=pg_temp.nota('libera_tramo',a->>'factura_id','nota_credito',100);
  select * into d from public.detracciones where factura_id=a->>'factura_id' and documento_ajuste_id is null;
  r:=public.registrar_cobro_cxc_atomico('emp_2000000000',a->>'cxc_id',jsonb_build_object('id','cob_spot7_15','monto_capital',700),jsonb_build_object('id','tes_spot7_15','monto',700,'moneda','PEN','cuenta_bancaria_id','cb_299412'),null);
  select * into c from public.cxc where id=a->>'cxc_id';
  if d.estado<>'anulada' or c.saldo<>0 or c.estado<>'cobrada' then raise exception 'CASO_15|tramo_no_liberado'; end if;
  raise notice 'CASO_15|obligacion=anulada|tramo_reservado=0|cobro_normal=700|aceptado|saldo=0|estado=cobrada';
end;$test$;

rollback;
\echo 'STEP7_DRY_RUN_ROLLBACK_COMPLETED'
