-- 656 · ¿La orden de venta se despacha desde el WMS? (tiene pedido de salida activo o histórico no anulado)
-- Administración lo usa para: anular con la RPC del WMS o con el flujo antiguo, y bloquear guías manuales de OV gestionadas.
CREATE OR REPLACE FUNCTION public.wms_ov_gestionada(p_empresa_id text, p_ov_id text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
BEGIN
  IF auth.uid() IS NULL OR NOT public.usuario_tiene_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'No tienes acceso a esta empresa.' USING ERRCODE = '42501';
  END IF;
  RETURN EXISTS (SELECT 1 FROM public.wms_demandas d
                  WHERE d.empresa_id = p_empresa_id AND d.origen_tipo = 'orden_venta' AND d.origen_id = p_ov_id AND d.estado <> 'anulada');
END $f$;
REVOKE ALL ON FUNCTION public.wms_ov_gestionada(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wms_ov_gestionada(text, text) TO authenticated;

DO $chk$
BEGIN
  IF to_regprocedure('public.wms_ov_gestionada(text,text)') IS NULL THEN RAISE EXCEPTION 'falta wms_ov_gestionada'; END IF;
  IF has_function_privilege('anon', 'public.wms_ov_gestionada(text,text)', 'execute') THEN RAISE EXCEPTION 'anon no debe ejecutar'; END IF;
END $chk$;
