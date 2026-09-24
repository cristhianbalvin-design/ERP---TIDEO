\set ON_ERROR_STOP on
\pset pager off
\pset format aligned
\pset null '[NULL]'
\echo '--- Paso 6: dry run ---'
begin;
\ir 20260924_spot_registrar_cobro_body.sql

create or replace function pg_temp.registrar_cobro_cxc_atomico_anterior(
  p_empresa_id text, p_cxc_id text, p_cobro jsonb, p_movimiento jsonb, p_comision jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path=public
as $old$
declare
  v_cxc public.cxc%rowtype;
  v_factura public.facturas%rowtype;
  v_cobro public.cobros_cxc%rowtype;
  v_movimiento public.movimientos_tesoreria%rowtype;
  v_comision public.comisiones%rowtype;
  v_monto numeric(14,2);
  v_mora numeric(14,2);
  v_neto_cobrable numeric(14,2);
  v_nuevo_pagado numeric(14,2);
  v_nuevo_saldo numeric(14,2);
  v_estado text;
  v_cobro_id text;
  v_movimiento_id text;
  v_comision_id text;
begin
  select * into v_cxc from public.cxc where id=p_cxc_id and empresa_id=p_empresa_id for update;
  if not found then raise exception 'La cuenta por cobrar no existe o no pertenece a la empresa activa.'; end if;
  if not public.usuario_tiene_empresa(v_cxc.empresa_id) then raise exception 'No tiene permisos para registrar cobros en esta empresa.'; end if;
  v_monto:=round(coalesce(nullif(p_cobro->>'monto_capital','')::numeric,0),2);
  v_mora:=round(coalesce(nullif(p_cobro->>'monto_mora','')::numeric,0),2);
  if v_monto<=0 then raise exception 'El monto cobrado debe ser mayor a cero.'; end if;
  if v_mora<0 then raise exception 'El monto de mora no puede ser negativo.'; end if;
  select * into v_factura from public.facturas where id=v_cxc.factura_id and empresa_id=v_cxc.empresa_id for update;
  v_neto_cobrable:=coalesce(nullif(v_factura.monto_neto_cobrable,0),v_cxc.monto_total-coalesce(v_cxc.monto_retencion,0),0);
  v_nuevo_pagado:=round(coalesce(v_cxc.monto_pagado,0)+v_monto,2);
  v_nuevo_saldo:=round(v_neto_cobrable-v_nuevo_pagado,2);
  if v_monto>coalesce(v_cxc.saldo,v_neto_cobrable-coalesce(v_cxc.monto_pagado,0))+0.005 then raise exception 'El monto cobrado supera el saldo pendiente de %.',coalesce(v_cxc.saldo,0); end if;
  if v_nuevo_saldo < -0.005 then raise exception 'El monto cobrado supera el saldo pendiente.'; end if;
  v_nuevo_saldo:=greatest(0,v_nuevo_saldo);
  v_estado:=case when v_nuevo_saldo<=0 then 'cobrada' else 'cobro_parcial' end;
  update public.cxc set monto_pagado=v_nuevo_pagado,saldo=v_nuevo_saldo,estado=v_estado,updated_at=now() where id=v_cxc.id returning * into v_cxc;
  if v_factura.id is not null then update public.facturas set estado=v_estado,updated_at=now() where id=v_factura.id returning * into v_factura; end if;
  v_cobro_id:=coalesce(nullif(btrim(p_cobro->>'id'),''),'cob_'||replace(gen_random_uuid()::text,'-',''));
  insert into public.cobros_cxc(id,empresa_id,cxc_id,factura_id,cuenta_id,monto_capital,monto_mora,medio_pago,cuenta_bancaria,numero_operacion,fecha_cobro,notas,registrado_por,creado_en)
  values(v_cobro_id,v_cxc.empresa_id,v_cxc.id,v_cxc.factura_id,v_cxc.cuenta_id,v_monto,v_mora,coalesce(nullif(btrim(p_cobro->>'medio_pago'),''),'Efectivo'),nullif(btrim(p_cobro->>'cuenta_bancaria'),''),nullif(btrim(p_cobro->>'numero_operacion'),''),coalesce(nullif(p_cobro->>'fecha_cobro','')::date,current_date),nullif(btrim(p_cobro->>'notas'),''),nullif(btrim(p_cobro->>'registrado_por'),''),now()) returning * into v_cobro;
  v_movimiento_id:=coalesce(nullif(btrim(p_movimiento->>'id'),''),'tes_'||replace(gen_random_uuid()::text,'-',''));
  insert into public.movimientos_tesoreria(id,empresa_id,tipo,descripcion,monto,moneda,fecha,cuenta_bancaria,cuenta_bancaria_id,tc_aplicado,monto_en_moneda_cuenta,referencia,vinculo_tipo,vinculo_id,estado,created_at)
  values(v_movimiento_id,v_cxc.empresa_id,'ingreso',coalesce(nullif(btrim(p_movimiento->>'descripcion'),''),'Cobro de factura'),v_monto+v_mora,coalesce(nullif(btrim(p_movimiento->>'moneda'),''),v_cxc.moneda,'PEN'),coalesce(nullif(p_movimiento->>'fecha','')::date,v_cobro.fecha_cobro),nullif(btrim(p_movimiento->>'cuenta_bancaria'),''),nullif(btrim(p_movimiento->>'cuenta_bancaria_id'),''),nullif(p_movimiento->>'tc_aplicado','')::numeric,nullif(p_movimiento->>'monto_en_moneda_cuenta','')::numeric,nullif(btrim(p_movimiento->>'referencia'),''),'cxc',v_cxc.id,'registrado',now()) returning * into v_movimiento;
  if p_comision is not null and coalesce(nullif(btrim(p_comision->>'id'),''),'')<>'' then
    v_comision_id:=p_comision->>'id';
    insert into public.comisiones(id,empresa_id,cobro_cxc_id,cxc_id,factura_id,vendedor_id,vendedor_nombre,monto_cobrado,porcentaje_comision,monto_comision,bonificacion,monto_total,modalidad_pago,periodo,estado,nota_acuerdo,tc_pen_usd,retencion_ir,creado_en)
    values(v_comision_id,v_cxc.empresa_id,v_cobro.id,v_cxc.id,v_cxc.factura_id,nullif(btrim(p_comision->>'vendedor_id'),''),nullif(btrim(p_comision->>'vendedor_nombre'),''),coalesce(nullif(p_comision->>'monto_cobrado','')::numeric,v_monto),nullif(p_comision->>'porcentaje_comision','')::numeric,nullif(p_comision->>'monto_comision','')::numeric,coalesce(nullif(p_comision->>'bonificacion','')::numeric,0),nullif(p_comision->>'monto_total','')::numeric,nullif(btrim(p_comision->>'modalidad_pago'),''),nullif(btrim(p_comision->>'periodo'),''),coalesce(nullif(btrim(p_comision->>'estado'),''),'pendiente_aprobacion'),nullif(btrim(p_comision->>'nota_acuerdo'),''),nullif(p_comision->>'tc_pen_usd','')::numeric,coalesce(nullif(p_comision->>'retencion_ir','')::boolean,false),now()) returning * into v_comision;
  end if;
  return jsonb_build_object('cxc',to_jsonb(v_cxc),'factura',case when v_factura.id is null then null else to_jsonb(v_factura) end,'cobro',to_jsonb(v_cobro),'movimiento',to_jsonb(v_movimiento),'comision',case when v_comision.id is null then null else to_jsonb(v_comision) end);
end;
$old$;

create or replace function pg_temp.fixture_cxc(
  p_tag text, p_moneda text, p_total numeric, p_con_detraccion boolean, p_tipo_cambio numeric default null
) returns jsonb
language plpgsql
as $fixture$
declare
  v_factura text := 'fac_spot6_' || p_tag;
  v_cxc text := 'cxc_spot6_' || p_tag;
  v_detraccion uuid;
  v_catalogo uuid;
  v_base numeric(18,2);
  v_origen numeric(18,2);
  v_soles numeric(18,2);
begin
  v_base:=case when p_moneda='USD' then round(p_total*p_tipo_cambio,2) else round(p_total,2) end;
  v_origen:=round(p_total*12/100,2);
  v_soles:=round(v_base*12/100,0);
  insert into public.facturas(id,empresa_id,cuenta_id,centro_beneficio_id,sociedad_id,numero,tipo_documento,fecha_emision,fecha_vencimiento,subtotal,igv,total,moneda,estado,items,aplica_retencion,monto_retencion,monto_neto_cobrable,aplica_detraccion,porcentaje_detraccion,monto_detraccion)
  values(v_factura,'emp_2000000000','cta_108241','cebe_1fd8d3b7f35a445c92','609a2f33-d057-411f-a001-4e3e83f700d0','F-SPOT6-'||p_tag,'factura',date '2026-09-24',date '2026-10-24',round(p_total/1.18,2),round(p_total-round(p_total/1.18,2),2),p_total,p_moneda,'emitida','[]'::jsonb,false,0,null,p_con_detraccion,case when p_con_detraccion then 12 else null end,case when p_con_detraccion then v_origen else null end);
  insert into public.cxc(id,empresa_id,cuenta_id,factura_id,sociedad_id,fecha_emision,fecha_vencimiento,monto_total,monto_pagado,saldo,moneda,estado,monto_retencion)
  values(v_cxc,'emp_2000000000','cta_108241',v_factura,'609a2f33-d057-411f-a001-4e3e83f700d0',date '2026-09-24',date '2026-10-24',p_total,0,p_total,p_moneda,'por_cobrar',0);
  if p_con_detraccion then
    select id into v_catalogo from public.spot_catalogo where codigo='012' order by vigencia_desde desc limit 1;
    insert into public.detracciones(direccion,factura_id,cxc_id,empresa_id,sociedad_id,spot_catalogo_id,codigo_spot,porcentaje,base_soles,monto_detraccion_soles,monto_detraccion_origen,moneda_origen,tipo_cambio,tipo_cambio_fuente,origen,estado)
    values('venta',v_factura,v_cxc,null,null,v_catalogo,'012',12,v_base,v_soles,v_origen,p_moneda,case when p_moneda='USD' then p_tipo_cambio else null end,case when p_moneda='USD' then 'manual' else null end,'emision','pendiente')
    returning id into v_detraccion;
  end if;
  return jsonb_build_object('factura_id',v_factura,'cxc_id',v_cxc,'detraccion_id',v_detraccion,'origen',v_origen,'soles',v_soles,'tipo_cambio',p_tipo_cambio);
end;
$fixture$;

insert into public.cuentas_bancarias(id,empresa_id,nombre,banco,moneda,tipo,estado,sociedad_id,es_cuenta_detracciones)
values
  ('cb_spot6_bn','emp_2000000000','Cuenta BN temporal','Banco de la Nacion','PEN','corriente','activo','609a2f33-d057-411f-a001-4e3e83f700d0',true),
  ('cb_spot6_bn_other','emp_2000000000','Cuenta BN otra sociedad','Banco de la Nacion','PEN','corriente','activo','b03f3bda-d4be-4acb-891c-07f36b731fd5',true)
on conflict (id) do update set es_cuenta_detracciones=excluded.es_cuenta_detracciones;

select set_config('request.jwt.claims','{"sub":"94c60fcb-8818-42e4-b395-31a8ff8635b1","role":"authenticated"}',true);

\echo '--- caso 1: no-regresion contra la version anterior, parcial y total ---'
do $test$
declare
  a jsonb; b jsonb; ro jsonb; rn jsonb; co text;
begin
  a:=pg_temp.fixture_cxc('nr_old','PEN',1000,false);
  b:=pg_temp.fixture_cxc('nr_new','PEN',1000,false);
  ro:=pg_temp.registrar_cobro_cxc_atomico_anterior('emp_2000000000',a->>'cxc_id',jsonb_build_object('id','cob_spot6_old_p','monto_capital',300,'monto_mora',0,'medio_pago','Transferencia','cuenta_bancaria','cb_299412','numero_operacion','OP-NR-P','fecha_cobro','2026-09-24'),jsonb_build_object('id','tes_spot6_old_p','descripcion','Cobro normal','monto',300,'moneda','PEN','fecha','2026-09-24','cuenta_bancaria','INTERBANK SOLES','cuenta_bancaria_id','cb_299412','tc_aplicado',1,'monto_en_moneda_cuenta',300,'referencia','OP-NR-P'),jsonb_build_object('id','com_spot6_old_p','monto_cobrado',300,'porcentaje_comision',10,'monto_comision',30,'bonificacion',0,'monto_total',30,'modalidad_pago','Planilla','periodo','2026-09','estado','pendiente_aprobacion'));
  rn:=public.registrar_cobro_cxc_atomico('emp_2000000000',b->>'cxc_id',jsonb_build_object('id','cob_spot6_new_p','monto_capital',300,'monto_mora',0,'medio_pago','Transferencia','cuenta_bancaria','cb_299412','numero_operacion','OP-NR-P','fecha_cobro','2026-09-24'),jsonb_build_object('id','tes_spot6_new_p','descripcion','Cobro normal','monto',300,'moneda','PEN','fecha','2026-09-24','cuenta_bancaria','INTERBANK SOLES','cuenta_bancaria_id','cb_299412','tc_aplicado',1,'monto_en_moneda_cuenta',300,'referencia','OP-NR-P'),jsonb_build_object('id','com_spot6_new_p','monto_cobrado',300,'porcentaje_comision',10,'monto_comision',30,'bonificacion',0,'monto_total',30,'modalidad_pago','Planilla','periodo','2026-09','estado','pendiente_aprobacion'));
  if ((ro->'cxc') - ARRAY['id','factura_id','created_at','updated_at']) is distinct from ((rn->'cxc') - ARRAY['id','factura_id','created_at','updated_at']) then raise exception 'CASO_1|parcial|cxc_campo_a_campo_diferente'; end if;
  if ((ro->'cobro') - ARRAY['id','cxc_id','factura_id','creado_en']) is distinct from ((rn->'cobro') - ARRAY['id','cxc_id','factura_id','creado_en']) then raise exception 'CASO_1|parcial|cobro_campo_a_campo_diferente'; end if;
  if ((ro->'movimiento') - ARRAY['id','vinculo_id','created_at']) is distinct from ((rn->'movimiento') - ARRAY['id','vinculo_id','created_at']) then raise exception 'CASO_1|parcial|movimiento_campo_a_campo_diferente'; end if;
  if ((ro->'comision') - ARRAY['id','cobro_cxc_id','cxc_id','factura_id','creado_en']) is distinct from ((rn->'comision') - ARRAY['id','cobro_cxc_id','cxc_id','factura_id','creado_en']) then raise exception 'CASO_1|parcial|comision_campo_a_campo_diferente'; end if;
  raise notice 'CASO_1|parcial|cxc_cobro_movimiento_comision=campo_a_campo_coinciden';
  ro:=pg_temp.registrar_cobro_cxc_atomico_anterior('emp_2000000000',a->>'cxc_id',jsonb_build_object('id','cob_spot6_old_t','monto_capital',700,'monto_mora',0,'medio_pago','Transferencia','cuenta_bancaria','cb_299412','numero_operacion','OP-NR-T','fecha_cobro','2026-09-24'),jsonb_build_object('id','tes_spot6_old_t','descripcion','Cobro normal','monto',700,'moneda','PEN','fecha','2026-09-24','cuenta_bancaria','INTERBANK SOLES','cuenta_bancaria_id','cb_299412','tc_aplicado',1,'monto_en_moneda_cuenta',700,'referencia','OP-NR-T'),jsonb_build_object('id','com_spot6_old_t','monto_cobrado',700,'porcentaje_comision',10,'monto_comision',70,'bonificacion',0,'monto_total',70,'modalidad_pago','Planilla','periodo','2026-09','estado','pendiente_aprobacion'));
  rn:=public.registrar_cobro_cxc_atomico('emp_2000000000',b->>'cxc_id',jsonb_build_object('id','cob_spot6_new_t','monto_capital',700,'monto_mora',0,'medio_pago','Transferencia','cuenta_bancaria','cb_299412','numero_operacion','OP-NR-T','fecha_cobro','2026-09-24'),jsonb_build_object('id','tes_spot6_new_t','descripcion','Cobro normal','monto',700,'moneda','PEN','fecha','2026-09-24','cuenta_bancaria','INTERBANK SOLES','cuenta_bancaria_id','cb_299412','tc_aplicado',1,'monto_en_moneda_cuenta',700,'referencia','OP-NR-T'),jsonb_build_object('id','com_spot6_new_t','monto_cobrado',700,'porcentaje_comision',10,'monto_comision',70,'bonificacion',0,'monto_total',70,'modalidad_pago','Planilla','periodo','2026-09','estado','pendiente_aprobacion'));
  if ((ro->'cxc') - ARRAY['id','factura_id','created_at','updated_at']) is distinct from ((rn->'cxc') - ARRAY['id','factura_id','created_at','updated_at']) then raise exception 'CASO_1|total|cxc_campo_a_campo_diferente'; end if;
  if ((ro->'cobro') - ARRAY['id','cxc_id','factura_id','creado_en']) is distinct from ((rn->'cobro') - ARRAY['id','cxc_id','factura_id','creado_en']) then raise exception 'CASO_1|total|cobro_campo_a_campo_diferente'; end if;
  if ((ro->'movimiento') - ARRAY['id','vinculo_id','created_at']) is distinct from ((rn->'movimiento') - ARRAY['id','vinculo_id','created_at']) then raise exception 'CASO_1|total|movimiento_campo_a_campo_diferente'; end if;
  if ((ro->'comision') - ARRAY['id','cobro_cxc_id','cxc_id','factura_id','creado_en']) is distinct from ((rn->'comision') - ARRAY['id','cobro_cxc_id','cxc_id','factura_id','creado_en']) then raise exception 'CASO_1|total|comision_campo_a_campo_diferente'; end if;
  raise notice 'CASO_1|total|cxc_cobro_movimiento_comision=campo_a_campo_coinciden';
end;
$test$;

\echo '--- caso 2: detraccion PEN, cuenta BN, comision unica ---'
do $test$
declare f jsonb; r jsonb; d record; co integer;
begin
  f:=pg_temp.fixture_cxc('det_pen','PEN',1000,true);
  r:=public.registrar_cobro_cxc_atomico('emp_2000000000',f->>'cxc_id',jsonb_build_object('id','cob_spot6_det2','tipo_cobro','detraccion','detraccion_id',f->>'detraccion_id','monto_capital',120,'monto_mora',0,'medio_pago','Detraccion','cuenta_bancaria','cb_spot6_bn','numero_constancia','CONST-2','fecha_cobro','2026-09-24'),jsonb_build_object('id','tes_spot6_det2','descripcion','Deposito detraccion','monto',120,'moneda','PEN','fecha','2026-09-24','cuenta_bancaria','Cuenta BN temporal','cuenta_bancaria_id','cb_spot6_bn','tc_aplicado',1,'monto_en_moneda_cuenta',120,'referencia','CONST-2'),jsonb_build_object('id','com_spot6_det2','monto_cobrado',999,'porcentaje_comision',10,'monto_comision',999,'bonificacion',0,'monto_total',999,'modalidad_pago','Planilla','periodo','2026-09','estado','pendiente_aprobacion'));
  select * into d from public.detracciones where id=(f->>'detraccion_id')::uuid;
  select count(*) into co from public.comisiones where cobro_cxc_id='cob_spot6_det2';
  if r->'cxc'->>'saldo' <> '880.00' or r->'cobro'->>'monto_capital' <> '120.00' or r->'cobro'->>'detraccion_id' <> f->>'detraccion_id' or r->'movimiento'->>'monto' <> '120.00' or r->'movimiento'->>'detraccion_id' <> f->>'detraccion_id' or d.estado <> 'depositada' or r->'cobro'->>'numero_operacion' <> 'CONST-2' or co<>1 or r->'comision'->>'monto_cobrado' <> '120.00' or r->'comision'->>'monto_comision' <> '12.00' then raise exception 'CASO_2|resultado_incorrecto'; end if;
  raise notice 'CASO_2|PEN|saldo=880|obligacion=depositada|comision=1|base_comision=120|constancia=CONST-2';
end;
$test$;

\echo '--- casos 3 a 7: cuentas y limite normal ---'
do $test$
declare e text; f jsonb; r jsonb;
begin
  f:=pg_temp.fixture_cxc('det_normal','PEN',1000,true);
  begin
    r:=public.registrar_cobro_cxc_atomico('emp_2000000000',f->>'cxc_id',jsonb_build_object('id','cob_spot6_det3','tipo_cobro','detraccion','detraccion_id',f->>'detraccion_id','monto_capital',120),jsonb_build_object('id','tes_spot6_det3','monto',120,'moneda','PEN','cuenta_bancaria_id','cb_299412'),null);
  exception when others then e:=sqlerrm; end;
  if e not like 'El cobro de detraccion solo puede%' then raise exception 'CASO_3|mensaje=%',e; end if;
  raise notice 'CASO_3|cuenta_normal=rechazado|mensaje=%',e;

  f:=pg_temp.fixture_cxc('normal_bn','PEN',1000,false);
  begin
    r:=public.registrar_cobro_cxc_atomico('emp_2000000000',f->>'cxc_id',jsonb_build_object('id','cob_spot6_det4','monto_capital',100),jsonb_build_object('id','tes_spot6_det4','monto',100,'moneda','PEN','cuenta_bancaria_id','cb_spot6_bn'),null);
  exception when others then e:=sqlerrm; end;
  if e not like 'Un cobro normal%' then raise exception 'CASO_4|mensaje=%',e; end if;
  raise notice 'CASO_4|cobro_normal_en_BN=rechazado|mensaje=%',e;

  f:=pg_temp.fixture_cxc('det_monto','PEN',1000,true);
  begin
    r:=public.registrar_cobro_cxc_atomico('emp_2000000000',f->>'cxc_id',jsonb_build_object('id','cob_spot6_det5','tipo_cobro','detraccion','detraccion_id',f->>'detraccion_id','monto_capital',119),jsonb_build_object('id','tes_spot6_det5','monto',119,'moneda','PEN','cuenta_bancaria_id','cb_spot6_bn'),null);
  exception when others then e:=sqlerrm; end;
  if e not like 'El monto del cobro de detraccion debe%' and e not like 'El deposito de detraccion debe%' then raise exception 'CASO_5|mensaje=%',e; end if;
  raise notice 'CASO_5|importe_distinto=rechazado|mensaje=%',e;

  f:=pg_temp.fixture_cxc('det_sociedad','PEN',1000,true);
  begin
    r:=public.registrar_cobro_cxc_atomico('emp_2000000000',f->>'cxc_id',jsonb_build_object('id','cob_spot6_det6','tipo_cobro','detraccion','detraccion_id',f->>'detraccion_id','monto_capital',120),jsonb_build_object('id','tes_spot6_det6','monto',120,'moneda','PEN','cuenta_bancaria_id','cb_spot6_bn_other'),null);
  exception when others then e:=sqlerrm; end;
  if e not like 'El cobro de detraccion solo puede%' then raise exception 'CASO_6|mensaje=%',e; end if;
  raise notice 'CASO_6|BN_otra_sociedad=rechazado|mensaje=%',e;

  f:=pg_temp.fixture_cxc('det_limite','PEN',1000,true);
  begin
    r:=public.registrar_cobro_cxc_atomico('emp_2000000000',f->>'cxc_id',jsonb_build_object('id','cob_spot6_det7x','monto_capital',881),jsonb_build_object('id','tes_spot6_det7x','monto',881,'moneda','PEN','cuenta_bancaria_id','cb_299412'),null);
  exception when others then e:=sqlerrm; end;
  if e not like 'El cobro normal no puede invadir%' then raise exception 'CASO_7|invasión|mensaje=%',e; end if;
  raise notice 'CASO_7|normal=881|rechazado_por_tramo_detraccion|mensaje=%',e;
  r:=public.registrar_cobro_cxc_atomico('emp_2000000000',f->>'cxc_id',jsonb_build_object('id','cob_spot6_det7','monto_capital',880),jsonb_build_object('id','tes_spot6_det7','monto',880,'moneda','PEN','cuenta_bancaria_id','cb_299412'),null);
  if r->'cxc'->>'saldo' <> '120.00' then raise exception 'CASO_7|limite_aceptado_incorrecto'; end if;
  raise notice 'CASO_7|normal=880|aceptado_hasta_limite|saldo=120';
end;
$test$;

\echo '--- caso 8: CxC USD, detraccion 406 PEN reduce 120 USD ---'
do $test$
declare f jsonb; r jsonb;
begin
  f:=pg_temp.fixture_cxc('det_usd','USD',1000,true,3.380891);
  r:=public.registrar_cobro_cxc_atomico('emp_2000000000',f->>'cxc_id',jsonb_build_object('id','cob_spot6_det8','tipo_cobro','detraccion','detraccion_id',f->>'detraccion_id','monto_capital',120),jsonb_build_object('id','tes_spot6_det8','monto',406,'moneda','PEN','cuenta_bancaria_id','cb_spot6_bn','tc_aplicado',3.380891,'monto_en_moneda_cuenta',406),null);
  if r->'cxc'->>'saldo' <> '880.00' or r->'movimiento'->>'monto' <> '406.00' or r->'movimiento'->>'moneda' <> 'PEN' or r->'movimiento'->>'tc_aplicado' <> '3.380891' or r->'movimiento'->>'monto_en_moneda_cuenta' <> '406.00' then raise exception 'CASO_8|conversion_incorrecta'; end if;
  raise notice 'CASO_8|USD|cobro=406_PEN|cxc_reducida=120_USD|movimiento=406_PEN';
end;
$test$;

\echo '--- caso 9: segundo cobro sobre obligacion depositada ---'
do $test$
declare f jsonb; e text; r jsonb;
begin
  f:=pg_temp.fixture_cxc('det_doble','PEN',1000,true);
  r:=public.registrar_cobro_cxc_atomico('emp_2000000000',f->>'cxc_id',jsonb_build_object('id','cob_spot6_det9a','tipo_cobro','detraccion','detraccion_id',f->>'detraccion_id','monto_capital',120),jsonb_build_object('id','tes_spot6_det9a','monto',120,'moneda','PEN','cuenta_bancaria_id','cb_spot6_bn'),null);
  begin
    r:=public.registrar_cobro_cxc_atomico('emp_2000000000',f->>'cxc_id',jsonb_build_object('id','cob_spot6_det9b','tipo_cobro','detraccion','detraccion_id',f->>'detraccion_id','monto_capital',120),jsonb_build_object('id','tes_spot6_det9b','monto',120,'moneda','PEN','cuenta_bancaria_id','cb_spot6_bn'),null);
  exception when others then e:=sqlerrm; end;
  if e not like 'No existe una obligacion SPOT pendiente%' then raise exception 'CASO_9|mensaje=%',e; end if;
  raise notice 'CASO_9|segunda_detraccion=rechazada|mensaje=%',e;
end;
$test$;

\echo '--- caso 10: flujo neto + detraccion ---'
do $test$
declare f jsonb; r jsonb; co integer; mo integer; cm integer; d record;
begin
  f:=pg_temp.fixture_cxc('flujo_completo','PEN',1000,true);
  r:=public.registrar_cobro_cxc_atomico('emp_2000000000',f->>'cxc_id',jsonb_build_object('id','cob_spot6_10n','monto_capital',880),jsonb_build_object('id','tes_spot6_10n','monto',880,'moneda','PEN','cuenta_bancaria_id','cb_299412'),jsonb_build_object('id','com_spot6_10n','monto_cobrado',880,'porcentaje_comision',10,'monto_comision',88,'bonificacion',0,'monto_total',88,'modalidad_pago','Planilla','periodo','2026-09','estado','pendiente_aprobacion'));
  r:=public.registrar_cobro_cxc_atomico('emp_2000000000',f->>'cxc_id',jsonb_build_object('id','cob_spot6_10d','tipo_cobro','detraccion','detraccion_id',f->>'detraccion_id','monto_capital',120),jsonb_build_object('id','tes_spot6_10d','monto',120,'moneda','PEN','cuenta_bancaria_id','cb_spot6_bn'),jsonb_build_object('id','com_spot6_10d','monto_cobrado',120,'porcentaje_comision',10,'monto_comision',12,'bonificacion',0,'monto_total',12,'modalidad_pago','Planilla','periodo','2026-09','estado','pendiente_aprobacion'));
  select * into d from public.detracciones where id=(f->>'detraccion_id')::uuid;
  select count(*) into co from public.cobros_cxc where cxc_id=f->>'cxc_id';
  select count(*) into mo from public.movimientos_tesoreria where vinculo_id=f->>'cxc_id';
  select count(*) into cm from public.comisiones where cxc_id=f->>'cxc_id';
  if r->'cxc'->>'saldo' <> '0.00' or r->'cxc'->>'estado' <> 'cobrada' or d.estado <> 'depositada' or co<>2 or mo<>2 or cm<>2 then raise exception 'CASO_10|flujo_incompleto'; end if;
  raise notice 'CASO_10|neto=880+detraccion=120|cxc=0|estado=cobrada|obligacion=depositada|comisiones=2|cobros=2|movimientos=2';
end;
$test$;

rollback;
\echo 'STEP6_DRY_RUN_ROLLBACK_COMPLETED'
