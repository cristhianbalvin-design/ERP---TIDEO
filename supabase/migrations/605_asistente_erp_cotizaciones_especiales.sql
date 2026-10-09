-- 605_asistente_erp_cotizaciones_especiales.sql
-- El asistente cuenta y lista las cotizaciones como la pantalla Cotizaciones: ultima version de
-- cada numero estandar + cotizaciones especiales (tabla cotizaciones_especiales). El conteo agrega
-- por_origen {estandar, especial}; el listado agrega origen y, en especiales, cliente y servicios.
-- Misma firma que 599/600/602/603/604: CREATE OR REPLACE, sin DROP, permisos y RLS sin cambios.
-- Alcance societario y permiso de precios iguales a los de cotizaciones estandar.

CREATE OR REPLACE FUNCTION public.asistente_contar_registros(
  p_empresa_id text,
  p_entidad text,
  p_sociedad_id uuid DEFAULT NULL,
  p_estado text DEFAULT NULL,
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL,
  p_texto text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public
AS $$
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
    'guias_remision','ordenes_venta'
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
  END CASE;

  -- Las búsquedas de 599 validan rangos de hasta 12 meses en estas entidades.
  v_desde:=p_desde;
  v_hasta:=p_hasta;
  IF p_entidad IN ('leads','oportunidades','cotizaciones','solpe','procesos_compra',
                    'ordenes_compra','recepciones','guias_remision','ordenes_venta') THEN
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
  END CASE;

  IF v_por_estado IS NULL THEN
    RETURN jsonb_build_object('entidad',p_entidad,'total',v_total,'filtros_aplicados',v_filtros);
  END IF;
  RETURN jsonb_strip_nulls(jsonb_build_object('entidad',p_entidad,'total',v_total,'por_estado',v_por_estado,'por_tipo',v_por_tipo,'por_origen',v_por_origen,'filtros_aplicados',v_filtros));
END;
$$;


CREATE OR REPLACE FUNCTION public.asistente_buscar_cotizaciones(p_empresa_id text,p_sociedad_id uuid DEFAULT NULL,p_busqueda text DEFAULT NULL,p_limite integer DEFAULT 20,p_desde date DEFAULT NULL,p_hasta date DEFAULT NULL,p_estado text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE v jsonb; p jsonb; a uuid[]; d date; h date; o text[];
BEGIN
 a:=public.asistente_autorizar(p_empresa_id,'cotizaciones',p_sociedad_id,true); p:=public.asistente_permisos_especiales(p_empresa_id); d:=p_desde; h:=p_hasta;
 o:=CASE WHEN NOT (p->>'ver_precios')::boolean THEN ARRAY['subtotal','descuento_global_pct','descuento_global','igv','total','items.precios','hitos_pago']::text[] ELSE ARRAY[]::text[] END;
 IF d IS NULL AND h IS NOT NULL THEN d:=(h-interval '12 months')::date; ELSIF h IS NULL AND d IS NOT NULL THEN h:=(d+interval '12 months')::date; END IF;
 IF d IS NOT NULL AND (h<d OR h>(d+interval '12 months')::date) THEN RAISE EXCEPTION 'Rango inválido: máximo 12 meses'; END IF;
 SELECT coalesce(jsonb_agg(q.x ORDER BY q.f DESC,q.n),'[]'::jsonb) INTO v FROM (SELECT * FROM (
 SELECT c.fecha::date AS f,c.numero AS n,jsonb_strip_nulls(jsonb_build_object('id',c.id,'origen','estandar','oportunidad_id',c.oportunidad_id,'cuenta_id',c.cuenta_id,'numero',c.numero,'version',c.version,'estado',c.estado,'fecha',c.fecha,'moneda',c.moneda,'sociedad_id',c.sociedad_id,
  'cliente',(SELECT coalesce(ct.nombre_comercial,ct.razon_social) FROM public.cuentas ct WHERE ct.empresa_id=p_empresa_id AND ct.id=c.cuenta_id),
  'oportunidad',(SELECT op.nombre FROM public.oportunidades op WHERE op.empresa_id=p_empresa_id AND op.id=c.oportunidad_id),
  'descripcion',left(c.descripcion_general,300),'linea_negocio',c.linea_negocio,'numero_caso',c.numero_caso,
  'glosa',left(c.glosa_factura,200),
  'servicios_principales',(SELECT string_agg(z.d,'; ' ORDER BY z.ord) FROM (SELECT left(coalesce(e.value->>'descripcion',e.value->>'nombre'),120) AS d,e.ord FROM jsonb_array_elements(CASE WHEN jsonb_typeof(c.items)='array' THEN c.items ELSE '[]'::jsonb END) WITH ORDINALITY AS e(value,ord) WHERE coalesce(e.value->>'descripcion',e.value->>'nombre','')<>'' ORDER BY e.ord LIMIT 3) z),
  'subtotal',CASE WHEN (p->>'ver_precios')::boolean THEN c.subtotal END,'descuento_global_pct',CASE WHEN (p->>'ver_precios')::boolean THEN c.descuento_global_pct END,'descuento_global',CASE WHEN (p->>'ver_precios')::boolean THEN c.descuento_global END,
  'igv',CASE WHEN (p->>'ver_precios')::boolean THEN c.igv END,'total',CASE WHEN (p->>'ver_precios')::boolean THEN c.total END)) AS x
 FROM (SELECT DISTINCT ON (c0.numero) c0.* FROM public.cotizaciones c0 WHERE c0.empresa_id=p_empresa_id AND (a IS NULL OR c0.sociedad_id=ANY(a)) ORDER BY c0.numero,c0.version DESC) c
 WHERE (d IS NULL OR c.fecha::date BETWEEN d AND h) AND (p_estado IS NULL OR lower(c.estado)=lower(p_estado)) AND (p_busqueda IS NULL OR c.numero ILIKE '%'||p_busqueda||'%' OR c.estado ILIKE '%'||p_busqueda||'%')
 UNION ALL
 SELECT coalesce(s.emitida_at,s.created_at)::date,s.numero,jsonb_strip_nulls(jsonb_build_object('id',s.id,'origen','especial','oportunidad_id',s.oportunidad_id,'cuenta_id',s.cuenta_id,'numero',s.numero,'estado',s.estado,'fecha',coalesce(s.emitida_at,s.created_at)::date,'moneda',s.moneda,'sociedad_id',s.sociedad_id,
  'cliente',(SELECT coalesce(ct.nombre_comercial,ct.razon_social) FROM public.cuentas ct WHERE ct.empresa_id=p_empresa_id AND ct.id=s.cuenta_id),
  'oportunidad',(SELECT op.nombre FROM public.oportunidades op WHERE op.empresa_id=p_empresa_id AND op.id=s.oportunidad_id),
  'linea_negocio',s.linea_negocio,'numero_caso',s.numero_caso,
  'servicios_principales',(SELECT string_agg(z.d,'; ' ORDER BY z.ord) FROM (SELECT left(coalesce(e.value->>'descripcion',e.value->>'nombre'),120) AS d,e.ord FROM jsonb_array_elements(CASE WHEN jsonb_typeof(s.items)='array' THEN s.items ELSE '[]'::jsonb END) WITH ORDINALITY AS e(value,ord) WHERE coalesce(e.value->>'descripcion',e.value->>'nombre','')<>'' ORDER BY e.ord LIMIT 3) z),
  'subtotal',CASE WHEN (p->>'ver_precios')::boolean THEN s.subtotal END,'igv',CASE WHEN (p->>'ver_precios')::boolean THEN s.igv END,'total',CASE WHEN (p->>'ver_precios')::boolean THEN s.total END))
 FROM public.cotizaciones_especiales s WHERE s.empresa_id=p_empresa_id AND (a IS NULL OR s.sociedad_id=ANY(a)) AND (d IS NULL OR coalesce(s.emitida_at,s.created_at)::date BETWEEN d AND h) AND (p_estado IS NULL OR lower(s.estado)=lower(p_estado)) AND (p_busqueda IS NULL OR s.numero ILIKE '%'||p_busqueda||'%' OR s.estado ILIKE '%'||p_busqueda||'%')
 ) u ORDER BY u.f DESC,u.n LIMIT least(greatest(coalesce(p_limite,20),1),100)+1) q; RETURN public.asistente_formato_listado(v,p_limite,o);
END $$;
