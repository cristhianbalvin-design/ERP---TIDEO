-- 688 · Modo experto de Aria: solo administradores y cuota de 150 consultas al mes por empresa (antes 10 al día por usuario).
-- Parte de la definición vigente de aria_experto_cuota (687): cambian el periodo, el alcance del conteo y se agrega "permitido".
CREATE OR REPLACE FUNCTION public.aria_experto_cuota(p_empresa_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_usadas integer; v_limite CONSTANT integer := 150; v_inicio timestamptz; v_permitido boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sesión no autenticada'; END IF;
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN RAISE EXCEPTION 'El usuario no pertenece a la empresa'; END IF;
  -- Solo administradores de la empresa (o de la plataforma) usan el modo experto.
  v_permitido := public.usuario_es_superadmin_plataforma() OR EXISTS (
    SELECT 1 FROM public.usuarios_empresas ue JOIN public.roles r ON r.id = ue.rol_id
     WHERE ue.user_id = auth.uid() AND ue.empresa_id = p_empresa_id AND ue.estado = 'activo' AND r.es_admin_empresa = true);
  -- La cuota es de la empresa y se renueva el día 1 de cada mes (hora de Lima).
  v_inicio := date_trunc('month', now() AT TIME ZONE 'America/Lima') AT TIME ZONE 'America/Lima';
  SELECT count(*)::integer INTO v_usadas FROM public.asistente_historial h
   WHERE h.empresa_id = p_empresa_id AND h.created_at >= v_inicio
     AND h.modelo LIKE 'claude-sonnet%' AND coalesce(h.error_code, '') NOT LIKE 'eval%';
  RETURN jsonb_build_object('permitido', v_permitido, 'usadas', v_usadas, 'limite', v_limite, 'restantes', greatest(v_limite - v_usadas, 0),
    'puede_continuar', v_permitido AND v_usadas < v_limite);
END; $$;
DO $$ BEGIN
  IF has_function_privilege('anon', 'public.aria_experto_cuota(text)', 'EXECUTE') THEN RAISE EXCEPTION '688: anon puede ejecutar'; END IF;
  IF position('150' in pg_get_functiondef('public.aria_experto_cuota(text)'::regprocedure)) = 0 THEN RAISE EXCEPTION '688: no quedó la cuota mensual'; END IF;
END $$;
