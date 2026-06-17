-- ============================================================================
-- 254 · Sistema de periodos para documentos renovables
-- ============================================================================

-- ── 1. Catálogo tenant: tipos_documento_config ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.tipos_documento_config (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    empresa_id text NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    tipo_doc text NOT NULL,
    renovable boolean DEFAULT false,
    frecuencia_dias integer,
    es_habilitante boolean DEFAULT true,
    activo boolean DEFAULT true,
    creado_en timestamp with time zone DEFAULT now(),
    actualizado_en timestamp with time zone DEFAULT now(),
    UNIQUE(empresa_id, tipo_doc)
);

ALTER TABLE public.tipos_documento_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Acceso a tipos_documento_config para usuarios de la empresa"
ON public.tipos_documento_config FOR ALL
USING (public.usuario_tiene_empresa(empresa_id))
WITH CHECK (public.usuario_tiene_empresa(empresa_id));

-- ── 2. Campos nuevos en personal_documentos ─────────────────────────────────
ALTER TABLE public.personal_documentos 
ADD COLUMN IF NOT EXISTS periodo_grupo_id uuid,
ADD COLUMN IF NOT EXISTS renovable boolean DEFAULT false;

-- ── 3. Backfill: Agrupar por vencimiento ────────────────────────────────────
DO $$
DECLARE
    rec record;
    v_grupo uuid;
    v_msg text;
BEGIN
    FOR rec IN 
        SELECT empresa_id, personal_id, tipo_doc, fecha_vencimiento
        FROM public.personal_documentos
        WHERE fecha_vencimiento IS NOT NULL
        GROUP BY empresa_id, personal_id, tipo_doc, fecha_vencimiento
        HAVING COUNT(*) > 1
    LOOP
        v_grupo := gen_random_uuid();
        
        -- Verificar si al agrupar hay mas de un activo=true
        IF (SELECT COUNT(*) FROM public.personal_documentos 
            WHERE empresa_id = rec.empresa_id AND personal_id = rec.personal_id AND tipo_doc = rec.tipo_doc AND fecha_vencimiento = rec.fecha_vencimiento AND activo = true) > 1 THEN
            
            -- Dejar activo solo el mas reciente (mayor version o id)
            WITH mas_reciente AS (
                SELECT id FROM public.personal_documentos
                WHERE empresa_id = rec.empresa_id AND personal_id = rec.personal_id AND tipo_doc = rec.tipo_doc AND fecha_vencimiento = rec.fecha_vencimiento AND activo = true
                ORDER BY version DESC, creado_en DESC LIMIT 1
            )
            UPDATE public.personal_documentos
            SET activo = false
            WHERE empresa_id = rec.empresa_id AND personal_id = rec.personal_id AND tipo_doc = rec.tipo_doc AND fecha_vencimiento = rec.fecha_vencimiento AND activo = true
            AND id NOT IN (SELECT id FROM mas_reciente);
            
            RAISE NOTICE 'Backfill conflicto activo=true resuelto para %, %, %, %', rec.empresa_id, rec.personal_id, rec.tipo_doc, rec.fecha_vencimiento;
        END IF;

        UPDATE public.personal_documentos
        SET periodo_grupo_id = v_grupo, renovable = true
        WHERE empresa_id = rec.empresa_id 
          AND personal_id = rec.personal_id 
          AND tipo_doc = rec.tipo_doc 
          AND fecha_vencimiento = rec.fecha_vencimiento;
    END LOOP;
    
    -- Para los que no se agruparon (o que no tienen vencimiento o son 1 solo) 
    -- y tienen activo=true, vamos a resolver posibles multiples activos
    FOR rec IN 
        SELECT empresa_id, personal_id, tipo_doc
        FROM public.personal_documentos
        WHERE activo = true AND periodo_grupo_id IS NULL
        GROUP BY empresa_id, personal_id, tipo_doc
        HAVING COUNT(*) > 1
    LOOP
        WITH mas_reciente AS (
            SELECT id FROM public.personal_documentos
            WHERE empresa_id = rec.empresa_id AND personal_id = rec.personal_id AND tipo_doc = rec.tipo_doc AND activo = true AND periodo_grupo_id IS NULL
            ORDER BY version DESC, creado_en DESC LIMIT 1
        )
        UPDATE public.personal_documentos
        SET activo = false
        WHERE empresa_id = rec.empresa_id AND personal_id = rec.personal_id AND tipo_doc = rec.tipo_doc AND activo = true AND periodo_grupo_id IS NULL
        AND id NOT IN (SELECT id FROM mas_reciente);
        
        RAISE NOTICE 'Backfill conflicto nulos resuelto para %, %, %', rec.empresa_id, rec.personal_id, rec.tipo_doc;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ── 4. Constraint Unique activo por grupo ───────────────────────────────────
