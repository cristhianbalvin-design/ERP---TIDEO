\set ON_ERROR_STOP on
\encoding UTF8
set client_encoding = 'UTF8';
set lock_timeout = '5s';
set statement_timeout = '120s';
begin;
\ir ../supabase/migrations/20260926162307_compras_campo_lineas_oc.sql

-- La migración se carga por referencia; no duplicar su contenido aquí.
create temporary table _campo_resultados (
  caso text primary key,
  resultado text,
  detalle text
) on commit drop;

create temporary table _campo_lineas on commit drop as
with candidatas as (
  select s.id solpe_id,
         s.codigo solpe_codigo,
         item.item ->> 'id' solpe_item_id,
         nullif(item.item ->> 'cantidad','')::numeric cantidad
  from public.solpe_interna s
  cross join lateral jsonb_array_elements(coalesce(s.items,'[]'::jsonb)) with ordinality item(item,ordinality)
  where s.empresa_id='emp_2000000000'
    and lower(trim(coalesce(s.estado,''))) in ('aprobada','oc_parcial')
    and nullif(btrim(item.item ->> 'oc_id'),'') is null
    and nullif(btrim(item.item ->> 'proveedor_asignado_id'),'') is null
    and nullif(btrim(item.item ->> 'comprador_campo_id'),'') is null
    and nullif(item.item ->> 'cantidad','') is not null
)
select solpe_id,solpe_codigo,solpe_item_id,cantidad
from candidatas
order by solpe_id
limit 5;

do $$
declare
  v_empresa text := 'emp_2000000000';
  v_sociedad uuid := '609a2f33-d057-411f-a001-4e3e83f700d0';
  v_ceco text := 'ceco_03ee8fb3d1db45f49d';
  v_tecnico uuid := '67b0e438-8712-40c0-ae60-006fbdd3c577';
  v_otro uuid := '30bc196b-808f-4f4b-a3ec-9bfe6b8f7837';
  v_no_perm uuid := '00000000-0000-0000-0000-000000000000';
  v_s1 text; v_i1 text; v_q1 numeric;
  v_s2 text; v_i2 text; v_q2 numeric;
  v_sh text; v_ih text; v_qh numeric;
  v_si text; v_ii text; v_qi numeric;
  v_result jsonb; v_error text; v_oc text; v_och text; v_cxp text; v_provider text;
  v_count integer; v_count2 integer; v_state text; v_hash text;
  v_started timestamptz := clock_timestamp();
