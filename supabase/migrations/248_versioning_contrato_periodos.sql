-- 248 — Versioning de períodos contractuales
-- Agrega contrato_periodo_id, es_correccion, periodo_fecha_inicio/fin, periodo_estado
-- a personal_documentos. Actualiza corregir_documento_personal, subir_documento_personal
-- y crea nuevo_contrato_periodo. Idempotente: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE.

-- ── 1. Columnas nuevas ────────────────────────────────────────────────────────

ALTER TABLE public.personal_documentos
  ADD COLUMN IF NOT EXISTS contrato_periodo_id text,
  ADD COLUMN IF NOT EXISTS es_correccion boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS periodo_fecha_inicio date,
  ADD COLUMN IF NOT EXISTS periodo_fecha_fin date,
  ADD COLUMN IF NOT EXISTS periodo_estado text NOT NULL DEFAULT 'vigente'
    CHECK (periodo_estado IN ('vigente', 'archivado'));

COMMENT ON COLUMN public.personal_documentos.contrato_periodo_id IS
  'cper_ + uuid. Agrupa todas las versiones y correcciones del mismo período contractual. Null para documentos no contractuales.';
COMMENT ON COLUMN public.personal_documentos.es_correccion IS
  'true = corrección de metadatos del mismo período sin incremento de versión conceptual.';
COMMENT ON COLUMN public.personal_documentos.periodo_estado IS
  'vigente = período activo; archivado = período cerrado porque se creó un nuevo contrato.';

-- ── 2. Backfill registros históricos ─────────────────────────────────────────
-- Un mismo (empresa_id, personal_id, tipo_documento_id) → un contrato_periodo_id compartido.
-- Documentar: se asigna un único período por colaborador+tipo por simplicidad migratoria;
-- futuros "Nuevo contrato" generarán un contrato_periodo_id nuevo.

DO $$
BEGIN
  -- Solo procesa si hay tipos_documento_empresa con captura_snapshot_laboral
  IF EXISTS (SELECT 1 FROM public.tipos_documento_empresa WHERE captura_snapshot_laboral = true LIMIT 1) THEN
    WITH grupos AS (
      SELECT DISTINCT ON (d.empresa_id, d.personal_id, d.tipo_documento_id)
        d.empresa_id,
        d.personal_id,
        d.tipo_documento_id,
        'cper_' || gen_random_uuid()::text AS periodo_id
      FROM public.personal_documentos d
      WHERE d.contrato_periodo_id IS NULL
        AND d.tipo_documento_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.tipos_documento_empresa t
          WHERE t.id = d.tipo_documento_id
            AND t.captura_snapshot_laboral = true
        )
      ORDER BY d.empresa_id, d.personal_id, d.tipo_documento_id
    )
    UPDATE public.personal_documentos d
    SET contrato_periodo_id = g.periodo_id,
        periodo_fecha_inicio = d.fecha_emision,
        periodo_fecha_fin    = d.fecha_vencimiento
    FROM grupos g
    WHERE d.empresa_id      = g.empresa_id
      AND d.personal_id     = g.personal_id
      AND d.tipo_documento_id = g.tipo_documento_id
      AND d.contrato_periodo_id IS NULL;
  END IF;
END;
$$;

-- ── 3. corregir_documento_personal: marcar es_correccion = true ───────────────

CREATE OR REPLACE FUNCTION public.corregir_documento_personal(
  p_documento_id          text,
  p_fecha_emision         date     DEFAULT NULL,
  p_fecha_vencimiento     date     DEFAULT NULL,
  p_condiciones_laborales jsonb    DEFAULT NULL,
  p_notas                 text     DEFAULT NULL,
  p_archivo_url           text     DEFAULT NULL,
  p_nombre_archivo        text     DEFAULT NULL
)
RETURNS public.personal_documentos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_id text;
  v_row        public.personal_documentos;
