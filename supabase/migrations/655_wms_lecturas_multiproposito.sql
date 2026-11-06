-- 655 · Lecturas agregadas para las pantallas WMS multipropósito (solo lectura).
-- wms_stock_minimos: disponible propio, parámetros por material y almacén, consumo mensual (90 días) y cobertura.
-- wms_custodia_resumen: almacenes de custodia, clientes con sus posiciones, tarifas, stock y posiciones libres.

CREATE OR REPLACE FUNCTION public.wms_stock_minimos(p_empresa_id text, p_almacen_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE v_alc uuid[]; v jsonb;
BEGIN
  PERFORM public.wms_exigir(p_empresa_id, 'ver', 'No tienes permiso para ver el inventario.');
  v_alc := public.usuario_alcance_sociedades(p_empresa_id);
  WITH alm AS (
    SELECT a.id, a.codigo, a.nombre, a.proposito FROM public.almacenes a
     WHERE a.empresa_id = p_empresa_id AND coalesce(a.estado, 'activo') <> 'inactivo' AND a.proposito <> 'custodia'
       AND (p_almacen_id IS NULL OR a.id = p_almacen_id)),
  st AS (
    SELECT s.material_id, s.almacen_id, sum(coalesce(s.disponible, 0)) AS disponible, sum(coalesce(s.reservado, 0)) AS reservado, sum(coalesce(s.fisico, 0)) AS fisico
      FROM public.stock s JOIN alm ON alm.id = s.almacen_id
      LEFT JOIN public.ubicaciones u ON u.id = s.ubicacion_id
     WHERE s.empresa_id = p_empresa_id AND (u.id IS NULL OR (u.propietario_cuenta_id IS NULL AND u.uso NOT IN ('cuarentena', 'merma')))
       AND (v_alc IS NULL OR s.sociedad_id = ANY (v_alc))
     GROUP BY 1, 2),
  par AS (SELECT p.* FROM public.material_almacen_parametros p JOIN alm ON alm.id = p.almacen_id WHERE p.empresa_id = p_empresa_id),
  base AS (
    SELECT coalesce(st.material_id, par.material_id) AS material_id, coalesce(st.almacen_id, par.almacen_id) AS almacen_id,
           coalesce(st.disponible, 0) AS disponible, coalesce(st.reservado, 0) AS reservado, coalesce(st.fisico, 0) AS fisico,
           par.stock_minimo, par.punto_reorden, par.stock_maximo, par.stock_seguridad, par.protegido_operaciones, par.material_id IS NOT NULL AS configurado
      FROM st FULL JOIN par ON par.material_id = st.material_id AND par.almacen_id = st.almacen_id),
  cons AS (
    SELECT k.material_id, k.almacen_id, sum(abs(k.cantidad)) / 3.0 AS consumo_mes FROM public.kardex k JOIN alm ON alm.id = k.almacen_id
     WHERE k.empresa_id = p_empresa_id AND k.tipo = 'salida' AND NOT coalesce(k.anulado, false)
       AND coalesce(k.motivo, '') NOT IN ('ajuste_conteo', 'transferencia', 'transferencia_guia', 'salida_custodia')
       AND k.fecha > now() - interval '90 days'
     GROUP BY 1, 2)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'material_id', b.material_id, 'codigo', m.codigo, 'descripcion', m.descripcion, 'unidad', m.unidad, 'familia', m.familia,
      'almacen_id', b.almacen_id, 'almacen_codigo', alm.codigo, 'almacen_nombre', alm.nombre, 'proposito', alm.proposito,
      'disponible', b.disponible, 'reservado', b.reservado, 'fisico', b.fisico, 'configurado', b.configurado,
      'stock_minimo', coalesce(b.stock_minimo, m.stock_minimo, 0), 'punto_reorden', coalesce(b.punto_reorden, m.punto_reorden, 0),
      'stock_maximo', coalesce(b.stock_maximo, m.stock_maximo, 0), 'stock_seguridad', coalesce(b.stock_seguridad, m.stock_seguridad, 0),
      'protegido_operaciones', coalesce(b.protegido_operaciones, 0), 'consumo_mes', round(coalesce(c.consumo_mes, 0), 2),
      'costo_promedio', coalesce(m.costo_promedio, 0))
      ORDER BY alm.codigo, m.codigo), '[]'::jsonb)
    INTO v
    FROM base b JOIN alm ON alm.id = b.almacen_id JOIN public.materiales m ON m.id = b.material_id AND m.empresa_id = p_empresa_id
    LEFT JOIN cons c ON c.material_id = b.material_id AND c.almacen_id = b.almacen_id
   WHERE coalesce(m.estado, 'activo') <> 'inactivo';
  RETURN v;
END $f$;

