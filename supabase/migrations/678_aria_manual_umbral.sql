-- 678: Umbral de la búsqueda amplia del manual de Aria. Si no coinciden todas las palabras, una ficha
-- solo cuenta cuando comparte al menos la mitad de las palabras importantes de la pregunta; si no hay
-- ninguna así, el manual responde "sin resultados" y la pregunta llega a soporte.
-- Parte de la versión vigente (677, verificada con pg_get_functiondef).

CREATE OR REPLACE FUNCTION public.asistente_consultar_manual(p_empresa_id text, p_texto text DEFAULT NULL::text, p_pantalla text DEFAULT NULL::text, p_limite integer DEFAULT 5)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_texto text := nullif(trim(left(coalesce(p_texto, ''), 300)), '');
  v_todas tsquery; v_cualquiera tsquery; v_q tsquery; v_terminos text[]; v_minimo integer := 1;
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
    -- En la búsqueda amplia una ficha debe coincidir con al menos la mitad de las palabras importantes;
    -- así "gemelo 3D del planner" no trae una ficha que solo menciona "planner".
    v_terminos := regexp_split_to_array(v_todas::text, ' & ');
    v_minimo := greatest(1, ceil(coalesce(array_length(v_terminos, 1), 1) / 2.0)::integer);
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
        AND (v_intento = 1 OR v_q IS NULL OR (SELECT count(*) FROM unnest(v_terminos) t WHERE d.doc @@ t::tsquery) >= v_minimo)
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

DO $$
DECLARE v_def text := pg_get_functiondef('public.asistente_consultar_manual(text,text,text,integer)'::regprocedure);
BEGIN
  IF position('v_minimo' IN v_def) = 0 THEN RAISE EXCEPTION '678: la búsqueda no quedó con umbral'; END IF;
  IF position('ninguna' IN v_def) = 0 THEN RAISE EXCEPTION '678: se perdió la visibilidad de fichas generales'; END IF;
END $$;
