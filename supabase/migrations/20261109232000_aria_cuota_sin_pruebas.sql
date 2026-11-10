-- Aria: las pruebas comparativas de modelos (solo superadmin de plataforma) no consumen la cuota diaria.
-- Esas filas del historial llevan error_code que empieza por 'eval'.
-- Parte de la versión remota vigente de asistente_verificar_cuota; único cambio: el filtro de error_code.

CREATE OR REPLACE FUNCTION public.asistente_verificar_cuota(p_empresa_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_conteo integer; v_limite CONSTANT integer := 30; v_inicio timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sesión no autenticada'; END IF;
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN RAISE EXCEPTION 'El usuario no pertenece a la empresa'; END IF;
  v_inicio := date_trunc('day', now() AT TIME ZONE 'America/Lima') AT TIME ZONE 'America/Lima';
  SELECT count(*)::integer INTO v_conteo FROM public.asistente_historial h
   WHERE h.user_id = auth.uid() AND h.empresa_id = p_empresa_id AND h.created_at >= v_inicio
     AND coalesce(h.error_code, '') NOT LIKE 'eval%';
  RETURN jsonb_build_object('conteo', v_conteo, 'limite', v_limite, 'puede_continuar', v_conteo < v_limite);
END;
$function$;

do $$
begin
  if position('eval%' in pg_get_functiondef('public.asistente_verificar_cuota(text)'::regprocedure)) = 0 then
    raise exception 'asistente_verificar_cuota no quedó con el filtro de pruebas';
  end if;
end;
$$;
