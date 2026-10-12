BEGIN;

CREATE OR REPLACE FUNCTION public.asistente_buscar_facturas(
 p_empresa_id text,p_sociedad_id uuid DEFAULT NULL,p_texto text DEFAULT NULL,p_estado text DEFAULT NULL,
 p_tipo_documento text DEFAULT NULL,p_desde date DEFAULT NULL,p_hasta date DEFAULT NULL,p_solo_vencidas boolean DEFAULT false,
 p_limite integer DEFAULT 20,p_monto numeric DEFAULT NULL,p_monto_min numeric DEFAULT NULL,p_monto_max numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE
 v_alcance uuid[]; v_permisos jsonb; v_ver_finanzas boolean; v_texto text; v_hoy date:=(now() AT TIME ZONE 'America/Lima')::date;
 v_desde date:=p_desde; v_hasta date:=p_hasta; v_omitidos text[]:=ARRAY[]::text[];
 v_filas jsonb; v_formato jsonb; v_por_moneda jsonb; v_cantidad integer;
BEGIN
 IF p_limite IS NULL OR p_limite<1 OR p_limite>100 THEN RAISE EXCEPTION 'Límite debe estar entre 1 y 100'; END IF;
 IF p_tipo_documento IS NOT NULL AND lower(p_tipo_documento) NOT IN ('factura','boleta','nota_credito','nota_debito') THEN RAISE EXCEPTION 'Tipo de documento no válido'; END IF;
 IF p_monto_min IS NOT NULL AND p_monto_max IS NOT NULL AND p_monto_min>p_monto_max THEN RAISE EXCEPTION 'Rango de monto inválido'; END IF;
 IF (p_desde IS NULL)<>(p_hasta IS NULL) THEN
  IF v_desde IS NULL THEN v_desde:=(v_hasta-interval '12 months')::date; ELSE v_hasta:=(v_desde+interval '12 months')::date; END IF;
 END IF;
 IF v_desde IS NOT NULL AND (v_hasta<v_desde OR v_hasta>(v_desde+interval '12 months')::date) THEN RAISE EXCEPTION 'Rango inválido: máximo 12 meses'; END IF;
 v_alcance:=public.asistente_autorizar(p_empresa_id,'facturacion',p_sociedad_id,true);
 v_permisos:=public.asistente_permisos_especiales(p_empresa_id); v_ver_finanzas:=coalesce((v_permisos->>'ver_finanzas')::boolean,false);
 IF (p_monto IS NOT NULL OR p_monto_min IS NOT NULL OR p_monto_max IS NOT NULL) AND NOT v_ver_finanzas THEN
  RETURN public.asistente_formato_listado('[]'::jsonb,p_limite,ARRAY['subtotal','igv','total','monto_retencion','monto_detraccion','monto_neto_cobrable','totales_por_moneda']::text[])
   || jsonb_build_object('aviso','El filtro por monto no está disponible con tus permisos');
 END IF;
 IF NOT v_ver_finanzas THEN v_omitidos:=ARRAY['subtotal','igv','total','monto_retencion','monto_detraccion','monto_neto_cobrable','totales_por_moneda']::text[]; END IF;
 v_texto:=replace(replace(replace(coalesce(p_texto,''),'\','\\'),'%','\%'),'_','\_');
 WITH base AS (
  SELECT f.id,f.numero,coalesce(c.nombre_comercial,c.razon_social) cliente,lower(f.tipo_documento) tipo_documento,
   lower(f.estado) estado,f.fecha_emision,f.fecha_vencimiento,upper(coalesce(nullif(f.moneda,''),'PEN')) moneda,
   os.numero os_numero,f.subtotal,f.igv,f.total,f.monto_retencion,f.monto_detraccion,f.monto_neto_cobrable
  FROM public.facturas f
  LEFT JOIN public.cuentas c ON c.empresa_id=f.empresa_id AND c.id=f.cuenta_id
  LEFT JOIN public.os_clientes os ON os.empresa_id=f.empresa_id AND os.id=f.os_cliente_id
  WHERE f.empresa_id=p_empresa_id AND (v_alcance IS NULL OR f.sociedad_id=ANY(v_alcance))
   AND (p_estado IS NULL OR lower(f.estado)=lower(p_estado))
   AND (p_tipo_documento IS NULL OR lower(f.tipo_documento)=lower(p_tipo_documento))
   AND (v_desde IS NULL OR f.fecha_emision BETWEEN v_desde AND v_hasta)
   AND (NOT coalesce(p_solo_vencidas,false) OR (lower(f.tipo_documento) IN ('factura','boleta') AND lower(f.estado) IN ('emitida','cobro_parcial') AND f.fecha_vencimiento<v_hoy))
   AND (p_texto IS NULL OR f.numero ILIKE '%'||v_texto||'%' ESCAPE '\' OR f.glosa ILIKE '%'||v_texto||'%' ESCAPE '\'
    OR f.concepto ILIKE '%'||v_texto||'%' ESCAPE '\' OR c.nombre_comercial ILIKE '%'||v_texto||'%' ESCAPE '\' OR c.razon_social ILIKE '%'||v_texto||'%' ESCAPE '\')
   AND (p_monto IS NULL AND p_monto_min IS NULL AND p_monto_max IS NULL OR
    (public.asistente_monto_coincide(f.total,p_monto,p_monto_min,p_monto_max) OR public.asistente_monto_coincide(f.monto_neto_cobrable,p_monto,p_monto_min,p_monto_max)))
 ), filas AS (
  SELECT b.*,jsonb_strip_nulls(jsonb_build_object('numero',b.numero,'cliente',b.cliente,'tipo_documento',b.tipo_documento,'estado',b.estado,
   'fecha_emision',b.fecha_emision,'fecha_vencimiento',b.fecha_vencimiento,
   'dias_mora',CASE WHEN b.tipo_documento IN ('factura','boleta') AND b.estado IN ('emitida','cobro_parcial') AND b.fecha_vencimiento<v_hoy THEN v_hoy-b.fecha_vencimiento END,
   'moneda',b.moneda,'os_numero',b.os_numero,'subtotal',CASE WHEN v_ver_finanzas THEN b.subtotal END,'igv',CASE WHEN v_ver_finanzas THEN b.igv END,
   'total',CASE WHEN v_ver_finanzas THEN b.total END,'monto_retencion',CASE WHEN v_ver_finanzas THEN b.monto_retencion END,
   'monto_detraccion',CASE WHEN v_ver_finanzas THEN b.monto_detraccion END,'monto_neto_cobrable',CASE WHEN v_ver_finanzas THEN b.monto_neto_cobrable END)) fila
  FROM base b
 ), lista AS (
  SELECT coalesce(jsonb_agg(q.fila ORDER BY q.fecha_emision DESC NULLS LAST,q.numero),'[]'::jsonb) valor,(SELECT count(*)::integer FROM filas) cantidad
  FROM (SELECT f.fila,f.fecha_emision,f.numero FROM filas f ORDER BY f.fecha_emision DESC NULLS LAST,f.numero LIMIT p_limite) q
 ), monedas AS (
  SELECT f.moneda,count(*) FILTER (WHERE coalesce(f.estado,'')<>'anulada')::integer cantidad_sin_anuladas,
   CASE WHEN v_ver_finanzas THEN coalesce(round(sum(f.total) FILTER (WHERE f.tipo_documento IN ('factura','boleta','nota_debito') AND coalesce(f.estado,'')<>'anulada'),2),0) END total_facturado,
   count(*) FILTER (WHERE f.tipo_documento='nota_credito' AND coalesce(f.estado,'')<>'anulada')::integer cantidad_notas_credito,
   CASE WHEN v_ver_finanzas THEN coalesce(round(sum(f.total) FILTER (WHERE f.tipo_documento='nota_credito' AND coalesce(f.estado,'')<>'anulada'),2),0) END total_notas_credito
  FROM filas f GROUP BY f.moneda
 )
 SELECT l.valor,l.cantidad,coalesce((SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('moneda',m.moneda,'cantidad_sin_anuladas',m.cantidad_sin_anuladas,
  'total_facturado',m.total_facturado,'cantidad_notas_credito',m.cantidad_notas_credito,'total_notas_credito',m.total_notas_credito)) ORDER BY m.moneda) FROM monedas m),'[]'::jsonb)
 INTO v_filas,v_cantidad,v_por_moneda FROM lista l;
 v_formato:=public.asistente_formato_listado(v_filas,p_limite,v_omitidos);
 RETURN jsonb_build_object('filas',v_formato->'filas','cantidad_total',v_cantidad,'truncado',v_cantidad>p_limite,
  'por_moneda',v_por_moneda,'campos_omitidos_por_permiso',to_jsonb(v_omitidos));
END $$;
REVOKE ALL ON FUNCTION public.asistente_buscar_facturas(text,uuid,text,text,text,date,date,boolean,integer,numeric,numeric,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.asistente_buscar_facturas(text,uuid,text,text,text,date,date,boolean,integer,numeric,numeric,numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.asistente_resumen_facturacion(
 p_empresa_id text,p_sociedad_id uuid,p_desde date,p_hasta date,p_moneda text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE
 v_alcance uuid[]; v_permisos jsonb; v_ver_finanzas boolean; v_desde date:=p_desde; v_hasta date:=p_hasta;
 v_moneda text:=CASE WHEN p_moneda IS NULL THEN NULL ELSE upper(btrim(p_moneda)) END;
 v_meses jsonb; v_resumen jsonb; v_con_datos jsonb; v_sin_datos jsonb; v_omitidos text[]:=ARRAY[]::text[]; v_meses_rango integer;
BEGIN
 IF v_moneda IS NOT NULL AND v_moneda NOT IN ('PEN','USD') THEN RAISE EXCEPTION 'Moneda no válida'; END IF;
 IF v_desde IS NULL OR v_hasta IS NULL THEN RAISE EXCEPTION 'Debe indicar desde y hasta'; END IF;
 IF v_hasta<v_desde OR (extract(year FROM v_hasta)::integer*12+extract(month FROM v_hasta)::integer)-(extract(year FROM v_desde)::integer*12+extract(month FROM v_desde)::integer)>=36 THEN RAISE EXCEPTION 'Rango inválido: máximo 36 meses'; END IF;
 v_meses_rango:=(extract(year FROM v_hasta)::integer*12+extract(month FROM v_hasta)::integer)-(extract(year FROM v_desde)::integer*12+extract(month FROM v_desde)::integer)+1;
 v_alcance:=public.asistente_autorizar(p_empresa_id,'facturacion',p_sociedad_id,true);
 v_permisos:=public.asistente_permisos_especiales(p_empresa_id); v_ver_finanzas:=coalesce((v_permisos->>'ver_finanzas')::boolean,false);
 IF NOT v_ver_finanzas THEN v_omitidos:=ARRAY['facturado_bruto','notas_credito','neto','desglose_por_estado']::text[]; END IF;
 WITH base AS (
  SELECT date_trunc('month',f.fecha_emision)::date mes,upper(coalesce(nullif(f.moneda,''),'PEN')) moneda,
   lower(f.tipo_documento) tipo_documento,lower(f.estado) estado,count(*)::integer cantidad,round(sum(coalesce(f.total,0)),2) importe
  FROM public.facturas f WHERE f.empresa_id=p_empresa_id AND (v_alcance IS NULL OR f.sociedad_id=ANY(v_alcance))
   AND f.fecha_emision BETWEEN v_desde AND v_hasta AND (v_moneda IS NULL OR upper(coalesce(nullif(f.moneda,''),'PEN'))=v_moneda)
  GROUP BY date_trunc('month',f.fecha_emision)::date,upper(coalesce(nullif(f.moneda,''),'PEN')),lower(f.tipo_documento),lower(f.estado)
 ), estado_mes AS (
  SELECT q.mes,q.moneda,jsonb_agg(jsonb_build_object('estado',q.estado,'cantidad',q.cantidad) ORDER BY q.estado) desglose_estado
  FROM (SELECT b.mes,b.moneda,b.estado,sum(b.cantidad)::integer cantidad FROM base b
   WHERE b.tipo_documento IN ('factura','boleta') AND coalesce(b.estado,'')<>'anulada' GROUP BY b.mes,b.moneda,b.estado) q
  GROUP BY q.mes,q.moneda
 ), estado_moneda AS (
  SELECT q.moneda,jsonb_agg(jsonb_build_object('estado',q.estado,'cantidad',q.cantidad) ORDER BY q.estado) desglose_estado
  FROM (SELECT b.moneda,b.estado,sum(b.cantidad)::integer cantidad FROM base b
   WHERE b.tipo_documento IN ('factura','boleta') AND coalesce(b.estado,'')<>'anulada' GROUP BY b.moneda,b.estado) q
  GROUP BY q.moneda
 ), por_mes AS (
  SELECT b.mes,b.moneda,sum(b.cantidad) FILTER (WHERE coalesce(b.estado,'')<>'anulada')::integer cantidad_documentos,
   round(sum(b.importe) FILTER (WHERE b.tipo_documento IN ('factura','boleta','nota_debito') AND coalesce(b.estado,'')<>'anulada'),2) facturado_bruto,
   round(sum(b.importe) FILTER (WHERE b.tipo_documento='nota_credito' AND coalesce(b.estado,'')<>'anulada'),2) notas_credito,
   coalesce(sum(b.cantidad) FILTER (WHERE b.estado='anulada'),0)::integer cantidad_anuladas,
   bool_or(b.tipo_documento='nota_credito' AND coalesce(b.estado,'')<>'anulada') tiene_notas_credito
  FROM base b GROUP BY b.mes,b.moneda
 ),
 items AS (
  SELECT jsonb_strip_nulls(jsonb_build_object('mes',to_char(pm.mes,'YYYY-MM'),'moneda',pm.moneda,'cantidad_documentos',coalesce(pm.cantidad_documentos,0),
   'facturado_bruto',CASE WHEN v_ver_finanzas THEN coalesce(pm.facturado_bruto,0) END,'notas_credito',CASE WHEN v_ver_finanzas THEN coalesce(pm.notas_credito,0) END,
   'neto',CASE WHEN v_ver_finanzas THEN coalesce(pm.facturado_bruto,0)-coalesce(pm.notas_credito,0) END,
   'cantidad_anuladas',coalesce(pm.cantidad_anuladas,0),'desglose_por_estado',CASE WHEN v_ver_finanzas THEN coalesce(em.desglose_estado,'[]'::jsonb) END)) fila,
   pm.mes,pm.moneda,pm.tiene_notas_credito
  FROM por_mes pm LEFT JOIN estado_mes em ON em.mes=pm.mes AND em.moneda=pm.moneda
 ), meses_con AS (SELECT DISTINCT i.mes FROM items i),
 resumen AS (
  SELECT i.moneda,sum((i.fila->>'cantidad_documentos')::integer)::integer cantidad_documentos,
   sum((i.fila->>'cantidad_anuladas')::integer)::integer cantidad_anuladas,
   CASE WHEN v_ver_finanzas THEN round(sum(coalesce((i.fila->>'facturado_bruto')::numeric,0)),2) END facturado_bruto,
   CASE WHEN v_ver_finanzas THEN round(sum(coalesce((i.fila->>'notas_credito')::numeric,0)),2) END notas_credito,
   CASE WHEN v_ver_finanzas THEN round(sum(coalesce((i.fila->>'neto')::numeric,0)),2) END neto,
   em.desglose_estado
  FROM items i LEFT JOIN estado_moneda em ON em.moneda=i.moneda GROUP BY i.moneda,em.desglose_estado
 )
 SELECT coalesce((SELECT jsonb_agg(i.fila ORDER BY i.mes,i.moneda) FROM items i),'[]'::jsonb),
  coalesce((SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('moneda',r.moneda,'cantidad_documentos',r.cantidad_documentos,'cantidad_anuladas',r.cantidad_anuladas,
   'facturado_bruto',r.facturado_bruto,'notas_credito',r.notas_credito,'neto',r.neto,'desglose_por_estado',CASE WHEN v_ver_finanzas THEN r.desglose_estado END)) ORDER BY r.moneda) FROM resumen r),'[]'::jsonb),
  coalesce((SELECT jsonb_agg(to_char(mc.mes,'YYYY-MM') ORDER BY mc.mes) FROM meses_con mc),'[]'::jsonb),
  coalesce((SELECT jsonb_agg(to_char(mr.mes,'YYYY-MM') ORDER BY mr.mes) FROM generate_series(date_trunc('month',v_desde)::timestamp,date_trunc('month',v_hasta)::timestamp,interval '1 month') mr(mes) WHERE NOT EXISTS(SELECT 1 FROM meses_con mc WHERE mc.mes=mr.mes::date)),'[]'::jsonb)
 INTO v_meses,v_resumen,v_con_datos,v_sin_datos;
 RETURN jsonb_build_object('desde',v_desde,'hasta',v_hasta,'meses_en_rango',v_meses_rango,'meses',v_meses,'resumen_por_moneda',v_resumen,
  'meses_con_datos',v_con_datos,'meses_sin_datos',v_sin_datos,'tiene_notas_credito',EXISTS(SELECT 1 FROM public.facturas f WHERE f.empresa_id=p_empresa_id AND (v_alcance IS NULL OR f.sociedad_id=ANY(v_alcance)) AND f.fecha_emision BETWEEN v_desde AND v_hasta AND lower(f.tipo_documento)='nota_credito' AND lower(coalesce(f.estado,''))<>'anulada' AND (v_moneda IS NULL OR upper(coalesce(nullif(f.moneda,''),'PEN'))=v_moneda)),
  'campos_omitidos_por_permiso',to_jsonb(v_omitidos));
END $$;
REVOKE ALL ON FUNCTION public.asistente_resumen_facturacion(text,uuid,date,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.asistente_resumen_facturacion(text,uuid,date,date,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.asistente_buscar_os_clientes(
 p_empresa_id text,p_sociedad_id uuid DEFAULT NULL,p_texto text DEFAULT NULL,p_estado text DEFAULT NULL,p_estado_produccion text DEFAULT NULL,
 p_desde date DEFAULT NULL,p_hasta date DEFAULT NULL,p_limite integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE
 v_alcance uuid[]; v_permisos jsonb; v_ver_finanzas boolean; v_ver_precios boolean; v_texto text; v_desde date:=p_desde; v_hasta date:=p_hasta;
 v_omitidos text[]:=ARRAY[]::text[]; v_filas jsonb; v_formato jsonb; v_por_moneda jsonb; v_total integer;
BEGIN
 IF p_limite IS NULL OR p_limite<1 OR p_limite>100 THEN RAISE EXCEPTION 'Límite debe estar entre 1 y 100'; END IF;
 IF p_estado_produccion IS NOT NULL AND p_estado_produccion NOT IN ('Evaluación','Cotización','Stand By','Proceso','Terminado','No Procede','Devolución','Entregado','Negociación') THEN RAISE EXCEPTION 'Estado de producción no válido'; END IF;
 IF (p_desde IS NULL)<>(p_hasta IS NULL) THEN
  IF v_desde IS NULL THEN v_desde:=(v_hasta-interval '12 months')::date; ELSE v_hasta:=(v_desde+interval '12 months')::date; END IF;
 END IF;
 IF v_desde IS NOT NULL AND (v_hasta<v_desde OR v_hasta>(v_desde+interval '12 months')::date) THEN RAISE EXCEPTION 'Rango inválido: máximo 12 meses'; END IF;
 v_alcance:=public.asistente_autorizar(p_empresa_id,'os_cliente',p_sociedad_id,true); v_permisos:=public.asistente_permisos_especiales(p_empresa_id);
 v_ver_finanzas:=coalesce((v_permisos->>'ver_finanzas')::boolean,false); v_ver_precios:=coalesce((v_permisos->>'ver_precios')::boolean,false);
 IF NOT v_ver_finanzas THEN v_omitidos:=v_omitidos||ARRAY['monto_facturado','monto_cobrado','saldo_por_facturar']::text[]; END IF;
 IF NOT v_ver_precios THEN v_omitidos:=v_omitidos||ARRAY['monto_aprobado']::text[]; END IF;
 v_texto:=replace(replace(replace(coalesce(p_texto,''),'\','\\'),'%','\%'),'_','\_');
 WITH base AS (
  SELECT o.numero,o.nombre,coalesce(c.nombre_comercial,c.razon_social) cliente,lower(o.estado) estado,o.estado_produccion,
   o.fecha_emision,o.fecha_inicio,o.fecha_fin,upper(coalesce(nullif(o.moneda,''),'PEN')) moneda,
   CASE WHEN jsonb_typeof(o.ots_asociadas)='array' THEN jsonb_array_length(o.ots_asociadas) ELSE 0 END cantidad_ots,
   o.monto_aprobado,o.monto_facturado,o.monto_cobrado,o.saldo_por_facturar
  FROM public.os_clientes o LEFT JOIN public.cuentas c ON c.empresa_id=o.empresa_id AND c.id=o.cuenta_id
  WHERE o.empresa_id=p_empresa_id AND (v_alcance IS NULL OR o.sociedad_id=ANY(v_alcance))
   AND (p_estado IS NULL OR (lower(p_estado) IN ('activa','activo','en_ejecucion') AND lower(o.estado) IN ('activa','activo','en_ejecucion')) OR (lower(p_estado) NOT IN ('activa','activo','en_ejecucion') AND lower(o.estado)=lower(p_estado)))
   AND (p_estado_produccion IS NULL OR o.estado_produccion=p_estado_produccion)
   AND (v_desde IS NULL OR o.fecha_emision BETWEEN v_desde AND v_hasta)
   AND (p_texto IS NULL OR o.numero ILIKE '%'||v_texto||'%' ESCAPE '\' OR o.nombre ILIKE '%'||v_texto||'%' ESCAPE '\'
    OR o.numero_doc_cliente ILIKE '%'||v_texto||'%' ESCAPE '\' OR c.nombre_comercial ILIKE '%'||v_texto||'%' ESCAPE '\' OR c.razon_social ILIKE '%'||v_texto||'%' ESCAPE '\')
 ), filas AS (
  SELECT b.*,jsonb_strip_nulls(jsonb_build_object('numero',b.numero,'nombre',b.nombre,'cliente',b.cliente,'estado',b.estado,
   'estado_produccion',b.estado_produccion,'fecha_emision',b.fecha_emision,'fecha_inicio',b.fecha_inicio,'fecha_fin',b.fecha_fin,'moneda',b.moneda,'cantidad_ots',b.cantidad_ots,
   'monto_aprobado',CASE WHEN v_ver_precios THEN b.monto_aprobado END,'monto_facturado',CASE WHEN v_ver_finanzas THEN b.monto_facturado END,
   'monto_cobrado',CASE WHEN v_ver_finanzas THEN b.monto_cobrado END,'saldo_por_facturar',CASE WHEN v_ver_finanzas THEN b.saldo_por_facturar END)) fila
  FROM base b
 ), lista AS (SELECT coalesce(jsonb_agg(q.fila ORDER BY q.fecha_emision DESC NULLS LAST,q.numero),'[]'::jsonb) valor,(SELECT count(*)::integer FROM filas) cantidad FROM (SELECT f.fila,f.fecha_emision,f.numero FROM filas f ORDER BY f.fecha_emision DESC NULLS LAST,f.numero LIMIT p_limite) q),
 totales AS (
  SELECT f.moneda,CASE WHEN v_ver_precios THEN round(sum(f.monto_aprobado),2) END monto_aprobado,
   CASE WHEN v_ver_finanzas THEN round(sum(f.monto_facturado),2) END monto_facturado,
   CASE WHEN v_ver_finanzas THEN round(sum(f.monto_cobrado),2) END monto_cobrado,
   CASE WHEN v_ver_finanzas THEN round(sum(f.saldo_por_facturar),2) END saldo_por_facturar FROM filas f GROUP BY f.moneda
 )
 SELECT l.valor,l.cantidad,coalesce((SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('moneda',t.moneda,'monto_aprobado',t.monto_aprobado,
  'monto_facturado',t.monto_facturado,'monto_cobrado',t.monto_cobrado,'saldo_por_facturar',t.saldo_por_facturar)) ORDER BY t.moneda) FROM totales t),'[]'::jsonb)
 INTO v_filas,v_total,v_por_moneda FROM lista l;
 v_formato:=public.asistente_formato_listado(v_filas,p_limite,v_omitidos);
 RETURN jsonb_build_object('filas',v_formato->'filas','cantidad_total',v_total,'truncado',v_total>p_limite,
  'por_moneda',v_por_moneda,'campos_omitidos_por_permiso',to_jsonb(v_omitidos));
END $$;
REVOKE ALL ON FUNCTION public.asistente_buscar_os_clientes(text,uuid,text,text,text,date,date,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.asistente_buscar_os_clientes(text,uuid,text,text,text,date,date,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.asistente_resumen_os_clientes(p_empresa_id text,p_sociedad_id uuid,p_texto text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE
 v_alcance uuid[]; v_permisos jsonb; v_ver_finanzas boolean; v_ver_precios boolean; v_texto text; v_omitidos text[]:=ARRAY[]::text[];
 v_por_estado_moneda jsonb; v_por_produccion jsonb;
BEGIN
 v_alcance:=public.asistente_autorizar(p_empresa_id,'os_cliente',p_sociedad_id,true); v_permisos:=public.asistente_permisos_especiales(p_empresa_id);
 v_ver_finanzas:=coalesce((v_permisos->>'ver_finanzas')::boolean,false); v_ver_precios:=coalesce((v_permisos->>'ver_precios')::boolean,false);
 IF NOT v_ver_finanzas THEN v_omitidos:=v_omitidos||ARRAY['monto_facturado','monto_cobrado','saldo_por_facturar']::text[]; END IF;
 IF NOT v_ver_precios THEN v_omitidos:=v_omitidos||ARRAY['monto_aprobado']::text[]; END IF;
 v_texto:=replace(replace(replace(coalesce(p_texto,''),'\','\\'),'%','\%'),'_','\_');
 WITH base AS (
  SELECT CASE WHEN lower(coalesce(o.estado,'')) IN ('activa','activo','en_ejecucion') THEN 'activa' ELSE coalesce(o.estado,'sin_estado') END estado,
   upper(coalesce(nullif(o.moneda,''),'PEN')) moneda,o.estado_produccion,o.monto_aprobado,o.monto_facturado,o.monto_cobrado,o.saldo_por_facturar
  FROM public.os_clientes o LEFT JOIN public.cuentas c ON c.empresa_id=o.empresa_id AND c.id=o.cuenta_id
  WHERE o.empresa_id=p_empresa_id AND (v_alcance IS NULL OR o.sociedad_id=ANY(v_alcance))
   AND (p_texto IS NULL OR o.numero ILIKE '%'||v_texto||'%' ESCAPE '\' OR o.nombre ILIKE '%'||v_texto||'%' ESCAPE '\' OR o.numero_doc_cliente ILIKE '%'||v_texto||'%' ESCAPE '\' OR c.nombre_comercial ILIKE '%'||v_texto||'%' ESCAPE '\' OR c.razon_social ILIKE '%'||v_texto||'%' ESCAPE '\')
 ), estados AS (
  SELECT b.estado,b.moneda,count(*)::integer cantidad,CASE WHEN v_ver_precios THEN round(sum(b.monto_aprobado),2) END monto_aprobado,
   CASE WHEN v_ver_finanzas THEN round(sum(b.monto_facturado),2) END monto_facturado,
   CASE WHEN v_ver_finanzas THEN round(sum(b.monto_cobrado),2) END monto_cobrado,
   CASE WHEN v_ver_finanzas THEN round(sum(b.saldo_por_facturar),2) END saldo_por_facturar FROM base b GROUP BY b.estado,b.moneda
 ), produccion AS (SELECT coalesce(b.estado_produccion,'sin_estado') estado_produccion,count(*)::integer cantidad FROM base b GROUP BY b.estado_produccion)
 SELECT coalesce((SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('estado',e.estado,'moneda',e.moneda,'cantidad',e.cantidad,'monto_aprobado',e.monto_aprobado,
   'monto_facturado',e.monto_facturado,'monto_cobrado',e.monto_cobrado,'saldo_por_facturar',e.saldo_por_facturar)) ORDER BY e.estado,e.moneda) FROM estados e),'[]'::jsonb),
  coalesce((SELECT jsonb_object_agg(pr.estado_produccion,pr.cantidad) FROM produccion pr),'{}'::jsonb)
 INTO v_por_estado_moneda,v_por_produccion;
 RETURN jsonb_build_object('por_estado_moneda',v_por_estado_moneda,'por_estado_produccion',v_por_produccion,'campos_omitidos_por_permiso',to_jsonb(v_omitidos));
END $$;
REVOKE ALL ON FUNCTION public.asistente_resumen_os_clientes(text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.asistente_resumen_os_clientes(text,uuid,text) TO authenticated;


CREATE OR REPLACE FUNCTION public.asistente_contar_registros(p_empresa_id text, p_entidad text, p_sociedad_id uuid DEFAULT NULL::uuid, p_estado text DEFAULT NULL::text, p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date, p_texto text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total bigint := 0;
  v_por_estado jsonb;
  v_por_tipo jsonb;
  v_por_origen jsonb;
  v_filtros jsonb := '{}'::jsonb;
  v_alcance uuid[];
  v_desde date;
  v_hasta date;
  v_texto text;
BEGIN
  IF p_entidad IS NULL OR p_entidad NOT IN (
    'cuentas','leads','oportunidades','cotizaciones','proveedores','solpe',
    'procesos_compra','ordenes_compra','recepciones','materiales','almacenes',
    'guias_remision','ordenes_venta','facturas','os_clientes'
  ) THEN
    RAISE EXCEPTION 'Entidad no permitida para conteo: %', coalesce(p_entidad, 'NULL');
  END IF;

  -- Cada llamada y módulo coincide con la RPC de búsqueda de 599.
  CASE p_entidad
    WHEN 'cuentas' THEN PERFORM public.asistente_autorizar(p_empresa_id,'cuentas');
    WHEN 'leads' THEN PERFORM public.asistente_autorizar(p_empresa_id,'leads');
    WHEN 'oportunidades' THEN PERFORM public.asistente_autorizar(p_empresa_id,'pipeline');
    WHEN 'cotizaciones' THEN v_alcance:=public.asistente_autorizar(p_empresa_id,'cotizaciones',p_sociedad_id,true);
    WHEN 'proveedores' THEN PERFORM public.asistente_autorizar(p_empresa_id,'proveedores');
    WHEN 'solpe' THEN PERFORM public.asistente_autorizar(p_empresa_id,'solpe');
    WHEN 'procesos_compra' THEN PERFORM public.asistente_autorizar(p_empresa_id,'cot_compras');
    WHEN 'ordenes_compra' THEN v_alcance:=public.asistente_autorizar(p_empresa_id,'ordenes_compra',p_sociedad_id,true);
    WHEN 'recepciones' THEN v_alcance:=public.asistente_autorizar(p_empresa_id,'recepciones',p_sociedad_id,true);
    WHEN 'materiales' THEN PERFORM public.asistente_autorizar(p_empresa_id,'inventario');
    WHEN 'almacenes' THEN PERFORM public.asistente_autorizar(p_empresa_id,'inventario');
    WHEN 'guias_remision' THEN v_alcance:=public.asistente_autorizar(p_empresa_id,'remision',p_sociedad_id,true);
    WHEN 'ordenes_venta' THEN v_alcance:=public.asistente_autorizar(p_empresa_id,'remision',p_sociedad_id,true);
    WHEN 'facturas' THEN v_alcance:=public.asistente_autorizar(p_empresa_id,'facturacion',p_sociedad_id,true);
    WHEN 'os_clientes' THEN v_alcance:=public.asistente_autorizar(p_empresa_id,'os_cliente',p_sociedad_id,true);
  END CASE;

  -- Las búsquedas de 599 validan rangos de hasta 12 meses en estas entidades.
  v_desde:=p_desde;
  v_hasta:=p_hasta;
  IF p_entidad IN ('leads','oportunidades','cotizaciones','solpe','procesos_compra',
                    'ordenes_compra','recepciones','guias_remision','ordenes_venta','facturas','os_clientes') THEN
    IF v_desde IS NULL AND v_hasta IS NOT NULL THEN
      v_desde:=(v_hasta-interval '12 months')::date;
    ELSIF v_hasta IS NULL AND v_desde IS NOT NULL THEN
      v_hasta:=(v_desde+interval '12 months')::date;
    END IF;
    IF v_desde IS NOT NULL AND (v_hasta<v_desde OR v_hasta>(v_desde+interval '12 months')::date) THEN
      RAISE EXCEPTION 'Rango inválido: máximo 12 meses';
    END IF;
  END IF;
  v_texto:=replace(replace(replace(coalesce(p_texto,''),'\','\\'),'%','\%'),'_','\_');

  CASE p_entidad
    WHEN 'cuentas' THEN
      v_filtros:=jsonb_strip_nulls(jsonb_build_object('texto',p_texto));
      SELECT count(*) INTO v_total FROM public.cuentas c
       WHERE c.empresa_id=p_empresa_id
         AND (p_texto IS NULL OR c.nombre_comercial ILIKE '%'||p_texto||'%' OR c.razon_social ILIKE '%'||p_texto||'%' OR c.ruc=p_texto OR c.tipo::text=lower(p_texto));
      SELECT coalesce(jsonb_object_agg(coalesce(c.estado::text,'sin_estado'),c.cantidad),'{}'::jsonb) INTO v_por_estado
       FROM (SELECT c.estado,count(*)::bigint AS cantidad FROM public.cuentas c WHERE c.empresa_id=p_empresa_id
         AND (p_texto IS NULL OR c.nombre_comercial ILIKE '%'||p_texto||'%' OR c.razon_social ILIKE '%'||p_texto||'%' OR c.ruc=p_texto OR c.tipo::text=lower(p_texto)) GROUP BY c.estado) c;
      SELECT coalesce(jsonb_object_agg(coalesce(t.tipo::text,'sin_tipo'),t.cantidad),'{}'::jsonb) INTO v_por_tipo
       FROM (SELECT c.tipo,count(*)::bigint AS cantidad FROM public.cuentas c WHERE c.empresa_id=p_empresa_id
         AND (p_texto IS NULL OR c.nombre_comercial ILIKE '%'||p_texto||'%' OR c.razon_social ILIKE '%'||p_texto||'%' OR c.ruc=p_texto OR c.tipo::text=lower(p_texto)) GROUP BY c.tipo) t;

    WHEN 'leads' THEN
      v_filtros:=jsonb_strip_nulls(jsonb_build_object('texto',p_texto,'estado',p_estado,'desde',v_desde,'hasta',v_hasta));
      SELECT coalesce(sum(q.cantidad),0),coalesce(jsonb_object_agg(coalesce(q.estado::text,'sin_estado'),q.cantidad),'{}'::jsonb)
        INTO v_total,v_por_estado FROM (SELECT l.estado,count(*)::bigint cantidad FROM public.leads l WHERE l.empresa_id=p_empresa_id
         AND (v_desde IS NULL OR l.fecha_creacion::date BETWEEN v_desde AND v_hasta) AND (p_estado IS NULL OR l.estado=p_estado)
         AND (p_texto IS NULL OR l.nombre_contacto ILIKE '%'||p_texto||'%' OR l.empresa_nombre ILIKE '%'||p_texto||'%' OR l.numero_documento=p_texto) GROUP BY l.estado) q;

    WHEN 'oportunidades' THEN
      v_filtros:=jsonb_strip_nulls(jsonb_build_object('texto',p_texto,'estado',p_estado,'desde',v_desde,'hasta',v_hasta));
      SELECT coalesce(sum(q.cantidad),0),coalesce(jsonb_object_agg(coalesce(q.estado::text,'sin_estado'),q.cantidad),'{}'::jsonb)
        INTO v_total,v_por_estado FROM (SELECT o.estado,count(*)::bigint cantidad FROM public.oportunidades o WHERE o.empresa_id=p_empresa_id
         AND (v_desde IS NULL OR o.fecha_cierre_estimada BETWEEN v_desde AND v_hasta) AND (p_estado IS NULL OR o.estado=p_estado)
         AND (p_texto IS NULL OR o.nombre ILIKE '%'||p_texto||'%') GROUP BY o.estado) q;

    WHEN 'cotizaciones' THEN
      v_filtros:=jsonb_strip_nulls(jsonb_build_object('texto',p_texto,'estado',p_estado,'desde',v_desde,'hasta',v_hasta,'sociedad_id',p_sociedad_id,'alcance_sociedades',v_alcance));
      -- Igual que la pantalla: ultima version de cada numero estandar + cotizaciones especiales.
      WITH u AS (
        SELECT x.estado,'estandar'::text AS origen
          FROM (SELECT DISTINCT ON (c0.numero) c0.numero,c0.estado,c0.fecha FROM public.cotizaciones c0
                 WHERE c0.empresa_id=p_empresa_id AND (v_alcance IS NULL OR c0.sociedad_id=ANY(v_alcance))
                 ORDER BY c0.numero,c0.version DESC) x
         WHERE (v_desde IS NULL OR x.fecha::date BETWEEN v_desde AND v_hasta) AND (p_estado IS NULL OR lower(x.estado)=lower(p_estado))
           AND (p_texto IS NULL OR x.numero ILIKE '%'||p_texto||'%' OR x.estado ILIKE '%'||p_texto||'%')
        UNION ALL
        SELECT e.estado,'especial'::text
          FROM public.cotizaciones_especiales e
         WHERE e.empresa_id=p_empresa_id AND (v_alcance IS NULL OR e.sociedad_id=ANY(v_alcance))
           AND (v_desde IS NULL OR coalesce(e.emitida_at,e.created_at)::date BETWEEN v_desde AND v_hasta)
           AND (p_estado IS NULL OR lower(e.estado)=lower(p_estado))
           AND (p_texto IS NULL OR e.numero ILIKE '%'||p_texto||'%' OR e.estado ILIKE '%'||p_texto||'%')
      ), pe AS (SELECT u.estado,count(*)::bigint n FROM u GROUP BY u.estado),
         po AS (SELECT u.origen,count(*)::bigint n FROM u GROUP BY u.origen)
      SELECT (SELECT coalesce(sum(pe.n),0) FROM pe),
             (SELECT coalesce(jsonb_object_agg(coalesce(pe.estado::text,'sin_estado'),pe.n),'{}'::jsonb) FROM pe),
             (SELECT coalesce(jsonb_object_agg(po.origen,po.n),'{}'::jsonb) FROM po)
        INTO v_total,v_por_estado,v_por_origen;

    WHEN 'proveedores' THEN
      v_filtros:=jsonb_strip_nulls(jsonb_build_object('texto',p_texto,'estado',p_estado));
      SELECT coalesce(sum(q.cantidad),0),coalesce(jsonb_object_agg(coalesce(q.estado::text,'sin_estado'),q.cantidad),'{}'::jsonb)
        INTO v_total,v_por_estado FROM (SELECT p.estado,count(*)::bigint cantidad FROM public.proveedores p WHERE p.empresa_id=p_empresa_id
         AND (p_estado IS NULL OR p.estado=p_estado)
         AND (p_texto IS NULL OR p.razon_social ILIKE '%'||v_texto||'%' ESCAPE '\' OR p.nombre_comercial ILIKE '%'||v_texto||'%' ESCAPE '\'
          OR p.codigo ILIKE '%'||v_texto||'%' ESCAPE '\' OR p.ruc=p_texto) GROUP BY p.estado) q;

    WHEN 'solpe' THEN
      v_filtros:=jsonb_strip_nulls(jsonb_build_object('texto',p_texto,'estado',p_estado,'desde',v_desde,'hasta',v_hasta));
      SELECT coalesce(sum(q.cantidad),0),coalesce(jsonb_object_agg(coalesce(q.estado::text,'sin_estado'),q.cantidad),'{}'::jsonb)
        INTO v_total,v_por_estado FROM (SELECT s.estado,count(*)::bigint cantidad FROM public.solpe_interna s WHERE s.empresa_id=p_empresa_id
         AND (p_estado IS NULL OR s.estado=p_estado) AND (v_desde IS NULL OR s.fecha::date BETWEEN v_desde AND v_hasta)
         AND (p_texto IS NULL OR s.codigo ILIKE '%'||v_texto||'%' ESCAPE '\' OR s.descripcion ILIKE '%'||v_texto||'%' ESCAPE '\' OR s.solicitante ILIKE '%'||v_texto||'%' ESCAPE '\') GROUP BY s.estado) q;

    WHEN 'procesos_compra' THEN
      v_filtros:=jsonb_strip_nulls(jsonb_build_object('texto',p_texto,'estado',p_estado,'desde',v_desde,'hasta',v_hasta));
      SELECT coalesce(sum(q.cantidad),0),coalesce(jsonb_object_agg(coalesce(q.estado::text,'sin_estado'),q.cantidad),'{}'::jsonb)
        INTO v_total,v_por_estado FROM (SELECT c.estado,count(*)::bigint cantidad FROM public.procesos_compra c WHERE c.empresa_id=p_empresa_id
         AND (p_estado IS NULL OR c.estado=p_estado) AND (v_desde IS NULL OR c.fecha_limite::date BETWEEN v_desde AND v_hasta)
         AND (p_texto IS NULL OR c.codigo ILIKE '%'||v_texto||'%' ESCAPE '\' OR c.descripcion ILIKE '%'||v_texto||'%' ESCAPE '\' OR c.proveedor_ganador ILIKE '%'||v_texto||'%' ESCAPE '\') GROUP BY c.estado) q;

    WHEN 'ordenes_compra' THEN
      v_filtros:=jsonb_strip_nulls(jsonb_build_object('texto',p_texto,'estado',p_estado,'desde',v_desde,'hasta',v_hasta,'sociedad_id',p_sociedad_id,'alcance_sociedades',v_alcance));
      SELECT coalesce(sum(q.cantidad),0),coalesce(jsonb_object_agg(coalesce(q.estado::text,'sin_estado'),q.cantidad),'{}'::jsonb)
        INTO v_total,v_por_estado FROM (SELECT oc.estado,count(*)::bigint cantidad FROM public.ordenes_compra oc WHERE oc.empresa_id=p_empresa_id
         AND (v_alcance IS NULL OR oc.sociedad_id=ANY(v_alcance)) AND (p_estado IS NULL OR oc.estado=p_estado)
         AND (v_desde IS NULL OR oc.fecha_emision::date BETWEEN v_desde AND v_hasta)
         AND (p_texto IS NULL OR oc.codigo ILIKE '%'||v_texto||'%' ESCAPE '\' OR oc.descripcion ILIKE '%'||v_texto||'%' ESCAPE '\' OR oc.solpe_codigo ILIKE '%'||v_texto||'%' ESCAPE '\') GROUP BY oc.estado) q;

    WHEN 'recepciones' THEN
      v_filtros:=jsonb_strip_nulls(jsonb_build_object('desde',v_desde,'hasta',v_hasta,'sociedad_id',p_sociedad_id,'alcance_sociedades',v_alcance));
      SELECT coalesce(sum(q.cantidad),0),coalesce(jsonb_object_agg(coalesce(q.estado::text,'sin_estado'),q.cantidad),'{}'::jsonb)
        INTO v_total,v_por_estado FROM (SELECT r.estado,count(*)::bigint cantidad FROM public.recepciones r WHERE r.empresa_id=p_empresa_id
         AND (v_alcance IS NULL OR r.sociedad_id=ANY(v_alcance)) AND (v_desde IS NULL OR r.fecha::date BETWEEN v_desde AND v_hasta) GROUP BY r.estado) q;

    WHEN 'materiales' THEN
      IF p_estado IS NOT NULL AND (length(p_estado)>80 OR p_estado !~ '^[[:alnum:] _.-]+$') THEN RAISE EXCEPTION 'Estado inválido'; END IF;
      v_filtros:=jsonb_strip_nulls(jsonb_build_object('texto',p_texto,'estado',p_estado));
      SELECT coalesce(sum(q.cantidad),0),coalesce(jsonb_object_agg(coalesce(q.estado::text,'sin_estado'),q.cantidad),'{}'::jsonb)
        INTO v_total,v_por_estado FROM (SELECT m.estado,count(*)::bigint cantidad FROM public.materiales m WHERE m.empresa_id=p_empresa_id
         AND (p_estado IS NULL OR m.estado=p_estado)
         AND (p_texto IS NULL OR m.codigo ILIKE '%'||v_texto||'%' ESCAPE '\' OR m.descripcion ILIKE '%'||v_texto||'%' ESCAPE '\' OR m.nro_parte ILIKE '%'||v_texto||'%' ESCAPE '\' OR m.codigo_barras ILIKE '%'||v_texto||'%' ESCAPE '\') GROUP BY m.estado) q;

    WHEN 'almacenes' THEN
      IF p_estado IS NOT NULL AND (length(p_estado)>80 OR p_estado !~ '^[[:alnum:] _.-]+$') THEN RAISE EXCEPTION 'Estado inválido'; END IF;
      v_filtros:=jsonb_strip_nulls(jsonb_build_object('texto',p_texto,'estado',p_estado));
      SELECT coalesce(sum(q.cantidad),0),coalesce(jsonb_object_agg(coalesce(q.estado::text,'sin_estado'),q.cantidad),'{}'::jsonb)
        INTO v_total,v_por_estado FROM (SELECT a.estado,count(*)::bigint cantidad FROM public.almacenes a WHERE a.empresa_id=p_empresa_id
         AND (p_estado IS NULL OR a.estado=p_estado)
         AND (p_texto IS NULL OR a.codigo ILIKE '%'||v_texto||'%' ESCAPE '\' OR a.nombre ILIKE '%'||v_texto||'%' ESCAPE '\' OR a.ubicacion ILIKE '%'||v_texto||'%' ESCAPE '\') GROUP BY a.estado) q;

    WHEN 'guias_remision' THEN
      IF p_estado IS NOT NULL AND (length(p_estado)>80 OR p_estado !~ '^[[:alnum:] _.-]+$') THEN RAISE EXCEPTION 'Estado inválido'; END IF;
      v_filtros:=jsonb_strip_nulls(jsonb_build_object('texto',p_texto,'estado',p_estado,'desde',v_desde,'hasta',v_hasta,'sociedad_id',p_sociedad_id,'alcance_sociedades',v_alcance));
      SELECT coalesce(sum(q.cantidad),0),coalesce(jsonb_object_agg(coalesce(q.estado::text,'sin_estado'),q.cantidad),'{}'::jsonb)
        INTO v_total,v_por_estado FROM (SELECT g.estado,count(*)::bigint cantidad FROM public.guias_remision g WHERE g.empresa_id=p_empresa_id
         AND (p_estado IS NULL OR g.estado=p_estado) AND (v_desde IS NULL OR g.fecha_emision BETWEEN v_desde AND v_hasta)
         AND (v_alcance IS NULL OR g.sociedad_origen_id=ANY(v_alcance) OR g.sociedad_destino_id=ANY(v_alcance))
         AND (p_texto IS NULL OR g.numero_completo ILIKE '%'||v_texto||'%' ESCAPE '\' OR g.motivo_traslado ILIKE '%'||v_texto||'%' ESCAPE '\' OR g.destinatario_razon_social ILIKE '%'||v_texto||'%' ESCAPE '\') GROUP BY g.estado) q;

    WHEN 'ordenes_venta' THEN
      IF p_estado IS NOT NULL AND (length(p_estado)>80 OR p_estado !~ '^[[:alnum:] _.-]+$') THEN RAISE EXCEPTION 'Estado inválido'; END IF;
      v_filtros:=jsonb_strip_nulls(jsonb_build_object('texto',p_texto,'estado',p_estado,'desde',v_desde,'hasta',v_hasta,'sociedad_id',p_sociedad_id,'alcance_sociedades',v_alcance));
      SELECT coalesce(sum(q.cantidad),0),coalesce(jsonb_object_agg(coalesce(q.estado::text,'sin_estado'),q.cantidad),'{}'::jsonb)
        INTO v_total,v_por_estado FROM (SELECT o.estado,count(*)::bigint cantidad FROM public.ordenes_venta o WHERE o.empresa_id=p_empresa_id
         AND (v_alcance IS NULL OR o.sociedad_id=ANY(v_alcance)) AND (p_estado IS NULL OR o.estado=p_estado)
         AND (v_desde IS NULL OR o.fecha_emision BETWEEN v_desde AND v_hasta)
         AND (p_texto IS NULL OR o.numero ILIKE '%'||v_texto||'%' ESCAPE '\' OR o.cliente_nombre ILIKE '%'||v_texto||'%' ESCAPE '\') GROUP BY o.estado) q;
    WHEN 'facturas' THEN
      v_filtros:=jsonb_strip_nulls(jsonb_build_object('texto',p_texto,'estado',p_estado,'desde',v_desde,'hasta',v_hasta,'sociedad_id',p_sociedad_id,'alcance_sociedades',v_alcance));
      WITH matched AS (
        SELECT lower(f.estado) estado,lower(f.tipo_documento) tipo_documento FROM public.facturas f
        LEFT JOIN public.cuentas c ON c.empresa_id=f.empresa_id AND c.id=f.cuenta_id
        WHERE f.empresa_id=p_empresa_id AND (v_alcance IS NULL OR f.sociedad_id=ANY(v_alcance))
         AND (p_estado IS NULL OR lower(f.estado)=lower(p_estado))
         AND (v_desde IS NULL OR f.fecha_emision BETWEEN v_desde AND v_hasta)
         AND (p_texto IS NULL OR f.numero ILIKE '%'||v_texto||'%' ESCAPE '\' OR f.glosa ILIKE '%'||v_texto||'%' ESCAPE '\'
          OR f.concepto ILIKE '%'||v_texto||'%' ESCAPE '\' OR c.nombre_comercial ILIKE '%'||v_texto||'%' ESCAPE '\' OR c.razon_social ILIKE '%'||v_texto||'%' ESCAPE '\')
      ), pe AS (SELECT m.estado,count(*)::bigint cantidad FROM matched m GROUP BY m.estado),
         pt AS (SELECT m.tipo_documento,count(*)::bigint cantidad FROM matched m GROUP BY m.tipo_documento)
      SELECT (SELECT count(*) FROM matched),
       (SELECT coalesce(jsonb_object_agg(coalesce(pe.estado,'sin_estado'),pe.cantidad),'{}'::jsonb) FROM pe),
       (SELECT coalesce(jsonb_object_agg(coalesce(pt.tipo_documento,'sin_tipo'),pt.cantidad),'{}'::jsonb) FROM pt)
       INTO v_total,v_por_estado,v_por_tipo;

    WHEN 'os_clientes' THEN
      v_filtros:=jsonb_strip_nulls(jsonb_build_object('texto',p_texto,'estado',p_estado,'desde',v_desde,'hasta',v_hasta,'sociedad_id',p_sociedad_id,'alcance_sociedades',v_alcance));
      WITH matched AS (
        SELECT CASE WHEN lower(coalesce(o.estado,'')) IN ('activa','activo','en_ejecucion') THEN 'activa' ELSE o.estado END estado
        FROM public.os_clientes o WHERE o.empresa_id=p_empresa_id AND (v_alcance IS NULL OR o.sociedad_id=ANY(v_alcance))
         AND (p_estado IS NULL OR (lower(p_estado) IN ('activa','activo','en_ejecucion') AND lower(o.estado) IN ('activa','activo','en_ejecucion'))
          OR (lower(p_estado) NOT IN ('activa','activo','en_ejecucion') AND lower(o.estado)=lower(p_estado)))
         AND (v_desde IS NULL OR o.fecha_emision BETWEEN v_desde AND v_hasta)
         AND (p_texto IS NULL OR o.numero ILIKE '%'||v_texto||'%' ESCAPE '\' OR o.nombre ILIKE '%'||v_texto||'%' ESCAPE '\' OR o.numero_doc_cliente ILIKE '%'||v_texto||'%' ESCAPE '\')
      ), pe AS (SELECT m.estado,count(*)::bigint cantidad FROM matched m GROUP BY m.estado)
      SELECT coalesce(sum(pe.cantidad),0),coalesce(jsonb_object_agg(coalesce(pe.estado,'sin_estado'),pe.cantidad),'{}'::jsonb)
       INTO v_total,v_por_estado FROM pe;
  END CASE;

  IF v_por_estado IS NULL THEN
    RETURN jsonb_build_object('entidad',p_entidad,'total',v_total,'filtros_aplicados',v_filtros);
  END IF;
  RETURN jsonb_strip_nulls(jsonb_build_object('entidad',p_entidad,'total',v_total,'por_estado',v_por_estado,'por_tipo',v_por_tipo,'por_origen',v_por_origen,'filtros_aplicados',v_filtros));
END;
$function$;

REVOKE ALL ON FUNCTION public.asistente_contar_registros(text,text,uuid,text,date,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.asistente_contar_registros(text,text,uuid,text,date,date,text) TO authenticated;

COMMIT;
