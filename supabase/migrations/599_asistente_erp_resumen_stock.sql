-- 599: resumen de stock valorizado para el asistente (solo lectura, SECURITY INVOKER).
-- Valoriza con materiales.costo_promedio solo si el usuario tiene ver_costos.
CREATE OR REPLACE FUNCTION public.asistente_resumen_stock(
  p_empresa_id text,
  p_sociedad_id uuid DEFAULT NULL,
  p_almacen_id text DEFAULT NULL,
  p_texto text DEFAULT NULL,
  p_solo_con_stock boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  a uuid[];
  p jsonb;
  t text;
  v_costos boolean;
  r jsonb;
BEGIN
  a := public.asistente_autorizar(p_empresa_id, 'inventario', p_sociedad_id, true);
  p := public.asistente_permisos_especiales(p_empresa_id);
  v_costos := coalesce((p->>'ver_costos')::boolean, false);
  t := replace(replace(replace(coalesce(p_texto,''),'\','\\'),'%','\%'),'_','\_');

  WITH base AS (
    SELECT stk.material_id, stk.almacen_id,
           coalesce(stk.fisico,0) AS fisico, coalesce(stk.disponible,0) AS disponible, coalesce(stk.reservado,0) AS reservado,
           mat.codigo AS mcodigo, left(mat.descripcion,120) AS mdesc, mat.unidad AS munidad, mat.moneda AS mmoneda,
           mat.costo_promedio AS ccosto, mat.costo_promedio_usd AS ccosto_usd,
           alm.codigo AS acodigo, alm.nombre AS anombre
    FROM public.stock stk
    JOIN public.materiales mat ON mat.id = stk.material_id AND mat.empresa_id = stk.empresa_id
    JOIN public.almacenes alm ON alm.id = stk.almacen_id AND alm.empresa_id = stk.empresa_id
    WHERE stk.empresa_id = p_empresa_id
      AND (p_almacen_id IS NULL OR stk.almacen_id = p_almacen_id)
      AND (a IS NULL OR stk.sociedad_id = ANY(a))
      AND (NOT coalesce(p_solo_con_stock, true) OR coalesce(stk.fisico,0) > 0)
      AND (p_texto IS NULL OR mat.codigo ILIKE '%'||t||'%' ESCAPE '\' OR mat.descripcion ILIKE '%'||t||'%' ESCAPE '\'
           OR alm.codigo ILIKE '%'||t||'%' ESCAPE '\' OR alm.nombre ILIKE '%'||t||'%' ESCAPE '\')
  )
  SELECT jsonb_build_object(
    'materiales_distintos', (SELECT count(DISTINCT material_id) FROM base),
    'registros_stock', (SELECT count(*) FROM base),
    'unidades_fisico', (SELECT coalesce(sum(fisico),0) FROM base),
    'unidades_disponible', (SELECT coalesce(sum(disponible),0) FROM base),
    'unidades_reservado', (SELECT coalesce(sum(reservado),0) FROM base),
    'valorizado_por_moneda', CASE WHEN v_costos THEN (
        SELECT coalesce(jsonb_object_agg(q.moneda, q.valor), '{}'::jsonb)
        FROM (SELECT coalesce(mmoneda,'sin_moneda') AS moneda, round(sum(fisico*coalesce(ccosto,0)),2) AS valor FROM base GROUP BY 1) q) END,
    'registros_sin_costo', CASE WHEN v_costos THEN (SELECT count(*) FROM base WHERE coalesce(ccosto,0) = 0) END,
    'por_almacen', (
        SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'codigo', q.acodigo, 'nombre', q.anombre, 'materiales', q.materiales, 'unidades_fisico', q.unidades,
          'valorizado_por_moneda', q.valor)) ORDER BY q.unidades DESC, q.acodigo), '[]'::jsonb)
        FROM (SELECT b.acodigo, b.anombre, count(DISTINCT b.material_id) AS materiales, sum(b.fisico) AS unidades,
                CASE WHEN v_costos THEN (
                  SELECT jsonb_object_agg(x.moneda, x.valor)
                  FROM (SELECT coalesce(b2.mmoneda,'sin_moneda') AS moneda, round(sum(b2.fisico*coalesce(b2.ccosto,0)),2) AS valor
                        FROM base b2 WHERE b2.acodigo = b.acodigo GROUP BY 1) x) END AS valor
              FROM base b GROUP BY b.acodigo, b.anombre ORDER BY sum(b.fisico) DESC, b.acodigo LIMIT 20) q),
    'top_materiales', (
        SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
          'codigo', q.mcodigo, 'descripcion', q.mdesc, 'unidad', q.munidad, 'unidades_fisico', q.unidades,
          'valor', CASE WHEN v_costos THEN q.valor END, 'moneda', CASE WHEN v_costos THEN q.moneda END)) ORDER BY q.orden DESC, q.mcodigo), '[]'::jsonb)
        FROM (SELECT b.mcodigo, max(b.mdesc) AS mdesc, max(b.munidad) AS munidad, sum(b.fisico) AS unidades,
                round(sum(b.fisico*coalesce(b.ccosto,0)),2) AS valor, max(b.mmoneda) AS moneda,
                CASE WHEN v_costos THEN sum(b.fisico*coalesce(nullif(b.ccosto_usd,0),b.ccosto,0)) ELSE sum(b.fisico) END AS orden
              FROM base b GROUP BY b.mcodigo ORDER BY 6 DESC, b.mcodigo LIMIT 40) q),
    'filtros_aplicados', jsonb_strip_nulls(jsonb_build_object('texto', p_texto, 'almacen_id', p_almacen_id, 'sociedad_id', p_sociedad_id,
        'solo_con_stock', coalesce(p_solo_con_stock, true), 'alcance_sociedades', a)),
    'campos_omitidos_por_permiso', CASE WHEN v_costos THEN '[]'::jsonb
        ELSE jsonb_build_array('valorizado_por_moneda','registros_sin_costo','valor') END
  ) INTO r;

  RETURN r;
END;
$$;

REVOKE ALL ON FUNCTION public.asistente_resumen_stock(text,uuid,text,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.asistente_resumen_stock(text,uuid,text,text,boolean) TO authenticated;
COMMENT ON FUNCTION public.asistente_resumen_stock(text,uuid,text,text,boolean) IS
  'Resumen de stock del asistente: unidades, valorización por moneda (solo con ver_costos), desglose por almacén y top de 40 materiales por valor.';
