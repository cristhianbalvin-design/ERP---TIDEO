-- ============================================================================
-- 321 · Fase 2.5 — Corrección de contrato_periodo_id (backfill + carga)
-- ============================================================================
-- Problema: subir_documento_personal solo HEREDA contrato_periodo_id de un
-- documento activo del mismo tipo; nunca lo GENERA. El primer contrato de
-- cada persona (Contrato Primigenio) no tiene nada de qué heredar, así que
-- queda NULL para siempre. subir_version_documento no hereda ni genera (solo
-- pasa lo que reciba). nuevo_contrato_periodo ya genera correctamente y no
-- se toca.
--
-- Decisiones de diseño (confirmadas con el usuario antes de implementar):
--   1. Adenda (contrato_referencia_id): hereda el contrato_periodo_id del
--      contrato referenciado — comparten el mismo ciclo contractual.
--   2. Renovación de tipos 'renovable' (ej. Contrato Laboral/de trabajo):
--      espeja el patrón ya existente de periodo_grupo_id — una nueva versión
--      DENTRO del mismo periodo_grupo_id (subir_version_documento con
--      p_periodo_grupo_id explícito) hereda el período; un periodo_grupo_id
--      nuevo (siempre el caso en renovar_documento) abre un período nuevo.
--   3. Backfill: solo DIFESMAQ (único tenant con datos operativos reales).
--      Se confirmó por consulta directa que ningún tenant tiene adendas
--      cargadas (contrato_referencia_id NULL en el 100% de las filas) y que
--      en DIFESMAQ todos los documentos contractuales de una misma persona
--      comparten tipo_documento_id (sin cadena Primigenio→Laboral), así que
--      agrupar por (personal_id, tipo_documento_id) es inequívoco: 0 casos
--      ambiguos.
-- ============================================================================

-- ── 1. subir_documento_personal ──────────────────────────────────────────────

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
  p_contrato_periodo_id     text     DEFAULT NULL,
  p_origen                  text     DEFAULT 'backoffice',
  p_es_indefinido           boolean  DEFAULT false,
  p_forzar_override         boolean  DEFAULT false,
  p_motivo_override         text     DEFAULT NULL
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
  v_es_contractual boolean;
  v_aprobados  integer;
  v_permite_firma boolean;
  v_predecesor_id text;
  v_predecesor_nombre text;
