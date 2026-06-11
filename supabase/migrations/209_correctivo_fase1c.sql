-- ============================================================================
-- 209 · Fase 1C Correctivo — Motor de estado documentario
-- ============================================================================
-- Cambios respecto a 207:
--   1. Agrega campo `dias_restantes` (integer, calculado en BD — fuente única)
--   2. Renombra el estado 'sin_fecha_vencimiento' → 'incompleto' (alinea contrato)
--   3. Actualiza la vista estado_global_colaboradores para usar 'incompleto'
-- ============================================================================

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
  dias_restantes       integer   -- NUEVO: negativo si vencido, null si no aplica
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH personal AS (
    SELECT id, 'operativo'     AS personal_tipo, cargo_id
    FROM   public.personal_operativo
    WHERE  empresa_id = p_empresa_id
      AND  estado     <> 'inactivo'

    UNION ALL

    SELECT id, 'administrativo' AS personal_tipo, cargo_id
    FROM   public.personal_administrativo
    WHERE  empresa_id = p_empresa_id
  ),

  -- Un solo registro activo por (personal_id, tipo_doc) — el de mayor versión
  doc_activo AS (
    SELECT DISTINCT ON (personal_id, tipo_doc)
      personal_id,
      tipo_doc,
      estado_validacion,
      fecha_vencimiento
    FROM   public.personal_documentos
    WHERE  empresa_id = p_empresa_id
      AND  activo     = true
    ORDER  BY personal_id, tipo_doc, version DESC
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
           ON  tde.id      = cdr.tipo_documento_id
           AND tde.estado  = 'activo'
    LEFT   JOIN doc_activo d
           ON  d.personal_id = p.id
           AND d.tipo_doc    = cdr.tipo_documento_id
    WHERE  p.cargo_id IS NOT NULL
  )

  -- ── Filas con requisitos ──────────────────────────────────────────────────
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
      WHEN estado_validacion IS NULL                                         THEN 'falta'
      WHEN estado_validacion = 'rechazado'                                   THEN 'rechazado'
      WHEN estado_validacion = 'pendiente' AND requiere_validacion            THEN 'en_revision'
      WHEN exige_vencimiento AND fecha_vencimiento IS NULL                   THEN 'incompleto'
      WHEN exige_vencimiento AND fecha_vencimiento < current_date             THEN 'vencido'
      WHEN exige_vencimiento
           AND fecha_vencimiento <= current_date + (_dias || ' days')::interval
                                                                             THEN 'por_vencer'
      ELSE 'vigente'
    END                 AS estado,
    fecha_vencimiento,
    -- dias_restantes: positivo = días hasta vencer, negativo = días vencido
    -- null cuando no aplica vencimiento o no hay documento
    CASE
      WHEN exige_vencimiento AND fecha_vencimiento IS NOT NULL
        THEN (fecha_vencimiento - current_date)::integer
      ELSE NULL
    END                 AS dias_restantes
  FROM estado_docs

  UNION ALL

  -- ── Colaboradores sin cargo: una sola fila con estado = 'sin_cargo' ───────
  SELECT
    id, personal_tipo,
    false, null,
    null, null, null, null,
    null, null, null, null,
    null,
    'sin_cargo',
    null,
    null   -- dias_restantes null para sin_cargo
  FROM personal
  WHERE cargo_id IS NULL
$$;

-- Permisos de ejecución (la función es SECURITY DEFINER, aplica RLS propio)
REVOKE ALL    ON FUNCTION public.calcular_habilitaciones_personal(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.calcular_habilitaciones_personal(text) TO authenticated;

-- ── Vista de estado_global por colaborador — actualizada para 'incompleto' ──
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
