-- 675: Modo consultor de Aria.
-- 1) Búsqueda del manual sin distinción de tildes, primero con todas las palabras y luego con cualquiera,
--    con más peso al título y al resumen; la pantalla activa ordena pero ya no oculta fichas de otras pantallas.
-- 2) Los pasos de fichas generales (pantalla "ninguna") los ve cualquier miembro de la empresa.
-- 3) Registro de preguntas que el manual no responde y resumen diario por correo a contacto@tideo.tech
--    (y campana a los administradores de plataforma) para documentarlas.
-- Aditiva salvo el CREATE OR REPLACE de asistente_consultar_manual, que parte de la versión vigente (617).

CREATE OR REPLACE FUNCTION public.aria_sin_tildes(p_texto text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public'
AS $function$ SELECT lower(public.unaccent('public.unaccent'::regdictionary, coalesce(p_texto, ''))) $function$;

-- Texto de búsqueda: sin tildes y sin los verbos de pregunta que no describen el tema ("cómo hago…", "dónde puedo…").
CREATE OR REPLACE FUNCTION public.aria_texto_busqueda(p_texto text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public'
AS $function$ SELECT regexp_replace(public.aria_sin_tildes(p_texto),
  '\m(hago|hacer|hace|hacemos|puedo|puede|puedes|podemos|debo|debe|tengo|tiene|quiero|necesito|saber|funciona|sirve|usar|uso|utilizo|opera|erp|sistema|pantalla|modulo)\M', ' ', 'g') $function$;

CREATE OR REPLACE FUNCTION public.asistente_consultar_manual(p_empresa_id text, p_texto text DEFAULT NULL::text, p_pantalla text DEFAULT NULL::text, p_limite integer DEFAULT 5)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_texto text := nullif(trim(left(coalesce(p_texto, ''), 300)), '');
  v_todas tsquery; v_cualquiera tsquery; v_q tsquery;
  v_fichas jsonb := '[]'::jsonb; v_item jsonb; v_steps jsonb;
  v_truncado boolean := false; v_count integer := 0; v_limit integer := least(greatest(coalesce(p_limite, 5), 1), 10);
  v_busqueda text := 'pantalla';
  r record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sesión no autenticada'; END IF;
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN RAISE EXCEPTION 'Empresa no autorizada'; END IF;
  PERFORM set_config('aria.manual_empresa_id', p_empresa_id, true);
  IF v_texto IS NOT NULL THEN
    v_todas := plainto_tsquery('spanish'::regconfig, public.aria_texto_busqueda(v_texto));
    v_cualquiera := nullif(replace(v_todas::text, ' & ', ' | '), '')::tsquery;
    IF v_todas::text = '' THEN v_texto := NULL; END IF;
  END IF;
  -- Intento 1: todas las palabras importantes. Intento 2 (solo si el 1 no dejó fichas visibles): cualquiera.
  FOR v_intento IN 1..2 LOOP
    IF v_intento = 2 AND (v_texto IS NULL OR jsonb_array_length(v_fichas) > 0 OR v_cualquiera::text = v_todas::text) THEN EXIT; END IF;
    v_q := CASE WHEN v_texto IS NULL THEN NULL WHEN v_intento = 1 THEN v_todas ELSE v_cualquiera END;
    v_busqueda := CASE WHEN v_texto IS NULL THEN 'pantalla' WHEN v_intento = 1 THEN 'todas_las_palabras' ELSE 'alguna_palabra' END;
    v_count := 0; v_truncado := false;
    FOR r IN
      WITH docs AS (
        SELECT f.clave, f.tipo, f.pantalla_key, f.titulo, f.resumen,
          setweight(to_tsvector('spanish'::regconfig, public.aria_sin_tildes(f.titulo)), 'A')
          || setweight(to_tsvector('spanish'::regconfig, public.aria_sin_tildes(f.resumen)), 'B')
          || setweight(to_tsvector('spanish'::regconfig, public.aria_sin_tildes((SELECT string_agg(p.texto, ' ') FROM public.asistente_manual_pasos p WHERE p.ficha_clave = f.clave))), 'C') AS doc,
          (p_pantalla IS NOT NULL AND (f.pantalla_key = p_pantalla OR EXISTS (SELECT 1 FROM public.asistente_manual_pasos px WHERE px.ficha_clave = f.clave AND px.pantalla_key = p_pantalla))) AS de_pantalla
        FROM public.asistente_manual_fichas f
      )
      SELECT d.clave, d.tipo, d.titulo, d.resumen,
        CASE WHEN v_q IS NULL THEN 0 ELSE ts_rank(d.doc, v_q) END + CASE WHEN d.de_pantalla THEN 0.5 ELSE 0 END AS relevancia
      FROM docs d
      WHERE CASE WHEN v_q IS NULL THEN d.de_pantalla ELSE d.doc @@ v_q END
      ORDER BY relevancia DESC, d.clave
      LIMIT 20
    LOOP
      IF v_count >= v_limit THEN v_truncado := true; EXIT; END IF;
      SELECT coalesce(jsonb_agg(jsonb_build_object('orden', p.orden, 'texto', p.texto) ORDER BY p.orden), '[]'::jsonb)
        INTO v_steps FROM public.asistente_manual_pasos p
       WHERE p.ficha_clave = r.clave
         AND (v_texto IS NOT NULL OR p_pantalla IS NULL OR p.pantalla_key = p_pantalla)
         AND (p.pantalla_key = 'ninguna' OR public.usuario_puede(p_empresa_id, p.pantalla_key, 'ver'))
         AND (p.permiso_accion IS NULL OR public.usuario_puede(p_empresa_id, coalesce(p.permiso_pantalla, p.pantalla_key), p.permiso_accion));
      IF jsonb_array_length(v_steps) = 0 THEN CONTINUE; END IF;
      v_item := jsonb_build_object('clave', r.clave, 'tipo', r.tipo, 'titulo', r.titulo, 'resumen', r.resumen, 'pasos', v_steps);
      IF octet_length((jsonb_build_object('respuesta', 'ok', 'fichas', v_fichas || jsonb_build_array(v_item), 'truncado', v_truncado))::text) > 9800 THEN
        v_truncado := true; EXIT;
      END IF;
      v_fichas := v_fichas || jsonb_build_array(v_item); v_count := v_count + 1;
    END LOOP;
  END LOOP;
  IF jsonb_array_length(v_fichas) = 0 THEN RETURN jsonb_build_object('respuesta', 'sin resultados', 'fichas', '[]'::jsonb, 'truncado', false); END IF;
  RETURN jsonb_build_object('respuesta', 'ok', 'busqueda', v_busqueda, 'fichas', v_fichas, 'truncado', v_truncado);
END; $function$;

-- Preguntas que el manual no respondió (una fila por empresa + pantalla + pregunta mientras no se notifique).
CREATE TABLE IF NOT EXISTS public.aria_manual_sin_respuesta (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id text NOT NULL,
  user_id uuid NOT NULL,
  pantalla text NOT NULL DEFAULT '',
  pregunta text NOT NULL,
  busqueda text,
  pregunta_clave text NOT NULL,
  veces integer NOT NULL DEFAULT 1,
  primera_vez timestamptz NOT NULL DEFAULT now(),
  ultima_vez timestamptz NOT NULL DEFAULT now(),
  notificado_en timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS aria_manual_sin_respuesta_pendiente_uidx
  ON public.aria_manual_sin_respuesta (empresa_id, pantalla, pregunta_clave) WHERE notificado_en IS NULL;
CREATE INDEX IF NOT EXISTS aria_manual_sin_respuesta_usuario_idx ON public.aria_manual_sin_respuesta (user_id, ultima_vez DESC);
ALTER TABLE public.aria_manual_sin_respuesta ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_manual_sin_respuesta_select_plataforma ON public.aria_manual_sin_respuesta;
CREATE POLICY aria_manual_sin_respuesta_select_plataforma ON public.aria_manual_sin_respuesta
  FOR SELECT TO authenticated USING (public.usuario_es_admin_plataforma());
REVOKE ALL ON public.aria_manual_sin_respuesta FROM anon;
GRANT SELECT ON public.aria_manual_sin_respuesta TO authenticated;

-- La llama la Edge de Aria cuando el manual no responde. Máximo 40 preguntas nuevas por usuario al día.
CREATE OR REPLACE FUNCTION public.aria_registrar_sin_respuesta(p_empresa_id text, p_pregunta text, p_pantalla text DEFAULT NULL, p_busqueda text DEFAULT NULL)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_pregunta text := nullif(trim(left(coalesce(p_pregunta, ''), 1000)), '');
  v_pantalla text := coalesce(nullif(trim(left(coalesce(p_pantalla, ''), 100)), ''), '');
  v_clave text;
BEGIN
  IF v_uid IS NULL OR v_pregunta IS NULL THEN RETURN false; END IF;
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN RETURN false; END IF;
  v_clave := left(regexp_replace(public.aria_sin_tildes(v_pregunta), '[^a-z0-9ñ ]+', ' ', 'g'), 300);
  v_clave := trim(regexp_replace(v_clave, '\s+', ' ', 'g'));
  UPDATE public.aria_manual_sin_respuesta
     SET veces = veces + 1, ultima_vez = now(), user_id = v_uid, busqueda = coalesce(left(p_busqueda, 300), busqueda)
   WHERE empresa_id = p_empresa_id AND pantalla = v_pantalla AND pregunta_clave = v_clave AND notificado_en IS NULL;
  IF FOUND THEN RETURN true; END IF;
  IF (SELECT count(*) FROM public.aria_manual_sin_respuesta t
       WHERE t.user_id = v_uid AND t.primera_vez >= now() - interval '1 day') >= 40 THEN RETURN false; END IF;
  INSERT INTO public.aria_manual_sin_respuesta (empresa_id, user_id, pantalla, pregunta, busqueda, pregunta_clave)
  VALUES (p_empresa_id, v_uid, v_pantalla, v_pregunta, left(p_busqueda, 300), v_clave)
  ON CONFLICT (empresa_id, pantalla, pregunta_clave) WHERE notificado_en IS NULL
  DO UPDATE SET veces = aria_manual_sin_respuesta.veces + 1, ultima_vez = now();
  RETURN true;
END; $function$;
REVOKE ALL ON FUNCTION public.aria_registrar_sin_respuesta(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aria_registrar_sin_respuesta(text, text, text, text) TO authenticated;

INSERT INTO public.notif_eventos_catalogo
  (codigo, modulo, nombre, descripcion, legado, canales_soportados, roles_soportados, parametros_default, destinatarios_default, orden)
VALUES
  ('aria_manual_sin_respuesta', 'plataforma', 'Preguntas a Aria sin respuesta en el manual',
   'Resumen diario para soporte de OPERA con las preguntas que el manual de Aria no pudo responder, para documentarlas.',
   true, array['campana', 'correo'], array['admin_plataforma'],
   '{}'::jsonb, '{"admin_plataforma": {"campana": true, "correo": true}}'::jsonb, 910)
ON CONFLICT (codigo) DO NOTHING;

-- Resumen diario: un correo a contacto@tideo.tech con todo el contexto y un aviso en la campana de los
-- administradores de plataforma. Marca las filas como notificadas.
CREATE OR REPLACE FUNCTION public.aria_enviar_resumen_sin_respuesta(p_correo text DEFAULT 'contacto@tideo.tech')
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_empresa text := (SELECT id FROM public.empresas WHERE es_plataforma ORDER BY id LIMIT 1);
  v_fecha date := (now() AT TIME ZONE 'America/Lima')::date;
  v_ids bigint[];
  v_items jsonb;
  v_total integer;
  v_texto text;
  v_titulo text;
  a record;
BEGIN
  IF v_empresa IS NULL THEN RETURN 0; END IF;
  SELECT array_agg(id) INTO v_ids FROM (
    SELECT id FROM public.aria_manual_sin_respuesta WHERE notificado_en IS NULL ORDER BY ultima_vez LIMIT 200 FOR UPDATE SKIP LOCKED
  ) s;
  IF v_ids IS NULL THEN RETURN 0; END IF;
  SELECT jsonb_agg(jsonb_build_object(
           'empresa', coalesce(e.nombre_comercial, e.razon_social, t.empresa_id),
           'usuario', coalesce(nullif(u.nombre, ''), au.email, t.user_id::text),
           'correo_usuario', coalesce(au.email, u.email),
           'pantalla', coalesce(c.titulo, nullif(t.pantalla, ''), 'Sin pantalla'),
           'pregunta', t.pregunta,
           'busqueda', t.busqueda,
           'veces', t.veces,
           'ultima_vez', to_char(t.ultima_vez AT TIME ZONE 'America/Lima', 'DD/MM/YYYY HH24:MI'))
         ORDER BY coalesce(e.nombre_comercial, e.razon_social, t.empresa_id), t.pantalla, t.ultima_vez),
         sum(t.veces)
    INTO v_items, v_total
    FROM public.aria_manual_sin_respuesta t
    LEFT JOIN public.empresas e ON e.id = t.empresa_id
    LEFT JOIN public.usuarios u ON u.id = t.user_id::text
    LEFT JOIN auth.users au ON au.id = t.user_id
    LEFT JOIN LATERAL (SELECT ac.titulo FROM public.aria_catalogo_pantallas ac WHERE ac.permiso = t.pantalla ORDER BY ac.clave LIMIT 1) c ON true
   WHERE t.id = ANY (v_ids);
  v_titulo := format('Aria: %s %s sin respuesta en el manual', cardinality(v_ids), CASE WHEN cardinality(v_ids) = 1 THEN 'pregunta' ELSE 'preguntas' END);
  SELECT string_agg(format('- [%s] %s · %s · %s (%s %s, último %s): %s', i->>'empresa', i->>'pantalla', i->>'usuario', i->>'correo_usuario',
                           i->>'veces', CASE WHEN (i->>'veces')::int = 1 THEN 'vez' ELSE 'veces' END, i->>'ultima_vez', i->>'pregunta'), E'\n')
    INTO v_texto FROM jsonb_array_elements(v_items) i;
  v_texto := format(E'Aria no encontró respuesta en el manual para estas preguntas (%s consultas en total). Documéntalas en docs/manual-pantallas/.\n\n%s', v_total, v_texto);
  INSERT INTO public.notif_envios (empresa_id, evento_codigo, canal, rol_destinatario, destinatario_email, clave_dedupe,
                                   titulo, mensaje, payload, referencia_tipo, referencia_id, estado)
  VALUES (v_empresa, 'aria_manual_sin_respuesta', 'correo', 'soporte', p_correo, 'aria_sin_respuesta:' || v_fecha || ':' || v_ids[1],
          v_titulo, v_texto, jsonb_build_object('fecha', v_fecha, 'total', cardinality(v_ids), 'consultas', v_total, 'items', v_items),
          'aria_manual', v_fecha::text, 'pendiente');
  FOR a IN SELECT * FROM public.plataforma_admins() LOOP
    PERFORM public.notif_emitir(a.empresa_id, 'aria_manual_sin_respuesta', 'campana', 'admin_plataforma', a.user_id,
                                'aria_sin_respuesta:' || v_fecha || ':' || v_ids[1], v_titulo,
                                'Aria no encontró en el manual algunas preguntas de hoy. Revisa el correo enviado a ' || p_correo || ' para documentarlas.',
                                jsonb_build_object('fecha', v_fecha, 'total', cardinality(v_ids)), 'aria_manual', v_fecha::text, 'media');
  END LOOP;
  UPDATE public.aria_manual_sin_respuesta SET notificado_en = now() WHERE id = ANY (v_ids);
  RETURN cardinality(v_ids);
END; $function$;
REVOKE ALL ON FUNCTION public.aria_enviar_resumen_sin_respuesta(text) FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'aria-manual-sin-respuesta-diario') THEN
    PERFORM cron.unschedule('aria-manual-sin-respuesta-diario');
  END IF;
  PERFORM cron.schedule('aria-manual-sin-respuesta-diario', '47 12 * * *', 'select public.aria_enviar_resumen_sin_respuesta();');
END $$;

-- Comprobación: si algo no quedó como se espera, se revierte toda la migración.
DO $$
DECLARE v_puede boolean;
BEGIN
  IF public.aria_sin_tildes('Rendición ÁRBOL') <> 'rendicion arbol' THEN RAISE EXCEPTION '675: aria_sin_tildes no normaliza'; END IF;
  IF plainto_tsquery('spanish', public.aria_texto_busqueda('¿Cómo hago la rendición de caja chica?'))::text <> '''rendicion'' & ''caj'' & ''chic''' THEN RAISE EXCEPTION '675: aria_texto_busqueda no limpia la pregunta'; END IF;
  IF to_regclass('public.aria_manual_sin_respuesta') IS NULL THEN RAISE EXCEPTION '675: falta la tabla aria_manual_sin_respuesta'; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.aria_manual_sin_respuesta'::regclass) THEN RAISE EXCEPTION '675: RLS no está activo'; END IF;
  IF has_function_privilege('anon', 'public.aria_registrar_sin_respuesta(text,text,text,text)', 'EXECUTE') THEN RAISE EXCEPTION '675: anon no debe registrar'; END IF;
  IF has_function_privilege('authenticated', 'public.aria_enviar_resumen_sin_respuesta(text)', 'EXECUTE') THEN RAISE EXCEPTION '675: el resumen no debe ser invocable por usuarios'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.notif_eventos_catalogo WHERE codigo = 'aria_manual_sin_respuesta') THEN RAISE EXCEPTION '675: falta el evento de notificación'; END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'aria-manual-sin-respuesta-diario') THEN RAISE EXCEPTION '675: falta la tarea diaria'; END IF;
  IF to_regprocedure('public.asistente_consultar_manual(text,text,text,integer)') IS NULL THEN RAISE EXCEPTION '675: falta asistente_consultar_manual'; END IF;
END $$;
