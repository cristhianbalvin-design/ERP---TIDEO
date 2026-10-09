-- 615_asistente_erp_cuota_30.sql
-- Aria (asistente ERP): reduce el limite diario de preguntas de 50 a 30 por usuario y empresa.
-- Unico cambio: v_limite 50 -> 30. Resto de la funcion identico a 599 (seccion C).
-- CREATE OR REPLACE sobre la funcion existente; firma, grants y comportamiento no cambian.

CREATE OR REPLACE FUNCTION public.asistente_verificar_cuota(p_empresa_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_conteo integer; v_limite CONSTANT integer := 30; v_inicio timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sesión no autenticada'; END IF;
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN RAISE EXCEPTION 'El usuario no pertenece a la empresa'; END IF;
  v_inicio := date_trunc('day', now() AT TIME ZONE 'America/Lima') AT TIME ZONE 'America/Lima';
  SELECT count(*)::integer INTO v_conteo FROM public.asistente_historial h
   WHERE h.user_id = auth.uid() AND h.empresa_id = p_empresa_id AND h.created_at >= v_inicio;
  RETURN jsonb_build_object('conteo', v_conteo, 'limite', v_limite, 'puede_continuar', v_conteo < v_limite);
END;
$$;
REVOKE ALL ON FUNCTION public.asistente_verificar_cuota(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.asistente_verificar_cuota(text) TO authenticated;
