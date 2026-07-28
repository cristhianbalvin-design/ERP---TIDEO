-- Las respuestas pertenecen al hilo del comentario padre.
-- Se heredan audiencia y visibilidad interna sin modificar las politicas RLS.

ALTER TABLE public.tideo_salud_comentarios
  ADD COLUMN IF NOT EXISTS autor_es_tideo BOOLEAN NOT NULL DEFAULT false;

UPDATE public.tideo_salud_comentarios c
SET autor_es_tideo = COALESCE(
  (
    SELECT lower(btrim(u.email)) LIKE '%@tideo.tech'
    FROM public.usuarios u
    WHERE u.id = c.autor_id
  ),
  false
);

CREATE OR REPLACE FUNCTION public.preparar_tideo_salud_comentario()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_id TEXT := auth.uid()::text;
BEGIN
  NEW.texto := btrim(NEW.texto);

  IF v_auth_id IS NOT NULL THEN
    NEW.autor_id := v_auth_id;
    SELECT
      COALESCE(NULLIF(btrim(u.nombre), ''), u.email, u.id),
      COALESCE(lower(btrim(u.email)) LIKE '%@tideo.tech', false)
    INTO NEW.autor_nombre, NEW.autor_es_tideo
    FROM public.usuarios u
    WHERE u.id = v_auth_id;

    IF NEW.autor_nombre IS NULL THEN
      RAISE EXCEPTION 'El usuario autenticado no tiene un perfil valido';
    END IF;
  ELSIF NEW.autor_id IS NOT NULL THEN
    SELECT
      COALESCE(NULLIF(btrim(u.nombre), ''), u.email, u.id),
      COALESCE(lower(btrim(u.email)) LIKE '%@tideo.tech', false)
    INTO NEW.autor_nombre, NEW.autor_es_tideo
    FROM public.usuarios u
    WHERE u.id = NEW.autor_id;
    NEW.autor_nombre := COALESCE(NEW.autor_nombre, 'Registro migrado');
    NEW.autor_es_tideo := COALESCE(NEW.autor_es_tideo, false);
  ELSE
    NEW.autor_nombre :=
      COALESCE(NULLIF(btrim(NEW.autor_nombre), ''), 'Registro migrado');
    NEW.autor_es_tideo := false;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validar_tideo_salud_respuesta()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_audiencia_padre TEXT;
  v_solo_interno_padre BOOLEAN;
BEGIN
  IF NEW.respuesta_a_comentario_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT original.audiencia, original.solo_interno
  INTO v_audiencia_padre, v_solo_interno_padre
  FROM public.tideo_salud_comentarios original
  WHERE original.id = NEW.respuesta_a_comentario_id
    AND original.empresa_id = NEW.empresa_id
    AND original.configuracion_id = NEW.configuracion_id
    AND (
      public.tideo_salud_personal_tideo_tiene_acceso(NEW.empresa_id)
      OR NOT (
        original.audiencia = 'tideo'
        AND original.solo_interno = true
      )
    );

  IF v_audiencia_padre IS NULL THEN
    RAISE EXCEPTION 'Comentario original no disponible para responder';
  END IF;

  NEW.audiencia := v_audiencia_padre;
  NEW.solo_interno := v_solo_interno_padre;

  RETURN NEW;
END;
$$;

-- Corrige respuestas historicas que quedaron en una columna distinta del padre.
UPDATE public.tideo_salud_comentarios respuesta
SET
  audiencia = padre.audiencia,
  solo_interno = padre.solo_interno
FROM public.tideo_salud_comentarios padre
WHERE respuesta.respuesta_a_comentario_id = padre.id
  AND (
    respuesta.audiencia IS DISTINCT FROM padre.audiencia
    OR respuesta.solo_interno IS DISTINCT FROM padre.solo_interno
  );

COMMENT ON COLUMN public.tideo_salud_comentarios.autor_es_tideo IS
  'Marca denormalizada del dominio @tideo.tech para distinguir al autor sin exponer su correo.';

COMMENT ON FUNCTION public.validar_tideo_salud_respuesta() IS
  'Valida el comentario padre y fuerza que la respuesta herede audiencia y solo_interno.';
