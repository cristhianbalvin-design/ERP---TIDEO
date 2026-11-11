-- 683: Memoria de largo plazo de Aria ("Lo que Aria recuerda de ti").
-- Recuerdos por persona y empresa: los que la persona pide ("recuerda que…") y los que Aria aprende sola.
-- Cada quien ve y borra solo los suyos (RLS). Nunca se guardan montos ni saldos: esos siempre se consultan.
-- Búsqueda por afinidad con pgvector (embeddings de 1536 dimensiones); sin embedding, por palabras. Aditiva.

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.aria_recuerdos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  empresa_id text NOT NULL,
  texto text NOT NULL CHECK (length(texto) BETWEEN 8 AND 300),
  tipo text NOT NULL DEFAULT 'explicito' CHECK (tipo IN ('explicito', 'automatico')),
  conversacion_id uuid REFERENCES public.aria_conversaciones(id) ON DELETE SET NULL,
  embedding extensions.vector(1536),
  avisado boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS aria_recuerdos_usuario_idx ON public.aria_recuerdos (user_id, empresa_id, actualizado_en DESC);

CREATE TABLE IF NOT EXISTS public.aria_memoria_ajustes (
  user_id uuid NOT NULL DEFAULT auth.uid(),
  empresa_id text NOT NULL,
  pausada boolean NOT NULL DEFAULT false,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, empresa_id)
);

ALTER TABLE public.aria_recuerdos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aria_memoria_ajustes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aria_recuerdos_propios ON public.aria_recuerdos;
CREATE POLICY aria_recuerdos_propios ON public.aria_recuerdos FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()) AND public.usuario_tiene_empresa(empresa_id))
  WITH CHECK (user_id = (SELECT auth.uid()) AND public.usuario_tiene_empresa(empresa_id));
DROP POLICY IF EXISTS aria_memoria_ajustes_propios ON public.aria_memoria_ajustes;
CREATE POLICY aria_memoria_ajustes_propios ON public.aria_memoria_ajustes FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()) AND public.usuario_tiene_empresa(empresa_id))
  WITH CHECK (user_id = (SELECT auth.uid()) AND public.usuario_tiene_empresa(empresa_id));
REVOKE ALL ON public.aria_recuerdos, public.aria_memoria_ajustes FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.aria_recuerdos, public.aria_memoria_ajustes TO authenticated;

