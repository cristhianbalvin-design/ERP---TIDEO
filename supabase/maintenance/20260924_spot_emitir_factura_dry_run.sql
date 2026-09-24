\set ON_ERROR_STOP on
\pset pager off
\pset format aligned
\pset null '[NULL]'
\echo '--- Paso 5: dry run ---'
begin;
\ir 20260924_spot_emitir_factura_body.sql

create or replace function pg_temp.spot_emit(
  p_id text, p_num text, p_tipo text, p_sub numeric, p_igv numeric, p_total numeric,
  p_moneda text, p_items jsonb, p_extra jsonb default '{}'::jsonb
) returns jsonb
language sql
as $$
  select public.emitir_factura_cxc_atomico(
    jsonb_build_object(
      'empresa_id','emp_2000000000',
      'factura_id',p_id,
      'cxc_id','cxc_' || replace(p_id,'fac_',''),
      'cuenta_id','cta_108241',
      'centro_beneficio_id','cebe_1fd8d3b7f35a445c92',
      'sociedad_id','609a2f33-d057-411f-a001-4e3e83f700d0',
      'numero',p_num,
      'tipo_documento',p_tipo,
      'fecha_emision','2026-09-24',
      'fecha_vencimiento','2026-10-24',
      'subtotal',p_sub,
      'igv',p_igv,
      'total',p_total,
      'moneda',p_moneda,
      'items',p_items
    ) || p_extra
  );
$$;

update public.familia_servicio set spot_catalogo_id = null where id='fam_d781ee8c60ae024eea';
update public.servicios set spot_catalogo_id = null where id='srv_c529a00515fe4defb6';
select set_config('request.jwt.claims', '{"sub":"94c60fcb-8818-42e4-b395-31a8ff8635b1","role":"authenticated"}', true);

\echo '--- caso 1: sin codigo y equivalencia con contrato anterior ---'
do $$
declare r jsonb; f jsonb; c jsonb;
begin
  r := pg_temp.spot_emit('fac_spot_t01','F-SPOT-T01','factura',100,18,118,'PEN',
    jsonb_build_array(jsonb_build_object('descripcion','manual','cantidad',1,'precio_unitario',118)));
  f:=r->'factura'; c:=r->'cxc';
  if f->>'id' <> 'fac_spot_t01' or f->>'aplica_detraccion' <> 'false' or f->>'porcentaje_detraccion' is not null or f->>'monto_detraccion' is not null or c->>'saldo' <> '118.00' or exists(select 1 from public.detracciones where factura_id='fac_spot_t01') then
    raise exception 'CASO_1|diferencia_con_contrato_anterior';
  end if;
  raise notice 'CASO_1|sin_codigo|factura_y_cxc_equivalentes|obligacion=0';
end $$;

update public.familia_servicio set spot_catalogo_id=(select id from public.spot_catalogo where codigo='004' order by vigencia_desde desc limit 1) where id='fam_d781ee8c60ae024eea';

\echo '--- caso 2: bajo umbral ---'
do $$
declare r jsonb;
begin
  r:=pg_temp.spot_emit('fac_spot_t02','F-SPOT-T02','factura',592.37,106.63,699,'PEN',
    jsonb_build_array(jsonb_build_object('servicio_id','srv_c529a00515fe4defb6','cantidad',1,'precio_unitario',699)));
  if r->'factura'->>'aplica_detraccion' <> 'false' or exists(select 1 from public.detracciones where factura_id='fac_spot_t02') then raise exception 'CASO_2|aplico_bajo_umbral'; end if;
  raise notice 'CASO_2|base=699.00|umbral=700.00|obligacion=0';
end $$;

\echo '--- caso 3: familia heredada y redondeo ---'
do $$
declare r jsonb; d record;
begin
  r:=pg_temp.spot_emit('fac_spot_t03','F-SPOT-T03','factura',625.42,112.58,738,'PEN',
    jsonb_build_array(jsonb_build_object('servicio_id','srv_c529a00515fe4defb6','cantidad',1,'precio_unitario',738)));
  select * into d from public.detracciones where factura_id='fac_spot_t03';
  if d.codigo_spot <> '004' or d.porcentaje <> 4 or d.base_soles <> 738 or d.monto_detraccion_origen <> 29.52 or d.monto_detraccion_soles <> 30 then raise exception 'CASO_3|calculo_incorrecto'; end if;
  raise notice 'CASO_3|codigo=004|base=738.00|4pct=29.52|deposito_redondeado=30|obligacion=1';
