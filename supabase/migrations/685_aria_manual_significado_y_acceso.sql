-- 685 · Aria experta, capa 3
-- 1) Búsqueda del manual por significado (embeddings de cada ficha).
-- 2) Pantallas en demostración: Aria lo dice en vez de inventar pasos o avisar a soporte.
-- 3) Diagnóstico de acceso: "¿por qué no puedo…?" según el permiso del rol y el estado de la pantalla.
-- Todo es aditivo: no cambia asistente_consultar_manual.

CREATE TABLE IF NOT EXISTS public.aria_manual_embeddings (
  ficha_clave text PRIMARY KEY,
  huella text NOT NULL,
  embedding extensions.vector(1536) NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.aria_manual_embeddings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.aria_manual_embeddings FROM anon, authenticated;

-- Texto de una ficha tal como se indexa: título, resumen y pasos.
CREATE OR REPLACE FUNCTION public.aria_manual_texto(p_clave text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT left(f.titulo || '. ' || f.resumen || ' ' || coalesce((SELECT string_agg(p.texto, ' ' ORDER BY p.orden) FROM public.asistente_manual_pasos p WHERE p.ficha_clave = f.clave), ''), 6000)
  FROM public.asistente_manual_fichas f WHERE f.clave = p_clave;
$$;

-- Fichas sin embedding vigente (la huella cambia cuando cambia el texto de la ficha).
CREATE OR REPLACE FUNCTION public.aria_manual_por_indexar(p_limite integer DEFAULT 60)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sesión no autenticada'; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object('clave', x.clave, 'huella', x.huella, 'texto', x.texto))
    FROM (
      SELECT f.clave, md5(public.aria_manual_texto(f.clave)) AS huella, public.aria_manual_texto(f.clave) AS texto
      FROM public.asistente_manual_fichas f
      LEFT JOIN public.aria_manual_embeddings e ON e.ficha_clave = f.clave
      WHERE e.ficha_clave IS NULL OR e.huella <> md5(public.aria_manual_texto(f.clave))
      ORDER BY f.clave
      LIMIT least(greatest(coalesce(p_limite, 60), 1), 100)
    ) x), '[]'::jsonb);
END; $$;