-- Guarda un recuerdo. No guarda montos, respeta la pausa y el tope de 100, y no duplica:
-- si ya hay uno igual o casi idéntico, el explícito lo actualiza y el automático lo deja como está.
CREATE OR REPLACE FUNCTION public.aria_recuerdo_guardar(p_empresa_id text, p_texto text, p_tipo text DEFAULT 'explicito', p_conversacion_id uuid DEFAULT NULL, p_embedding text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_texto text := left(regexp_replace(trim(coalesce(p_texto, '')), '\s+', ' ', 'g'), 300);
  v_tipo text := CASE WHEN p_tipo = 'automatico' THEN 'automatico' ELSE 'explicito' END;
  v_vec extensions.vector(1536); v_id uuid; v_conv uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sesión no autenticada'; END IF;
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN RAISE EXCEPTION 'Empresa no autorizada'; END IF;
  IF EXISTS (SELECT 1 FROM public.aria_memoria_ajustes WHERE user_id = auth.uid() AND empresa_id = p_empresa_id AND pausada) THEN
    RETURN jsonb_build_object('estado', 'pausada');
  END IF;
  IF length(v_texto) < 8 THEN RETURN jsonb_build_object('estado', 'rechazado', 'motivo', 'texto_corto'); END IF;
  IF v_texto ~* '(s/\.?\s*\d|us\$|\$\s*\d|\d\s*(soles|sol|d[oó]lares|usd|pen)\M)' THEN
    RETURN jsonb_build_object('estado', 'rechazado', 'motivo', 'cifras');
  END IF;
  IF p_embedding IS NOT NULL THEN
    BEGIN v_vec := p_embedding::extensions.vector(1536); EXCEPTION WHEN others THEN v_vec := NULL; END;
  END IF;
  SELECT id INTO v_conv FROM public.aria_conversaciones WHERE id = p_conversacion_id AND user_id = auth.uid() AND empresa_id = p_empresa_id;
  SELECT r.id INTO v_id FROM public.aria_recuerdos r
   WHERE r.user_id = auth.uid() AND r.empresa_id = p_empresa_id
     AND (public.aria_sin_tildes(r.texto) = public.aria_sin_tildes(v_texto)
          OR (v_vec IS NOT NULL AND r.embedding IS NOT NULL AND 1 - (r.embedding <=> v_vec) >= 0.92))
   ORDER BY (public.aria_sin_tildes(r.texto) = public.aria_sin_tildes(v_texto)) DESC LIMIT 1;
  IF v_id IS NOT NULL THEN
    IF v_tipo = 'automatico' THEN RETURN jsonb_build_object('estado', 'ya_existe', 'id', v_id); END IF;
    UPDATE public.aria_recuerdos SET texto = v_texto, tipo = 'explicito', embedding = coalesce(v_vec, embedding), actualizado_en = now()
     WHERE id = v_id AND user_id = auth.uid();
    RETURN jsonb_build_object('estado', 'actualizado', 'id', v_id, 'texto', v_texto, 'tipo', 'explicito');
  END IF;
  IF (SELECT count(*) FROM public.aria_recuerdos WHERE user_id = auth.uid() AND empresa_id = p_empresa_id) >= 100 THEN
    RETURN jsonb_build_object('estado', 'limite');
  END IF;
  INSERT INTO public.aria_recuerdos (empresa_id, texto, tipo, conversacion_id, embedding, avisado)
  VALUES (p_empresa_id, v_texto, v_tipo, v_conv, v_vec, v_tipo = 'explicito') RETURNING id INTO v_id;
  RETURN jsonb_build_object('estado', 'guardado', 'id', v_id, 'texto', v_texto, 'tipo', v_tipo);
END; $function$;

-- Contexto para la Edge: los recuerdos más afines a la pregunta (por embedding; si no hay, por palabras y recientes).
CREATE OR REPLACE FUNCTION public.aria_recuerdos_contexto(p_empresa_id text, p_texto text DEFAULT NULL, p_embedding text DEFAULT NULL, p_limite integer DEFAULT 6)
 RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_vec extensions.vector(1536); v_total integer; v_pendientes integer; v_pausada boolean; v_q text := public.aria_sin_tildes(left(coalesce(p_texto, ''), 1000));
BEGIN
  SELECT count(*), count(*) FILTER (WHERE NOT avisado) INTO v_total, v_pendientes
    FROM public.aria_recuerdos WHERE user_id = auth.uid() AND empresa_id = p_empresa_id;
  v_pausada := EXISTS (SELECT 1 FROM public.aria_memoria_ajustes WHERE user_id = auth.uid() AND empresa_id = p_empresa_id AND pausada);
  IF v_pausada OR v_total = 0 THEN
    RETURN jsonb_build_object('pausada', v_pausada, 'total', v_total, 'por_avisar', 0, 'recuerdos', '[]'::jsonb);
  END IF;
  IF p_embedding IS NOT NULL THEN
    BEGIN v_vec := p_embedding::extensions.vector(1536); EXCEPTION WHEN others THEN v_vec := NULL; END;
  END IF;
  RETURN jsonb_build_object('pausada', false, 'total', v_total, 'por_avisar', v_pendientes, 'recuerdos', coalesce((
    SELECT jsonb_agg(jsonb_build_object('id', x.id, 'texto', x.texto) ORDER BY x.pos)
    FROM (SELECT r.id, r.texto, row_number() OVER (ORDER BY
                   CASE WHEN v_vec IS NOT NULL AND r.embedding IS NOT NULL THEN r.embedding <=> v_vec END ASC NULLS LAST,
                   (SELECT count(*) FROM regexp_split_to_table(v_q, '[^a-z0-9ñ]+') w WHERE length(w) >= 4 AND position(w IN public.aria_sin_tildes(r.texto)) > 0) DESC,
                   r.actualizado_en DESC) AS pos
            FROM public.aria_recuerdos r WHERE r.user_id = auth.uid() AND r.empresa_id = p_empresa_id
           ORDER BY pos LIMIT least(greatest(coalesce(p_limite, 6), 1), 12)) x), '[]'::jsonb));
END; $function$;

-- Recuerdos automáticos que el panel aún no mostró ("Aria recordó: …"); al devolverlos quedan avisados.
CREATE OR REPLACE FUNCTION public.aria_recuerdos_por_avisar(p_empresa_id text)
 RETURNS jsonb LANGUAGE sql SET search_path TO 'public'
AS $function$
  WITH u AS (UPDATE public.aria_recuerdos SET avisado = true
              WHERE user_id = auth.uid() AND empresa_id = p_empresa_id AND NOT avisado
              RETURNING id, texto, tipo, creado_en)
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'texto', texto, 'tipo', tipo) ORDER BY creado_en), '[]'::jsonb) FROM u;
$function$;

