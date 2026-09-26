-- Casos a-g de registrar_compra_campo.
-- El ejecutor debe anteponer BEGIN y la migracion candidata, y cerrar con ROLLBACK.
-- Este archivo no aplica cambios permanentes.

create temporary table _registrar_compra_campo_results (
  caso text,
  resultado text,
  detalle text
) on commit drop;

do $$
declare
  v_empresa text := 'emp_2000000000';
  v_sociedad uuid := '609a2f33-d057-411f-a001-4e3e83f700d0';
  v_ceco text := 'ceco_03ee8fb3d1db45f49d';
  v_tecnico uuid := '67b0e438-8712-40c0-ae60-006fbdd3c577';
  v_gasto text;
  v_cxp text;
  v_error text;
  v_count integer;
  v_gasto_row record;
  v_cxp_row record;
begin
  perform set_config('request.jwt.claim.sub', v_tecnico::text, true);

  v_gasto := 'gasto_rpca20260926abcdefghijkl';
  perform public.registrar_compra_campo(jsonb_build_object(
    'empresa_id', v_empresa, 'sociedad_id', v_sociedad, 'crear_cxp', false,
    'gasto', jsonb_build_object('id', v_gasto, 'descripcion', 'Dry run sin CxP', 'monto', 10.00, 'fecha', current_date,
      'centro_costo_id', v_ceco, 'ruc_proveedor', '20123456789', 'num_comprobante', 'DRY-A-001',
      'proveedor_referencia', 'Proveedor dry run', 'metodo_pago', 'Efectivo'),
    'adjunto', jsonb_build_object('bucket', 'documentos-generales', 'storage_path', v_empresa || '/compras_gastos/' || v_gasto || '/a.jpg',
      'url', 'https://atqwyjfidfoepthygfoo.supabase.co/storage/v1/object/public/documentos-generales/' || v_empresa || '/compras_gastos/' || v_gasto || '/a.jpg',
      'nombre_original', 'a.jpg', 'mime_type', 'image/jpeg', 'tamano_bytes', 10)
  ));
  select count(*) into v_count from public.adjuntos where entidad_tipo = 'compras_gastos' and entidad_id = v_gasto;
  select * into v_gasto_row from public.compras_gastos where id = v_gasto;
  insert into _registrar_compra_campo_results values ('a', case when v_gasto_row.estado_pago = 'pagado' and v_gasto_row.estado = 'pendiente_revision' and v_gasto_row.cxp_id is null and v_count = 1 then 'ACEPTADO' else 'FALLO' end,
    format('gasto=%s estado_pago=%s estado=%s adjuntos=%s cxp_id=%s', v_gasto, v_gasto_row.estado_pago, v_gasto_row.estado, v_count, coalesce(v_gasto_row.cxp_id, 'NULL')));

  v_gasto := 'gasto_rpcb20260926abcdefghijkl';
  v_cxp := (public.registrar_compra_campo(jsonb_build_object(
    'empresa_id', v_empresa, 'sociedad_id', v_sociedad, 'crear_cxp', true,
    'gasto', jsonb_build_object('id', v_gasto, 'descripcion', 'Dry run con CxP', 'monto', 20.00, 'fecha', current_date,
      'centro_costo_id', v_ceco, 'ruc_proveedor', '20123456788', 'num_comprobante', 'DRY-B-001',
      'proveedor_referencia', 'Proveedor dry run CxP', 'metodo_pago', 'Efectivo'),
    'adjunto', jsonb_build_object('bucket', 'documentos-generales', 'storage_path', v_empresa || '/compras_gastos/' || v_gasto || '/b.jpg',
      'url', 'https://atqwyjfidfoepthygfoo.supabase.co/storage/v1/object/public/documentos-generales/' || v_empresa || '/compras_gastos/' || v_gasto || '/b.jpg',
      'nombre_original', 'b.jpg', 'mime_type', 'image/jpeg', 'tamano_bytes', 20),
    'cxp', jsonb_build_object('factura_numero', 'DRY-B-001', 'ruc_emisor', '20123456788', 'fecha_emision', current_date,
      'fecha_vencimiento', current_date + 30, 'concepto', 'Dry run con CxP', 'estado', 'pagada', 'origen', 'otro', 'no_devengar_er', false)
  )))->>'cxp_id';
  select * into v_gasto_row from public.compras_gastos where id = v_gasto;
  select * into v_cxp_row from public.cxp where id = v_cxp;
  select count(*) into v_count from public.adjuntos where entidad_tipo = 'compras_gastos' and entidad_id = v_gasto;
  insert into _registrar_compra_campo_results values ('b', case when v_gasto_row.estado_pago = 'pendiente' and v_gasto_row.cxp_id = v_cxp and v_cxp_row.gasto_id = v_gasto and v_cxp_row.estado = 'por_pagar' and v_cxp_row.origen = 'gasto_movil' and v_cxp_row.no_devengar_er and v_count = 1 then 'ACEPTADO' else 'FALLO' end,
    format('gasto=%s cxp=%s gasto.cxp_id=%s cxp.gasto_id=%s cxp.estado=%s cxp.origen=%s no_devengar_er=%s adjuntos=%s', v_gasto, v_cxp, v_gasto_row.cxp_id, v_cxp_row.gasto_id, v_cxp_row.estado, v_cxp_row.origen, v_cxp_row.no_devengar_er, v_count));

  begin
    perform public.registrar_compra_campo(jsonb_build_object(
      'empresa_id', v_empresa, 'sociedad_id', v_sociedad, 'crear_cxp', true,
      'gasto', jsonb_build_object('id', 'gasto_rpcc20260926abcdefghijkl', 'descripcion', 'Duplicado', 'monto', 21.00, 'fecha', current_date,
        'centro_costo_id', v_ceco, 'ruc_proveedor', '20123456788', 'num_comprobante', 'DRY-B-001', 'metodo_pago', 'Efectivo'),
      'adjunto', jsonb_build_object('bucket', 'documentos-generales', 'storage_path', v_empresa || '/compras_gastos/gasto_rpcc20260926abcdefghijkl/c.jpg', 'url', 'https://example.test/c.jpg', 'nombre_original', 'c.jpg'),
      'cxp', jsonb_build_object('factura_numero', 'DRY-B-001', 'ruc_emisor', '20123456788', 'fecha_emision', current_date, 'fecha_vencimiento', current_date + 30)
    ));
    insert into _registrar_compra_campo_results values ('c', 'FALLO', 'La segunda factura no fue rechazada');
  exception when others then
    get stacked diagnostics v_error = message_text;
    insert into _registrar_compra_campo_results values ('c', case when v_error = 'Esta factura ya fue registrada' then 'RECHAZADA' else 'RECHAZADA_CON_OTRO_MENSAJE' end, v_error);
  end;

  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000000', true);
  begin
    perform public.registrar_compra_campo(jsonb_build_object('empresa_id', v_empresa, 'sociedad_id', v_sociedad, 'crear_cxp', false,
      'gasto', jsonb_build_object('id', 'gasto_rpcd20260926abcdefghijkl', 'descripcion', 'Sin acceso', 'monto', 1, 'fecha', current_date, 'centro_costo_id', v_ceco, 'metodo_pago', 'Efectivo'),
      'adjunto', jsonb_build_object('bucket', 'documentos-generales', 'storage_path', v_empresa || '/compras_gastos/gasto_rpcd20260926abcdefghijkl/d.jpg', 'url', 'https://example.test/d.jpg', 'nombre_original', 'd.jpg')));
    insert into _registrar_compra_campo_results values ('d', 'FALLO', 'El usuario sin acceso no fue rechazado');
  exception when others then
    get stacked diagnostics v_error = message_text;
    insert into _registrar_compra_campo_results values ('d', 'RECHAZADO', v_error);
  end;
  perform set_config('request.jwt.claim.sub', v_tecnico::text, true);

  begin
    perform public.registrar_compra_campo(jsonb_build_object('empresa_id', v_empresa, 'sociedad_id', v_sociedad, 'crear_cxp', false,
      'gasto', jsonb_build_object('id', 'gasto_rpce20260926abcdefghijkl', 'descripcion', 'Ruta incorrecta', 'monto', 1, 'fecha', current_date, 'centro_costo_id', v_ceco, 'metodo_pago', 'Efectivo'),
      'adjunto', jsonb_build_object('bucket', 'documentos-generales', 'storage_path', 'emp_otro/compras_gastos/gasto_rpce20260926abcdefghijkl/e.jpg', 'url', 'https://example.test/e.jpg', 'nombre_original', 'e.jpg')));
    insert into _registrar_compra_campo_results values ('e', 'FALLO', 'La ruta de otro tenant no fue rechazada');
  exception when others then
    get stacked diagnostics v_error = message_text;
    insert into _registrar_compra_campo_results values ('e', 'RECHAZADO', v_error);
  end;

  v_gasto := 'gasto_rpcf20260926abcdefghijkl';
  v_cxp := (public.registrar_compra_campo(jsonb_build_object(
    'empresa_id', v_empresa, 'sociedad_id', v_sociedad, 'crear_cxp', true,
    'gasto', jsonb_build_object('id', v_gasto, 'descripcion', 'Estado forzado', 'monto', 22.00, 'fecha', current_date, 'centro_costo_id', v_ceco, 'ruc_proveedor', '20123456787', 'num_comprobante', 'DRY-F-001', 'metodo_pago', 'Efectivo'),
    'adjunto', jsonb_build_object('bucket', 'documentos-generales', 'storage_path', v_empresa || '/compras_gastos/' || v_gasto || '/f.jpg', 'url', 'https://example.test/f.jpg', 'nombre_original', 'f.jpg'),
    'cxp', jsonb_build_object('factura_numero', 'DRY-F-001', 'ruc_emisor', '20123456787', 'fecha_emision', current_date, 'fecha_vencimiento', current_date + 30, 'estado', 'pagada')
  )))->>'cxp_id';
  select estado into v_error from public.cxp where id = v_cxp;
  insert into _registrar_compra_campo_results values ('f', case when v_error = 'por_pagar' then 'ACEPTADO' else 'FALLO' end, format('cxp_id=%s estado=%s (payload estado=pagada)', v_cxp, v_error));

  begin
    perform public.registrar_compra_campo(jsonb_build_object(
      'empresa_id', v_empresa, 'sociedad_id', v_sociedad, 'crear_cxp', true,
      'gasto', jsonb_build_object('id', 'gasto_rpcg20260926abcdefghijkl', 'descripcion', 'Fallo posterior', 'monto', 23.00, 'fecha', current_date, 'centro_costo_id', v_ceco, 'ruc_proveedor', '20123456786', 'num_comprobante', 'DRY-G-001', 'metodo_pago', 'Efectivo'),
      'adjunto', jsonb_build_object('bucket', 'documentos-generales', 'storage_path', v_empresa || '/compras_gastos/gasto_rpcg20260926abcdefghijkl/g.jpg', 'url', 'https://example.test/g.jpg', 'nombre_original', 'g.jpg'),
      'cxp', jsonb_build_object('factura_numero', 'DRY-G-001', 'ruc_emisor', '20123456786', 'fecha_emision', current_date, 'fecha_vencimiento', 'no-es-fecha')
    ));
    insert into _registrar_compra_campo_results values ('g', 'FALLO', 'La RPC no falló después de insertar');
  exception when others then
    get stacked diagnostics v_error = message_text;
    select count(*) into v_count from public.compras_gastos where id = 'gasto_rpcg20260926abcdefghijkl';
    select v_count + (select count(*) from public.cxp where gasto_id = 'gasto_rpcg20260926abcdefghijkl') + (select count(*) from public.adjuntos where entidad_id = 'gasto_rpcg20260926abcdefghijkl') into v_count;
    insert into _registrar_compra_campo_results values ('g', case when v_count = 0 then 'RECHAZADO_ROLLBACK' else 'FALLO_ROLLBACK' end, format('error=%s filas_restantes=%s', v_error, v_count));
  end;
end;
$$;

select caso, resultado, detalle from _registrar_compra_campo_results order by caso;
