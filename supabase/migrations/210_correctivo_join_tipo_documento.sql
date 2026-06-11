-- ============================================================================
-- 210 · Correctivo — join tipo_documento_id en motor documentario
-- ============================================================================
-- Problema raíz: personal_documentos.tipo_doc guarda el NOMBRE del tipo
-- (texto libre, ej. "SCTR Salud"), pero calcular_habilitaciones_personal
-- hace JOIN por cdr.tipo_documento_id (ID del catálogo, ej. "tdoc_xxxx").
-- El LEFT JOIN nunca coincide → estado_validacion siempre NULL → motor
-- devuelve 'vigente' (fallback ELSE) aunque el documento esté en 'falta'.
--
-- Correcciones:
--   1. Agregar columna tipo_documento_id a personal_documentos
--   2. Backfill mediante comparación normalizada de nombres (lower+trim+colapsar espacios)
--   3. Extender subir_documento_personal para guardar tipo_documento_id
--   4. Corregir el JOIN en calcular_habilitaciones_personal
-- ============================================================================

-- ── 1. Columna tipo_documento_id ─────────────────────────────────────────────

ALTER TABLE public.personal_documentos
  ADD COLUMN IF NOT EXISTS tipo_documento_id text
    REFERENCES public.tipos_documento_empresa(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pdoc_tipo_documento_id
  ON public.personal_documentos (empresa_id, personal_id, tipo_documento_id);

-- ── 2. Backfill: exactamente un match → poblar; cero o múltiples → NULL ──────
-- La ventana COUNT(*) agrupa por (empresa_id, tipo_doc) para detectar ambigüedades
-- a nivel de tenant, no de documento individual.

UPDATE public.personal_documentos pd
SET    tipo_documento_id = sub.tipo_doc_id
FROM (
  SELECT
    pd2.id  AS pdoc_id,
    tde.id  AS tipo_doc_id,
    COUNT(tde.id) OVER (
      PARTITION BY pd2.empresa_id,
                   lower(trim(regexp_replace(pd2.tipo_doc, '\s+', ' ', 'g')))
    ) AS n_matches
  FROM public.personal_documentos pd2
  JOIN public.tipos_documento_empresa tde
    ON  tde.empresa_id = pd2.empresa_id
    AND lower(trim(regexp_replace(tde.nombre,   '\s+', ' ', 'g')))
      = lower(trim(regexp_replace(pd2.tipo_doc, '\s+', ' ', 'g')))
  WHERE pd2.tipo_documento_id IS NULL
) sub
WHERE pd.id          = sub.pdoc_id
  AND sub.n_matches  = 1;

-- ── 3. subir_documento_personal — acepta y guarda tipo_documento_id ──────────

-- Eliminar firma anterior (10 params) antes de crear la nueva (11 params)
DROP FUNCTION IF EXISTS public.subir_documento_personal(
  text, text, text, text, text, text, date, date, text, text
);

CREATE FUNCTION public.subir_documento_personal(
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
  p_tipo_documento_id  text     DEFAULT NULL
)
RETURNS public.personal_documentos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usuario_id  text;
  v_version     integer;
  v_row         public.personal_documentos;
BEGIN
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Acceso denegado al tenant';
  END IF;

  SELECT id INTO v_usuario_id
  FROM   public.usuarios
  WHERE  id = auth.uid()::text
  LIMIT  1;

  -- Archivar versión activa anterior.
  -- Preferir match por tipo_documento_id cuando está disponible (más exacto);
  -- caer en tipo_doc para documentos legacy sin tipo_documento_id.
  UPDATE public.personal_documentos
  SET    activo = false
  WHERE  empresa_id  = p_empresa_id
    AND  personal_id = p_personal_id
    AND  activo      = true
    AND  (
      (p_tipo_documento_id IS NOT NULL AND tipo_documento_id = p_tipo_documento_id)
      OR tipo_doc = p_tipo_doc
    );

  SELECT coalesce(MAX(version), 0) + 1 INTO v_version
  FROM   public.personal_documentos
  WHERE  empresa_id  = p_empresa_id
    AND  personal_id = p_personal_id
    AND  (
      (p_tipo_documento_id IS NOT NULL AND tipo_documento_id = p_tipo_documento_id)
      OR tipo_doc = p_tipo_doc
    );

  INSERT INTO public.personal_documentos (
    empresa_id, personal_id, personal_tipo,
    tipo_doc, tipo_documento_id,
    nombre_archivo, archivo_url,
    fecha_emision, fecha_vencimiento,
    version, activo,
    estado_validacion, notas,
    subido_por, subido_desde
  ) VALUES (
    p_empresa_id, p_personal_id, p_personal_tipo,
    p_tipo_doc, p_tipo_documento_id,
    p_nombre_archivo, p_archivo_url,
    p_fecha_emision, p_fecha_vencimiento,
    v_version, true,
    'pendiente', p_notas,
    v_usuario_id, p_subido_desde
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL    ON FUNCTION public.subir_documento_personal(text,text,text,text,text,text,date,date,text,text,text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.subir_documento_personal(text,text,text,text,text,text,date,date,text,text,text) TO authenticated;

-- ── 4. calcular_habilitaciones_personal — join corregido ─────────────────────
-- doc_activo ahora usa tipo_documento_id para deduplicar y para el JOIN.
-- Solo considera documentos con tipo_documento_id poblado (los demás no
-- pueden ser relacionados con un requisito del catálogo).

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

  -- Un solo registro activo por (personal_id, tipo_documento_id) — mayor versión.
  -- Excluye documentos sin tipo_documento_id: no pueden satisfacer ningún requisito.
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
    ORDER  BY personal_id, tipo_documento_id, version DESC
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

  -- ── Colaboradores sin cargo ───────────────────────────────────────────────
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
  WHERE cargo_id IS NULL
$$;

REVOKE ALL    ON FUNCTION public.calcular_habilitaciones_personal(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.calcular_habilitaciones_personal(text) TO authenticated;

-- ── Recrear vista (CASCADE la eliminó junto con la función) ──────────────────
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
