\set ON_ERROR_STOP on
\pset pager off
\pset format aligned
\pset null '[NULL]'
\echo '--- E2E SPOT: dry run con funciones persistidas ---'
begin;

update public.familia_servicio
set spot_catalogo_id=(select id from public.spot_catalogo where codigo='012' order by vigencia_desde desc limit 1)
where id='fam_d781ee8c60ae024eea';
update public.servicios set spot_catalogo_id=null where id='srv_c529a00515fe4defb6';

insert into public.cuentas_bancarias(id,empresa_id,nombre,banco,moneda,tipo,estado,sociedad_id,es_cuenta_detracciones)
values('cb_e2e8_bn','emp_2000000000','Cuenta BN E2E Paso 8','Banco de la Nacion','PEN','corriente','activo','609a2f33-d057-411f-a001-4e3e83f700d0',true)
on conflict (id) do update set empresa_id=excluded.empresa_id,nombre=excluded.nombre,banco=excluded.banco,moneda=excluded.moneda,tipo=excluded.tipo,estado=excluded.estado,sociedad_id=excluded.sociedad_id,es_cuenta_detracciones=excluded.es_cuenta_detracciones;

select set_config('request.jwt.claims','{"sub":"94c60fcb-8818-42e4-b395-31a8ff8635b1","role":"authenticated"}',true);

