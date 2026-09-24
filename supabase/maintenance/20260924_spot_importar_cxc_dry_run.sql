\set ON_ERROR_STOP on
\pset pager off
\pset format aligned
\pset null '[NULL]'
\echo '--- Paso 8: dry run ---'
begin;
\ir 20260924_spot_importar_cxc_body.sql

select p.oid::regprocedure as funcion, p.proacl,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
       has_function_privilege('postgres',p.oid,'EXECUTE') as postgres_execute,
       has_function_privilege('service_role',p.oid,'EXECUTE') as service_role_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('importar_cxc_masiva_fila','importar_cxc_masiva_fila_base','importar_cxc_masiva_fila_base_impl')
  and pg_get_function_identity_arguments(p.oid)='p_payload jsonb'
order by p.proname;

create or replace function pg_temp.importar(p_tag text,p_ruc text,p_numero text,p_monto_pagado numeric,p_monto_detraccion numeric,p_codigo text default null,p_cuenta_det text default null,p_cebe text default 'CEBE-000') returns jsonb language sql as $$
  select public.importar_cxc_masiva_fila(jsonb_build_object(
    'empresa_id','emp_2000000000','ruc_cliente',p_ruc,'razon_social','Cliente SPOT 8 '||p_tag,'tipo_documento','factura','numero',p_numero,
    'fecha_emision','2026-09-24','fecha_vencimiento','2026-10-24','moneda','PEN','subtotal',847.46,'igv',152.54,'monto_total',1000,
    'monto_pagado',p_monto_pagado,'monto_detraccion',p_monto_detraccion,'codigo_spot',p_codigo,'fecha_cobro','2026-09-24','medio_pago','Transferencia',
    'cuenta_bancaria','INTERBANK SOLES','cuenta_detraccion_id',p_cuenta_det,
    'numero_operacion','OP-SPOT8-'||p_tag,'centro_beneficio_codigo',p_cebe,'glosa','Prueba Paso 8'
  ));
$$;

create or replace function pg_temp.norm_import(p_result jsonb) returns jsonb language sql as $$
  select jsonb_build_object('factura',(p_result->'factura')-array['id','numero','created_at','updated_at','cuenta_id'],'cxc',(p_result->'cxc')-array['id','factura_id','created_at','updated_at','cuenta_id'],'cobro',(p_result->'cobro')-array['id','cxc_id','factura_id','cuenta_id','creado_en'])
$$;

create or replace function pg_temp.importar_anterior(p_payload jsonb) returns jsonb language sql as $$ select public.importar_cxc_masiva_fila_base_impl(p_payload) $$;

insert into public.cuentas_bancarias(id,empresa_id,nombre,banco,moneda,tipo,estado,sociedad_id,es_cuenta_detracciones)
values ('cb_spot8_bn','emp_2000000000','Cuenta BN Paso 8','Banco de la Nacion','PEN','corriente','activo','609a2f33-d057-411f-a001-4e3e83f700d0',true),('cb_spot8_bn_other','emp_2000000000','Cuenta BN Paso 8 otra sociedad','Banco de la Nacion','PEN','corriente','activo','b03f3bda-d4be-4acb-891c-07f36b731fd5',true)
on conflict (id) do update set estado=excluded.estado,es_cuenta_detracciones=excluded.es_cuenta_detracciones;
insert into public.cuentas(id,empresa_id,nombre_comercial,razon_social,ruc,tipo,moneda,estado,agente_retencion_sunat,tasa_retencion_sunat,tipo_documento)
values('cta_spot8_ret','emp_2000000000','Cliente retencion SPOT 8','Cliente retencion SPOT 8','20999999991','cliente','PEN','activo',true,3,'RUC')
on conflict (id) do update set agente_retencion_sunat=true,tasa_retencion_sunat=3;
insert into public.centros_beneficio(id,empresa_id,codigo,nombre,tipo,estado,es_facturable,sociedad_id)
values('cebe_spot8_other','emp_2000000000','CEBE-SPOT8-B','CEBE Paso 8 sociedad B','cliente','activo',true,'b03f3bda-d4be-4acb-891c-07f36b731fd5')
on conflict (id) do update set sociedad_id=excluded.sociedad_id,estado='activo';
insert into public.spot_catalogo(codigo,anexo,descripcion,porcentaje,monto_minimo,umbral_operador,vigencia_desde,fuente_url,fuente_referencia)
values('TST-IMP-2040','ANEXO_3','Prueba importacion futura',12,700,'>',date '2040-01-01','https://orientacion.sunat.gob.pe/apendices-del-sistema-de-detracciones','Prueba temporal');
select set_config('request.jwt.claims','{"sub":"94c60fcb-8818-42e4-b395-31a8ff8635b1","role":"authenticated"}',true);