-- Panel: lista de recuerdos con buscador sin tildes, origen y estado de la pausa.
CREATE OR REPLACE FUNCTION public.aria_recuerdos_listar(p_empresa_id text, p_texto text DEFAULT NULL)
 RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  WITH q AS (SELECT nullif(trim(left(coalesce(p_texto, ''), 100)), '') AS t)
  SELECT jsonb_build_object(
    'pausada', EXISTS (SELECT 1 FROM public.aria_memoria_ajustes WHERE user_id = auth.uid() AND empresa_id = p_empresa_id AND pausada),
    'total', (SELECT count(*) FROM public.aria_recuerdos WHERE user_id = auth.uid() AND empresa_id = p_empresa_id),
    'recuerdos', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', r.id, 'texto', r.texto, 'tipo', r.tipo, 'creado_en', r.creado_en,
                                          'origen', (SELECT c.titulo FROM public.aria_conversaciones c WHERE c.id = r.conversacion_id)) ORDER BY r.actualizado_en DESC)
      FROM public.aria_recuerdos r, q
      WHERE r.user_id = auth.uid() AND r.empresa_id = p_empresa_id
        AND (q.t IS NULL OR public.aria_sin_tildes(r.texto) LIKE '%' || public.aria_sin_tildes(q.t) || '%')), '[]'::jsonb));
$function$;

CREATE OR REPLACE FUNCTION public.aria_recuerdo_borrar(p_recuerdo_id uuid)
 RETURNS boolean LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.aria_recuerdos WHERE id = p_recuerdo_id AND user_id = auth.uid();
  RETURN FOUND;
END; $function$;

CREATE OR REPLACE FUNCTION public.aria_recuerdos_borrar_todos(p_empresa_id text)
 RETURNS integer LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE v_n integer;
BEGIN
  DELETE FROM public.aria_recuerdos WHERE user_id = auth.uid() AND empresa_id = p_empresa_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END; $function$;

CREATE OR REPLACE FUNCTION public.aria_memoria_pausar(p_empresa_id text, p_pausada boolean)
 RETURNS boolean LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sesión no autenticada'; END IF;
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN RAISE EXCEPTION 'Empresa no autorizada'; END IF;
  INSERT INTO public.aria_memoria_ajustes (empresa_id, pausada) VALUES (p_empresa_id, coalesce(p_pausada, false))
  ON CONFLICT (user_id, empresa_id) DO UPDATE SET pausada = EXCLUDED.pausada, actualizado_en = now();
  RETURN coalesce(p_pausada, false);
END; $function$;

REVOKE ALL ON FUNCTION public.aria_recuerdo_guardar(text, text, text, uuid, text), public.aria_recuerdos_contexto(text, text, text, integer),
  public.aria_recuerdos_por_avisar(text), public.aria_recuerdos_listar(text, text), public.aria_recuerdo_borrar(uuid),
  public.aria_recuerdos_borrar_todos(text), public.aria_memoria_pausar(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aria_recuerdo_guardar(text, text, text, uuid, text), public.aria_recuerdos_contexto(text, text, text, integer),
  public.aria_recuerdos_por_avisar(text), public.aria_recuerdos_listar(text, text), public.aria_recuerdo_borrar(uuid),
  public.aria_recuerdos_borrar_todos(text), public.aria_memoria_pausar(text, boolean) TO authenticated;

-- Comprobación: si algo no quedó como se espera, se revierte toda la migración.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN RAISE EXCEPTION '683: falta la extensión vector'; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.aria_recuerdos'::regclass) THEN RAISE EXCEPTION '683: RLS de recuerdos inactivo'; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.aria_memoria_ajustes'::regclass) THEN RAISE EXCEPTION '683: RLS de ajustes inactivo'; END IF;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('aria_recuerdos', 'aria_memoria_ajustes')) <> 2 THEN RAISE EXCEPTION '683: políticas inesperadas'; END IF;
  IF has_table_privilege('anon', 'public.aria_recuerdos', 'SELECT') THEN RAISE EXCEPTION '683: anon no debe leer recuerdos'; END IF;
  IF has_function_privilege('anon', 'public.aria_recuerdo_guardar(text,text,text,uuid,text)', 'EXECUTE') THEN RAISE EXCEPTION '683: anon no debe guardar recuerdos'; END IF;
  IF has_function_privilege('anon', 'public.aria_recuerdos_borrar_todos(text)', 'EXECUTE') THEN RAISE EXCEPTION '683: anon no debe borrar recuerdos'; END IF;
END $$;