begin
  select solpe_id,solpe_item_id,cantidad into v_s1,v_i1,v_q1 from _campo_lineas offset 0 limit 1;
  select solpe_id,solpe_item_id,cantidad into v_s2,v_i2,v_q2 from _campo_lineas offset 1 limit 1;
  select solpe_id,solpe_item_id,cantidad into v_sh,v_ih,v_qh from _campo_lineas offset 2 limit 1;

  perform set_config('request.jwt.claim.sub',v_tecnico::text,true);

  if v_s1 is null then
    insert into _campo_resultados values ('a','NO_DISPONIBLE','No hay una linea aprobada libre en PRUEBA');
    insert into _campo_resultados values ('b','NO_DISPONIBLE','No hay una linea aprobada libre en PRUEBA');
    insert into _campo_resultados values ('c','NO_DISPONIBLE','No hay una linea aprobada libre en PRUEBA');
    insert into _campo_resultados values ('d','NO_DISPONIBLE','No hay una linea aprobada libre en PRUEBA');
    insert into _campo_resultados values ('e','NO_DISPONIBLE','No hay una linea aprobada libre en PRUEBA');
    insert into _campo_resultados values ('f','NO_DISPONIBLE','No hay una linea aprobada libre en PRUEBA');
  else
    perform public.tomar_linea_sourcing(v_s1,v_i1);
    select count(*) into v_count from public.solpe_interna s,jsonb_array_elements(s.items) x(item)
      where s.id=v_s1 and x.item ->> 'id'=v_i1 and x.item ->> 'comprador_campo_id'=v_tecnico::text;
    insert into _campo_resultados values ('a',case when v_count=1 then 'ACEPTADO' else 'FALLO' end,
      format('tomar=1 comprador_campo_id=%s; liberar=pendiente de caso c',v_tecnico));
    perform public.liberar_linea_sourcing(v_s1,v_i1);

    perform public.tomar_linea_sourcing(v_s1,v_i1);
    perform set_config('request.jwt.claim.sub',v_otro::text,true);
    begin
      perform public.tomar_linea_sourcing(v_s1,v_i1);
      insert into _campo_resultados values ('b','FALLO','El segundo comprador tambien tomo la linea');
    exception when others then
      get stacked diagnostics v_error=message_text;
      insert into _campo_resultados values ('b','ACEPTADO',format('primer_toma=ACEPTADA segundo_intento=RECHAZADO error=%s',v_error));
      raise notice 'mensaje literal caso b: %', v_error;
    end;
    perform set_config('request.jwt.claim.sub',v_tecnico::text,true);
    perform public.liberar_linea_sourcing(v_s1,v_i1);

    perform public.tomar_linea_sourcing(v_s1,v_i1);
    perform set_config('request.jwt.claim.sub',v_otro::text,true);
    begin
      perform public.liberar_linea_sourcing(v_s1,v_i1);
      v_error := 'Un tercero libero la linea';
    exception when others then
      get stacked diagnostics v_error=message_text;
    end;
    perform set_config('request.jwt.claim.sub',v_tecnico::text,true);
    perform public.liberar_linea_sourcing(v_s1,v_i1);
    insert into _campo_resultados values ('c',case when v_error = 'Un tercero libero la linea' then 'FALLO' else 'ACEPTADO' end,format('liberar_otro=%s; liberar_propietario=ACEPTADO',v_error));
    
    perform public.tomar_linea_sourcing(v_s1,v_i1);
    perform set_config('request.jwt.claim.sub',v_no_perm::text,true);
    begin
      perform public.quitar_comprador_linea_sourcing(v_s1,v_i1);
      insert into _campo_resultados values ('d','FALLO','El usuario sin permiso pudo quitar la toma');
    exception when others then
      get stacked diagnostics v_error=message_text;
      perform set_config('request.jwt.claim.sub',v_otro::text,true);
      perform public.quitar_comprador_linea_sourcing(v_s1,v_i1);
      insert into _campo_resultados values ('d','ACEPTADO',format('quitar_sin_permiso=RECHAZADO; quitar_backoffice=ACEPTADO; error=%s',v_error));
    end;
    perform set_config('request.jwt.claim.sub',v_tecnico::text,true);

    select id into v_provider from public.proveedores where empresa_id=v_empresa order by id limit 1;
    perform public.tomar_linea_sourcing(v_s1,v_i1);
    begin
      perform public.asignar_proveedor_linea_sourcing(v_s1,v_i1,v_provider);
      insert into _campo_resultados values ('e','FALLO','Se asigno proveedor a una linea tomada');
    exception when others then
      get stacked diagnostics v_error=message_text;
      insert into _campo_resultados values ('e','RECHAZADO',v_error);
    end;
    perform public.liberar_linea_sourcing(v_s1,v_i1);

    perform public.tomar_linea_sourcing(v_s1,v_i1);
    select count(*) into v_count from public.obtener_lineas_campo(v_empresa)
      where solpe_id=v_s1 and solpe_item_id=v_i1 and comprador_campo_id=v_tecnico::text and tomada_en is not null;
    perform set_config('request.jwt.claim.sub',v_otro::text,true);
    select count(*) into v_count2 from public.obtener_lineas_sourcing(v_empresa)
      where solpe_id=v_s1 and solpe_item_id=v_i1 and comprador_campo_id=v_tecnico::text and tomada_en is not null;
    perform set_config('request.jwt.claim.sub',v_tecnico::text,true);
    perform public.liberar_linea_sourcing(v_s1,v_i1);
    insert into _campo_resultados values ('f',case when v_count=1 and v_count2=1 then 'ACEPTADO' else 'FALLO' end,
      format('obtener_lineas_campo=%s; obtener_lineas_sourcing=%s; comprador=%s',v_count,v_count2,v_tecnico));
  end if;

  if v_sh is null then
    insert into _campo_resultados values ('h','NO_DISPONIBLE','No existe una linea libre con cantidad exactamente 10 en PRUEBA');
  else
    if v_qh <> 10 then
      update public.solpe_interna s
      set items=(select jsonb_agg(case when x.item ->> 'id'=v_ih then jsonb_set(x.item,'{cantidad}','10'::jsonb,true) else x.item end order by x.ordinality)
                 from jsonb_array_elements(s.items) with ordinality x(item,ordinality))
      where s.id=v_sh;
      v_qh:=10;
    end if;
    perform set_config('request.jwt.claim.sub',v_tecnico::text,true);
    perform public.tomar_linea_sourcing(v_sh,v_ih);
    v_result:=public.registrar_compra_campo(jsonb_build_object(
      'empresa_id',v_empresa,'sociedad_id',v_sociedad,'crear_cxp',false,
      'gasto',jsonb_build_object('id','gasto_campoh20260926abcdefghijkl','descripcion','Dry H split 6 of 10','monto',70.80,'monto_sin_igv',60.00,'fecha',current_date,'centro_costo_id',v_ceco,'ruc_proveedor','20999990003','num_comprobante','DRY-H-001','proveedor_referencia','Proveedor H','metodo_pago','Efectivo'),
      'adjunto',jsonb_build_object('bucket','documentos-generales','storage_path',v_empresa || '/compras_gastos/gasto_campoh20260926abcdefghijkl/h.jpg','url','https://example.test/h.jpg','nombre_original','h.jpg','mime_type','image/jpeg'),
      'lineas_solpe',jsonb_build_array(jsonb_build_object('solpe_id',v_sh,'solpe_item_id',v_ih,'cantidad',6,'precio_unitario',10))
    ));
    v_och:=v_result->'oc'->>'id';
    select count(*) into v_count from public.solpe_interna s,jsonb_array_elements(s.items) x(item)
      where s.id=v_sh and x.item ->> 'id'=v_ih and (x.item ->> 'cantidad')::numeric=6 and x.item ->> 'oc_id'=v_och;
    select count(*) into v_count2 from public.solpe_interna s,jsonb_array_elements(s.items) x(item)
      where s.id=v_sh and coalesce(x.item ->> 'cantidad','')='4' and nullif(x.item ->> 'oc_id','') is null and nullif(x.item ->> 'proveedor_asignado_id','') is null and nullif(x.item ->> 'comprador_campo_id','') is null;
    insert into _campo_resultados values ('h',case when v_count=1 and v_count2=1 then 'ACEPTADO' else 'FALLO' end,
      format('cubierta_6=%s libre_4=%s oc=%s',v_count,v_count2,v_result->'oc'->>'codigo'));
  end if;

  if v_s1 is null or v_s2 is null then
    insert into _campo_resultados values ('g','NO_DISPONIBLE','Se requieren dos lineas libres de SOLPE de empresas distintas');
  else
    perform set_config('request.jwt.claim.sub',v_tecnico::text,true);
    perform public.tomar_linea_sourcing(v_s1,v_i1);
    perform public.tomar_linea_sourcing(v_s2,v_i2);
    v_result:=public.registrar_compra_campo(jsonb_build_object(
      'empresa_id',v_empresa,'sociedad_id',v_sociedad,'crear_cxp',true,
      'gasto',jsonb_build_object('id','gasto_campog20260926abcdefghijkl','descripcion','Dry G complete lines','monto',round((v_q1*10+v_q2*10)*1.18,2),'monto_sin_igv',v_q1*10+v_q2*10,'fecha',current_date,'centro_costo_id',v_ceco,'ruc_proveedor','20999990001','num_comprobante','DRY-G-001','proveedor_referencia','Proveedor G','metodo_pago','Efectivo'),
      'adjunto',jsonb_build_object('bucket','documentos-generales','storage_path',v_empresa || '/compras_gastos/gasto_campog20260926abcdefghijkl/g.jpg','url','https://example.test/g.jpg','nombre_original','g.jpg','mime_type','image/jpeg'),
      'cxp',jsonb_build_object('factura_numero','DRY-G-001','ruc_emisor','20999990001','fecha_emision',current_date,'fecha_vencimiento',current_date+30,'concepto','Dry G'),
      'lineas_solpe',jsonb_build_array(
        jsonb_build_object('solpe_id',v_s1,'solpe_item_id',v_i1,'cantidad',v_q1,'precio_unitario',10),
        jsonb_build_object('solpe_id',v_s2,'solpe_item_id',v_i2,'cantidad',v_q2,'precio_unitario',10)
      )
    ));
    v_oc:=v_result->'oc'->>'id'; v_cxp:=v_result->>'cxp_id';
    select count(*) into v_count from public.compras_gastos where id='gasto_campog20260926abcdefghijkl' and orden_compra_id=v_oc and excluir_de_er=true;
    select count(*) into v_count2 from public.cxp where id=v_cxp and gasto_id='gasto_campog20260926abcdefghijkl' and orden_compra_id=v_oc and origen='gasto_movil' and no_devengar_er=true and estado='por_pagar';
    select count(*) into v_state from public.ordenes_compra where id=v_oc and origen_tipo='compra_campo' and estado='emitida';
    select count(*) into v_hash from public.solpe_interna s,jsonb_array_elements(s.items) x(item)
      where s.id in (v_s1,v_s2) and x.item ->> 'oc_id'=v_oc;
    insert into _campo_resultados values ('g',case when v_count=1 and v_count2=1 and v_state::int=1 and v_hash::int=2 then 'ACEPTADO' else 'FALLO' end,
      format('oc=%s estado=emitida origen_tipo=compra_campo gasto_oc=%s excluir_de_er=%s cxp_oc=%s cxp_gasto=%s lineas_cubiertas=%s',v_oc,v_count,v_state,v_count2,v_cxp,v_hash,v_result->>'lineas_cubiertas'));
  end if;

  select s.id,x.item ->> 'id',nullif(x.item ->> 'cantidad','')::numeric into v_si,v_ii,v_qi
  from public.solpe_interna s
  cross join lateral jsonb_array_elements(coalesce(s.items,'[]'::jsonb)) x(item)
  where s.empresa_id=v_empresa and lower(trim(coalesce(s.estado,''))) in ('aprobada','oc_parcial')
    and nullif(x.item ->> 'oc_id','') is null and nullif(x.item ->> 'proveedor_asignado_id','') is null
    and nullif(x.item ->> 'comprador_campo_id','') is null
  limit 1;
  if v_si is null then
    insert into _campo_resultados values ('i','NO_DISPONIBLE','No hay una cuarta linea libre para prueba D5');
  else
    perform set_config('request.jwt.claim.sub',v_tecnico::text,true);
    perform public.tomar_linea_sourcing(v_si,v_ii);
    begin
      perform public.registrar_compra_campo(jsonb_build_object(
        'empresa_id',v_empresa,'sociedad_id',v_sociedad,'crear_cxp',false,
        'gasto',jsonb_build_object('id','gasto_campoi20260926abcdefghijkl','descripcion','Dry mismatch','monto',10,'monto_sin_igv',999,'fecha',current_date,'centro_costo_id',v_ceco,'ruc_proveedor','20999990004','num_comprobante','DRY-I-001','metodo_pago','Efectivo'),
        'adjunto',jsonb_build_object('bucket','documentos-generales','storage_path',v_empresa || '/compras_gastos/gasto_campoi20260926abcdefghijkl/i.jpg','url','https://example.test/i.jpg','nombre_original','i.jpg'),
        'lineas_solpe',jsonb_build_array(jsonb_build_object('solpe_id',v_si,'solpe_item_id',v_ii,'cantidad',1,'precio_unitario',10))
      ));
      insert into _campo_resultados values ('i','FALLO','El D5 no rechazo el total incongruente');
    exception when others then
      get stacked diagnostics v_error=message_text;
      select count(*) into v_count from public.compras_gastos where id='gasto_campoi20260926abcdefghijkl';
      select count(*) into v_count2 from public.ordenes_compra where descripcion='Compra de campo DRY-I-001';
      insert into _campo_resultados values ('i',case when v_count=0 and v_count2=0 then 'RECHAZADO' else 'FALLO_ROLLBACK' end,format('error=%s gasto=%s oc=%s',v_error,v_count,v_count2));
    end;
    perform public.liberar_linea_sourcing(v_si,v_ii);
  end if;

  if v_oc is null then
    insert into _campo_resultados values ('j','NO_DISPONIBLE','No se genero OC para probar linea cubierta/no tomada');
  else
    begin
      perform public.registrar_compra_campo(jsonb_build_object(
        'empresa_id',v_empresa,'sociedad_id',v_sociedad,'crear_cxp',false,
        'gasto',jsonb_build_object('id','gasto_campoj20260926abcdefghijkl','descripcion','Dry covered reject','monto',10,'monto_sin_igv',10,'fecha',current_date,'centro_costo_id',v_ceco,'ruc_proveedor','20999990005','num_comprobante','DRY-J-001','metodo_pago','Efectivo'),
        'adjunto',jsonb_build_object('bucket','documentos-generales','storage_path',v_empresa || '/compras_gastos/gasto_campoj20260926abcdefghijkl/j.jpg','url','https://example.test/j.jpg','nombre_original','j.jpg'),
        'lineas_solpe',jsonb_build_array(jsonb_build_object('solpe_id',v_s1,'solpe_item_id',v_i1,'cantidad',1,'precio_unitario',10))
      ));
      insert into _campo_resultados values ('j','FALLO','La linea ya cubierta fue aceptada');
    exception when others then
      get stacked diagnostics v_error=message_text;
      insert into _campo_resultados values ('j','RECHAZADO',v_error);
    end;
  end if;

  perform set_config('request.jwt.claim.sub',v_tecnico::text,true);
  select public.resolver_proveedor_por_ruc(v_empresa,'20999990006','Proveedor K') into v_provider;
  select public.resolver_proveedor_por_ruc(v_empresa,'20999990006','Proveedor K') into v_cxp;
  select count(*) into v_count from public.proveedores where empresa_id=v_empresa and regexp_replace(coalesce(ruc,''),'\D','','g')='20999990006';
  insert into _campo_resultados values ('k',case when v_provider=v_cxp and v_count=1 then 'ACEPTADO' else 'FALLO' end,format('proveedor_1=%s proveedor_2=%s filas_ruc=%s',v_provider,v_cxp,v_count));

  if coalesce(v_och,v_oc) is null then
    insert into _campo_resultados values ('l','NO_DISPONIBLE','No hubo CxP de campo para probar duplicado');
  else
    begin
      perform public.registrar_compra_campo(jsonb_build_object(
        'empresa_id',v_empresa,'sociedad_id',v_sociedad,'crear_cxp',true,
        'gasto',jsonb_build_object('id','gasto_campol20260926abcdefghijkl','descripcion','Dry duplicate','monto',10,'fecha',current_date,'centro_costo_id',v_ceco,'ruc_proveedor','20999990001','num_comprobante','DRY-G-001','metodo_pago','Efectivo'),
        'adjunto',jsonb_build_object('bucket','documentos-generales','storage_path',v_empresa || '/compras_gastos/gasto_campol20260926abcdefghijkl/l.jpg','url','https://example.test/l.jpg','nombre_original','l.jpg'),
        'cxp',jsonb_build_object('factura_numero','DRY-G-001','ruc_emisor','20999990001','fecha_emision',current_date,'fecha_vencimiento',current_date+30)
      ));
      insert into _campo_resultados values ('l','FALLO','La factura duplicada fue aceptada');
    exception when others then
      get stacked diagnostics v_error=message_text;
      insert into _campo_resultados values ('l',case when v_error='Esta factura ya fue registrada' then 'RECHAZADO' else 'RECHAZADO_OTRO_MENSAJE' end,v_error);
    end;
  end if;

  v_result:=public.registrar_compra_campo(jsonb_build_object(
    'empresa_id',v_empresa,'sociedad_id',v_sociedad,'crear_cxp',false,
    'gasto',jsonb_build_object('id','gasto_campom20260926abcdefghijkl','descripcion','Dry no lines','monto',11,'fecha',current_date,'centro_costo_id',v_ceco,'ruc_proveedor','20999990007','num_comprobante','DRY-M-001','metodo_pago','Efectivo'),
    'adjunto',jsonb_build_object('bucket','documentos-generales','storage_path',v_empresa || '/compras_gastos/gasto_campom20260926abcdefghijkl/m.jpg','url','https://example.test/m.jpg','nombre_original','m.jpg')
  ));
  select count(*) into v_count from public.compras_gastos where id='gasto_campom20260926abcdefghijkl' and orden_compra_id is null and excluir_de_er=false and estado_pago='pagado';
  insert into _campo_resultados values ('m1',case when v_count=1 then 'ACEPTADO' else 'FALLO' end,'sin lineas: comportamiento Fase 1a conservado');
  
  v_result:=public.registrar_compra_campo(jsonb_build_object(
    'empresa_id',v_empresa,'sociedad_id',v_sociedad,'crear_cxp',true,
    'gasto',jsonb_build_object('id','gasto_campom220260926abcdefghijk','descripcion','Dry no lines CxP','monto',12,'fecha',current_date,'centro_costo_id',v_ceco,'ruc_proveedor','20999990008','num_comprobante','DRY-M2-001','metodo_pago','Efectivo'),
    'adjunto',jsonb_build_object('bucket','documentos-generales','storage_path',v_empresa || '/compras_gastos/gasto_campom220260926abcdefghijk/m2.jpg','url','https://example.test/m2.jpg','nombre_original','m2.jpg'),
    'cxp',jsonb_build_object('factura_numero','DRY-M2-001','ruc_emisor','20999990008','fecha_emision',current_date,'fecha_vencimiento',current_date+30)
  ));
  select count(*) into v_count from public.compras_gastos g join public.cxp c on c.id=g.cxp_id
    where g.id='gasto_campom220260926abcdefghijk' and g.orden_compra_id is null and g.excluir_de_er=false and g.estado_pago='pendiente' and c.origen='gasto_movil' and c.estado='por_pagar';
  insert into _campo_resultados values ('m2',case when v_count=1 then 'ACEPTADO' else 'FALLO' end,'sin lineas con CxP: comportamiento Fase 1a conservado');

  if v_oc is null then
    insert into _campo_resultados values ('n','NO_DISPONIBLE','No hubo OC de campo');
  else
    begin
      perform public.generar_cxp_centralizado(jsonb_build_object('id','cxp_campo_n20260926abcdefghijkl','empresa_id',v_empresa,'recepcion_id','recep_campo_n','orden_compra_id',coalesce(v_och,v_oc),'proveedor_id',v_provider,'fecha_emision',current_date,'fecha_vencimiento',current_date+30,'monto_total',10,'saldo',10,'tipo_beneficiario','proveedor','sociedad_id',v_sociedad), 'recepcion_create','crear');
      insert into _campo_resultados values ('n','FALLO','La recepcion genero CxP');
    exception when others then
      get stacked diagnostics v_error=message_text;
      insert into _campo_resultados values ('n','RECHAZADO',v_error);
    end;
  end if;
