-- 681: Memoria de conversación de Aria.
-- Cada conversación y sus mensajes se guardan tal como la persona los vio; la Edge asistente-erp carga los
-- últimos 20 mensajes más un resumen automático de lo anterior. Cada usuario ve solo sus conversaciones de
-- su empresa (RLS). Se borran a los 180 días sin actividad. Aditiva.

CREATE TABLE IF NOT EXISTS public.aria_conversaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  empresa_id text NOT NULL,
  titulo text,
  resumen text,
  resumen_hasta integer NOT NULL DEFAULT 0,
  mensajes integer NOT NULL DEFAULT 0,
  borrador_pendiente boolean NOT NULL DEFAULT false,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS aria_conversaciones_usuario_idx ON public.aria_conversaciones (user_id, empresa_id, actualizado_en DESC);

CREATE TABLE IF NOT EXISTS public.aria_mensajes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversacion_id uuid NOT NULL REFERENCES public.aria_conversaciones(id) ON DELETE CASCADE,
  orden integer NOT NULL,
  rol text NOT NULL CHECK (rol IN ('user', 'assistant')),
  contenido text NOT NULL,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversacion_id, orden)
);

ALTER TABLE public.aria_conversaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aria_mensajes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_conversaciones_propias ON public.aria_conversaciones;
CREATE POLICY aria_conversaciones_propias ON public.aria_conversaciones FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()) AND public.usuario_tiene_empresa(empresa_id))
  WITH CHECK (user_id = (SELECT auth.uid()) AND public.usuario_tiene_empresa(empresa_id));
DROP POLICY IF EXISTS aria_mensajes_propios ON public.aria_mensajes;
CREATE POLICY aria_mensajes_propios ON public.aria_mensajes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.aria_conversaciones c WHERE c.id = conversacion_id AND c.user_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.aria_conversaciones c WHERE c.id = conversacion_id AND c.user_id = (SELECT auth.uid())));
REVOKE ALL ON public.aria_conversaciones, public.aria_mensajes FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.aria_conversaciones, public.aria_mensajes TO authenticated;

-- Contexto para la Edge: resumen + últimos 20 mensajes + lo que dijo la persona (para la guarda de cifras).
CREATE OR REPLACE FUNCTION public.aria_conversacion_contexto(p_conversacion_id uuid)
 RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'conversacion_id', c.id, 'resumen', c.resumen,
    'mensajes', coalesce((SELECT jsonb_agg(jsonb_build_object('rol', m.rol, 'contenido', m.contenido) ORDER BY m.orden)
                          FROM (SELECT * FROM public.aria_mensajes WHERE conversacion_id = c.id ORDER BY orden DESC LIMIT 20) m), '[]'::jsonb),
    'dichos', coalesce((SELECT jsonb_agg(m.contenido ORDER BY m.orden)
                        FROM (SELECT * FROM public.aria_mensajes WHERE conversacion_id = c.id AND rol = 'user' ORDER BY orden DESC LIMIT 60) m), '[]'::jsonb))
  FROM public.aria_conversaciones c
  WHERE c.id = p_conversacion_id AND c.user_id = auth.uid();
$function$;

-- Guarda un turno (pregunta + respuesta). Crea la conversación si no existe o no es de la persona.
-- Devuelve la tarea de resumen cuando falta el título o hay 10+ mensajes nuevos fuera de los últimos 20.
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
  IF v_titulo IS NULL OR v_hasta - v_resumen_hasta >= 10 THEN
    v_tarea := jsonb_build_object(
      'falta_titulo', v_titulo IS NULL, 'resumen_previo', v_resumen, 'hasta', v_hasta,
      'por_resumir', coalesce((SELECT jsonb_agg(jsonb_build_object('rol', m.rol, 'contenido', left(m.contenido, 1500)) ORDER BY m.orden)
                               FROM public.aria_mensajes m WHERE m.conversacion_id = v_id AND m.orden > v_resumen_hasta AND m.orden <= v_hasta), '[]'::jsonb),
      'recientes', coalesce((SELECT jsonb_agg(jsonb_build_object('rol', m.rol, 'contenido', left(m.contenido, 800)) ORDER BY m.orden)
                             FROM (SELECT * FROM public.aria_mensajes WHERE conversacion_id = v_id ORDER BY orden DESC LIMIT 4) m), '[]'::jsonb));
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
         resumen = CASE WHEN p_hasta > resumen_hasta THEN coalesce(nullif(left(trim(p_resumen), 3000), ''), resumen) ELSE resumen END,
         resumen_hasta = greatest(resumen_hasta, least(coalesce(p_hasta, 0), mensajes))
   WHERE id = p_conversacion_id AND user_id = auth.uid();
  RETURN FOUND;
END; $function$;