\echo '--- caso 1: no-regresion sin detraccion ---'
do $test$
declare old_r jsonb; new_r jsonb; p jsonb;
begin
  p:=jsonb_build_object('empresa_id','emp_2000000000','ruc_cliente','20111111111','razon_social','Cliente NR antiguo','tipo_documento','factura','numero','F-SPOT8-OLD','fecha_emision','2026-09-24','fecha_vencimiento','2026-10-24','moneda','PEN','subtotal',847.46,'igv',152.54,'monto_total',1000,'monto_pagado',100,'fecha_cobro','2026-09-24','centro_beneficio_codigo','CEBE-000');
  old_r:=pg_temp.importar_anterior(p);
  p:=jsonb_set(p,'{ruc_cliente}','"20111111112"')||jsonb_build_object('numero','F-SPOT8-NEW','razon_social','Cliente NR nuevo');
  new_r:=public.importar_cxc_masiva_fila(p);
  if pg_temp.norm_import(old_r) is distinct from pg_temp.norm_import(new_r) then raise exception 'CASO_1|diferencia_campo_a_campo'; end if;
  if (select count(*) from public.movimientos_tesoreria where vinculo_id=(new_r->'cxc'->>'id'))<>0 then raise exception 'CASO_1|movimiento_no_regresion'; end if;
  raise notice 'CASO_1|sin_detraccion|version_anterior_vs_nueva=campo_a_campo_coinciden|movimientos=0';
end;$test$;

\echo '--- caso 2: detraccion sin codigo ni cuenta BN ---'
do $test$
declare r jsonb; d record; c record; n integer;
begin
  r:=pg_temp.importar('sin_codigo','20222222222','F-SPOT8-02',100,120,null,null);
  select * into d from public.detracciones where cxc_id=r->'cxc'->>'id'; select * into c from public.cobros_cxc where cxc_id=r->'cxc'->>'id' and detraccion_id is not null; select count(*) into n from public.movimientos_tesoreria where vinculo_id=r->'cxc'->>'id';
  if d.estado<>'depositada' or d.origen<>'importacion' or d.spot_catalogo_id is not null or c.detraccion_id is null or n<>0 then raise exception 'CASO_2|resultado_incorrecto'; end if;
  raise notice 'CASO_2|codigo=NULL|obligacion=depositada|cobro_vinculado=1|movimientos=0';
end;$test$;

\echo '--- caso 3: codigo vigente y cuenta BN ---'
do $test$
declare r jsonb; d record; n integer;
begin
  r:=pg_temp.importar('con_codigo','20222222223','F-SPOT8-03',100,120,'012','cb_spot8_bn');
  select * into d from public.detracciones where cxc_id=r->'cxc'->>'id'; select count(*) into n from public.movimientos_tesoreria where vinculo_id=r->'cxc'->>'id';
  if d.codigo_spot<>'012' or d.spot_catalogo_id is null or d.estado<>'depositada' or d.cuenta_destino_id<>'cb_spot8_bn' or n<>0 then raise exception 'CASO_3|resultado_incorrecto'; end if;
  raise notice 'CASO_3|codigo=012|vigente=1|obligacion=depositada|cuenta_destino_id=cb_spot8_bn|movimientos=0';
