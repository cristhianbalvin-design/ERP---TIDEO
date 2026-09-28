-- Dry run Fase 1b: proveedores por RUC y montos de líneas.
-- Ejecutar con psql desde este directorio. Nunca termina en COMMIT.
\set ON_ERROR_STOP off
\set ECHO all
\timing on
set client_encoding = 'UTF8';
set lock_timeout = '5s';
set statement_timeout = '120s';

begin;
select set_config('request.jwt.claim.sub', '58d38046-8c04-4190-a9e7-eec2db0f1752', true);
\echo 'Usuario simulado: 58d38046-8c04-4190-a9e7-eec2db0f1752 (camilo@tideo.tech), Asesor Comercial, es_admin_empresa=false, acceso_campo=true, compras habilitado.'
\ir ../supabase/migrations/20260928080426_compras_campo_proveedor_montos.sql
\if :ERROR
  \echo 'ERROR: la migración falló; se ejecuta ROLLBACK.'
  rollback;
  \quit
\endif

select 'A_EXISTENTE' as caso, count(*) as filas, max(razon_social) as razon_social
  from public.buscar_proveedor_por_ruc('emp_2000000000', '20100088991');
select 'A_INEXISTENTE' as caso, count(*) as filas
  from public.buscar_proveedor_por_ruc('emp_2000000000', '20123456786');
do $$
begin
  perform public.buscar_proveedor_por_ruc('emp_2000000000', '20100088991');
  perform set_config('request.jwt.claim.sub', '611602e5-ca1c-4813-ac94-98445284431c', true);
  begin
    perform public.buscar_proveedor_por_ruc('emp_2000000000', '20100088991');
    raise notice 'A_SIN_ACCESO|FALLO|la llamada no fue rechazada';
  exception when others then
    raise notice 'A_SIN_ACCESO|RECHAZADO|%', sqlerrm;
  end;
  perform set_config('request.jwt.claim.sub', '58d38046-8c04-4190-a9e7-eec2db0f1752', true);
end;
$$;

-- SOLPE exclusivamente transaccional para probar la rama con líneas.
insert into public.solpe_interna (id, empresa_id, codigo, descripcion, estado, fecha, centro_costo_id, items, creado_por)
values (
  'slp_dry_proveedor_montos', 'emp_2000000000', 'SLP-DRY-PROV-001', 'Dry run proveedor campo', 'aprobada', current_date,
  'ceco_03ee8fb3d1db45f49d',
  jsonb_build_array(jsonb_build_object(
    'id','itm_dry_proveedor_montos','unidad','UND','cantidad',1,'descripcion','Material dry run',
    'material_id','mat_65c0c50be3374ed79c','material_codigo','EPP-PRO-001',
    'proveedor_asignado_id',null,'comprador_campo_id','58d38046-8c04-4190-a9e7-eec2db0f1752','tomada_en',now()
  )),
  '58d38046-8c04-4190-a9e7-eec2db0f1752'
);

select public.registrar_compra_campo(jsonb_build_object(
  'empresa_id','emp_2000000000','sociedad_id','609a2f33-d057-411f-a001-4e3e83f700d0','crear_cxp',true,
  'lineas_solpe',jsonb_build_array(jsonb_build_object('solpe_id','slp_dry_proveedor_montos','solpe_item_id','itm_dry_proveedor_montos','cantidad',1,'precio_unitario',10)),
  'gasto',jsonb_build_object('id','gasto_dryprovidermontos000000000001','descripcion','Dry proveedor nuevo','categoria','Materiales','monto',11.80,'monto_sin_igv',10.00,'igv',1.80,'moneda','PEN','fecha',current_date,'num_comprobante','FDRY-0001','tipo_comprobante','Factura','centro_costo_id','ceco_03ee8fb3d1db45f49d','proveedor_referencia','Proveedor Campo Dry','ruc_proveedor','20123456786','metodo_pago','Efectivo'),
  'adjunto',jsonb_build_object('bucket','documentos-generales','storage_path','emp_2000000000/compras_gastos/gasto_dryprovidermontos000000000001/comprobante.jpg','url','https://example.invalid/dry-a.jpg','categoria','comprobante','nombre_original','dry-a.jpg','mime_type','image/jpeg','tamano_bytes',10),
  'cxp',jsonb_build_object('factura_numero','FDRY-0001','concepto','Dry proveedor nuevo','fecha_emision',current_date,'fecha_vencimiento',current_date+30,'monto_total',11.80,'ruc_emisor','20123456786','nombre_emisor','Proveedor Campo Dry','centro_costo_id','ceco_03ee8fb3d1db45f49d')
)) as B_LINEA_CXP_RESULTADO;
select 'B_PROVEEDOR' as caso, p.id, p.estado, p.origen, p.creado_por, count(*) over () as proveedores_con_ruc
  from public.proveedores p where p.empresa_id='emp_2000000000' and regexp_replace(coalesce(p.ruc,''),'\D','','g')='20123456786';