\echo '--- Flujo A: PEN, familia 012 ---'
do $e2e$
declare r jsonb; e text; d uuid;
begin
  r:=public.emitir_factura_cxc_atomico(jsonb_build_object(
    'empresa_id','emp_2000000000','factura_id','e2e8a_fac','cxc_id','e2e8a_cxc','cuenta_id','cta_108241',
    'centro_beneficio_id','cebe_1fd8d3b7f35a445c92','sociedad_id','609a2f33-d057-411f-a001-4e3e83f700d0',
    'numero','F-E2E8-A','tipo_documento','factura','fecha_emision','2026-09-24','fecha_vencimiento','2026-10-24',
    'subtotal',847.46,'igv',152.54,'total',1000,'moneda','PEN',
    'items',jsonb_build_array(jsonb_build_object('servicio_id','srv_c529a00515fe4defb6','cantidad',1,'precio_unitario',1000))
  ));
  select id into d from public.detracciones where factura_id='e2e8a_fac' and documento_ajuste_id is null;
  if d is null or (select monto_detraccion_origen from public.detracciones where id=d)<>120 then raise exception 'E2E_A_a|obligacion_incorrecta'; end if;
  raise notice 'E2E_A_a|factura=1000.00|codigo=012|12pct=120.00|obligacion=pendiente';

  e:=null;
  begin
    perform public.registrar_cobro_cxc_atomico('emp_2000000000','e2e8a_cxc',
      jsonb_build_object('id','e2e8a_cob_881','monto_capital',881,'medio_pago','Transferencia'),
      jsonb_build_object('id','e2e8a_mov_881','monto',881,'moneda','PEN','cuenta_bancaria_id','cb_299412','tc_aplicado',1,'monto_en_moneda_cuenta',881),null);
  exception when others then e:=sqlerrm; end;
  if e is null or e not like '%maximo cobrable ahora: 880%' then raise exception 'E2E_A_b1|mensaje=%',e; end if;
  raise notice 'E2E_A_b1|normal=881|rechazado|maximo=880|mensaje=%',e;

  perform public.registrar_cobro_cxc_atomico('emp_2000000000','e2e8a_cxc',
    jsonb_build_object('id','e2e8a_cob_880','monto_capital',880,'medio_pago','Transferencia','numero_operacion','E2E-A-880'),
    jsonb_build_object('id','e2e8a_mov_880','monto',880,'moneda','PEN','cuenta_bancaria_id','cb_299412','tc_aplicado',1,'monto_en_moneda_cuenta',880,'referencia','E2E-A-880'),
    jsonb_build_object('id','e2e8a_com_880','monto_cobrado',880,'porcentaje_comision',10,'monto_comision',88,'bonificacion',0,'monto_total',88,'modalidad_pago','Planilla','periodo','2026-09','estado','pendiente_aprobacion'));
  raise notice 'E2E_A_b2|normal=880|aceptado|cxc_saldo=120.00';

  perform public.registrar_cobro_cxc_atomico('emp_2000000000','e2e8a_cxc',
    jsonb_build_object('id','e2e8a_cob_det_120','tipo_cobro','detraccion','detraccion_id',d::text,'monto_capital',120,'medio_pago','Detraccion','numero_constancia','E2E-A-DET-120','fecha_cobro','2026-09-24'),
    jsonb_build_object('id','e2e8a_mov_det_120','monto',120,'moneda','PEN','cuenta_bancaria_id','cb_e2e8_bn','tc_aplicado',1,'monto_en_moneda_cuenta',120,'referencia','E2E-A-DET-120'),
    jsonb_build_object('id','e2e8a_com_det_120','monto_cobrado',120,'porcentaje_comision',10,'monto_comision',12,'bonificacion',0,'monto_total',12,'modalidad_pago','Planilla','periodo','2026-09','estado','pendiente_aprobacion'));
  if (select estado from public.detracciones where id=d)<>'depositada' or (select saldo from public.cxc where id='e2e8a_cxc')<>0 then raise exception 'E2E_A_c|estado_o_saldo_incorrecto'; end if;
  raise notice 'E2E_A_c|detraccion=120_PEN|cuenta=BN|depositada|cxc_saldo=0|comisiones=2|bases=880,120';

  perform public.emitir_nota_cxc_atomica(jsonb_build_object(
    'empresa_id','emp_2000000000','factura_origen_id','e2e8a_fac','factura_id','e2e8a_nd','sociedad_id','609a2f33-d057-411f-a001-4e3e83f700d0',
    'tipo_documento','nota_debito','motivo_codigo','01','fecha_emision','2026-09-24','subtotal',84.75,'igv',15.25,'total',100,'moneda','PEN'));
  if (select monto_detraccion_origen from public.detracciones where factura_id='e2e8a_fac' and documento_ajuste_id='e2e8a_nd')<>12 then raise exception 'E2E_A_d|incremental_incorrecto'; end if;
  raise notice 'E2E_A_d|ND=100.00|total_nuevo=1100.00|incremental=12.00|pendiente|cxc_saldo=100.00';

  e:=null;
  begin
    perform public.registrar_cobro_cxc_atomico('emp_2000000000','e2e8a_cxc',jsonb_build_object('id','e2e8a_cob_89','monto_capital',89),jsonb_build_object('id','e2e8a_mov_89','monto',89,'moneda','PEN','cuenta_bancaria_id','cb_299412'),null);
  exception when others then e:=sqlerrm; end;
  if e is null or e not like '%maximo cobrable ahora: 88%' then raise exception 'E2E_A_e|resultado_89=%',e; end if;
  raise notice 'E2E_A_e|normal_solicitado=89|rechazado|maximo=88|inconsistencia_aritmetica_con_solicitud';

  perform public.registrar_cobro_cxc_atomico('emp_2000000000','e2e8a_cxc',jsonb_build_object('id','e2e8a_cob_88','monto_capital',88),jsonb_build_object('id','e2e8a_mov_88','monto',88,'moneda','PEN','cuenta_bancaria_id','cb_299412'),jsonb_build_object('id','e2e8a_com_88','monto_cobrado',88,'porcentaje_comision',10,'monto_comision',8.8,'bonificacion',0,'monto_total',8.8,'modalidad_pago','Planilla','periodo','2026-09','estado','pendiente_aprobacion'));
  e:=null;
  begin
    perform public.registrar_cobro_cxc_atomico('emp_2000000000','e2e8a_cxc',jsonb_build_object('id','e2e8a_cob_1','monto_capital',1),jsonb_build_object('id','e2e8a_mov_1','monto',1,'moneda','PEN','cuenta_bancaria_id','cb_299412'),null);
  exception when others then e:=sqlerrm; end;
  if e is null or e not like '%maximo cobrable ahora: 0%' then raise exception 'E2E_A_e2|mensaje=%',e; end if;
  raise notice 'E2E_A_e2|normal=88|aceptado|normal_adicional=1|rechazado|maximo=0';

  perform public.registrar_cobro_cxc_atomico('emp_2000000000','e2e8a_cxc',jsonb_build_object('id','e2e8a_cob_det_12','tipo_cobro','detraccion','detraccion_id',(select id::text from public.detracciones where factura_id='e2e8a_fac' and documento_ajuste_id='e2e8a_nd'),'monto_capital',12,'medio_pago','Detraccion','numero_constancia','E2E-A-DET-12'),jsonb_build_object('id','e2e8a_mov_det_12','monto',12,'moneda','PEN','cuenta_bancaria_id','cb_e2e8_bn','tc_aplicado',1,'monto_en_moneda_cuenta',12,'referencia','E2E-A-DET-12'),jsonb_build_object('id','e2e8a_com_det_12','monto_cobrado',12,'porcentaje_comision',10,'monto_comision',1.2,'bonificacion',0,'monto_total',1.2,'modalidad_pago','Planilla','periodo','2026-09','estado','pendiente_aprobacion'));
  raise notice 'E2E_A_f|detraccion_incremental=12|depositada|cxc_saldo=0|flujo_completo=ok';
