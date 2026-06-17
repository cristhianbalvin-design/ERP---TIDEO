-- ============================================================================
-- 264 · Reglas Predecesor Contratos
-- ============================================================================

-- Modificamos subir_version_documento
DROP FUNCTION IF EXISTS public.subir_version_documento(text, text, text, text, text, text, uuid, date, date, text, text, text, jsonb, text, jsonb, date, text, text, text);

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
  p_origen             text     DEFAULT 'backoffice'
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
  v_aprobados   integer;
  v_permite_firma boolean;
  v_predecesor_id text;
  v_predecesor_nombre text;
BEGIN
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Acceso denegado al tenant';
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
    fecha_vigencia_cambio, seccion_documental, contrato_periodo_id
  ) VALUES (
    p_empresa_id, p_personal_id, p_personal_tipo,
    p_tipo_doc, p_tipo_documento_id,
    p_nombre_archivo, p_archivo_url,
    p_fecha_emision, p_fecha_vencimiento,
    v_version, true, 'pendiente', p_notas,
    v_usuario_id, p_subido_desde,
    v_grupo_id, v_renovable,
    p_condiciones_laborales, p_contrato_referencia_id, p_adenda_cambios,
    p_fecha_vigencia_cambio, p_seccion_documental, p_contrato_periodo_id
  ) RETURNING id INTO v_row_id;

  RETURN v_row_id;
END;
$$;

REVOKE ALL ON FUNCTION public.subir_version_documento(text, text, text, text, text, text, uuid, date, date, text, text, text, jsonb, text, jsonb, date, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.subir_version_documento(text, text, text, text, text, text, uuid, date, date, text, text, text, jsonb, text, jsonb, date, text, text, text) TO authenticated;

-- Modificamos subir_documento_personal
DROP FUNCTION IF EXISTS public.subir_documento_personal(text, text, text, text, text, text, date, date, text, text, text, jsonb, text, jsonb, date, text, text, text);

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
  p_origen                  text     DEFAULT 'backoffice'
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
  v_aprobados  integer;
  v_permite_firma boolean;
  v_predecesor_id text;
  v_predecesor_nombre text;
BEGIN
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Acceso denegado al tenant';
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

REVOKE ALL ON FUNCTION public.subir_documento_personal(text,text,text,text,text,text,date,date,text,text,text,jsonb,text,jsonb,date,text,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.subir_documento_personal(text,text,text,text,text,text,date,date,text,text,text,jsonb,text,jsonb,date,text,text,text) TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
