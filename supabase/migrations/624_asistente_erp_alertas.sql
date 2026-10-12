BEGIN;

CREATE OR REPLACE FUNCTION public.asistente_alertas(
 p_empresa_id text,p_tipo text,p_sociedad_id uuid DEFAULT NULL,p_dias integer DEFAULT 7,p_limite integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE
 a uuid[]; p jsonb; ver_finanzas boolean; ver_costos boolean;
 hoy date:=(now() AT TIME ZONE 'America/Lima')::date; hasta_fecha date;
 omitidos text[]:=ARRAY[]::text[]; v_filas jsonb; v_formato jsonb; v_resumen jsonb; v_cantidad integer;
BEGIN
 IF p_tipo IS NULL OR p_tipo NOT IN ('cxp_por_vencer','cxc_por_vencer','ordenes_compra_pendientes_recepcion','stock_bajo') THEN
  RAISE EXCEPTION 'Tipo de alerta no válido';
 END IF;
 IF p_limite IS NULL OR p_limite<1 OR p_limite>100 THEN RAISE EXCEPTION 'Límite debe estar entre 1 y 100'; END IF;
 IF p_tipo IN ('cxp_por_vencer','cxc_por_vencer') THEN
  IF p_dias IS NULL OR p_dias<1 OR p_dias>30 THEN RAISE EXCEPTION 'Días debe estar entre 1 y 30'; END IF;
  hasta_fecha:=hoy+p_dias;
  IF p_tipo='cxp_por_vencer' THEN a:=public.asistente_autorizar(p_empresa_id,'cxp',p_sociedad_id,true);
  ELSE a:=public.asistente_autorizar(p_empresa_id,'cxc',p_sociedad_id,true); END IF;
 ELSE
  IF p_dias IS DISTINCT FROM 7 THEN RAISE EXCEPTION 'Días solo aplica a alertas de CxP/CxC por vencer'; END IF;
  IF p_tipo='ordenes_compra_pendientes_recepcion' THEN a:=public.asistente_autorizar(p_empresa_id,'ordenes_compra',p_sociedad_id,true);
  ELSE a:=public.asistente_autorizar(p_empresa_id,'inventario',p_sociedad_id,true); END IF;
 END IF;
 p:=public.asistente_permisos_especiales(p_empresa_id);
 ver_finanzas:=coalesce((p->>'ver_finanzas')::boolean,false);
 ver_costos:=coalesce((p->>'ver_costos')::boolean,false);

 IF p_tipo IN ('cxp_por_vencer','cxc_por_vencer') THEN
  IF NOT ver_finanzas THEN omitidos:=ARRAY['monto_total','monto_pagado','saldo','total_por_vencer']::text[]; END IF;
  WITH base AS (
   SELECT c.id::text id,coalesce(nullif(c.moneda,''),'PEN') moneda,c.fecha_vencimiento,
    coalesce(pr.nombre_comercial,pr.razon_social,c.nombre_emisor,'(sin proveedor)') tercero,
    c.factura_numero documento,
    c.monto_total,c.monto_pagado,
    greatest(coalesce(c.saldo,0),0) saldo
   FROM public.cxp c
   LEFT JOIN public.proveedores pr ON pr.empresa_id=c.empresa_id AND pr.id=c.proveedor_id
   WHERE p_tipo='cxp_por_vencer' AND c.empresa_id=p_empresa_id AND (a IS NULL OR c.sociedad_id=ANY(a))
    AND lower(coalesce(c.estado,'')) NOT IN ('pagada','anulada','cancelada') AND greatest(coalesce(c.saldo,0),0)>0
    AND c.fecha_vencimiento BETWEEN hoy AND hasta_fecha
   UNION ALL
   SELECT c.id::text,coalesce(nullif(c.moneda,''),'PEN'),c.fecha_vencimiento,
    coalesce(ct.nombre_comercial,ct.razon_social,'(sin cliente)'),coalesce(f.numero,c.factura_id),
    c.monto_total,c.monto_pagado,greatest(coalesce(c.saldo,0)-coalesce(c.monto_retencion,0),0)
   FROM public.cxc c
   LEFT JOIN public.cuentas ct ON ct.empresa_id=c.empresa_id AND ct.id=c.cuenta_id
   LEFT JOIN public.facturas f ON f.empresa_id=c.empresa_id AND f.id=c.factura_id
   WHERE p_tipo='cxc_por_vencer' AND c.empresa_id=p_empresa_id AND (a IS NULL OR c.sociedad_id=ANY(a))
    AND lower(coalesce(c.estado,'')) NOT IN ('cobrada','pagada','anulada','cancelada')
    AND greatest(coalesce(c.saldo,0)-coalesce(c.monto_retencion,0),0)>0 AND c.fecha_vencimiento BETWEEN hoy AND hasta_fecha
  ), item_rows AS (
   SELECT b.*,greatest(b.fecha_vencimiento-hoy,0) dias,
    jsonb_strip_nulls(jsonb_build_object('id',b.id,'tercero',b.tercero,'documento',b.documento,
     'moneda',b.moneda,'fecha_vencimiento',b.fecha_vencimiento,'dias',greatest(b.fecha_vencimiento-hoy,0),
     'monto_total',CASE WHEN ver_finanzas THEN b.monto_total END,'monto_pagado',CASE WHEN ver_finanzas THEN b.monto_pagado END,
     'saldo',CASE WHEN ver_finanzas THEN b.saldo END)) fila
   FROM base b
  ), por_moneda AS (
   SELECT moneda,count(*) cantidad,round(sum(saldo),2) total_por_vencer FROM item_rows GROUP BY moneda
  ), resumen_json AS (
   SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('moneda',moneda,'cantidad',cantidad,
    'total_por_vencer',CASE WHEN ver_finanzas THEN total_por_vencer END)) ORDER BY moneda),'[]'::jsonb) valor FROM por_moneda
  ), filas_json AS (
   SELECT coalesce(jsonb_agg(fila ORDER BY fecha_vencimiento,tercero,id),'[]'::jsonb) valor,count(*)::integer total FROM item_rows
  )
  SELECT r.valor,f.valor,f.total INTO v_resumen,v_filas,v_cantidad FROM resumen_json r CROSS JOIN filas_json f;
  v_formato:=public.asistente_formato_listado(v_filas,p_limite,omitidos);
  RETURN jsonb_build_object('tipo',p_tipo,'fecha_corte',hoy,'dias',p_dias,'hasta',hasta_fecha,'por_moneda',v_resumen,
   'filas',v_formato->'filas','cantidad_total',v_cantidad,'truncado',v_cantidad>p_limite,'campos_omitidos_por_permiso',to_jsonb(omitidos));
 END IF;

 IF p_tipo='ordenes_compra_pendientes_recepcion' THEN
  IF NOT ver_costos THEN omitidos:=ARRAY['total','moneda']::text[]; END IF;
  WITH ordenes AS (
   SELECT oc.id,oc.codigo,oc.proveedor_id,oc.estado,oc.fecha_entrega_esperada,oc.porcentaje_recibido,oc.total,oc.moneda,oc.items,
    coalesce(pr.razon_social,'(sin proveedor)') proveedor
   FROM public.ordenes_compra oc LEFT JOIN public.proveedores pr ON pr.id=oc.proveedor_id AND pr.empresa_id=oc.empresa_id
   WHERE oc.empresa_id=p_empresa_id AND (a IS NULL OR oc.sociedad_id=ANY(a))
    AND lower(coalesce(oc.estado,'')) IN ('emitida','confirmada','en_transito','recibida_parcial')
  ), pedido AS (
   SELECT o.id,CASE WHEN nullif(btrim(i.value->>'material_id'),'') IS NOT NULL THEN 'm:'||btrim(i.value->>'material_id')
     WHEN nullif(btrim(i.value->>'codigo'),'') IS NOT NULL THEN 'c:'||btrim(i.value->>'codigo') ELSE 'linea:'||i.ordinality::text END clave,
    sum(coalesce(nullif(i.value->>'cantidad','')::numeric,0)) cantidad
   FROM ordenes o CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(o.items)='array' THEN o.items ELSE '[]'::jsonb END) WITH ORDINALITY i(value,ordinality)
   GROUP BY o.id,CASE WHEN nullif(btrim(i.value->>'material_id'),'') IS NOT NULL THEN 'm:'||btrim(i.value->>'material_id')
     WHEN nullif(btrim(i.value->>'codigo'),'') IS NOT NULL THEN 'c:'||btrim(i.value->>'codigo') ELSE 'linea:'||i.ordinality::text END
  ), recibido AS (
   SELECT r.orden_compra_id id,CASE WHEN nullif(btrim(i.value->>'material_id'),'') IS NOT NULL THEN 'm:'||btrim(i.value->>'material_id')
     WHEN nullif(btrim(i.value->>'codigo'),'') IS NOT NULL THEN 'c:'||btrim(i.value->>'codigo') ELSE 'linea:'||i.ordinality::text END clave,
    sum(coalesce(nullif(i.value->>'recibido','')::numeric,0)) cantidad
   FROM public.recepciones r JOIN ordenes o ON o.id=r.orden_compra_id
   CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(r.items_recibidos)='array' THEN r.items_recibidos ELSE '[]'::jsonb END) WITH ORDINALITY i(value,ordinality)
   WHERE r.empresa_id=p_empresa_id AND lower(coalesce(r.estado,'')) NOT IN ('anulada','cancelada','rechazada')
   GROUP BY r.orden_compra_id,CASE WHEN nullif(btrim(i.value->>'material_id'),'') IS NOT NULL THEN 'm:'||btrim(i.value->>'material_id')
     WHEN nullif(btrim(i.value->>'codigo'),'') IS NOT NULL THEN 'c:'||btrim(i.value->>'codigo') ELSE 'linea:'||i.ordinality::text END
  ), pendientes AS (
   SELECT q.id,greatest(q.cantidad-coalesce(r.cantidad,0),0) pendiente
   FROM pedido q LEFT JOIN recibido r ON r.id=q.id AND r.clave=q.clave
  ), por_orden AS (
   SELECT id,count(*) FILTER (WHERE pendiente>0)::integer lineas_pendientes,sum(pendiente) total_pendiente
   FROM pendientes GROUP BY id
  ), item_rows AS (
   SELECT o.*,po.lineas_pendientes,greatest(hoy-o.fecha_entrega_esperada,0) dias_atraso,
    jsonb_strip_nulls(jsonb_build_object('codigo',o.codigo,'proveedor',o.proveedor,'estado',o.estado,
     'fecha_entrega_esperada',o.fecha_entrega_esperada,'dias_atraso',CASE WHEN o.fecha_entrega_esperada<hoy THEN hoy-o.fecha_entrega_esperada ELSE 0 END,
     'porcentaje_recibido',o.porcentaje_recibido,'lineas_pendientes',po.lineas_pendientes,
     'total',CASE WHEN ver_costos THEN o.total END,'moneda',CASE WHEN ver_costos THEN o.moneda END)) fila
   FROM ordenes o JOIN por_orden po ON po.id=o.id WHERE po.total_pendiente>0
  ), filas_json AS (
   SELECT coalesce(jsonb_agg(fila ORDER BY fecha_entrega_esperada NULLS LAST,codigo,id),'[]'::jsonb) valor,count(*)::integer total FROM item_rows
  )
  SELECT valor,total INTO v_filas,v_cantidad FROM filas_json;
  v_formato:=public.asistente_formato_listado(v_filas,p_limite,omitidos);
  RETURN jsonb_build_object('tipo',p_tipo,'fecha_corte',hoy,'filas',v_formato->'filas','cantidad_total',v_cantidad,
   'truncado',v_cantidad>p_limite,'campos_omitidos_por_permiso',to_jsonb(omitidos));
 END IF;

 WITH stock_material AS (
  SELECT st.empresa_id,st.material_id,sum(coalesce(st.disponible,0)) disponible_total
  FROM public.stock st WHERE st.empresa_id=p_empresa_id AND (a IS NULL OR st.sociedad_id=ANY(a)) GROUP BY st.empresa_id,st.material_id
 ), item_rows AS (
  SELECT m.codigo,m.descripcion,m.unidad,coalesce(sm.disponible_total,0) disponible_total,
   coalesce(m.punto_reorden,0)+coalesce(m.stock_seguridad,0) umbral,
   coalesce(m.punto_reorden,0)+coalesce(m.stock_seguridad,0)-coalesce(sm.disponible_total,0) faltante
  FROM public.materiales m LEFT JOIN stock_material sm ON sm.empresa_id=m.empresa_id AND sm.material_id=m.id
  WHERE m.empresa_id=p_empresa_id AND (m.estado IS NULL OR lower(m.estado)='activo')
   AND coalesce(m.punto_reorden,0)+coalesce(m.stock_seguridad,0)>0
   AND coalesce(sm.disponible_total,0)<coalesce(m.punto_reorden,0)+coalesce(m.stock_seguridad,0)
 ), rows_json AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object('codigo',codigo,'descripcion',descripcion,'unidad',unidad,
   'disponible_total',disponible_total,'umbral',umbral,'faltante',faltante) ORDER BY faltante DESC,codigo),'[]'::jsonb) valor,
   count(*)::integer total FROM item_rows
 )
 SELECT valor,total INTO v_filas,v_cantidad FROM rows_json;
 v_formato:=public.asistente_formato_listado(v_filas,p_limite,omitidos);
 RETURN jsonb_build_object('tipo',p_tipo,'fecha_corte',hoy,'filas',v_formato->'filas','cantidad_total',v_cantidad,
  'truncado',v_cantidad>p_limite,'campos_omitidos_por_permiso',to_jsonb(omitidos));
END $$;

REVOKE ALL ON FUNCTION public.asistente_alertas(text,text,uuid,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.asistente_alertas(text,text,uuid,integer,integer) TO authenticated;

COMMIT;