BEGIN
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Acceso denegado al tenant';
  END IF;

  IF p_forzar_override AND NOT public.personal_documentos_puede_forzar_retro(p_empresa_id, p_personal_tipo) THEN
    RAISE EXCEPTION 'No tiene autorización para forzar cambios retroactivos sobre nómina ya procesada.';
  END IF;

  -- VALIDACIÓN REGLA 1: Backoffice - no subir si el predecesor no está aprobado
  IF p_origen = 'backoffice' THEN
    SELECT id, nombre INTO v_predecesor_id, v_predecesor_nombre
    FROM public.tipos_documento_empresa
    WHERE empresa_id = p_empresa_id AND tipo_sucesor_id = (
      SELECT id FROM public.tipos_documento_empresa
      WHERE empresa_id = p_empresa_id AND (id = p_tipo_documento_id OR nombre = p_tipo_doc OR codigo = p_tipo_doc)
      LIMIT 1
    )
    LIMIT 1;

    IF v_predecesor_id IS NOT NULL THEN
      SELECT count(*) INTO v_aprobados
      FROM public.personal_documentos
      WHERE empresa_id = p_empresa_id
        AND personal_id = p_personal_id
        AND (tipo_documento_id = v_predecesor_id OR tipo_doc = v_predecesor_id)
        AND estado_validacion = 'aprobado'
        AND activo = true;

      IF v_aprobados = 0 THEN
        RAISE EXCEPTION 'Debe existir un % aprobado antes de subir este documento.', v_predecesor_nombre;
      END IF;
    END IF;
  END IF;

  -- VALIDACIÓN GAP 3
  IF p_origen = 'portal_empleado' THEN
    SELECT count(*) INTO v_aprobados
    FROM public.personal_documentos
    WHERE empresa_id = p_empresa_id
      AND personal_id = p_personal_id
      AND tipo_doc = p_tipo_doc
      AND estado_validacion = 'aprobado'
      AND activo = true;

    IF v_aprobados = 0 THEN
      RAISE EXCEPTION 'No existe contrato base aprobado. El primer contrato debe ser cargado por RRHH.';
    END IF;

    SELECT permite_firma_trabajador INTO v_permite_firma
    FROM public.tipos_documento_empresa
    WHERE empresa_id = p_empresa_id AND (id = p_tipo_documento_id OR nombre = p_tipo_doc OR codigo = p_tipo_doc)
    LIMIT 1;

    IF v_permite_firma IS FALSE THEN
      RAISE EXCEPTION 'Este tipo de documento no permite la subida de versiones firmadas desde el portal.';
    END IF;
  END IF;

  SELECT id INTO v_usuario_id
  FROM public.usuarios
  WHERE id = auth.uid()::text
  LIMIT 1;

  v_periodo_id := p_contrato_periodo_id;

  -- Adenda: hereda el período del contrato referenciado (mismo ciclo contractual)
  IF v_periodo_id IS NULL AND p_contrato_referencia_id IS NOT NULL THEN
    SELECT contrato_periodo_id INTO v_periodo_id
    FROM public.personal_documentos
    WHERE id = p_contrato_referencia_id
      AND empresa_id = p_empresa_id;
  END IF;

  -- Renovación/corrección del mismo tipo: hereda del documento activo vigente
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

  -- Nada de qué heredar: si el tipo es contractual, nace un período nuevo
  IF v_periodo_id IS NULL THEN
    v_es_contractual := false;
    IF p_tipo_documento_id IS NOT NULL THEN
      SELECT COALESCE(t.captura_snapshot_laboral, false) INTO v_es_contractual
      FROM public.tipos_documento_empresa t
      WHERE t.id = p_tipo_documento_id;
    END IF;
    IF NOT v_es_contractual THEN
      v_es_contractual := lower(COALESCE(p_tipo_doc, '')) LIKE '%contrato%'
                        OR lower(COALESCE(p_tipo_doc, '')) LIKE '%adenda%';
    END IF;
    IF v_es_contractual THEN
      v_periodo_id := 'cper_' || gen_random_uuid()::text;
    END IF;
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
    contrato_periodo_id, periodo_fecha_inicio, periodo_fecha_fin,
    es_indefinido, retro_override_por, retro_override_motivo
  ) VALUES (
    p_empresa_id, p_personal_id, p_personal_tipo,
    p_tipo_doc, p_tipo_documento_id,
    p_nombre_archivo, p_archivo_url,
    p_fecha_emision, p_fecha_vencimiento,
    v_version, false, 'pendiente', p_notas,
    v_usuario_id, p_subido_desde,
    COALESCE(p_condiciones_laborales, '{}'::jsonb), p_contrato_referencia_id,
    COALESCE(p_adenda_cambios, '{}'::jsonb), p_fecha_vigencia_cambio, v_seccion,
    v_periodo_id, p_fecha_emision, p_fecha_vencimiento,
    p_es_indefinido,
    CASE WHEN p_forzar_override THEN v_usuario_id ELSE NULL END,
    CASE WHEN p_forzar_override THEN p_motivo_override ELSE NULL END
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- ── 2. subir_version_documento ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.subir_version_documento(
  p_empresa_id         text,
  p_personal_id        text,
  p_personal_tipo      text,
  p_tipo_doc           text,
  p_nombre_archivo     text,
  p_archivo_url        text,
  p_periodo_grupo_id   uuid,
  p_fecha_emision      date     DEFAULT NULL,
  p_fecha_vencimiento  date     DEFAULT NULL,
  p_notas              text     DEFAULT NULL,
  p_subido_desde       text     DEFAULT 'backoffice',
  p_tipo_documento_id  text     DEFAULT NULL,
  p_condiciones_laborales jsonb DEFAULT '{}'::jsonb,
  p_contrato_referencia_id text DEFAULT NULL,
  p_adenda_cambios     jsonb    DEFAULT '{}'::jsonb,
  p_fecha_vigencia_cambio date  DEFAULT NULL,
  p_seccion_documental text     DEFAULT NULL,
  p_contrato_periodo_id text    DEFAULT NULL,
  p_origen             text     DEFAULT 'backoffice',
  p_es_indefinido      boolean  DEFAULT false,
  p_forzar_override    boolean  DEFAULT false,
  p_motivo_override    text     DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usuario_id  text;
  v_version     integer;
  v_row_id      uuid;
  v_grupo_id    uuid;
  v_renovable   boolean;
  v_periodo_id  text;
  v_es_contractual boolean;
  v_aprobados   integer;
  v_permite_firma boolean;
  v_predecesor_id text;
  v_predecesor_nombre text;
BEGIN
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Acceso denegado al tenant';
  END IF;

  IF p_forzar_override AND NOT public.personal_documentos_puede_forzar_retro(p_empresa_id, p_personal_tipo) THEN
    RAISE EXCEPTION 'No tiene autorización para forzar cambios retroactivos sobre nómina ya procesada.';
  END IF;

  -- VALIDACIÓN REGLA 1: Backoffice - no subir si el predecesor no está aprobado
  IF p_origen = 'backoffice' THEN
    SELECT id, nombre INTO v_predecesor_id, v_predecesor_nombre
    FROM public.tipos_documento_empresa
    WHERE empresa_id = p_empresa_id AND tipo_sucesor_id = (
      SELECT id FROM public.tipos_documento_empresa
      WHERE empresa_id = p_empresa_id AND (id = p_tipo_documento_id OR nombre = p_tipo_doc OR codigo = p_tipo_doc)
      LIMIT 1
    )
    LIMIT 1;

    IF v_predecesor_id IS NOT NULL THEN
      SELECT count(*) INTO v_aprobados
      FROM public.personal_documentos
      WHERE empresa_id = p_empresa_id
        AND personal_id = p_personal_id
        AND (tipo_documento_id = v_predecesor_id OR tipo_doc = v_predecesor_id)
        AND estado_validacion = 'aprobado'
        AND activo = true;

      IF v_aprobados = 0 THEN
        RAISE EXCEPTION 'Debe existir un % aprobado antes de subir este documento.', v_predecesor_nombre;
      END IF;
    END IF;
  END IF;

  -- VALIDACIÓN GAP 3: Si viene del portal, exigir contrato base aprobado
  IF p_origen = 'portal_empleado' THEN
    SELECT count(*) INTO v_aprobados
    FROM public.personal_documentos
    WHERE empresa_id = p_empresa_id
      AND personal_id = p_personal_id
      AND tipo_doc = p_tipo_doc
      AND estado_validacion = 'aprobado'
      AND activo = true;

    IF v_aprobados = 0 THEN
      RAISE EXCEPTION 'No existe contrato base aprobado. El primer contrato debe ser cargado por RRHH.';
    END IF;

    SELECT permite_firma_trabajador INTO v_permite_firma
    FROM public.tipos_documento_empresa
    WHERE empresa_id = p_empresa_id AND (id = p_tipo_documento_id OR nombre = p_tipo_doc OR codigo = p_tipo_doc)
    LIMIT 1;

    IF v_permite_firma IS FALSE THEN
      RAISE EXCEPTION 'Este tipo de documento no permite la subida de versiones firmadas desde el portal.';
    END IF;
  END IF;

  SELECT id INTO v_usuario_id FROM public.usuarios WHERE id = auth.uid()::text LIMIT 1;

  v_grupo_id := p_periodo_grupo_id;
  IF v_grupo_id IS NULL THEN
      v_grupo_id := gen_random_uuid();
  END IF;

  SELECT renovable INTO v_renovable
  FROM public.tipos_documento_empresa
  WHERE empresa_id = p_empresa_id AND (id = p_tipo_documento_id OR nombre = p_tipo_doc OR codigo = p_tipo_doc) LIMIT 1;

  IF v_renovable IS NULL THEN v_renovable := false; END IF;

  v_periodo_id := p_contrato_periodo_id;

  -- Adenda: hereda el período del contrato referenciado (mismo ciclo contractual)
  IF v_periodo_id IS NULL AND p_contrato_referencia_id IS NOT NULL THEN
    SELECT contrato_periodo_id INTO v_periodo_id
    FROM public.personal_documentos
    WHERE id = p_contrato_referencia_id
      AND empresa_id = p_empresa_id;
  END IF;

  -- Continuación del mismo periodo_grupo_id (ej. corrección de versión): hereda su período
  IF v_periodo_id IS NULL AND p_periodo_grupo_id IS NOT NULL THEN
    SELECT contrato_periodo_id INTO v_periodo_id
    FROM public.personal_documentos
    WHERE empresa_id       = p_empresa_id
      AND personal_id      = p_personal_id
      AND periodo_grupo_id = p_periodo_grupo_id
      AND contrato_periodo_id IS NOT NULL
    ORDER BY version DESC
    LIMIT 1;
  END IF;

  -- Grupo nuevo (renovación): si el tipo es contractual, nace un período nuevo
  IF v_periodo_id IS NULL THEN
    SELECT COALESCE(t.captura_snapshot_laboral, false) INTO v_es_contractual
    FROM public.tipos_documento_empresa t
    WHERE t.empresa_id = p_empresa_id AND (t.id = p_tipo_documento_id OR t.nombre = p_tipo_doc OR t.codigo = p_tipo_doc)
    LIMIT 1;
    IF NOT COALESCE(v_es_contractual, false) THEN
      v_es_contractual := lower(COALESCE(p_tipo_doc, '')) LIKE '%contrato%'
                        OR lower(COALESCE(p_tipo_doc, '')) LIKE '%adenda%';
    END IF;
    IF v_es_contractual THEN
      v_periodo_id := 'cper_' || gen_random_uuid()::text;
    END IF;
  END IF;

  UPDATE public.personal_documentos
  SET activo = false
  WHERE empresa_id = p_empresa_id
    AND personal_id = p_personal_id
    AND tipo_doc = p_tipo_doc
    AND periodo_grupo_id = v_grupo_id
    AND activo = true;

  SELECT coalesce(MAX(version), 0) + 1 INTO v_version
  FROM public.personal_documentos
  WHERE empresa_id = p_empresa_id
    AND personal_id = p_personal_id
    AND tipo_doc = p_tipo_doc
    AND periodo_grupo_id = v_grupo_id;

  INSERT INTO public.personal_documentos (
    empresa_id, personal_id, personal_tipo,
    tipo_doc, tipo_documento_id,
    nombre_archivo, archivo_url,
    fecha_emision, fecha_vencimiento,
    version, activo, estado_validacion, notas,
    subido_por, subido_desde,
    periodo_grupo_id, renovable,
    snapshot_laboral, contrato_referencia_id, adenda_cambios,
    fecha_vigencia_cambio, seccion_documental, contrato_periodo_id,
    es_indefinido, retro_override_por, retro_override_motivo
  ) VALUES (
    p_empresa_id, p_personal_id, p_personal_tipo,
    p_tipo_doc, p_tipo_documento_id,
    p_nombre_archivo, p_archivo_url,
    p_fecha_emision, p_fecha_vencimiento,
    v_version, true, 'pendiente', p_notas,
    v_usuario_id, p_subido_desde,
    v_grupo_id, v_renovable,
    p_condiciones_laborales, p_contrato_referencia_id, p_adenda_cambios,
    p_fecha_vigencia_cambio, p_seccion_documental, v_periodo_id,
    p_es_indefinido,
    CASE WHEN p_forzar_override THEN v_usuario_id ELSE NULL END,
    CASE WHEN p_forzar_override THEN p_motivo_override ELSE NULL END
  ) RETURNING id INTO v_row_id;

  RETURN v_row_id;
END;
$$;

-- ── 3. renovar_documento ─────────────────────────────────────────────────────
-- v_grupo_id siempre es un periodo_grupo_id NUEVO (gen_random_uuid()) por diseño
-- de esta función: cada renovación es, por definición, un grupo nuevo. Espejando
-- ese mismo criterio, el período contractual también nace nuevo salvo que venga
-- explícito o el documento sea una adenda de un contrato referenciado.

CREATE OR REPLACE FUNCTION public.renovar_documento(
  p_empresa_id         text,
  p_personal_id        text,
  p_personal_tipo      text,
  p_tipo_doc           text,
  p_nombre_archivo     text,
  p_archivo_url        text,
  p_fecha_emision      date     DEFAULT NULL,
  p_fecha_vencimiento  date     DEFAULT NULL,
  p_notas              text     DEFAULT NULL,
  p_subido_desde       text     DEFAULT 'backoffice',
  p_tipo_documento_id  text     DEFAULT NULL,
  p_condiciones_laborales jsonb DEFAULT '{}'::jsonb,
  p_contrato_referencia_id text DEFAULT NULL,
  p_adenda_cambios     jsonb    DEFAULT '{}'::jsonb,
  p_fecha_vigencia_cambio date  DEFAULT NULL,
  p_seccion_documental text     DEFAULT NULL,
  p_contrato_periodo_id text    DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usuario_id  text;
  v_row_id      uuid;
  v_grupo_id    uuid;
  v_renovable   boolean;
  v_periodo_id  text;
  v_es_contractual boolean;
BEGIN
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Acceso denegado al tenant';
  END IF;

  SELECT id INTO v_usuario_id FROM public.usuarios WHERE id = auth.uid()::text LIMIT 1;

  v_grupo_id := gen_random_uuid();

  SELECT renovable INTO v_renovable
  FROM public.tipos_documento_config
  WHERE empresa_id = p_empresa_id AND tipo_doc = p_tipo_doc LIMIT 1;

  IF v_renovable IS NULL THEN v_renovable := false; END IF;

  v_periodo_id := p_contrato_periodo_id;

  IF v_periodo_id IS NULL AND p_contrato_referencia_id IS NOT NULL THEN
    SELECT contrato_periodo_id INTO v_periodo_id
    FROM public.personal_documentos
    WHERE id = p_contrato_referencia_id
      AND empresa_id = p_empresa_id;
  END IF;

  IF v_periodo_id IS NULL THEN
    SELECT COALESCE(t.captura_snapshot_laboral, false) INTO v_es_contractual
    FROM public.tipos_documento_empresa t
    WHERE t.empresa_id = p_empresa_id AND (t.id = p_tipo_documento_id OR t.nombre = p_tipo_doc OR t.codigo = p_tipo_doc)
    LIMIT 1;
    IF NOT COALESCE(v_es_contractual, false) THEN
      v_es_contractual := lower(COALESCE(p_tipo_doc, '')) LIKE '%contrato%'
                        OR lower(COALESCE(p_tipo_doc, '')) LIKE '%adenda%';
    END IF;
    IF v_es_contractual THEN
      v_periodo_id := 'cper_' || gen_random_uuid()::text;
    END IF;
  END IF;

  -- OJO: No se toca el activo=true de grupos anteriores.
  -- La funcion getDocumentoActivoPorTipo y calcular_habilitaciones
  -- deberan resolver el grupo mas reciente.

  INSERT INTO public.personal_documentos (
    empresa_id, personal_id, personal_tipo,
    tipo_doc, tipo_documento_id,
    nombre_archivo, archivo_url,
    fecha_emision, fecha_vencimiento,
    version, activo, estado_validacion, notas,
    subido_por, subido_desde,
    periodo_grupo_id, renovable,
    snapshot_laboral, contrato_referencia_id, adenda_cambios,
    fecha_vigencia_cambio, seccion_documental, contrato_periodo_id
  ) VALUES (
    p_empresa_id, p_personal_id, p_personal_tipo,
    p_tipo_doc, p_tipo_documento_id,
    p_nombre_archivo, p_archivo_url,
    p_fecha_emision, p_fecha_vencimiento,
    1, true, 'pendiente', p_notas,
    v_usuario_id, p_subido_desde,
    v_grupo_id, v_renovable,
    p_condiciones_laborales, p_contrato_referencia_id, p_adenda_cambios,
    p_fecha_vigencia_cambio, p_seccion_documental, v_periodo_id
  ) RETURNING id INTO v_row_id;

  RETURN v_row_id;
END;
$$;

-- ── 4. Backfill DIFESMAQ (emp_20601829101, RUC 20601829101) ──────────────────
-- Confirmado por consulta directa: 24 documentos contractuales (24 filas,
-- tipo_documento_id = "Contrato Primigenio" en todos los casos) sin
-- contrato_periodo_id, repartidos en 20 personas (3 personas con
-- correcciones/versiones adicionales del mismo tipo). Sin adendas cargadas
-- (contrato_referencia_id NULL en el 100% de las filas) y sin cadena
-- Primigenio→Laboral en uso: agrupar por (personal_id, tipo_documento_id)
-- es inequívoco, 0 casos ambiguos.

DO $$
DECLARE
  v_empresa_id text := 'emp_20601829101';
BEGIN
  WITH grupos AS (
    SELECT DISTINCT ON (d.personal_id, d.tipo_documento_id)
      d.personal_id,
      d.tipo_documento_id,
      'cper_' || gen_random_uuid()::text AS periodo_id
    FROM public.personal_documentos d
    JOIN public.tipos_documento_empresa t ON t.id = d.tipo_documento_id
    WHERE d.empresa_id = v_empresa_id
      AND d.contrato_periodo_id IS NULL
      AND t.captura_snapshot_laboral = true
    ORDER BY d.personal_id, d.tipo_documento_id
  )
  UPDATE public.personal_documentos d
  SET contrato_periodo_id = g.periodo_id
  FROM grupos g
  WHERE d.empresa_id = v_empresa_id
    AND d.personal_id = g.personal_id
    AND d.tipo_documento_id = g.tipo_documento_id
    AND d.contrato_periodo_id IS NULL;
END;
$$;

SELECT pg_notify('pgrst', 'reload schema');
