-- ============================================================================
-- 278 · Contratos a Plazo Indefinido
-- ============================================================================

-- 1. Agregar es_indefinido a personal_documentos
ALTER TABLE public.personal_documentos
  ADD COLUMN IF NOT EXISTS es_indefinido boolean NOT NULL DEFAULT false;

-- 2. Actualizar motor calcular_habilitaciones_personal
DROP FUNCTION IF EXISTS public.calcular_habilitaciones_personal(text) CASCADE;

CREATE OR REPLACE FUNCTION public.calcular_habilitaciones_personal(
  p_empresa_id text
)
RETURNS TABLE (
  personal_id          text,
  personal_tipo        text,
  tiene_cargo          boolean,
  cargo_id             text,
  tipo_documento_id    text,
  tipo_doc_nombre      text,
  tipo_doc_codigo      text,
  tipo_doc_ambito      text,
  es_habilitante       boolean,
  requiere_validacion  boolean,
  exige_vencimiento    boolean,
  dias_alerta          integer,
  obligatorio          boolean,
  estado               text,
  fecha_vencimiento    date,
  dias_restantes       integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH personal AS (
    SELECT id, 'operativo'::text AS personal_tipo, cargo_id
    FROM   public.personal_operativo
    WHERE  empresa_id = p_empresa_id
      AND  estado     <> 'inactivo'

    UNION ALL

    SELECT id, 'administrativo'::text AS personal_tipo, cargo_id
    FROM   public.personal_administrativo
    WHERE  empresa_id = p_empresa_id
  ),

  doc_activo AS (
    SELECT DISTINCT ON (personal_id, tipo_documento_id)
      personal_id,
      tipo_documento_id,
      estado_validacion,
      fecha_vencimiento,
      es_indefinido
    FROM   public.personal_documentos
    WHERE  empresa_id        = p_empresa_id
      AND  (activo = true OR estado_validacion = 'pendiente')
      AND  tipo_documento_id IS NOT NULL
    ORDER  BY personal_id, tipo_documento_id,
              version DESC, creado_en DESC
  ),

  estado_docs AS (
    SELECT
      p.id              AS personal_id,
      p.personal_tipo,
      true              AS tiene_cargo,
      p.cargo_id,
      cdr.tipo_documento_id,
      tde.nombre        AS tipo_doc_nombre,
      tde.codigo        AS tipo_doc_codigo,
      tde.ambito        AS tipo_doc_ambito,
      tde.es_habilitante,
      tde.requiere_validacion,
      tde.exige_vencimiento,
      tde.dias_alerta,
      tde.tipo_sucesor_id,
      cdr.obligatorio,
      d.estado_validacion,
      d.fecha_vencimiento,
      d.es_indefinido,
      tde.dias_alerta   AS _dias,
      EXISTS (
        SELECT 1 FROM public.personal_documentos pd_suc
        WHERE pd_suc.empresa_id = p_empresa_id
          AND pd_suc.personal_id = p.id
          AND pd_suc.tipo_documento_id = tde.tipo_sucesor_id
          AND pd_suc.estado_validacion = 'aprobado'
          AND pd_suc.activo = true
      ) AS tiene_sucesor_aprobado
    FROM   personal p
    JOIN   public.cargo_documento_requisito  cdr
             ON  cdr.cargo_id   = p.cargo_id
             AND cdr.empresa_id = p_empresa_id
    JOIN   public.tipos_documento_empresa    tde
             ON  tde.id     = cdr.tipo_documento_id
             AND tde.estado = 'activo'
    LEFT   JOIN doc_activo d
             ON  d.personal_id       = p.id
             AND d.tipo_documento_id = cdr.tipo_documento_id
    WHERE  p.cargo_id IS NOT NULL
  )

  SELECT
    personal_id,
    personal_tipo,
    tiene_cargo,
    cargo_id,
    tipo_documento_id,
    tipo_doc_nombre,
    tipo_doc_codigo,
    tipo_doc_ambito,
    es_habilitante,
    requiere_validacion,
    exige_vencimiento,
    dias_alerta,
    obligatorio,
    CASE
      WHEN tipo_sucesor_id IS NOT NULL AND tiene_sucesor_aprobado                THEN 'historico'
      WHEN estado_validacion IS NULL                                             THEN 'falta'
      WHEN estado_validacion = 'rechazado'                                       THEN 'rechazado'
      WHEN estado_validacion = 'pendiente' AND requiere_validacion               THEN 'en_revision'
      WHEN exige_vencimiento AND (es_indefinido IS NOT TRUE) AND fecha_vencimiento IS NULL THEN 'incompleto'
      WHEN exige_vencimiento AND (es_indefinido IS NOT TRUE) AND fecha_vencimiento < current_date THEN 'vencido'
      WHEN exige_vencimiento AND (es_indefinido IS NOT TRUE)
           AND fecha_vencimiento <= current_date + (_dias || ' days')::interval  THEN 'por_vencer'
      ELSE 'vigente'
    END                  AS estado,
    fecha_vencimiento,
    CASE
      WHEN exige_vencimiento AND (es_indefinido IS NOT TRUE) AND fecha_vencimiento IS NOT NULL
        THEN (fecha_vencimiento - current_date)::integer
      ELSE NULL
    END                  AS dias_restantes
  FROM estado_docs

  UNION ALL

  SELECT
    id, personal_tipo,
    false, null,
    null, null, null, null,
    null, null, null, null,
    null,
    'sin_cargo',
    null,
    null
  FROM personal
  WHERE cargo_id IS NULL;
$$;

REVOKE ALL    ON FUNCTION public.calcular_habilitaciones_personal(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.calcular_habilitaciones_personal(text) TO authenticated;

-- 3. Actualizar subir_version_documento
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
  p_origen             text     DEFAULT 'backoffice',
  p_es_indefinido      boolean  DEFAULT false
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
    fecha_vigencia_cambio, seccion_documental, contrato_periodo_id,
    es_indefinido
  ) VALUES (
    p_empresa_id, p_personal_id, p_personal_tipo,
    p_tipo_doc, p_tipo_documento_id,
    p_nombre_archivo, p_archivo_url,
    p_fecha_emision, p_fecha_vencimiento,
    v_version, true, 'pendiente', p_notas,
    v_usuario_id, p_subido_desde,
    v_grupo_id, v_renovable,
    p_condiciones_laborales, p_contrato_referencia_id, p_adenda_cambios,
    p_fecha_vigencia_cambio, p_seccion_documental, p_contrato_periodo_id,
    p_es_indefinido
  ) RETURNING id INTO v_row_id;

  RETURN v_row_id;
END;
$$;

REVOKE ALL ON FUNCTION public.subir_version_documento(text, text, text, text, text, text, uuid, date, date, text, text, text, jsonb, text, jsonb, date, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.subir_version_documento(text, text, text, text, text, text, uuid, date, date, text, text, text, jsonb, text, jsonb, date, text, text, text, boolean) TO authenticated;

-- 4. Actualizar subir_documento_personal
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
  p_origen                  text     DEFAULT 'backoffice',
  p_es_indefinido           boolean  DEFAULT false
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
    contrato_periodo_id, periodo_fecha_inicio, periodo_fecha_fin,
    es_indefinido
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
    p_es_indefinido
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.subir_documento_personal(text,text,text,text,text,text,date,date,text,text,text,jsonb,text,jsonb,date,text,text,text,boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.subir_documento_personal(text,text,text,text,text,text,date,date,text,text,text,jsonb,text,jsonb,date,text,text,text,boolean) TO authenticated;

-- 5. Actualizar nuevo_contrato_periodo
DROP FUNCTION IF EXISTS public.nuevo_contrato_periodo(text, text, text, text, text, text, date, date, text, jsonb, text, text);

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
  p_periodo_id_anterior     text     DEFAULT NULL,
  p_es_indefinido           boolean  DEFAULT false
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
    periodo_estado, seccion_documental,
    es_indefinido
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
    'vigente', 'requisito_cargo',
    p_es_indefinido
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.nuevo_contrato_periodo(text,text,text,text,text,text,date,date,text,jsonb,text,text,boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.nuevo_contrato_periodo(text,text,text,text,text,text,date,date,text,jsonb,text,text,boolean) TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
