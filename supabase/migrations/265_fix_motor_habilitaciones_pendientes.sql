-- ============================================================================
-- 265 · Fix: Motor de habilitaciones ignoraba documentos pendientes
-- ============================================================================
-- calcular_habilitaciones_personal (usado por Personal Operativo) solo
-- consideraba documentos con activo = true. Un documento recien subido
-- queda con activo = false / estado_validacion = 'pendiente' hasta que RRHH
-- lo aprueba (ver subir_documento_personal), asi que el motor lo trataba
-- como inexistente y mostraba "Falta" en vez de "En revision".
-- Personal Administrativo no sufria esto porque su calculo de estado es
-- client-side (calcularEstadoDocumentoUI) y ya contempla 'pendiente'.

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
      fecha_vencimiento
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
      WHEN exige_vencimiento AND fecha_vencimiento IS NULL                       THEN 'incompleto'
      WHEN exige_vencimiento AND fecha_vencimiento < current_date                THEN 'vencido'
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

SELECT pg_notify('pgrst', 'reload schema');