CREATE OR REPLACE FUNCTION public.wms_custodia_resumen(p_empresa_id text, p_almacen_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE v_alc uuid[]; v_alm jsonb; v_cli jsonb; v_lib jsonb; v_stock jsonb; v_cuentas jsonb;
BEGIN
  PERFORM public.wms_exigir(p_empresa_id, 'ver', 'No tienes permiso para ver el inventario.');
  v_alc := public.usuario_alcance_sociedades(p_empresa_id);
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'codigo', a.codigo, 'nombre', a.nombre) ORDER BY a.codigo), '[]'::jsonb) INTO v_alm
    FROM public.almacenes a WHERE a.empresa_id = p_empresa_id AND a.proposito = 'custodia';
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'razon_social'), '[]'::jsonb) INTO v_cli FROM (
    SELECT jsonb_build_object('cuenta_id', c.id, 'razon_social', coalesce(c.razon_social, c.nombre_comercial), 'ruc', c.ruc, 'almacen_id', u.almacen_id,
      'posiciones', count(DISTINCT u.id),
      'ocupadas', count(DISTINCT u.id) FILTER (WHERE EXISTS (SELECT 1 FROM public.stock s WHERE s.ubicacion_id = u.id AND s.fisico > 0)),
      'materiales', (SELECT count(DISTINCT s.material_id) FROM public.stock s JOIN public.ubicaciones ux ON ux.id = s.ubicacion_id WHERE ux.propietario_cuenta_id = c.id AND ux.almacen_id = u.almacen_id AND s.fisico > 0),
      'unidades', (SELECT coalesce(sum(s.fisico), 0) FROM public.stock s JOIN public.ubicaciones ux ON ux.id = s.ubicacion_id WHERE ux.propietario_cuenta_id = c.id AND ux.almacen_id = u.almacen_id),
      'ubicaciones', jsonb_agg(DISTINCT jsonb_build_object('id', u.id, 'codigo', u.codigo)),
      'tarifa', (SELECT jsonb_build_object('tarifa_posicion_dia', t.tarifa_posicion_dia, 'tarifa_movimiento', t.tarifa_movimiento, 'moneda', t.moneda)
                   FROM public.custodia_tarifas t WHERE t.empresa_id = p_empresa_id AND t.cuenta_id = c.id AND t.almacen_id = u.almacen_id)) x
      FROM public.ubicaciones u JOIN public.cuentas c ON c.id = u.propietario_cuenta_id
      JOIN public.almacenes a ON a.id = u.almacen_id AND a.empresa_id = p_empresa_id AND a.proposito = 'custodia'
     WHERE (p_almacen_id IS NULL OR u.almacen_id = p_almacen_id)
     GROUP BY c.id, u.almacen_id) q;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'codigo', u.codigo, 'almacen_id', u.almacen_id) ORDER BY u.codigo), '[]'::jsonb) INTO v_lib
    FROM public.ubicaciones u JOIN public.almacenes a ON a.id = u.almacen_id AND a.empresa_id = p_empresa_id AND a.proposito = 'custodia'
   WHERE u.propietario_cuenta_id IS NULL AND NOT u.es_general AND coalesce(u.activo, true) AND u.uso = 'almacenaje'
     AND (p_almacen_id IS NULL OR u.almacen_id = p_almacen_id)
     AND NOT EXISTS (SELECT 1 FROM public.stock s WHERE s.ubicacion_id = u.id AND (s.fisico > 0 OR s.reservado > 0));
  SELECT coalesce(jsonb_agg(jsonb_build_object('cuenta_id', u.propietario_cuenta_id, 'almacen_id', s.almacen_id, 'ubicacion_id', u.id, 'ubicacion', u.codigo,
      'material_id', s.material_id, 'codigo', m.codigo, 'descripcion', m.descripcion, 'unidad', m.unidad, 'fisico', s.fisico, 'disponible', s.disponible,
      'reservado', s.reservado, 'sociedad_id', s.sociedad_id) ORDER BY u.codigo, m.codigo), '[]'::jsonb) INTO v_stock
    FROM public.stock s JOIN public.ubicaciones u ON u.id = s.ubicacion_id JOIN public.materiales m ON m.id = s.material_id
    JOIN public.almacenes a ON a.id = s.almacen_id AND a.empresa_id = p_empresa_id AND a.proposito = 'custodia'
   WHERE u.propietario_cuenta_id IS NOT NULL AND s.fisico > 0 AND (p_almacen_id IS NULL OR s.almacen_id = p_almacen_id)
     AND (v_alc IS NULL OR s.sociedad_id = ANY (v_alc));
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'razon_social', coalesce(c.razon_social, c.nombre_comercial)) ORDER BY coalesce(c.razon_social, c.nombre_comercial)), '[]'::jsonb) INTO v_cuentas
    FROM public.cuentas c WHERE c.empresa_id = p_empresa_id AND coalesce(c.estado, 'activo') <> 'inactivo';
  RETURN jsonb_build_object('almacenes', v_alm, 'clientes', v_cli, 'libres', v_lib, 'stock', v_stock, 'cuentas', v_cuentas);
END $f$;

REVOKE ALL ON FUNCTION public.wms_stock_minimos(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.wms_custodia_resumen(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wms_stock_minimos(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wms_custodia_resumen(text, text) TO authenticated;

DO $chk$
BEGIN
  IF to_regprocedure('public.wms_stock_minimos(text,text)') IS NULL OR to_regprocedure('public.wms_custodia_resumen(text,text)') IS NULL THEN
    RAISE EXCEPTION 'faltan funciones de lectura WMS';
  END IF;
  IF has_function_privilege('anon', 'public.wms_stock_minimos(text,text)', 'execute') THEN RAISE EXCEPTION 'anon no debe ejecutar'; END IF;
END $chk$;
