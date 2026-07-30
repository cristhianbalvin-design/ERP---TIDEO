-- Estados de avance y respuestas de la bitacora para Salud de Implementacion.
-- No modifica las RPC de conteo ni las politicas de audiencia de comentarios.

ALTER TABLE public.tideo_salud_anotaciones
  ADD COLUMN IF NOT EXISTS capacitado BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS capacitado_por TEXT
    REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS capacitado_por_nombre TEXT,
  ADD COLUMN IF NOT EXISTS capacitado_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS implementado BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS implementado_por TEXT
    REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS implementado_por_nombre TEXT,
  ADD COLUMN IF NOT EXISTS implementado_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.preparar_tideo_salud_estados()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_es_personal_tideo BOOLEAN;
  v_actor_id TEXT := auth.uid()::text;
  v_actor_nombre TEXT;
  v_cambio_capacitado BOOLEAN;
  v_cambio_implementado BOOLEAN;
  v_cambio_metadatos BOOLEAN;
BEGIN
  v_cambio_capacitado :=
    TG_OP = 'INSERT' AND NEW.capacitado = true
    OR TG_OP = 'UPDATE' AND NEW.capacitado IS DISTINCT FROM OLD.capacitado;
  v_cambio_implementado :=
    TG_OP = 'INSERT' AND NEW.implementado = true
    OR TG_OP = 'UPDATE' AND NEW.implementado IS DISTINCT FROM OLD.implementado;

  IF TG_OP = 'INSERT' THEN
    v_cambio_metadatos :=
      NEW.capacitado_por IS NOT NULL
      OR NEW.capacitado_por_nombre IS NOT NULL
      OR NEW.capacitado_at IS NOT NULL
      OR NEW.implementado_por IS NOT NULL
      OR NEW.implementado_por_nombre IS NOT NULL
      OR NEW.implementado_at IS NOT NULL;
  ELSE
    v_cambio_metadatos :=
      NEW.capacitado_por IS DISTINCT FROM OLD.capacitado_por
      OR NEW.capacitado_por_nombre IS DISTINCT FROM OLD.capacitado_por_nombre
      OR NEW.capacitado_at IS DISTINCT FROM OLD.capacitado_at
      OR NEW.implementado_por IS DISTINCT FROM OLD.implementado_por
      OR NEW.implementado_por_nombre IS DISTINCT FROM OLD.implementado_por_nombre
      OR NEW.implementado_at IS DISTINCT FROM OLD.implementado_at;
  END IF;

  IF v_cambio_capacitado OR v_cambio_implementado OR v_cambio_metadatos THEN
    v_es_personal_tideo :=
      public.tideo_salud_personal_tideo_tiene_acceso(NEW.empresa_id);

    IF NOT COALESCE(v_es_personal_tideo, false) THEN
      RAISE EXCEPTION
        'Solo personal TIDEO puede modificar Capacitado o Implementado';
    END IF;

    SELECT COALESCE(NULLIF(btrim(u.nombre), ''), u.email, u.id)
    INTO v_actor_nombre
    FROM public.usuarios u
    WHERE u.id = v_actor_id;

    IF v_actor_nombre IS NULL THEN
      RAISE EXCEPTION 'El usuario autenticado no tiene un perfil valido';
    END IF;
  END IF;

  IF v_cambio_capacitado THEN
    NEW.capacitado_por := v_actor_id;
    NEW.capacitado_por_nombre := v_actor_nombre;
    NEW.capacitado_at := now();
  ELSIF TG_OP = 'UPDATE' AND (
    NEW.capacitado_por IS DISTINCT FROM OLD.capacitado_por
    OR NEW.capacitado_por_nombre IS DISTINCT FROM OLD.capacitado_por_nombre
    OR NEW.capacitado_at IS DISTINCT FROM OLD.capacitado_at
  ) THEN
    RAISE EXCEPTION 'Los metadatos de Capacitado no se modifican directamente';
  END IF;

  IF v_cambio_implementado THEN
    NEW.implementado_por := v_actor_id;
    NEW.implementado_por_nombre := v_actor_nombre;
    NEW.implementado_at := now();
  ELSIF TG_OP = 'UPDATE' AND (
    NEW.implementado_por IS DISTINCT FROM OLD.implementado_por
    OR NEW.implementado_por_nombre IS DISTINCT FROM OLD.implementado_por_nombre
    OR NEW.implementado_at IS DISTINCT FROM OLD.implementado_at
  ) THEN
    RAISE EXCEPTION 'Los metadatos de Implementado no se modifican directamente';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_preparar_tideo_salud_estados
ON public.tideo_salud_anotaciones;
CREATE TRIGGER trg_preparar_tideo_salud_estados
BEFORE INSERT OR UPDATE OF
  capacitado,
  capacitado_por,
  capacitado_por_nombre,
  capacitado_at,
  implementado,
  implementado_por,
  implementado_por_nombre,
  implementado_at
