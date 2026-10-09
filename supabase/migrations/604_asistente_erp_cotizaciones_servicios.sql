-- 604_asistente_erp_cotizaciones_servicios.sql
-- Complementa 603: lo que dice de qué trata una cotización casi nunca está en descripcion_general
-- sino en la glosa y en las descripciones de sus líneas. El listado ahora devuelve la glosa y los
-- 3 primeros servicios. Misma firma que 599/603: CREATE OR REPLACE, sin DROP, permisos y RLS sin cambios.
-- Cliente y oportunidad se leen como invocador: si el usuario no los ve por RLS, salen vacíos.

CREATE OR REPLACE FUNCTION public.asistente_buscar_cotizaciones(p_empresa_id text,p_sociedad_id uuid DEFAULT NULL,p_busqueda text DEFAULT NULL,p_limite integer DEFAULT 20,p_desde date DEFAULT NULL,p_hasta date DEFAULT NULL,p_estado text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE v jsonb; p jsonb; a uuid[]; d date; h date; o text[];
BEGIN
 a:=public.asistente_autorizar(p_empresa_id,'cotizaciones',p_sociedad_id,true); p:=public.asistente_permisos_especiales(p_empresa_id); d:=p_desde; h:=p_hasta;
 o:=CASE WHEN NOT (p->>'ver_precios')::boolean THEN ARRAY['subtotal','descuento_global_pct','descuento_global','igv','total','items.precios','hitos_pago']::text[] ELSE ARRAY[]::text[] END;
 IF d IS NULL AND h IS NOT NULL THEN d:=(h-interval '12 months')::date; ELSIF h IS NULL AND d IS NOT NULL THEN h:=(d+interval '12 months')::date; END IF;
 IF d IS NOT NULL AND (h<d OR h>(d+interval '12 months')::date) THEN RAISE EXCEPTION 'Rango inválido: máximo 12 meses'; END IF;
 SELECT coalesce(jsonb_agg(x),'[]'::jsonb) INTO v FROM (SELECT jsonb_strip_nulls(jsonb_build_object('id',c.id,'oportunidad_id',c.oportunidad_id,'cuenta_id',c.cuenta_id,'numero',c.numero,'version',c.version,'estado',c.estado,'fecha',c.fecha,'moneda',c.moneda,'sociedad_id',c.sociedad_id,
  'cliente',(SELECT coalesce(ct.nombre_comercial,ct.razon_social) FROM public.cuentas ct WHERE ct.empresa_id=p_empresa_id AND ct.id=c.cuenta_id),
  'oportunidad',(SELECT op.nombre FROM public.oportunidades op WHERE op.empresa_id=p_empresa_id AND op.id=c.oportunidad_id),
  'descripcion',left(c.descripcion_general,300),'linea_negocio',c.linea_negocio,'numero_caso',c.numero_caso,
  'glosa',left(c.glosa_factura,200),
  'servicios_principales',(SELECT string_agg(z.d,'; ' ORDER BY z.ord) FROM (SELECT left(coalesce(e.value->>'descripcion',e.value->>'nombre'),120) AS d,e.ord FROM jsonb_array_elements(CASE WHEN jsonb_typeof(c.items)='array' THEN c.items ELSE '[]'::jsonb END) WITH ORDINALITY AS e(value,ord) WHERE coalesce(e.value->>'descripcion',e.value->>'nombre','')<>'' ORDER BY e.ord LIMIT 3) z),
  'subtotal',CASE WHEN (p->>'ver_precios')::boolean THEN c.subtotal END,'descuento_global_pct',CASE WHEN (p->>'ver_precios')::boolean THEN c.descuento_global_pct END,'descuento_global',CASE WHEN (p->>'ver_precios')::boolean THEN c.descuento_global END,
  'igv',CASE WHEN (p->>'ver_precios')::boolean THEN c.igv END,'total',CASE WHEN (p->>'ver_precios')::boolean THEN c.total END)) x
 FROM public.cotizaciones c WHERE c.empresa_id=p_empresa_id AND (d IS NULL OR c.fecha::date BETWEEN d AND h) AND (p_estado IS NULL OR lower(c.estado)=lower(p_estado)) AND (a IS NULL OR c.sociedad_id=ANY(a)) AND
 (p_busqueda IS NULL OR c.numero ILIKE '%'||p_busqueda||'%' OR c.estado ILIKE '%'||p_busqueda||'%') ORDER BY c.fecha DESC LIMIT least(greatest(coalesce(p_limite,20),1),100)+1) q; RETURN public.asistente_formato_listado(v,p_limite,o);
END $$;