select 'B_VINCULO' as caso, count(g.*) as gastos, count(c.*) as cxp, max(g.cxp_id) as gasto_cxp_id, max(c.gasto_id) as cxp_gasto_id
  from public.compras_gastos g left join public.cxp c on c.id=g.cxp_id
 where g.id='gasto_dryprovidermontos000000000001';

do $$
begin
  begin
    perform public.registrar_compra_campo(jsonb_build_object(
      'empresa_id','emp_2000000000','sociedad_id','609a2f33-d057-411f-a001-4e3e83f700d0','crear_cxp',false,
      'gasto',jsonb_build_object('id','gasto_dryprovidermontos000000000002','descripcion','Duplicado dry','monto',11.80,'fecha',current_date,'num_comprobante','FDRY-0001','centro_costo_id','ceco_03ee8fb3d1db45f49d','ruc_proveedor','20123456786','metodo_pago','Efectivo'),
      'adjunto',jsonb_build_object('bucket','documentos-generales','storage_path','emp_2000000000/compras_gastos/gasto_dryprovidermontos000000000002/comprobante.jpg','url','https://example.invalid/dry-c.jpg')
    ));
    raise notice 'C_DUPLICADO|FALLO|la segunda factura fue aceptada';
  exception when others then
    raise notice 'C_DUPLICADO|RECHAZADO|%', sqlerrm;
  end;
end;
$$;

do $$
begin
  perform set_config('request.jwt.claim.sub', '611602e5-ca1c-4813-ac94-98445284431c', true);
  begin
    perform public.registrar_compra_campo(jsonb_build_object(
      'empresa_id','emp_2000000000','crear_cxp',false,
      'gasto',jsonb_build_object('id','gasto_dryprovidermontos000000000003','descripcion','Sin acceso','monto',5,'fecha',current_date,'centro_costo_id','ceco_03ee8fb3d1db45f49d','metodo_pago','Efectivo'),
      'adjunto',jsonb_build_object('bucket','documentos-generales','storage_path','emp_2000000000/compras_gastos/gasto_dryprovidermontos000000000003/comprobante.jpg','url','https://example.invalid/dry-d.jpg')
    ));
    raise notice 'D_SIN_ACCESO|FALLO|la llamada fue aceptada';
  exception when others then
    raise notice 'D_SIN_ACCESO|RECHAZADO|%', sqlerrm;
  end;
  perform set_config('request.jwt.claim.sub', '58d38046-8c04-4190-a9e7-eec2db0f1752', true);
end;
$$;

do $$
begin
  begin
    perform public.registrar_compra_campo(jsonb_build_object(
      'empresa_id','emp_2000000000','crear_cxp',false,
      'gasto',jsonb_build_object('id','gasto_dryprovidermontos000000000004','descripcion','Ruta ajena','monto',5,'fecha',current_date,'centro_costo_id','ceco_03ee8fb3d1db45f49d','metodo_pago','Efectivo'),
      'adjunto',jsonb_build_object('bucket','documentos-generales','storage_path','emp_20541435833/compras_gastos/gasto_dryprovidermontos000000000004/comprobante.jpg','url','https://example.invalid/dry-e.jpg')
    ));
    raise notice 'E_RUTA_AJENA|FALLO|la ruta fue aceptada';
  exception when others then
    raise notice 'E_RUTA_AJENA|RECHAZADO|%', sqlerrm;
  end;