-- Guarda embeddings calculados por la Edge. Solo acepta la huella vigente de la ficha y no pisa un embedding vigente.
CREATE OR REPLACE FUNCTION public.aria_manual_indexar(p_items jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
DECLARE v_item jsonb; v_n integer := 0; v_clave text; v_huella text; v_filas integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sesión no autenticada'; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) > 100 THEN RAISE EXCEPTION 'Lote inválido'; END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_clave := v_item->>'clave'; v_huella := v_item->>'huella';
    CONTINUE WHEN v_clave IS NULL OR v_huella IS NULL OR v_item->>'embedding' IS NULL;
    CONTINUE WHEN md5(public.aria_manual_texto(v_clave)) IS DISTINCT FROM v_huella;
    INSERT INTO public.aria_manual_embeddings (ficha_clave, huella, embedding)
    VALUES (v_clave, v_huella, (v_item->>'embedding')::vector(1536))
    ON CONFLICT (ficha_clave) DO UPDATE SET huella = EXCLUDED.huella, embedding = EXCLUDED.embedding, creado_en = now()
      WHERE public.aria_manual_embeddings.huella <> EXCLUDED.huella;
    GET DIAGNOSTICS v_filas = ROW_COUNT; v_n := v_n + v_filas;
  END LOOP;
  DELETE FROM public.aria_manual_embeddings e WHERE NOT EXISTS (SELECT 1 FROM public.asistente_manual_fichas f WHERE f.clave = e.ficha_clave);
  RETURN v_n;
END; $$;

-- Amplía una consulta del manual que no encontró fichas (o las encontró por una sola palabra):
-- fichas por significado y pantallas del catálogo que aún son demostración.
CREATE OR REPLACE FUNCTION public.aria_manual_ampliar(p_empresa_id text, p_texto text DEFAULT NULL, p_pantalla text DEFAULT NULL, p_embedding text DEFAULT NULL, p_limite integer DEFAULT 3)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $$
DECLARE
  v_texto text := nullif(trim(left(coalesce(p_texto, ''), 300)), '');
  v_limit integer := least(greatest(coalesce(p_limite, 3), 1), 5);
  v_umbral constant numeric := 0.38;
  v_vec vector(1536);
  v_fichas jsonb := '[]'::jsonb; v_demo jsonb := '[]'::jsonb; v_steps jsonb; v_item jsonb; v_doc tsvector;
  r record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sesión no autenticada'; END IF;
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN RAISE EXCEPTION 'Empresa no autorizada'; END IF;
  IF p_embedding IS NOT NULL THEN
    BEGIN v_vec := p_embedding::vector(1536); EXCEPTION WHEN OTHERS THEN v_vec := NULL; END;
  END IF;
  IF v_vec IS NOT NULL THEN
    FOR r IN
      SELECT f.clave, f.tipo, f.titulo, f.resumen, round((1 - (e.embedding <=> v_vec))::numeric, 3) AS afinidad
      FROM public.aria_manual_embeddings e
      JOIN public.asistente_manual_fichas f ON f.clave = e.ficha_clave
      WHERE 1 - (e.embedding <=> v_vec) >= v_umbral
      ORDER BY e.embedding <=> v_vec
      LIMIT 12
    LOOP
      EXIT WHEN jsonb_array_length(v_fichas) >= v_limit;
      SELECT coalesce(jsonb_agg(jsonb_build_object('orden', p.orden, 'texto', p.texto) ORDER BY p.orden), '[]'::jsonb)
        INTO v_steps FROM public.asistente_manual_pasos p
       WHERE p.ficha_clave = r.clave
         AND (p.pantalla_key = 'ninguna' OR public.usuario_puede(p_empresa_id, p.pantalla_key, 'ver'))
         AND (p.permiso_accion IS NULL OR public.usuario_puede(p_empresa_id, coalesce(p.permiso_pantalla, p.pantalla_key), p.permiso_accion));
      CONTINUE WHEN jsonb_array_length(v_steps) = 0;
      v_item := jsonb_build_object('clave', r.clave, 'tipo', r.tipo, 'titulo', r.titulo, 'resumen', r.resumen, 'afinidad', r.afinidad, 'pasos', v_steps);
      EXIT WHEN octet_length((v_fichas || jsonb_build_array(v_item))::text) > 9000;
      v_fichas := v_fichas || jsonb_build_array(v_item);
    END LOOP;
  END IF;
  -- Pantallas en demostración: la que está abierta, o aquellas cuyo título completo aparece en la pregunta.
  IF v_texto IS NOT NULL THEN v_doc := to_tsvector('spanish'::regconfig, public.aria_sin_tildes(v_texto)); END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('titulo', x.titulo, 'modulo', x.modulo, 'aplicacion', x.app, 'estado', x.estado)), '[]'::jsonb) INTO v_demo
  FROM (
    SELECT c.titulo, c.modulo, c.app, c.estado
    FROM public.aria_catalogo_pantallas c
    WHERE c.estado IN ('maqueta', 'placeholder')
      AND (c.permiso IS NULL OR public.usuario_puede(p_empresa_id, c.permiso, 'ver'))
      AND (
        (p_pantalla IS NOT NULL AND (c.ruta = p_pantalla OR p_pantalla = ANY (c.alias)))
        OR (v_doc IS NOT NULL
            AND plainto_tsquery('spanish'::regconfig, public.aria_sin_tildes(c.titulo))::text <> ''
            AND v_doc @@ plainto_tsquery('spanish'::regconfig, public.aria_sin_tildes(c.titulo)))
      )
    ORDER BY (p_pantalla IS NOT NULL AND c.ruta = p_pantalla) DESC, length(c.titulo) DESC
    LIMIT 3
  ) x;
  RETURN jsonb_build_object('fichas', v_fichas, 'pantallas_demostracion', v_demo);
END; $$;