end;$test$;

\echo '--- caso 4: codigo sin vigencia ---'
do $test$
declare e text;
begin
  begin perform pg_temp.importar('codigo_futuro','20222222224','F-SPOT8-04',100,120,'TST-IMP-2040',null); exception when others then e:=sqlerrm; end;
  if e is null or e not like 'El codigo SPOT TST-IMP-2040 no tiene%' then raise exception 'CASO_4|mensaje=%',e; end if;
  raise notice 'CASO_4|codigo_sin_version_vigente=rechazado|mensaje=%',e;
end;$test$;

\echo '--- caso 5: cuenta BN de otra sociedad ---'
do $test$
declare e text;
begin
  begin perform pg_temp.importar('sociedad_bn','20222222225','F-SPOT8-05',100,120,'012','cb_spot8_bn_other'); exception when others then e:=sqlerrm; end;
  if e is null or e not like 'La cuenta de detracciones no es%' then raise exception 'CASO_5|mensaje=%',e; end if;
  raise notice 'CASO_5|cuenta_BN_otra_sociedad=rechazado|mensaje=%',e;
end;$test$;

\echo '--- caso 6: sociedad derivada fuera de alcance ---'
do $test$
declare e text;
begin
  insert into public.usuarios_asignaciones(empresa_id,user_id,rol_id,categoria,nivel_jerarquico,alcance_tipo,principal,activo,sociedades_ids)
  values('emp_2000000000','94c60fcb-8818-42e4-b395-31a8ff8635b1','rol_emp_2000000000_admin','admin','direccion','sociedad',false,true,array['609a2f33-d057-411f-a001-4e3e83f700d0']::uuid[]);
  begin perform pg_temp.importar('fuera_alcance','20222222226','F-SPOT8-06',100,0,null,null,'CEBE-SPOT8-B'); exception when others then e:=sqlerrm; end;
  if e is null or e not like 'La sociedad derivada de la importacion esta fuera%' then raise exception 'CASO_6|mensaje=%',e; end if;
  raise notice 'CASO_6|sociedad_derivada=fuera_de_alcance|rechazado|mensaje=%',e;
end;$test$;

\echo '--- caso 7: retencion y detraccion ---'
do $test$
declare e text;
begin
  begin perform pg_temp.importar('retencion','20999999991','F-SPOT8-07',100,120,null,null); exception when others then e:=sqlerrm; end;
  if e is null or e not like 'La importacion no puede tener retencion%' then raise exception 'CASO_7|mensaje=%',e; end if;
  raise notice 'CASO_7|retencion_mas_detraccion=rechazado|mensaje=%',e;
end;$test$;

\echo '--- caso 8: detraccion negativa ---'
do $test$
declare e text;
begin
  begin perform pg_temp.importar('negativo','20222222227','F-SPOT8-08',100,-1,null,null); exception when others then e:=sqlerrm; end;
  if e is null or e not like 'Monto de detraccion invalido%' then raise exception 'CASO_8|mensaje=%',e; end if;
  raise notice 'CASO_8|monto_detraccion=-1|rechazado|comportamiento_previo=conservado|mensaje=%',e;
end;$test$;

\echo '--- caso 9: funcion interna sin EXECUTE ---'
set local role authenticated;
do $test$
declare e text;
begin
  begin perform public.importar_cxc_masiva_fila_base_impl('{}'::jsonb); exception when others then e:=sqlerrm; end;
  if e is null or e not like '%permission denied%' then raise exception 'CASO_9|resultado_incorrecto|mensaje=%',e; end if;
  raise notice 'CASO_9|base_impl_directa=permiso_denegado|mensaje=%',e;
end;$test$;
reset role;

rollback;
\echo 'STEP8_DRY_RUN_ROLLBACK_COMPLETED'