end;
$$;

select caso,resultado,detalle from _campo_resultados order by caso;

create or replace function public._dry_run_fail_oc() returns trigger language plpgsql as $$ begin raise exception 'DRY_RUN_FORCED_OC_FAILURE'; end; $$;

create trigger trg_dry_run_fail_oc before insert on public.ordenes_compra for each row execute function public._dry_run_fail_oc();


do $$
declare
  v_empresa text := 'emp_2000000000';
  v_tecnico uuid := '67b0e438-8712-40c0-ae60-006fbdd3c577';
  v_s text; v_i text; v_q numeric; v_result jsonb; v_error text; v_count integer; v_count2 integer;
begin
  perform set_config('request.jwt.claim.sub',v_tecnico::text,true);
  select s.id,x.item ->> 'id',nullif(x.item ->> 'cantidad','')::numeric into v_s,v_i,v_q from public.solpe_interna s cross join lateral jsonb_array_elements(coalesce(s.items,'[]'::jsonb)) x(item)
   where s.empresa_id=v_empresa and lower(trim(coalesce(s.estado,''))) in ('aprobada','oc_parcial')
     and nullif(x.item ->> 'oc_id','') is null and nullif(x.item ->> 'proveedor_asignado_id','') is null
     and nullif(x.item ->> 'comprador_campo_id','') is null limit 1;
  if v_s is null then
    insert into _campo_resultados values ('o','NO_DISPONIBLE','No hay linea libre para fallo forzado');
  else
    perform public.tomar_linea_sourcing(v_s,v_i);
    begin
      perform public.registrar_compra_campo(jsonb_build_object(
        'empresa_id',v_empresa,'crear_cxp',false,
        'gasto',jsonb_build_object('id','gasto_campoo20260926abcdefghijkl','descripcion','Dry forced failure','monto',round(v_q*10*1.18,2),'monto_sin_igv',v_q*10,'fecha',current_date,'centro_costo_id','ceco_03ee8fb3d1db45f49d','ruc_proveedor','20999990009','num_comprobante','DRY-O-001','metodo_pago','Efectivo'),
        'adjunto',jsonb_build_object('bucket','documentos-generales','storage_path',v_empresa || '/compras_gastos/gasto_campoo20260926abcdefghijkl/o.jpg','url','https://example.test/o.jpg','nombre_original','o.jpg'),
        'lineas_solpe',jsonb_build_array(jsonb_build_object('solpe_id',v_s,'solpe_item_id',v_i,'cantidad',v_q,'precio_unitario',10))
      ));
      insert into _campo_resultados values ('o','FALLO','El trigger temporal no rechazo la OC');
    exception when others then
      get stacked diagnostics v_error=message_text;
      select count(*) into v_count from public.compras_gastos where id='gasto_campoo20260926abcdefghijkl';
      select count(*) into v_count2 from public.adjuntos where entidad_id='gasto_campoo20260926abcdefghijkl';
      insert into _campo_resultados values ('o',case when v_count=0 and v_count2=0 then 'RECHAZADO_ROLLBACK' else 'FALLO_ROLLBACK' end,format('error=%s gasto=%s adjuntos=%s',v_error,v_count,v_count2));
    end;
    perform public.liberar_linea_sourcing(v_s,v_i);
  end if;
