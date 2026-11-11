-- 686 · Aria indica la ruta exacta de cada ficha del manual (Aplicación › Módulo › Pantalla)
-- y entrega el destino para el botón "Ir a…" del chat. Aditiva.

CREATE OR REPLACE FUNCTION public.aria_manual_rutas(p_empresa_id text, p_claves text[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_res jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sesión no autenticada'; END IF;
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN RAISE EXCEPTION 'Empresa no autorizada'; END IF;
  IF p_claves IS NULL OR coalesce(array_length(p_claves, 1), 0) = 0 OR array_length(p_claves, 1) > 10 THEN RETURN '{}'::jsonb; END IF;
  WITH visibles AS (
    SELECT c.clave, c.app, c.modulo, c.titulo, c.ruta, c.permiso, c.tipo,
      CASE c.app WHEN 'admin' THEN 'Administración' ELSE 'Operaciones' END AS aplicacion
    FROM public.aria_catalogo_pantallas c
    WHERE c.estado = 'activa' AND c.app IN ('admin', 'operaciones')
      AND (c.permiso IS NULL OR public.usuario_puede(p_empresa_id, c.permiso, 'ver'))
  ),
  de_pantalla AS (
    -- Ficha de pantalla: las pantallas del catálogo que la ficha documenta.
    SELECT f.clave AS ficha, v.aplicacion, v.app, v.modulo, v.titulo, v.ruta,
      row_number() OVER (PARTITION BY f.clave ORDER BY (v.tipo = 'menu') DESC, v.titulo) AS orden
    FROM public.asistente_manual_fichas f
    JOIN public.aria_cobertura cob ON f.clave = ANY (cob.fichas)
    JOIN visibles v ON v.clave = cob.clave
    WHERE f.clave = ANY (p_claves) AND f.tipo = 'pantalla'
  ),
  pasos AS (
    SELECT p.ficha_clave AS ficha, p.pantalla_key, min(p.orden) AS orden
    FROM public.asistente_manual_pasos p
    JOIN public.asistente_manual_fichas f ON f.clave = p.ficha_clave
    WHERE f.clave = ANY (p_claves) AND f.tipo <> 'pantalla' AND p.pantalla_key <> 'ninguna'
    GROUP BY 1, 2
  ),
  de_proceso AS (
    -- Ficha de proceso: la pantalla principal de cada paso, en el orden del proceso.
    SELECT s.ficha, x.aplicacion, x.app, x.modulo, x.titulo, x.ruta, s.orden
    FROM pasos s
    CROSS JOIN LATERAL (
      SELECT v.* FROM visibles v WHERE v.permiso = s.pantalla_key
      ORDER BY (v.ruta = s.pantalla_key) DESC, (v.tipo = 'menu') DESC, (v.app = 'admin') DESC, v.titulo
      LIMIT 1
    ) x
  ),
  todas AS (
    SELECT * FROM de_pantalla WHERE orden <= 2
    UNION ALL
    SELECT * FROM de_proceso
  )
  SELECT coalesce(jsonb_object_agg(t.ficha, t.pantallas), '{}'::jsonb) INTO v_res
  FROM (
    SELECT ficha, jsonb_agg(jsonb_build_object('app', app, 'ruta', ruta, 'titulo', titulo, 'donde', aplicacion || ' › ' || modulo || ' › ' || titulo) ORDER BY orden) AS pantallas
    FROM todas GROUP BY ficha
  ) t;
  RETURN v_res;
END; $$;

REVOKE ALL ON FUNCTION public.aria_manual_rutas(text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aria_manual_rutas(text, text[]) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'aria_manual_rutas') THEN RAISE EXCEPTION '686: falta aria_manual_rutas'; END IF;
  IF has_function_privilege('anon', 'public.aria_manual_rutas(text, text[])', 'EXECUTE') THEN RAISE EXCEPTION '686: anon puede ejecutar'; END IF;
END $$;