end;
$e2e$;

\echo '--- Flujo A: estado completo ---'
select id,numero,total,moneda,estado,aplica_detraccion,porcentaje_detraccion,monto_detraccion,monto_neto_cobrable from public.facturas where id='e2e8a_fac';
select id,monto_total,monto_pagado,saldo,moneda,estado from public.cxc where id='e2e8a_cxc';
select id,documento_ajuste_id,codigo_spot,estado,monto_detraccion_origen,monto_detraccion_soles,moneda_origen,cuenta_destino_id from public.detracciones where cxc_id='e2e8a_cxc' order by creado_en;
select id,monto_capital,medio_pago,detraccion_id,numero_operacion from public.cobros_cxc where cxc_id='e2e8a_cxc' order by creado_en;
select id,monto,moneda,tc_aplicado,monto_en_moneda_cuenta,cuenta_bancaria_id,detraccion_id from public.movimientos_tesoreria where vinculo_id='e2e8a_cxc' order by created_at;
select id,monto_cobrado,monto_comision,monto_total,estado from public.comisiones where cxc_id='e2e8a_cxc' order by creado_en;

\echo '--- Flujo B: USD, TC manual 3.40 ---'
do $e2e$
declare r jsonb; d uuid;
begin
  r:=public.emitir_factura_cxc_atomico(jsonb_build_object(
    'empresa_id','emp_2000000000','factura_id','e2e8b_fac','cxc_id','e2e8b_cxc','cuenta_id','cta_108241',
    'centro_beneficio_id','cebe_1fd8d3b7f35a445c92','sociedad_id','609a2f33-d057-411f-a001-4e3e83f700d0',
    'numero','F-E2E8-B','tipo_documento','factura','fecha_emision','2026-09-24','fecha_vencimiento','2026-10-24',
    'subtotal',847.46,'igv',152.54,'total',1000,'moneda','USD','tipo_cambio_detraccion',3.40,'tipo_cambio_fuente','manual',
    'items',jsonb_build_array(jsonb_build_object('servicio_id','srv_c529a00515fe4defb6','cantidad',1,'precio_unitario',1000))));
  select id into d from public.detracciones where factura_id='e2e8b_fac';
  if (select monto_detraccion_soles from public.detracciones where id=d)<>408 then raise exception 'E2E_B_a|deposito_incorrecto'; end if;
  perform public.registrar_cobro_cxc_atomico('emp_2000000000','e2e8b_cxc',jsonb_build_object('id','e2e8b_cob_880','monto_capital',880),jsonb_build_object('id','e2e8b_mov_880','monto',880,'moneda','USD','cuenta_bancaria_id','cb_299412','tc_aplicado',3.40,'monto_en_moneda_cuenta',2992),jsonb_build_object('id','e2e8b_com_880','monto_cobrado',880,'porcentaje_comision',10,'monto_comision',88,'bonificacion',0,'monto_total',88,'modalidad_pago','Planilla','periodo','2026-09','estado','pendiente_aprobacion'));
  perform public.registrar_cobro_cxc_atomico('emp_2000000000','e2e8b_cxc',jsonb_build_object('id','e2e8b_cob_det','tipo_cobro','detraccion','detraccion_id',d::text,'monto_capital',120,'numero_constancia','E2E-B-DET'),jsonb_build_object('id','e2e8b_mov_det','monto',408,'moneda','PEN','cuenta_bancaria_id','cb_e2e8_bn','tc_aplicado',3.40,'monto_en_moneda_cuenta',408,'referencia','E2E-B-DET'),jsonb_build_object('id','e2e8b_com_det','monto_cobrado',120,'porcentaje_comision',10,'monto_comision',12,'bonificacion',0,'monto_total',12,'modalidad_pago','Planilla','periodo','2026-09','estado','pendiente_aprobacion'));
  if (select saldo from public.cxc where id='e2e8b_cxc')<>0 then raise exception 'E2E_B|saldo_no_cero'; end if;
  raise notice 'E2E_B|total=1000_USD|tc=3.40|neto=880_USD|origen=120_USD|1000*3.40*12pct=408.00_PEN|deposito=408|cxc_saldo=0';