ON public.tideo_salud_anotaciones
FOR EACH ROW
EXECUTE FUNCTION public.preparar_tideo_salud_estados();

DROP POLICY IF EXISTS "Personal TIDEO read salud anotaciones"
ON public.tideo_salud_anotaciones;
CREATE POLICY "Personal TIDEO read salud anotaciones"
ON public.tideo_salud_anotaciones
FOR SELECT
USING (
  solo_interno = false
  AND public.tideo_salud_personal_tideo_tiene_acceso(empresa_id)
);

CREATE OR REPLACE FUNCTION public.guardar_salud_implementacion_estado(
  p_configuracion_id UUID,
  p_empresa_id TEXT,
  p_campo TEXT,
  p_valor BOOLEAN
)
RETURNS public.tideo_salud_anotaciones
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anotacion public.tideo_salud_anotaciones;
BEGIN
  IF p_campo NOT IN ('capacitado', 'implementado') THEN
    RAISE EXCEPTION 'Estado de implementacion no valido';
  END IF;

  IF NOT public.tideo_salud_personal_tideo_tiene_acceso(p_empresa_id) THEN
    RAISE EXCEPTION
      'Solo personal TIDEO puede modificar Capacitado o Implementado';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.empresas e
    WHERE e.id = p_empresa_id
      AND e.es_plataforma = false
      AND e.estado = 'activa'
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.tideo_salud_configuracion c
    WHERE c.id = p_configuracion_id
      AND c.activa = true
  ) THEN
    RAISE EXCEPTION 'Tenant o configuracion no disponible';
  END IF;

  IF p_campo = 'capacitado' THEN
    INSERT INTO public.tideo_salud_anotaciones (
      configuracion_id,
      empresa_id,
      capacitado,
      solo_interno,
      updated_at,
      updated_by
    )
    VALUES (
      p_configuracion_id,
      p_empresa_id,
      p_valor,
      false,
      now(),
      auth.uid()
    )
    ON CONFLICT (configuracion_id, empresa_id)
    DO UPDATE SET
      capacitado = EXCLUDED.capacitado,
      updated_at = now(),
      updated_by = auth.uid()
    RETURNING * INTO v_anotacion;
  ELSE
    INSERT INTO public.tideo_salud_anotaciones (
      configuracion_id,
      empresa_id,
      implementado,
      solo_interno,
      updated_at,
      updated_by
    )
    VALUES (
      p_configuracion_id,
      p_empresa_id,
      p_valor,
      false,
      now(),
      auth.uid()
    )
    ON CONFLICT (configuracion_id, empresa_id)
    DO UPDATE SET
      implementado = EXCLUDED.implementado,
      updated_at = now(),
      updated_by = auth.uid()
    RETURNING * INTO v_anotacion;
  END IF;

  RETURN v_anotacion;
END;
$$;

REVOKE ALL
ON FUNCTION public.guardar_salud_implementacion_estado(UUID, TEXT, TEXT, BOOLEAN)
FROM PUBLIC;
GRANT EXECUTE
ON FUNCTION public.guardar_salud_implementacion_estado(UUID, TEXT, TEXT, BOOLEAN)
TO authenticated;

ALTER TABLE public.tideo_salud_comentarios
  ADD COLUMN IF NOT EXISTS respuesta_a_comentario_id UUID
    REFERENCES public.tideo_salud_comentarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tideo_salud_comentarios_respuesta
  ON public.tideo_salud_comentarios (respuesta_a_comentario_id)
  WHERE respuesta_a_comentario_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validar_tideo_salud_respuesta()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_respuesta_valida BOOLEAN;
BEGIN
  IF NEW.respuesta_a_comentario_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
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
      )
  )
  INTO v_respuesta_valida;

  IF NOT v_respuesta_valida THEN
    RAISE EXCEPTION 'Comentario original no disponible para responder';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_tideo_salud_respuesta
ON public.tideo_salud_comentarios;
CREATE TRIGGER trg_validar_tideo_salud_respuesta
BEFORE INSERT OR UPDATE OF
  respuesta_a_comentario_id,
  empresa_id,
  configuracion_id
ON public.tideo_salud_comentarios
FOR EACH ROW
EXECUTE FUNCTION public.validar_tideo_salud_respuesta();

COMMENT ON FUNCTION public.guardar_salud_implementacion_estado(UUID, TEXT, TEXT, BOOLEAN) IS
  'Actualiza Capacitado o Implementado y registra autor/fecha; exclusivo para personal @tideo.tech con acceso al tenant.';

COMMENT ON COLUMN public.tideo_salud_comentarios.respuesta_a_comentario_id IS
  'Referencia append-only al comentario original, limitada a la misma fila y tenant.';