-- Panel: abre una conversación con sus últimos 40 mensajes (incluye botones y borrador guardados en extra).
CREATE OR REPLACE FUNCTION public.aria_conversacion_abrir(p_conversacion_id uuid)
 RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'id', c.id, 'titulo', c.titulo, 'actualizado_en', c.actualizado_en, 'mensajes_total', c.mensajes,
    'mensajes', coalesce((SELECT jsonb_agg(jsonb_build_object('rol', m.rol, 'contenido', m.contenido, 'extra', m.extra, 'creado_en', m.creado_en) ORDER BY m.orden)
                          FROM (SELECT * FROM public.aria_mensajes WHERE conversacion_id = c.id ORDER BY orden DESC LIMIT 40) m), '[]'::jsonb))
  FROM public.aria_conversaciones c
  WHERE c.id = p_conversacion_id AND c.user_id = auth.uid();
$function$;

-- Panel: conversación de las últimas 24 horas para retomarla al abrir Aria (con sus últimos 40 mensajes).
CREATE OR REPLACE FUNCTION public.aria_conversacion_actual(p_empresa_id text)
 RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  SELECT public.aria_conversacion_abrir(c.id)
  FROM public.aria_conversaciones c
  WHERE c.user_id = auth.uid() AND c.empresa_id = p_empresa_id AND c.actualizado_en > now() - interval '24 hours'
  ORDER BY c.actualizado_en DESC LIMIT 1;
$function$;

-- Panel: lista de conversaciones con buscador (título, resumen o mensajes; sin distinguir tildes).
CREATE OR REPLACE FUNCTION public.aria_conversaciones_listar(p_empresa_id text, p_texto text DEFAULT NULL, p_limite integer DEFAULT 30)
 RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  WITH q AS (SELECT nullif(trim(left(coalesce(p_texto, ''), 100)), '') AS t),
  base AS (
    SELECT c.*, (SELECT left(m.contenido, 160) FROM public.aria_mensajes m, q
                  WHERE q.t IS NOT NULL AND m.conversacion_id = c.id AND public.aria_sin_tildes(m.contenido) LIKE '%' || public.aria_sin_tildes(q.t) || '%'
                  ORDER BY m.orden DESC LIMIT 1) AS fragmento
    FROM public.aria_conversaciones c, q
    WHERE c.user_id = auth.uid() AND c.empresa_id = p_empresa_id AND c.mensajes > 0
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

-- Herramienta de Aria: "¿qué revisamos la semana pasada sobre…?" Solo conversaciones de la persona.
CREATE OR REPLACE FUNCTION public.aria_buscar_conversaciones(p_empresa_id text, p_texto text DEFAULT NULL, p_limite integer DEFAULT 5)
 RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object('conversaciones', coalesce((
    SELECT jsonb_agg(jsonb_build_object('titulo', x->>'titulo', 'resumen', x->>'resumen', 'fragmento', x->>'fragmento',
                                        'fecha', to_char((x->>'actualizado_en')::timestamptz AT TIME ZONE 'America/Lima', 'DD/MM/YYYY HH24:MI')))
    FROM jsonb_array_elements(public.aria_conversaciones_listar(p_empresa_id, p_texto, least(greatest(coalesce(p_limite, 5), 1), 10))) x), '[]'::jsonb),
    'nota', 'Son recuerdos de conversaciones anteriores; las cifras pueden haber cambiado y se vuelven a consultar con las herramientas de datos.');
$function$;

REVOKE ALL ON FUNCTION public.aria_conversacion_contexto(uuid), public.aria_conversacion_registrar(text, uuid, text, text, jsonb),
  public.aria_conversacion_guardar_resumen(uuid, text, text, integer), public.aria_conversacion_actual(text),
  public.aria_conversacion_abrir(uuid), public.aria_conversaciones_listar(text, text, integer), public.aria_buscar_conversaciones(text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aria_conversacion_contexto(uuid), public.aria_conversacion_registrar(text, uuid, text, text, jsonb),
  public.aria_conversacion_guardar_resumen(uuid, text, text, integer), public.aria_conversacion_actual(text),
  public.aria_conversacion_abrir(uuid), public.aria_conversaciones_listar(text, text, integer), public.aria_buscar_conversaciones(text, text, integer) TO authenticated;

-- Retención: conversaciones sin actividad por 180 días se borran (con sus mensajes) cada madrugada.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'aria-conversaciones-retencion') THEN PERFORM cron.unschedule('aria-conversaciones-retencion'); END IF;
  PERFORM cron.schedule('aria-conversaciones-retencion', '23 8 * * *', $job$DELETE FROM public.aria_conversaciones WHERE actualizado_en < now() - interval '180 days'$job$);
END $$;

-- Comprobación: si algo no quedó como se espera, se revierte toda la migración.
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.aria_conversaciones'::regclass) THEN RAISE EXCEPTION '681: RLS de conversaciones inactivo'; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.aria_mensajes'::regclass) THEN RAISE EXCEPTION '681: RLS de mensajes inactivo'; END IF;
  IF has_function_privilege('anon', 'public.aria_conversacion_registrar(text,uuid,text,text,jsonb)', 'EXECUTE') THEN RAISE EXCEPTION '681: anon no debe registrar'; END IF;
  IF has_table_privilege('anon', 'public.aria_mensajes', 'SELECT') THEN RAISE EXCEPTION '681: anon no debe leer mensajes'; END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'aria-conversaciones-retencion') THEN RAISE EXCEPTION '681: falta la retención'; END IF;
END $$;