end;
$$;
drop trigger trg_dry_run_fail_oc on public.ordenes_compra;
drop function public._dry_run_fail_oc();


select set_config('request.jwt.claim.sub', '30bc196b-808f-4f4b-a3ec-9bfe6b8f7837', true);

create temporary table _cxp_regression_results (
  caso integer,
  nombre text,
  resultado text,
  detalle text
) on commit drop;

do $$
declare
  v_empresa text := 'emp_2000000000';
  v_base jsonb;
  v_oc_pago_parcial text := 'oc_reg_pago_parcial';
  v_oc_pago_total text := 'oc_reg_pago_total';
  v_oc_partes text := 'oc_reg_partes';
  v_proveedor text := 'prv_imp_a16911dd5cbf4efa97db';
  v_cxp_pago text := 'cxp_reg_pago';
  v_cxp_partes_1 text := 'cxp_reg_parte_1';
  v_cxp_partes_2 text := 'cxp_reg_parte_2';
  v_cxp_sin_oc text := 'cxp_reg_sin_oc';
  v_cxp_recep_anulada text := 'cxp_reg_recep_anulada';
  v_cxp_recep_activa text := 'cxp_reg_recep_activa';
  v_cxp_liq_alias_en text := 'cxp_reg_liq_en';
  v_cxp_liq_alias_es text := 'cxp_reg_liq_es';
  v_gasto text := 'gasto_reg_nuevo_egreso';
  v_cxp_gasto text;
  v_result jsonb;
  v_error text;
  v_count integer;
  v_estado text;