end;
$e2e$;
\echo '--- Flujo B: estado completo ---'
select id,numero,total,moneda,estado,aplica_detraccion,porcentaje_detraccion,monto_detraccion,monto_neto_cobrable from public.facturas where id='e2e8b_fac';
select id,monto_total,monto_pagado,saldo,moneda,estado from public.cxc where id='e2e8b_cxc';
select id,documento_ajuste_id,codigo_spot,estado,monto_detraccion_origen,monto_detraccion_soles,moneda_origen,tipo_cambio,tipo_cambio_fuente from public.detracciones where cxc_id='e2e8b_cxc';
select id,monto_capital,detraccion_id,numero_operacion from public.cobros_cxc where cxc_id='e2e8b_cxc' order by creado_en;
select id,monto,moneda,tc_aplicado,monto_en_moneda_cuenta,cuenta_bancaria_id,detraccion_id from public.movimientos_tesoreria where vinculo_id='e2e8b_cxc' order by created_at;
select id,monto_cobrado,monto_comision,monto_total,estado from public.comisiones where cxc_id='e2e8b_cxc' order by creado_en;

\echo '--- Flujo C: importacion y NC ---'
do $e2e$
declare r jsonb; d record;
begin
  r:=public.importar_cxc_masiva_fila(jsonb_build_object(
    'empresa_id','emp_2000000000','ruc_cliente','20244444444','razon_social','Cliente E2E C','tipo_documento','factura','numero','F-E2E8-C',
    'fecha_emision','2026-09-24','fecha_vencimiento','2026-10-24','moneda','PEN','subtotal',847.46,'igv',152.54,'monto_total',1000,
    'monto_pagado',880,'monto_detraccion',120,'codigo_spot','012','fecha_cobro','2026-09-24','medio_pago','Transferencia',
    'numero_operacion','E2E-C-IMPORT','centro_beneficio_codigo','CEBE-000','glosa','E2E importacion'));
  select * into d from public.detracciones where factura_id=r->'factura'->>'id';
  if d.estado<>'depositada' or d.cuenta_destino_id is not null or not exists(select 1 from public.cobros_cxc where detraccion_id=d.id) then raise exception 'E2E_C_a|importacion_incorrecta'; end if;
  perform public.emitir_nota_cxc_atomica(jsonb_build_object('empresa_id','emp_2000000000','factura_origen_id',r->'factura'->>'id','factura_id','e2e8c_nc','sociedad_id','609a2f33-d057-411f-a001-4e3e83f700d0','tipo_documento','nota_credito','motivo_codigo','01','fecha_emision','2026-09-24','subtotal',84.75,'igv',15.25,'total',100,'moneda','PEN'));
  if not exists(select 1 from public.detracciones where factura_id=r->'factura'->>'id' and documento_ajuste_id='e2e8c_nc' and estado='ajustada' and monto_detraccion_soles=12) then raise exception 'E2E_C_b|ajuste_incorrecto'; end if;
  raise notice 'E2E_C|importacion|principal=depositada|NC=100|nuevo_calculo=108|depositado=120|exceso=12|ajuste=ajustada|movimientos_importacion=0';
end;
$e2e$;
\echo '--- Flujo C: estado completo ---'
select f.id,f.numero,f.total,f.moneda,f.estado,f.aplica_detraccion,f.porcentaje_detraccion,f.monto_detraccion from public.facturas f where f.numero='F-E2E8-C' or f.id='e2e8c_nc' order by f.id;
select c.id,c.monto_total,c.monto_pagado,c.saldo,c.moneda,c.estado from public.cxc c where c.factura_id in (select id from public.facturas where numero='F-E2E8-C');
select d.id,d.documento_ajuste_id,d.codigo_spot,d.estado,d.monto_detraccion_origen,d.monto_detraccion_soles,d.cuenta_destino_id from public.detracciones d where d.factura_id in (select id from public.facturas where numero='F-E2E8-C') order by d.creado_en;
select x.id,x.monto_capital,x.detraccion_id,x.numero_operacion from public.cobros_cxc x where x.cxc_id in (select c.id from public.cxc c join public.facturas f on f.id=c.factura_id where f.numero='F-E2E8-C');
select m.id,m.monto,m.moneda,m.tc_aplicado,m.monto_en_moneda_cuenta,m.cuenta_bancaria_id,m.detraccion_id from public.movimientos_tesoreria m where m.vinculo_id in (select c.id from public.cxc c join public.facturas f on f.id=c.factura_id where f.numero='F-E2E8-C');
select com.id,com.monto_cobrado,com.monto_comision,com.monto_total,com.estado from public.comisiones com where com.cxc_id in (select c.id from public.cxc c join public.facturas f on f.id=c.factura_id where f.numero='F-E2E8-C');

rollback;
\echo 'E2E_DRY_RUN_ROLLBACK_COMPLETED'
