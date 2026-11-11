-- 682: Memoria de Aria — el título y el resumen se generan desde el primer turno y se actualizan cada 6
-- mensajes (antes el resumen solo existía al pasar de 20 mensajes, y la lista y la herramienta de recuerdos
-- quedaban sin él). El resumen abarca toda la conversación. Parte de la versión vigente (681).

CREATE OR REPLACE FUNCTION public.aria_conversacion_registrar(p_empresa_id text, p_conversacion_id uuid, p_pregunta text, p_respuesta text, p_extra jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid; v_total integer; v_hasta integer; v_resumen_hasta integer; v_titulo text; v_resumen text; v_tarea jsonb := NULL;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sesión no autenticada'; END IF;
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN RAISE EXCEPTION 'Empresa no autorizada'; END IF;
  SELECT id INTO v_id FROM public.aria_conversaciones
   WHERE id = p_conversacion_id AND user_id = auth.uid() AND empresa_id = p_empresa_id FOR UPDATE;
  IF v_id IS NULL THEN
    INSERT INTO public.aria_conversaciones (empresa_id) VALUES (p_empresa_id) RETURNING id INTO v_id;
  END IF;
  UPDATE public.aria_conversaciones
     SET mensajes = mensajes + 2, actualizado_en = now(),
         borrador_pendiente = coalesce(p_extra ? 'borrador', false)
   WHERE id = v_id
   RETURNING mensajes, resumen_hasta, titulo, resumen INTO v_total, v_resumen_hasta, v_titulo, v_resumen;
  INSERT INTO public.aria_mensajes (conversacion_id, orden, rol, contenido, extra) VALUES
    (v_id, v_total - 1, 'user', left(coalesce(p_pregunta, ''), 2000), '{}'::jsonb),
    (v_id, v_total, 'assistant', left(coalesce(p_respuesta, ''), 8000), coalesce(p_extra, '{}'::jsonb));
  v_hasta := greatest(v_resumen_hasta, v_total - 20);
  -- Título y resumen desde el primer turno y cada 6 mensajes (la lista y la herramienta de recuerdos los usan);
  -- además, cuando 10+ mensajes salen de la ventana de los últimos 20.
  IF v_titulo IS NULL OR v_resumen IS NULL OR v_total % 6 = 0 OR v_hasta - v_resumen_hasta >= 10 THEN
    v_tarea := jsonb_build_object(
      'falta_titulo', v_titulo IS NULL, 'resumen_previo', v_resumen, 'hasta', v_hasta,
      'por_resumir', coalesce((SELECT jsonb_agg(jsonb_build_object('rol', m.rol, 'contenido', left(m.contenido, 1500)) ORDER BY m.orden)
                               FROM public.aria_mensajes m WHERE m.conversacion_id = v_id AND m.orden > v_resumen_hasta AND m.orden <= v_hasta), '[]'::jsonb),
      'recientes', coalesce((SELECT jsonb_agg(jsonb_build_object('rol', m.rol, 'contenido', left(m.contenido, 800)) ORDER BY m.orden)
                             FROM (SELECT * FROM public.aria_mensajes WHERE conversacion_id = v_id ORDER BY orden DESC LIMIT 6) m), '[]'::jsonb));
  END IF;
  RETURN jsonb_build_object('conversacion_id', v_id, 'mensajes', v_total, 'tarea', v_tarea);
END; $function$;

-- Guarda el título y el resumen que calculó la Edge (solo avanza: nunca retrocede resumen_hasta).
CREATE OR REPLACE FUNCTION public.aria_conversacion_guardar_resumen(p_conversacion_id uuid, p_titulo text, p_resumen text, p_hasta integer)
 RETURNS boolean LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.aria_conversaciones
     SET titulo = coalesce(nullif(left(trim(p_titulo), 80), ''), titulo),
         resumen = coalesce(nullif(left(trim(p_resumen), 3000), ''), resumen),
         resumen_hasta = greatest(resumen_hasta, least(coalesce(p_hasta, 0), mensajes))
   WHERE id = p_conversacion_id AND user_id = auth.uid();
  RETURN FOUND;
END; $function$;

DO $$
BEGIN
  IF position('v_total % 6 = 0' IN pg_get_functiondef('public.aria_conversacion_registrar(text,uuid,text,text,jsonb)'::regprocedure)) = 0 THEN RAISE EXCEPTION '682: el registro no quedó con el nuevo ritmo de resumen'; END IF;
  IF position('CASE WHEN p_hasta' IN pg_get_functiondef('public.aria_conversacion_guardar_resumen(uuid,text,text,integer)'::regprocedure)) > 0 THEN RAISE EXCEPTION '682: guardar_resumen sigue condicionado'; END IF;
END $$;
