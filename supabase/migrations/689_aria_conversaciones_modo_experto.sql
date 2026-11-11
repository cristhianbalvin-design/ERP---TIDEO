-- 689 · Chat de Aria experta: cada conversación tiene un modo (normal o experto) y cada chat retoma y lista solo las suyas.
-- aria_conversacion_registrar, aria_conversacion_actual y aria_conversaciones_listar parten de su definición vigente (pg_get_functiondef):
-- registrar fija el modo al crear la conversación; actual y listar delegan en las variantes *_modo con modo normal.

ALTER TABLE public.aria_conversaciones ADD COLUMN IF NOT EXISTS modo text NOT NULL DEFAULT 'normal';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'aria_conversaciones_modo_check') THEN
    ALTER TABLE public.aria_conversaciones ADD CONSTRAINT aria_conversaciones_modo_check CHECK (modo IN ('normal', 'experto'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.aria_conversacion_registrar(p_empresa_id text, p_conversacion_id uuid, p_pregunta text, p_respuesta text, p_extra jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid; v_total integer; v_hasta integer; v_resumen_hasta integer; v_titulo text; v_resumen text; v_tarea jsonb := NULL;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sesión no autenticada'; END IF;
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN RAISE EXCEPTION 'Empresa no autorizada'; END IF;
  SELECT id INTO v_id FROM public.aria_conversaciones
   WHERE id = p_conversacion_id AND user_id = auth.uid() AND empresa_id = p_empresa_id FOR UPDATE;
  IF v_id IS NULL THEN
    -- El modo se fija al crear la conversación: el chat de Aria experta guarda las suyas aparte.
    INSERT INTO public.aria_conversaciones (empresa_id, modo)
    VALUES (p_empresa_id, CASE WHEN p_extra->>'modo' = 'experto' THEN 'experto' ELSE 'normal' END) RETURNING id INTO v_id;
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

-- Conversación de las últimas 24 horas de un modo (normal o experto).
CREATE OR REPLACE FUNCTION public.aria_conversacion_actual_modo(p_empresa_id text, p_modo text DEFAULT 'normal')
 RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  SELECT public.aria_conversacion_abrir(c.id)
  FROM public.aria_conversaciones c
  WHERE c.user_id = auth.uid() AND c.empresa_id = p_empresa_id AND c.actualizado_en > now() - interval '24 hours'
    AND c.modo = CASE WHEN p_modo = 'experto' THEN 'experto' ELSE 'normal' END
  ORDER BY c.actualizado_en DESC LIMIT 1;
$function$;

-- El chat normal (y los paneles anteriores) solo retoma conversaciones normales.
CREATE OR REPLACE FUNCTION public.aria_conversacion_actual(p_empresa_id text)
 RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  SELECT public.aria_conversacion_actual_modo(p_empresa_id, 'normal');
$function$;

CREATE OR REPLACE FUNCTION public.aria_conversaciones_listar_modo(p_empresa_id text, p_modo text DEFAULT 'normal', p_texto text DEFAULT NULL::text, p_limite integer DEFAULT 30)
 RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  WITH q AS (SELECT nullif(trim(left(coalesce(p_texto, ''), 100)), '') AS t),
  base AS (
    SELECT c.*, (SELECT left(m.contenido, 160) FROM public.aria_mensajes m, q
                  WHERE q.t IS NOT NULL AND m.conversacion_id = c.id AND public.aria_sin_tildes(m.contenido) LIKE '%' || public.aria_sin_tildes(q.t) || '%'
                  ORDER BY m.orden DESC LIMIT 1) AS fragmento
    FROM public.aria_conversaciones c, q
    WHERE c.user_id = auth.uid() AND c.empresa_id = p_empresa_id AND c.mensajes > 0
      AND c.modo = CASE WHEN p_modo = 'experto' THEN 'experto' ELSE 'normal' END
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', b.id, 'titulo', coalesce(b.titulo, 'Conversación sin título'), 'resumen', b.resumen, 'fragmento', b.fragmento,
           'mensajes', b.mensajes, 'borrador_pendiente', b.borrador_pendiente, 'actualizado_en', b.actualizado_en)
         ORDER BY b.actualizado_en DESC), '[]'::jsonb)
  FROM (SELECT b.* FROM base b, q
        WHERE q.t IS NULL OR b.fragmento IS NOT NULL
           OR public.aria_sin_tildes(coalesce(b.titulo, '') || ' ' || coalesce(b.resumen, '')) LIKE '%' || public.aria_sin_tildes(q.t) || '%'
        ORDER BY b.actualizado_en DESC LIMIT least(greatest(coalesce(p_limite, 30), 1), 60)) b;
$function$;

CREATE OR REPLACE FUNCTION public.aria_conversaciones_listar(p_empresa_id text, p_texto text DEFAULT NULL::text, p_limite integer DEFAULT 30)
 RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  SELECT public.aria_conversaciones_listar_modo(p_empresa_id, 'normal', p_texto, p_limite);
$function$;

REVOKE ALL ON FUNCTION public.aria_conversacion_actual_modo(text, text), public.aria_conversaciones_listar_modo(text, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aria_conversacion_actual_modo(text, text), public.aria_conversaciones_listar_modo(text, text, text, integer) TO authenticated;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='aria_conversaciones' AND column_name='modo') THEN RAISE EXCEPTION '689: falta la columna modo'; END IF;
  IF (SELECT count(*) FROM public.aria_conversaciones WHERE modo <> 'normal') > 0 THEN RAISE EXCEPTION '689: conversaciones previas con modo inesperado'; END IF;
  IF has_function_privilege('anon', 'public.aria_conversacion_actual_modo(text, text)', 'EXECUTE') THEN RAISE EXCEPTION '689: anon puede ejecutar'; END IF;
  IF position('p_extra->>''modo''' in pg_get_functiondef('public.aria_conversacion_registrar(text, uuid, text, text, jsonb)'::regprocedure)) = 0 THEN RAISE EXCEPTION '689: registrar no fija el modo'; END IF;
END $$;