end $$;

\echo '--- caso 4: override por servicio ---'
update public.servicios set spot_catalogo_id=(select id from public.spot_catalogo where codigo='012' limit 1) where id='srv_c529a00515fe4defb6';
do $$
declare r jsonb; d record;
begin
  r:=pg_temp.spot_emit('fac_spot_t04','F-SPOT-T04','factura',847.46,152.54,1000,'PEN',
    jsonb_build_array(jsonb_build_object('servicio_id','srv_c529a00515fe4defb6','cantidad',1,'precio_unitario',1000)));
  select * into d from public.detracciones where factura_id='fac_spot_t04';
  if d.codigo_spot <> '012' or d.porcentaje <> 12 or d.monto_detraccion_soles <> 120 then raise exception 'CASO_4|override_no_aplicado'; end if;
  raise notice 'CASO_4|servicio=012|familia=004|precedencia=servicio|deposito=120';
end $$;

\echo '--- caso 5: codigo explicito en linea ---'
update public.servicios set spot_catalogo_id=null where id='srv_c529a00515fe4defb6';
do $$
declare r jsonb; d record;
begin
  r:=pg_temp.spot_emit('fac_spot_t05','F-SPOT-T05','factura',847.46,152.54,1000,'PEN',
    jsonb_build_array(jsonb_build_object('spot_catalogo_id',(select id from public.spot_catalogo where codigo='019' limit 1),'cantidad',1,'precio_unitario',1000)));
  select * into d from public.detracciones where factura_id='fac_spot_t05';
  if d.codigo_spot <> '019' or d.monto_detraccion_soles <> 100 then raise exception 'CASO_5|codigo_explicito_no_aplicado'; end if;
  raise notice 'CASO_5|linea_explicita=019|deposito=100';
end $$;

\echo '--- casos 6 a 8: bloqueos ---'
update public.servicios set spot_catalogo_id=(select id from public.spot_catalogo where codigo='012' limit 1) where id='srv_c529a00515fe4defb6';
do $$
declare e text; r jsonb;
begin
  begin
    r:=pg_temp.spot_emit('fac_spot_t06','F-SPOT-T06','factura',1694.92,305.08,2000,'PEN',
      jsonb_build_array(jsonb_build_object('servicio_id','srv_c529a00515fe4defb6'),jsonb_build_object('spot_catalogo_id',(select id from public.spot_catalogo where codigo='019' limit 1))));
    raise exception 'CASO_6|no_bloqueo';
  exception when others then e:=sqlerrm; end;
  if e not like 'La factura contiene codigos SPOT%' then raise exception 'CASO_6|mensaje=%',e; end if;
  raise notice 'CASO_6|multi_tasa=bloqueada|mensaje=%',e;
end $$;
do $$
declare e text; r jsonb;
begin
  begin
    r:=pg_temp.spot_emit('fac_spot_t07','F-SPOT-T07','factura',847.46,152.54,1000,'PEN',
      jsonb_build_array(jsonb_build_object('servicio_id','srv_c529a00515fe4defb6')),
      jsonb_build_object('aplica_retencion',true,'monto_retencion',100));
    raise exception 'CASO_7|no_bloqueo';
  exception when others then e:=sqlerrm; end;
  if e not like 'La factura no puede tener retencion%' then raise exception 'CASO_7|mensaje=%',e; end if;
  raise notice 'CASO_7|retencion_detraccion=bloqueada|mensaje=%',e;
end $$;
do $$
declare e text; r jsonb;
begin
  begin
    r:=pg_temp.spot_emit('fac_spot_t08','F-SPOT-T08','factura',847.46,152.54,1000,'USD',
      jsonb_build_array(jsonb_build_object('servicio_id','srv_c529a00515fe4defb6')));
    raise exception 'CASO_8|no_rechazo';
  exception when others then e:=sqlerrm; end;
  if e not like 'Para una factura USD%' then raise exception 'CASO_8|mensaje=%',e; end if;
  raise notice 'CASO_8|USD_sin_tipo_cambio=rechazado|mensaje=%',e;