BEGIN
  SELECT empresa_id INTO v_empresa_id
  FROM public.personal_documentos
  WHERE id = p_documento_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Documento no encontrado';
  END IF;

  IF NOT public.usuario_tiene_empresa(v_empresa_id) THEN
    RAISE EXCEPTION 'Acceso denegado al tenant';
  END IF;

  UPDATE public.personal_documentos
  SET fecha_emision           = COALESCE(p_fecha_emision, fecha_emision),
      fecha_vencimiento       = p_fecha_vencimiento,
      condiciones_laborales   = COALESCE(p_condiciones_laborales, condiciones_laborales),
      notas                   = p_notas,
      archivo_url             = COALESCE(p_archivo_url, archivo_url),
      nombre_archivo          = COALESCE(p_nombre_archivo, nombre_archivo),
      es_correccion           = true
  WHERE id = p_documento_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.corregir_documento_personal(text,date,date,jsonb,text,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.corregir_documento_personal(text,date,date,jsonb,text,text,text) TO authenticated;

-- ── 4. subir_documento_personal: aceptar contrato_periodo_id opcional ─────────

DROP FUNCTION IF EXISTS public.subir_documento_personal(
  text, text, text, text, text, text, date, date, text, text, text, jsonb, text, jsonb, date, text
);

CREATE OR REPLACE FUNCTION public.subir_documento_personal(
  p_empresa_id              text,
  p_personal_id             text,
  p_personal_tipo           text,
  p_tipo_doc                text,
  p_nombre_archivo          text,
  p_archivo_url             text,
  p_fecha_emision           date     DEFAULT NULL,
  p_fecha_vencimiento       date     DEFAULT NULL,
  p_notas                   text     DEFAULT NULL,
  p_subido_desde            text     DEFAULT 'backoffice',
  p_tipo_documento_id       text     DEFAULT NULL,
  p_condiciones_laborales   jsonb    DEFAULT '{}'::jsonb,
  p_contrato_referencia_id  text     DEFAULT NULL,
  p_adenda_cambios          jsonb    DEFAULT '{}'::jsonb,
  p_fecha_vigencia_cambio   date     DEFAULT NULL,
  p_seccion_documental      text     DEFAULT NULL,
  p_contrato_periodo_id     text     DEFAULT NULL
)
RETURNS public.personal_documentos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usuario_id text;
  v_version    integer;
  v_row        public.personal_documentos;
  v_seccion    text := COALESCE(NULLIF(p_seccion_documental, ''), 'adicional');
  v_periodo_id text;
BEGIN
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Acceso denegado al tenant';
  END IF;

  SELECT id INTO v_usuario_id
  FROM public.usuarios
  WHERE id = auth.uid()::text
  LIMIT 1;

  -- Si se pasa un contrato_periodo_id, úsalo; de lo contrario, heredar del doc activo del mismo tipo
  v_periodo_id := p_contrato_periodo_id;
  IF v_periodo_id IS NULL AND p_tipo_documento_id IS NOT NULL THEN
    SELECT contrato_periodo_id INTO v_periodo_id
    FROM public.personal_documentos
    WHERE empresa_id       = p_empresa_id
      AND personal_id      = p_personal_id
      AND tipo_documento_id = p_tipo_documento_id
      AND activo = true
    ORDER BY version DESC
    LIMIT 1;
  END IF;

  SELECT COALESCE(MAX(version), 0) + 1 INTO v_version
  FROM public.personal_documentos
  WHERE empresa_id = p_empresa_id
    AND personal_id = p_personal_id
    AND (
      (p_tipo_documento_id IS NOT NULL AND tipo_documento_id = p_tipo_documento_id)
      OR tipo_doc = p_tipo_doc
    );

  INSERT INTO public.personal_documentos (
    empresa_id, personal_id, personal_tipo,
    tipo_doc, tipo_documento_id,
    nombre_archivo, archivo_url,
    fecha_emision, fecha_vencimiento,
    version, activo, estado_validacion, notas,
    subido_por, subido_desde,
    condiciones_laborales, contrato_referencia_id,
    adenda_cambios, fecha_vigencia_cambio, seccion_documental,
    contrato_periodo_id, periodo_fecha_inicio, periodo_fecha_fin
  ) VALUES (
    p_empresa_id, p_personal_id, p_personal_tipo,
    p_tipo_doc, p_tipo_documento_id,
    p_nombre_archivo, p_archivo_url,
    p_fecha_emision, p_fecha_vencimiento,
    v_version, false, 'pendiente', p_notas,
    v_usuario_id, p_subido_desde,
    COALESCE(p_condiciones_laborales, '{}'::jsonb), p_contrato_referencia_id,
    COALESCE(p_adenda_cambios, '{}'::jsonb), p_fecha_vigencia_cambio, v_seccion,
    v_periodo_id, p_fecha_emision, p_fecha_vencimiento
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.subir_documento_personal(text,text,text,text,text,text,date,date,text,text,text,jsonb,text,jsonb,date,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.subir_documento_personal(text,text,text,text,text,text,date,date,text,text,text,jsonb,text,jsonb,date,text,text) TO authenticated;

-- El signature anterior (16 params sin contrato_periodo_id) también debe seguir funcionando.
-- PostgreSQL soporta overload por parámetros, pero como es la misma función con DEFAULT null
-- el signature de 16 params se resuelve automáticamente.

-- ── 5. nuevo_contrato_periodo ─────────────────────────────────────────────────
-- Crea un nuevo registro v1 con nuevo contrato_periodo_id y archiva el período anterior.

CREATE OR REPLACE FUNCTION public.nuevo_contrato_periodo(
  p_empresa_id              text,
  p_personal_id             text,
  p_personal_tipo           text,
  p_tipo_doc                text,
  p_nombre_archivo          text,
  p_archivo_url             text,
  p_fecha_emision           date     DEFAULT NULL,
  p_fecha_vencimiento       date     DEFAULT NULL,
  p_notas                   text     DEFAULT NULL,
  p_condiciones_laborales   jsonb    DEFAULT '{}'::jsonb,
  p_tipo_documento_id       text     DEFAULT NULL,
  p_periodo_id_anterior     text     DEFAULT NULL
)
RETURNS public.personal_documentos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usuario_id      text;
  v_nuevo_periodo   text;
  v_row             public.personal_documentos;
BEGIN
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Acceso denegado al tenant';
  END IF;

  SELECT id INTO v_usuario_id
  FROM public.usuarios
  WHERE id = auth.uid()::text
  LIMIT 1;

  v_nuevo_periodo := 'cper_' || gen_random_uuid()::text;

  -- Archivar período anterior (por ID explícito o por el vigente del mismo tipo)
  IF p_periodo_id_anterior IS NOT NULL THEN
    UPDATE public.personal_documentos
    SET periodo_estado = 'archivado'
    WHERE empresa_id          = p_empresa_id
      AND personal_id         = p_personal_id
      AND contrato_periodo_id = p_periodo_id_anterior;
  ELSE
    UPDATE public.personal_documentos
    SET periodo_estado = 'archivado'
    WHERE empresa_id   = p_empresa_id
      AND personal_id  = p_personal_id
      AND periodo_estado = 'vigente'
      AND (
        (p_tipo_documento_id IS NOT NULL AND tipo_documento_id = p_tipo_documento_id)
        OR tipo_doc = p_tipo_doc
      );
  END IF;

  INSERT INTO public.personal_documentos (
    empresa_id, personal_id, personal_tipo,
    tipo_doc, tipo_documento_id,
    nombre_archivo, archivo_url,
    fecha_emision, fecha_vencimiento,
    version, activo, estado_validacion, notas,
    subido_por, subido_desde,
    condiciones_laborales,
    contrato_periodo_id,
    periodo_fecha_inicio, periodo_fecha_fin,
    periodo_estado, seccion_documental
  ) VALUES (
    p_empresa_id, p_personal_id, p_personal_tipo,
    p_tipo_doc, p_tipo_documento_id,
    p_nombre_archivo, p_archivo_url,
    p_fecha_emision, p_fecha_vencimiento,
    1, false, 'pendiente', p_notas,
    v_usuario_id, 'backoffice',
    COALESCE(p_condiciones_laborales, '{}'::jsonb),
    v_nuevo_periodo,
    p_fecha_emision, p_fecha_vencimiento,
    'vigente', 'requisito_cargo'
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.nuevo_contrato_periodo(text,text,text,text,text,text,date,date,text,jsonb,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.nuevo_contrato_periodo(text,text,text,text,text,text,date,date,text,jsonb,text,text) TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
