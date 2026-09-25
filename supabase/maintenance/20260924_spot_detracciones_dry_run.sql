-- Dry run del Paso 3. Nunca confirma cambios en la base de datos.
\encoding UTF8
show client_encoding;
begin;
set local role postgres;
\ir 20260924_spot_detracciones_body.sql

-- Prueba funcional: el trigger rechaza contexto enviado por el cliente.
do $$
begin
  begin
    insert into public.detracciones (id,direccion,factura_id,cxc_id,empresa_id,sociedad_id,origen,moneda_origen,base_soles,monto_detraccion_soles,monto_detraccion_origen)
    values ('00000000-0000-0000-0000-000000000303','venta','fac_sc1_prb','cxc_sc1_prb','emp_20513453711','6deed52c-845c-42bb-a61f-6666dea723f3','importacion','PEN',100,10,10);
    raise exception 'VALIDACION_DERIVACION_FALLO|se_acepto_empresa_incorrecta';
  exception when others then
    if sqlerrm not like 'DETRACCION_CONTEXTO_EMPRESA_RECHAZADO:%' then raise; end if;
    raise notice 'VALIDACION_DERIVACION|empresa_cliente_incorrecta=rechazada';
  end;
  begin
    insert into public.detracciones (id,direccion,factura_id,cxc_id,empresa_id,sociedad_id,origen,moneda_origen,base_soles,monto_detraccion_soles,monto_detraccion_origen)
    values ('00000000-0000-0000-0000-000000000304','venta','fac_sc1_prb','cxc_sc1_prb','emp_2000000000','6deed52c-845c-42bb-a61f-6666dea723f3','importacion','PEN',100,10,10);
    raise exception 'VALIDACION_DERIVACION_FALLO|se_acepto_sociedad_incorrecta';
  exception when others then
    if sqlerrm not like 'DETRACCION_CONTEXTO_SOCIEDAD_RECHAZADO:%' then raise; end if;
    raise notice 'VALIDACION_DERIVACION|sociedad_cliente_incorrecta=rechazada';
  end;
end $$;

-- Fixtures temporales: se eliminan con el ROLLBACK final.
insert into public.detracciones (id,direccion,factura_id,cxc_id,origen,moneda_origen,base_soles,monto_detraccion_soles,monto_detraccion_origen)
values
 ('00000000-0000-0000-0000-000000000301','venta','fac_sc1_prb','cxc_sc1_prb','importacion','PEN',100,10,10),
 ('00000000-0000-0000-0000-000000000302','venta','fac_imp_04ece8a3755348438263','cxc_imp_eb1c81d84b80449e8261','importacion','PEN',100,10,10);

select set_config('request.jwt.claim.sub','94c60fcb-8818-42e4-b395-31a8ff8635b1',true);
select set_config('request.jwt.claims','{"sub":"94c60fcb-8818-42e4-b395-31a8ff8635b1","role":"authenticated"}',true);
set local role authenticated;

do $$
declare v_own integer; v_other integer;
begin
  select count(*) into v_own from public.detracciones where empresa_id = 'emp_2000000000';
  select count(*) into v_other from public.detracciones where empresa_id = 'emp_20513453711';
  if v_own <> 1 or v_other <> 0 then raise exception 'VALIDACION_RLS_FALLO|propias=%|otra_empresa=%',v_own,v_other; end if;
  raise notice 'VALIDACION_RLS|usuario_prueba=emp_2000000000|propias=1|otra_empresa=0';
end $$;

do $$
begin
  begin
    insert into public.detracciones (id,direccion,factura_id,cxc_id,origen,moneda_origen,base_soles,monto_detraccion_soles,monto_detraccion_origen)
    values ('00000000-0000-0000-0000-000000000305','venta','fac_sc2_prb','cxc_sc2_prb','importacion','PEN',100,10,10);
    raise exception 'VALIDACION_ESCRITURA_DIRECTA_FALLO|insert_aceptado';
  exception when insufficient_privilege then raise notice 'VALIDACION_ESCRITURA_DIRECTA|insert=permiso_denegado'; end;
  begin
    update public.detracciones set estado = 'depositada' where id = '00000000-0000-0000-0000-000000000301';
    raise exception 'VALIDACION_ESCRITURA_DIRECTA_FALLO|update_aceptado';
  exception when insufficient_privilege then raise notice 'VALIDACION_ESCRITURA_DIRECTA|update=permiso_denegado'; end;
  begin
    delete from public.detracciones where id = '00000000-0000-0000-0000-000000000301';
    raise exception 'VALIDACION_ESCRITURA_DIRECTA_FALLO|delete_aceptado';
  exception when insufficient_privilege then raise notice 'VALIDACION_ESCRITURA_DIRECTA|delete=permiso_denegado'; end;
end $$;

reset role;
set local role anon;
do $$
declare v_count integer;
begin
  begin
    select count(*) into v_count from public.detracciones;
    raise exception 'VALIDACION_ANON_SELECT_FALLO|select_aceptado|filas=%',v_count;
  exception when insufficient_privilege then raise notice 'VALIDACION_ANON_SELECT|permiso_denegado'; end;
end $$;
reset role;
rollback;
\echo STEP3_DRY_RUN_ROLLBACK_COMPLETED