end;
$$;

select public.registrar_compra_campo(jsonb_build_object(
  'empresa_id','emp_2000000000','sociedad_id','609a2f33-d057-411f-a001-4e3e83f700d0','crear_cxp',true,
  'cxp',jsonb_build_object('factura_numero','FDRY-0002','concepto','Estado ignorado','fecha_emision',current_date,'fecha_vencimiento',current_date+30,'monto_total',5,'ruc_emisor','20123456794','nombre_emisor','Proveedor Estado Dry'),
  'gasto',jsonb_build_object('id','gasto_dryprovidermontos000000000005','descripcion','Estado payload','monto',5,'fecha',current_date,'num_comprobante','FDRY-0002','centro_costo_id','ceco_03ee8fb3d1db45f49d','ruc_proveedor','20123456794','metodo_pago','Efectivo'),
  'adjunto',jsonb_build_object('bucket','documentos-generales','storage_path','emp_2000000000/compras_gastos/gasto_dryprovidermontos000000000005/comprobante.jpg','url','https://example.invalid/dry-f.jpg')
)) -> 'cxp' ->> 'estado' as F_ESTADO_CXP;

create or replace function pg_temp.dry_run_falla_despues_gasto()
returns trigger language plpgsql as $$begin raise exception 'DRY_RUN_FORZADO_DESPUES_DE_GASTO'; end;$$;
create trigger dry_run_falla_despues_gasto after insert on public.compras_gastos
for each row execute function pg_temp.dry_run_falla_despues_gasto();
do $$
begin
  begin
    perform public.registrar_compra_campo(jsonb_build_object(
      'empresa_id','emp_2000000000','crear_cxp',false,
      'gasto',jsonb_build_object('id','gasto_dryprovidermontos000000000006','descripcion','Fallo forzado','monto',5,'fecha',current_date,'centro_costo_id','ceco_03ee8fb3d1db45f49d','metodo_pago','Efectivo'),
      'adjunto',jsonb_build_object('bucket','documentos-generales','storage_path','emp_2000000000/compras_gastos/gasto_dryprovidermontos000000000006/comprobante.jpg','url','https://example.invalid/dry-g.jpg')
    ));
    raise notice 'G_FALLO_FORZADO|FALLO|la llamada fue aceptada';
  exception when others then
    raise notice 'G_FALLO_FORZADO|RECHAZADO|%', sqlerrm;
  end;
end;
$$;
drop trigger dry_run_falla_despues_gasto on public.compras_gastos;
select 'G_CONTEO_DURANTE' as caso,
       (select count(*) from public.compras_gastos where id='gasto_dryprovidermontos000000000006') as gastos,
       (select count(*) from public.adjuntos where entidad_id='gasto_dryprovidermontos000000000006') as adjuntos;

\echo 'H_REGRESION_CXP_11_CASOS'
\ir regression_cxp_centralizado_20260924.sql

rollback;
select 'POST_ROLLBACK' as caso,
       (select count(*) from public.compras_gastos where id like 'gasto_dryprovidermontos%') as gastos,
       (select count(*) from public.adjuntos where entidad_id like 'gasto_dryprovidermontos%') as adjuntos,
       (select count(*) from public.proveedores where regexp_replace(coalesce(ruc,''),'\D','','g') in ('20123456786','20123456794')) as proveedores,
       (select count(*) from pg_proc where proname in ('crear_proveedor_campo','buscar_proveedor_por_ruc')) as funciones_nuevas,
       (select count(*) from information_schema.columns where table_schema='public' and table_name='proveedores' and column_name in ('origen','creado_por')) as columnas_nuevas;