begin
  insert into public.ordenes_compra (id, empresa_id, codigo, proveedor_id, descripcion, items, subtotal, igv, total, moneda, estado, sociedad_id)
  values
    (v_oc_pago_parcial, v_empresa, 'OC-REG-PAGO-PARCIAL', v_proveedor, 'Regresion pago parcial', '[]'::jsonb, 100, 0, 100, 'PEN', 'pendiente', '609a2f33-d057-411f-a001-4e3e83f700d0'),
    (v_oc_pago_total, v_empresa, 'OC-REG-PAGO-TOTAL', v_proveedor, 'Regresion pago total', '[]'::jsonb, 50, 0, 50, 'PEN', 'pendiente', '609a2f33-d057-411f-a001-4e3e83f700d0'),
    (v_oc_partes, v_empresa, 'OC-REG-PARTES', v_proveedor, 'Regresion CxP parciales', '[]'::jsonb, 100, 0, 100, 'PEN', 'pendiente', '609a2f33-d057-411f-a001-4e3e83f700d0');

  perform public.generar_cxp_centralizado(jsonb_build_object('id', v_cxp_pago, 'empresa_id', v_empresa, 'fecha_emision', current_date, 'fecha_vencimiento', current_date + 30, 'monto_total', 100, 'saldo', 100, 'tipo_beneficiario', 'proveedor', 'sociedad_id', '609a2f33-d057-411f-a001-4e3e83f700d0', 'orden_compra_id', v_oc_pago_parcial), 'cxp_manual', 'crear');
  perform public.generar_cxp_centralizado(jsonb_build_object('id', 'cxp_reg_pago_total', 'empresa_id', v_empresa, 'fecha_emision', current_date, 'fecha_vencimiento', current_date + 30, 'monto_total', 50, 'saldo', 50, 'tipo_beneficiario', 'proveedor', 'sociedad_id', '609a2f33-d057-411f-a001-4e3e83f700d0', 'orden_compra_id', v_oc_pago_total), 'cxp_manual', 'crear');

  -- 1. Pago parcial: CxP y movimiento creados; OC no se cierra.
  v_result := public.registrar_pago_cxp_atomico(
    v_cxp_pago, 40,
    jsonb_build_object('id', 'cxpp_reg_parcial', 'fecha_pago', current_date, 'monto', 40, 'referencia', 'REG-PARCIAL'),
    jsonb_build_object('id', 'tes_reg_parcial', 'descripcion', 'REG-PARCIAL', 'monto', 40, 'fecha', current_date, 'referencia', 'REG-PARCIAL')
  );
  select count(*) into v_count from public.cxp_pagos where id = 'cxpp_reg_parcial';
  select count(*) + (select count(*) from public.movimientos_tesoreria where id = 'tes_reg_parcial') into v_count from public.cxp_pagos where id = 'cxpp_reg_parcial';
  select estado into v_estado from public.ordenes_compra where id = v_oc_pago_parcial;
  insert into _cxp_regression_results values (1, 'pago parcial', case when v_count = 2 and v_estado <> 'cerrada' then 'ACEPTADO' else 'FALLO' end, format('cxp_pagos=1 movimientos_tesoreria=1 oc_estado=%s cxp_estado=%s', v_estado, v_result->'cxp'->>'estado'));

  -- 2. Pago que completa la OC: OC cerrada.
  v_result := public.registrar_pago_cxp_atomico(
    'cxp_reg_pago_total', 50,
    jsonb_build_object('id', 'cxpp_reg_total', 'fecha_pago', current_date, 'monto', 50, 'referencia', 'REG-TOTAL'),
    jsonb_build_object('id', 'tes_reg_total', 'descripcion', 'REG-TOTAL', 'monto', 50, 'fecha', current_date, 'referencia', 'REG-TOTAL')
  );
  select estado into v_estado from public.ordenes_compra where id = v_oc_pago_total;
  insert into _cxp_regression_results values (2, 'pago total y cierre OC', case when v_estado = 'cerrada' then 'ACEPTADO' else 'FALLO' end, format('oc_estado=%s cxp_estado=%s', v_estado, v_result->'cxp'->>'estado'));

  -- 3. Dos CxP parciales que completan exactamente la OC.
  perform public.generar_cxp_centralizado(jsonb_build_object('id', v_cxp_partes_1, 'empresa_id', v_empresa, 'fecha_emision', current_date, 'fecha_vencimiento', current_date + 30, 'monto_total', 40, 'saldo', 40, 'tipo_beneficiario', 'proveedor', 'sociedad_id', '609a2f33-d057-411f-a001-4e3e83f700d0', 'orden_compra_id', v_oc_partes), 'cxp_manual', 'crear');
  perform public.generar_cxp_centralizado(jsonb_build_object('id', v_cxp_partes_2, 'empresa_id', v_empresa, 'fecha_emision', current_date, 'fecha_vencimiento', current_date + 30, 'monto_total', 60, 'saldo', 60, 'tipo_beneficiario', 'proveedor', 'sociedad_id', '609a2f33-d057-411f-a001-4e3e83f700d0', 'orden_compra_id', v_oc_partes), 'cxp_manual', 'crear');
  select count(*) into v_count from public.cxp where orden_compra_id = v_oc_partes and estado <> 'anulada';
  insert into _cxp_regression_results values (3, 'dos CxP parciales exactas', case when v_count = 2 then 'ACEPTADAS' else 'FALLO' end, format('cxp_activas=%s suma=100.00 oc_total=100.00', v_count));

  -- 4. Tercera CxP excedente: rechazada.
  begin
    perform public.generar_cxp_centralizado(jsonb_build_object('id', 'cxp_reg_exceso', 'empresa_id', v_empresa, 'fecha_emision', current_date, 'fecha_vencimiento', current_date + 30, 'monto_total', 0.01, 'saldo', 0.01, 'tipo_beneficiario', 'proveedor', 'sociedad_id', '609a2f33-d057-411f-a001-4e3e83f700d0', 'orden_compra_id', v_oc_partes), 'cxp_manual', 'crear');
    insert into _cxp_regression_results values (4, 'tercera CxP excedente', 'FALLO', 'la llamada no fue rechazada');
  exception when others then
    get stacked diagnostics v_error = message_text;
    insert into _cxp_regression_results values (4, 'tercera CxP excedente', 'RECHAZADA', v_error);
  end;

  -- 5. CxP sin OC: aceptada.
  v_result := public.generar_cxp_centralizado(jsonb_build_object('id', v_cxp_sin_oc, 'empresa_id', v_empresa, 'fecha_emision', current_date, 'fecha_vencimiento', current_date + 30, 'monto_total', 12, 'saldo', 12, 'tipo_beneficiario', 'proveedor', 'sociedad_id', '609a2f33-d057-411f-a001-4e3e83f700d0'), 'cxp_manual', 'crear');
  insert into _cxp_regression_results values (5, 'CxP sin OC', case when v_result->>'id' = v_cxp_sin_oc then 'ACEPTADA' else 'FALLO' end, format('cxp_id=%s', v_result->>'id'));

  -- 6. Recepcion con anterior anulada: se recrea.
  insert into public.recepciones (id, empresa_id, estado) values ('rec_reg_anulada', v_empresa, 'confirmada');
  perform public.generar_cxp_centralizado(jsonb_build_object('id', v_cxp_recep_anulada, 'empresa_id', v_empresa, 'fecha_emision', current_date, 'fecha_vencimiento', current_date + 30, 'monto_total', 10, 'saldo', 10, 'tipo_beneficiario', 'proveedor', 'sociedad_id', '609a2f33-d057-411f-a001-4e3e83f700d0', 'recepcion_id', 'rec_reg_anulada'), 'recepcion_create', 'crear');
  update public.cxp set estado = 'anulada' where id = v_cxp_recep_anulada;
  v_result := public.generar_cxp_centralizado(jsonb_build_object('id', 'cxp_reg_recep_recreada', 'empresa_id', v_empresa, 'fecha_emision', current_date, 'fecha_vencimiento', current_date + 30, 'monto_total', 10, 'saldo', 10, 'tipo_beneficiario', 'proveedor', 'sociedad_id', '609a2f33-d057-411f-a001-4e3e83f700d0', 'recepcion_id', 'rec_reg_anulada'), 'recepcion_create', 'crear');
  insert into _cxp_regression_results values (6, 'recepcion anterior anulada', case when v_result->>'id' = 'cxp_reg_recep_recreada' then 'ACEPTADA / RECREADA' else 'FALLO' end, format('cxp_id=%s anterior_estado=anulada', v_result->>'id'));

  -- 7. Recepcion con anterior no anulada: bloqueada.
  insert into public.recepciones (id, empresa_id, estado) values ('rec_reg_activa', v_empresa, 'confirmada');
  perform public.generar_cxp_centralizado(jsonb_build_object('id', v_cxp_recep_activa, 'empresa_id', v_empresa, 'fecha_emision', current_date, 'fecha_vencimiento', current_date + 30, 'monto_total', 10, 'saldo', 10, 'tipo_beneficiario', 'proveedor', 'sociedad_id', '609a2f33-d057-411f-a001-4e3e83f700d0', 'recepcion_id', 'rec_reg_activa'), 'recepcion_create', 'crear');
  begin
    perform public.generar_cxp_centralizado(jsonb_build_object('id', 'cxp_reg_recep_bloqueada', 'empresa_id', v_empresa, 'fecha_emision', current_date, 'fecha_vencimiento', current_date + 30, 'monto_total', 10, 'saldo', 10, 'tipo_beneficiario', 'proveedor', 'sociedad_id', '609a2f33-d057-411f-a001-4e3e83f700d0', 'recepcion_id', 'rec_reg_activa'), 'recepcion_create', 'crear');
    insert into _cxp_regression_results values (7, 'recepcion anterior no anulada', 'FALLO', 'la llamada no fue bloqueada');
  exception when others then
    get stacked diagnostics v_error = message_text;
    insert into _cxp_regression_results values (7, 'recepcion anterior no anulada', 'BLOQUEADA', v_error);
  end;

  -- 8. Alias ingles de anulacion.
  v_result := public.generar_cxp_centralizado(jsonb_build_object('id', v_cxp_liq_alias_en, 'empresa_id', v_empresa, 'fecha_emision', current_date, 'fecha_vencimiento', current_date + 30, 'monto_total', 10, 'saldo', 10, 'tipo_beneficiario', 'proveedor', 'sociedad_id', '609a2f33-d057-411f-a001-4e3e83f700d0'), 'cxp_manual', 'crear');
  v_result := public.generar_cxp_centralizado(jsonb_build_object('id', v_cxp_liq_alias_en, 'estado', 'anulada', 'saldo', 0), 'liquidation_anular', 'actualizar');
  insert into _cxp_regression_results values (8, 'anulacion liquidation_anular', case when v_result->>'estado' = 'anulada' then 'ACEPTADA' else 'FALLO' end, format('estado=%s', v_result->>'estado'));

  -- 9. Alias espanol de anulacion.
  v_result := public.generar_cxp_centralizado(jsonb_build_object('id', v_cxp_liq_alias_es, 'empresa_id', v_empresa, 'fecha_emision', current_date, 'fecha_vencimiento', current_date + 30, 'monto_total', 10, 'saldo', 10, 'tipo_beneficiario', 'proveedor', 'sociedad_id', '609a2f33-d057-411f-a001-4e3e83f700d0'), 'cxp_manual', 'crear');
  v_result := public.generar_cxp_centralizado(jsonb_build_object('id', v_cxp_liq_alias_es, 'estado', 'anulada', 'saldo', 0), 'liquidacion_anular', 'actualizar');
  insert into _cxp_regression_results values (9, 'anulacion liquidacion_anular', case when v_result->>'estado' = 'anulada' then 'ACEPTADA' else 'FALLO' end, format('estado=%s', v_result->>'estado'));

  -- 10. Origen inexistente.
  begin
    perform public.generar_cxp_centralizado(jsonb_build_object('id', 'cxp_reg_origen_invalido', 'empresa_id', v_empresa, 'fecha_emision', current_date, 'fecha_vencimiento', current_date + 30, 'monto_total', 1, 'saldo', 1, 'tipo_beneficiario', 'proveedor', 'sociedad_id', '609a2f33-d057-411f-a001-4e3e83f700d0'), 'origen_inexistente', 'crear');
    insert into _cxp_regression_results values (10, 'origen inexistente', 'FALLO', 'la llamada no fue rechazada');
  exception when others then
    get stacked diagnostics v_error = message_text;
    insert into _cxp_regression_results values (10, 'origen inexistente', 'RECHAZADO', v_error);
  end;

  -- 11. registrar_gasto_pagado_auto conserva nuevo_egreso.
  insert into public.compras_gastos (id, empresa_id, tipo, descripcion, categoria, monto, moneda, fecha, origen_registro, estado, estado_pago, es_activo_fijo, sociedad_id)
  values (v_gasto, v_empresa, 'gasto', 'Regresion nuevo egreso', 'Regresion', 25, 'PEN', current_date, 'backoffice', 'registrado', 'pendiente', false, '609a2f33-d057-411f-a001-4e3e83f700d0');
  v_result := public.registrar_gasto_pagado_auto(jsonb_build_object(
    'gasto_id', v_gasto,
    'cxp', jsonb_build_object('id', 'cxp_reg_nuevo_egreso', 'empresa_id', v_empresa, 'fecha_emision', current_date, 'fecha_vencimiento', current_date + 30, 'monto_total', 25, 'saldo', 0, 'monto_pagado', 25, 'tipo_beneficiario', 'proveedor', 'sociedad_id', '609a2f33-d057-411f-a001-4e3e83f700d0', 'gasto_id', v_gasto, 'estado', 'pagada'),
    'pago', jsonb_build_object('id', 'cxpp_reg_nuevo_egreso', 'empresa_id', v_empresa, 'cxp_id', 'cxp_reg_nuevo_egreso', 'fecha_pago', current_date, 'monto', 25, 'referencia', 'REG-NUEVO-EGRESO', 'creado_en', now()),
    'movimiento', jsonb_build_object('id', 'tes_reg_nuevo_egreso', 'empresa_id', v_empresa, 'tipo', 'egreso', 'descripcion', 'REG-NUEVO-EGRESO', 'monto', 25, 'moneda', 'PEN', 'fecha', current_date, 'referencia', 'REG-NUEVO-EGRESO', 'vinculo_tipo', 'cxp', 'vinculo_id', 'cxp_reg_nuevo_egreso', 'estado', 'registrado', 'es_manual', false)
  ));
  select cxp_id into v_cxp_gasto from public.compras_gastos where id = v_gasto;
  insert into _cxp_regression_results values (11, 'registrar_gasto_pagado_auto / nuevo_egreso', case when v_result->>'created' = 'true' and v_cxp_gasto = 'cxp_reg_nuevo_egreso' then 'ACEPTADO' else 'FALLO' end, format('created=%s cxp_id=%s', v_result->>'created', v_cxp_gasto));
end;
$$;

select caso, nombre, resultado, detalle
from _cxp_regression_results
order by caso;

select 'campo-' || caso as caso,resultado,detalle from _campo_resultados
union all
select 'p-' || caso::text as caso,resultado,detalle from _cxp_regression_results
order by caso;

rollback;

