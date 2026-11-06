-- 657 · Al anular en Administración una guía de venta emitida por el WMS (después de revertir su kardex),
-- el pedido de salida se reabre: baja lo despachado de sus líneas y vuelve a reservar el stock liberado.
CREATE OR REPLACE FUNCTION public.wms_reabrir_demanda_por_guia(p_empresa_id text, p_guia_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE g public.guias_remision%rowtype; v_dem text; gl record; v_resta numeric; l record; v_take numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT public.usuario_tiene_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'No tienes acceso a esta empresa.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO g FROM public.guias_remision WHERE id = p_guia_id AND empresa_id = p_empresa_id;
  IF NOT FOUND OR g.orden_venta_id IS NULL THEN RETURN jsonb_build_object('reabierta', false); END IF;
  IF g.estado <> 'anulada' THEN RAISE EXCEPTION 'Primero anula la guía.'; END IF;
  SELECT id INTO v_dem FROM public.wms_demandas
   WHERE empresa_id = p_empresa_id AND origen_tipo = 'orden_venta' AND origen_id = g.orden_venta_id AND estado <> 'anulada'
   FOR UPDATE;
  IF v_dem IS NULL THEN RETURN jsonb_build_object('reabierta', false); END IF;
  FOR gl IN SELECT material_id, sum(cantidad) AS cantidad FROM public.guias_remision_lineas WHERE guia_id = g.id AND material_id IS NOT NULL GROUP BY 1 LOOP
    v_resta := gl.cantidad;
    FOR l IN SELECT * FROM public.wms_demanda_lineas WHERE demanda_id = v_dem AND material_id = gl.material_id AND cantidad_despachada > 0 ORDER BY orden DESC, id FOR UPDATE LOOP
      EXIT WHEN v_resta <= 0;
      v_take := least(v_resta, l.cantidad_despachada);
      UPDATE public.wms_demanda_lineas SET cantidad_despachada = cantidad_despachada - v_take WHERE id = l.id;
      v_resta := v_resta - v_take;
    END LOOP;
  END LOOP;
  UPDATE public.wms_demandas SET estado = 'parcial', updated_at = now() WHERE id = v_dem;
  RETURN jsonb_build_object('reabierta', true) || public.wms_reservar_demanda(v_dem);
END $f$;
REVOKE ALL ON FUNCTION public.wms_reabrir_demanda_por_guia(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wms_reabrir_demanda_por_guia(text, text) TO authenticated;

DO $chk$
BEGIN
  IF to_regprocedure('public.wms_reabrir_demanda_por_guia(text,text)') IS NULL THEN RAISE EXCEPTION 'falta wms_reabrir_demanda_por_guia'; END IF;
  IF has_function_privilege('anon', 'public.wms_reabrir_demanda_por_guia(text,text)', 'execute') THEN RAISE EXCEPTION 'anon no debe ejecutar'; END IF;
END $chk$;
