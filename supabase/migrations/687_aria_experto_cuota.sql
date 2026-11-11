-- 687 · Cuota diaria del modo experto de Aria (respuestas ampliadas con un modelo más capaz). Aditiva.
CREATE OR REPLACE FUNCTION public.aria_experto_cuota(p_empresa_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_usadas integer; v_limite CONSTANT integer := 10; v_inicio timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sesión no autenticada'; END IF;
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN RAISE EXCEPTION 'El usuario no pertenece a la empresa'; END IF;
  v_inicio := date_trunc('day', now() AT TIME ZONE 'America/Lima') AT TIME ZONE 'America/Lima';
  SELECT count(*)::integer INTO v_usadas FROM public.asistente_historial h
   WHERE h.user_id = auth.uid() AND h.empresa_id = p_empresa_id AND h.created_at >= v_inicio
     AND h.modelo LIKE 'claude-sonnet%' AND coalesce(h.error_code, '') NOT LIKE 'eval%';
  RETURN jsonb_build_object('usadas', v_usadas, 'limite', v_limite, 'restantes', greatest(v_limite - v_usadas, 0), 'puede_continuar', v_usadas < v_limite);
END; $$;
REVOKE ALL ON FUNCTION public.aria_experto_cuota(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aria_experto_cuota(text) TO authenticated;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='aria_experto_cuota') THEN RAISE EXCEPTION '687: falta aria_experto_cuota'; END IF;
  IF has_function_privilege('anon', 'public.aria_experto_cuota(text)', 'EXECUTE') THEN RAISE EXCEPTION '687: anon puede ejecutar'; END IF;
END $$;