end $$;

\echo '--- caso 9: USD, inversion historico y redondeo ---'
do $$
declare r jsonb; d record; v_usd numeric; v_tc numeric;
begin
  select usd into v_usd from public.tipo_cambio_historico where moneda_base='PEN' and fecha<=date '2026-09-24' order by fecha desc limit 1;
  v_tc:=round(1/v_usd,6);
  r:=pg_temp.spot_emit('fac_spot_t09','F-SPOT-T09','factura',847.46,152.54,1000,'USD',
    jsonb_build_array(jsonb_build_object('servicio_id','srv_c529a00515fe4defb6')),
    jsonb_build_object('tipo_cambio_detraccion',v_tc,'tipo_cambio_fuente','referencial'));
  select * into d from public.detracciones where factura_id='fac_spot_t09';
  if d.tipo_cambio <> v_tc or d.monto_detraccion_origen <> 120 or d.monto_detraccion_soles <> round(1000*v_tc*12/100,0) then raise exception 'CASO_9|conversion_incorrecta'; end if;
  raise notice 'CASO_9|usd_inverso=1/%=%.6f|origen=120.00|soles=%',v_usd,v_tc,d.monto_detraccion_soles;
end $$;

\echo '--- caso 10: boleta sobre umbral ---'
do $$
declare r jsonb;
begin
  r:=pg_temp.spot_emit('fac_spot_t10','F-SPOT-T10','boleta',847.46,152.54,1000,'PEN',
    jsonb_build_array(jsonb_build_object('servicio_id','srv_c529a00515fe4defb6')));
  if r->'factura'->>'aplica_detraccion' <> 'false' or exists(select 1 from public.detracciones where factura_id='fac_spot_t10') then raise exception 'CASO_10|boleta_aplico'; end if;
  raise notice 'CASO_10|boleta_sobre_umbral|obligacion=0';
end $$;

\echo '--- caso 11: neto cobrable y saldo conservan semantica ---'
do $$
declare r jsonb; f jsonb; c jsonb;
begin
  r:=pg_temp.spot_emit('fac_spot_t11','F-SPOT-T11','factura',847.46,152.54,1000,'PEN',
    jsonb_build_array(jsonb_build_object('servicio_id','srv_c529a00515fe4defb6')));
  f:=r->'factura'; c:=r->'cxc';
  if f->>'aplica_detraccion' <> 'true' or f->>'monto_neto_cobrable' is not null or c->>'saldo' <> '1000.00' then raise exception 'CASO_11|semantica_alterada'; end if;
  raise notice 'CASO_11|detraccion=1|monto_neto_cobrable=NULL_como_hoy|cxc_saldo=1000.00=total-retencion';
end $$;

\echo '--- caso 12: codigo sin version vigente ---'
do $$
declare e text; r jsonb;
begin
  insert into public.spot_catalogo(codigo,anexo,descripcion,porcentaje,monto_minimo,umbral_operador,vigencia_desde,fuente_url,fuente_referencia)
  values ('TST-2040','ANEXO_3','Prueba version futura',10,700,'>',date '2040-01-01','https://orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones','Prueba temporal');
  begin
    r:=pg_temp.spot_emit('fac_spot_t12','F-SPOT-T12','factura',847.46,152.54,1000,'PEN',
      jsonb_build_array(jsonb_build_object('spot_catalogo_id',(select id from public.spot_catalogo where codigo='TST-2040')));
    raise exception 'CASO_12|no_rechazo';
  exception when others then e:=sqlerrm; end;
  if e not like 'El codigo SPOT TST-2040 no tiene%' then raise exception 'CASO_12|mensaje=%',e; end if;
  raise notice 'CASO_12|version_no_vigente=rechazada|mensaje=%',e;
end $$;

reset role;
rollback;
\echo 'STEP5_DRY_RUN_ROLLBACK_COMPLETED'