-- Diagnóstico de acceso: qué puede hacer la persona en una pantalla y por qué no puede lo demás.
CREATE OR REPLACE FUNCTION public.aria_diagnosticar_acceso(p_empresa_id text, p_pantalla text, p_accion text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_busca text := public.aria_sin_tildes(trim(left(coalesce(p_pantalla, ''), 100)));
  v_accion text := nullif(lower(trim(left(coalesce(p_accion, ''), 30))), '');
  v_rol text; v_admin boolean; v_pantallas jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sesión no autenticada'; END IF;
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN RAISE EXCEPTION 'Empresa no autorizada'; END IF;
  IF v_busca = '' THEN RETURN jsonb_build_object('respuesta', 'falta_pantalla'); END IF;
  IF v_accion IS NOT NULL AND v_accion NOT IN ('ver', 'crear', 'editar', 'anular', 'eliminar', 'aprobar', 'exportar') THEN v_accion := NULL; END IF;
  SELECT r.nombre, coalesce(r.es_admin_empresa, false) INTO v_rol, v_admin
    FROM public.usuarios_empresas ue JOIN public.roles r ON r.id = ue.rol_id
   WHERE ue.user_id = auth.uid() AND ue.empresa_id = p_empresa_id AND ue.estado = 'activo'
   ORDER BY coalesce(r.es_admin_empresa, false) DESC LIMIT 1;
  SELECT coalesce(jsonb_agg(to_jsonb(x) - 'orden'), '[]'::jsonb) INTO v_pantallas
  FROM (
    SELECT c.titulo, c.modulo, c.app AS aplicacion, c.estado,
      CASE WHEN c.permiso IS NULL THEN NULL ELSE jsonb_build_object(
        'ver', public.usuario_puede(p_empresa_id, c.permiso, 'ver'),
        'crear', public.usuario_puede(p_empresa_id, c.permiso, 'crear'),
        'editar', public.usuario_puede(p_empresa_id, c.permiso, 'editar'),
        'anular', public.usuario_puede(p_empresa_id, c.permiso, 'anular'),
        'aprobar', public.usuario_puede(p_empresa_id, c.permiso, 'aprobar'),
        'exportar', public.usuario_puede(p_empresa_id, c.permiso, 'exportar')) END AS puede,
      CASE WHEN v_accion IS NULL OR c.permiso IS NULL THEN NULL ELSE public.usuario_puede(p_empresa_id, c.permiso, v_accion) END AS accion_permitida,
      CASE WHEN c.permiso = v_busca OR c.ruta = v_busca THEN 0
           WHEN public.aria_sin_tildes(c.titulo) = v_busca THEN 1
           WHEN c.estado = 'activa' THEN 2 ELSE 3 END AS orden
    FROM public.aria_catalogo_pantallas c
    WHERE c.estado <> 'legado'
      AND (c.permiso = v_busca OR c.ruta = v_busca OR v_busca = ANY (c.alias)
        OR public.aria_sin_tildes(c.titulo) LIKE '%' || replace(replace(v_busca, '%', ''), '_', ' ') || '%'
        OR (plainto_tsquery('spanish'::regconfig, public.aria_sin_tildes(c.titulo))::text <> ''
            AND to_tsvector('spanish'::regconfig, v_busca) @@ plainto_tsquery('spanish'::regconfig, public.aria_sin_tildes(c.titulo))))
    ORDER BY orden, c.titulo
    LIMIT 4
  ) x;
  IF jsonb_array_length(v_pantallas) = 0 THEN RETURN jsonb_build_object('respuesta', 'pantalla_no_encontrada', 'rol', v_rol); END IF;
  RETURN jsonb_build_object(
    'respuesta', 'ok', 'rol', v_rol, 'es_administrador_empresa', coalesce(v_admin, false), 'accion', v_accion, 'pantallas', v_pantallas,
    'nota', 'Los permisos los cambia el administrador de la empresa en Roles y Permisos. Una pantalla en estado maqueta o placeholder es una demostración sin datos reales. Si la persona tiene el permiso y aun así no puede, la causa está en el registro (su estado o un dato obligatorio): consulta el manual.');
END; $$;

REVOKE ALL ON FUNCTION public.aria_manual_texto(text), public.aria_manual_por_indexar(integer), public.aria_manual_indexar(jsonb), public.aria_manual_ampliar(text, text, text, text, integer), public.aria_diagnosticar_acceso(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aria_manual_por_indexar(integer), public.aria_manual_indexar(jsonb), public.aria_manual_ampliar(text, text, text, text, integer), public.aria_diagnosticar_acceso(text, text, text) TO authenticated;

DO $$
BEGIN
  IF (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('aria_manual_texto', 'aria_manual_por_indexar', 'aria_manual_indexar', 'aria_manual_ampliar', 'aria_diagnosticar_acceso')) <> 5 THEN
    RAISE EXCEPTION '685: faltan funciones';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.aria_manual_embeddings'::regclass) THEN RAISE EXCEPTION '685: RLS apagado'; END IF;
  IF has_function_privilege('anon', 'public.aria_diagnosticar_acceso(text, text, text)', 'EXECUTE') THEN RAISE EXCEPTION '685: anon puede ejecutar'; END IF;
  IF (SELECT count(*) FROM public.asistente_manual_fichas f WHERE public.aria_manual_texto(f.clave) IS NULL) > 0 THEN RAISE EXCEPTION '685: ficha sin texto'; END IF;
END $$;