-- Coalesce maneja los documentos únicos sin periodo_grupo_id
CREATE UNIQUE INDEX IF NOT EXISTS uq_personal_docs_activo_grupo 
ON public.personal_documentos (empresa_id, personal_id, tipo_doc, COALESCE(periodo_grupo_id, '00000000-0000-0000-0000-000000000000'::uuid)) 
WHERE activo = true;

-- ── 5. RPC subir_version_documento ──────────────────────────────────────────
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
  p_contrato_periodo_id text    DEFAULT NULL
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
BEGIN
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Acceso denegado al tenant';
  END IF;

  SELECT id INTO v_usuario_id FROM public.usuarios WHERE id = auth.uid()::text LIMIT 1;
  
  v_grupo_id := p_periodo_grupo_id;
  IF v_grupo_id IS NULL THEN
      v_grupo_id := gen_random_uuid();
  END IF;

  -- Heredar renovable de la configuracion si existe
  SELECT renovable INTO v_renovable 
  FROM public.tipos_documento_config 
  WHERE empresa_id = p_empresa_id AND tipo_doc = p_tipo_doc LIMIT 1;
  
  IF v_renovable IS NULL THEN v_renovable := false; END IF;

  -- Desactiva version anterior de este periodo_grupo_id
  UPDATE public.personal_documentos
  SET activo = false
  WHERE empresa_id = p_empresa_id 
    AND personal_id = p_personal_id 
    AND tipo_doc = p_tipo_doc 
    AND periodo_grupo_id = v_grupo_id
    AND activo = true;

  -- Calcula version dentro del grupo
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

REVOKE ALL ON FUNCTION public.subir_version_documento FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.subir_version_documento TO authenticated;

-- ── 6. RPC renovar_documento ────────────────────────────────────────────────
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
    p_fecha_vigencia_cambio, p_seccion_documental, p_contrato_periodo_id
  ) RETURNING id INTO v_row_id;

  RETURN v_row_id;
END;
$$;

REVOKE ALL ON FUNCTION public.renovar_documento FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.renovar_documento TO authenticated;

-- ── 7. calcular_habilitaciones_personal ──────────────────────────────────────
DROP FUNCTION IF EXISTS public.calcular_habilitaciones_personal(text) CASCADE;

CREATE FUNCTION public.calcular_habilitaciones_personal(
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

  -- Mismo filtro activo=true, pero usando el PERIODO mas reciente por tipo_documento_id.
  -- Usamos ORDER BY tipo_documento_id, fecha_vencimiento DESC NULLS LAST, creado_en DESC
  doc_activo AS (
    SELECT DISTINCT ON (personal_id, tipo_documento_id)
      personal_id,
      tipo_documento_id,
      estado_validacion,
      fecha_vencimiento
    FROM   public.personal_documentos
    WHERE  empresa_id        = p_empresa_id
      AND  activo            = true
      AND  tipo_documento_id IS NOT NULL
    ORDER  BY personal_id, tipo_documento_id, 
              fecha_vencimiento DESC NULLS LAST, creado_en DESC
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
      cdr.obligatorio,
      d.estado_validacion,
      d.fecha_vencimiento,
      tde.dias_alerta   AS _dias
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
      WHEN estado_validacion IS NULL                                           THEN 'falta'
      WHEN estado_validacion = 'rechazado'                                     THEN 'rechazado'
      WHEN estado_validacion = 'pendiente' AND requiere_validacion              THEN 'en_revision'
      WHEN exige_vencimiento AND fecha_vencimiento IS NULL                     THEN 'incompleto'
      WHEN exige_vencimiento AND fecha_vencimiento < current_date               THEN 'vencido'
      WHEN exige_vencimiento
           AND fecha_vencimiento <= current_date + (_dias || ' days')::interval
                                                                               THEN 'por_vencer'
      ELSE 'vigente'
    END                  AS estado,
    fecha_vencimiento,
    CASE
      WHEN exige_vencimiento AND fecha_vencimiento IS NOT NULL
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

-- Recrear vista
CREATE OR REPLACE VIEW public.estado_global_colaboradores AS
  SELECT
    h.personal_id,
    h.personal_tipo,
    h.tiene_cargo,
    h.cargo_id,
    CASE
      WHEN NOT h.tiene_cargo                                    THEN 'sin_cargo'
      WHEN NOT bool_or(h.tipo_documento_id IS NOT NULL)         THEN 'sin_requisitos'
      WHEN bool_or(h.obligatorio AND h.estado IN (
             'vencido','rechazado','falta','incompleto'
           ))                                                   THEN 'critico'
      WHEN bool_or(h.obligatorio AND h.estado IN (
             'por_vencer','en_revision'
           ))                                                   THEN 'advertencia'
      ELSE 'en_regla'
    END AS estado_global
  FROM (
    SELECT * FROM public.calcular_habilitaciones_personal(
      (SELECT id FROM public.empresas LIMIT 1)
    )
  ) h
  GROUP BY h.personal_id, h.personal_tipo, h.tiene_cargo, h.cargo_id;

SELECT pg_notify('pgrst', 'reload schema');
