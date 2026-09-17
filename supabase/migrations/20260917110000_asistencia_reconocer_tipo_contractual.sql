-- La vigencia de asistencia debe reconocer los tipos contractuales del
-- catalogo (por ejemplo DOC003: Contrato de trabajo), aunque el documento no
-- capture snapshot laboral. Tambien conserva cobertura de periodos archivados.

CREATE OR REPLACE FUNCTION public.vigencia_efectiva_core(
  p_empresa_id     text,
  p_fecha          date DEFAULT current_date,
  p_personal_id    text DEFAULT NULL,
  p_personal_tipo  text DEFAULT NULL
)
RETURNS TABLE (
  empresa_id            text,
  personal_id           text,
  personal_tipo         text,
  vigente               boolean,
  fecha_desde           date,
  fecha_hasta           date,
  es_indefinido         boolean,
  estado_validacion     text,
  contrato_documento_id text,
  contrato_periodo_id   text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH personas AS (
    SELECT po.id AS personal_id, 'operativo'::text AS personal_tipo
    FROM public.personal_operativo po
    WHERE po.empresa_id = p_empresa_id
      AND (p_personal_id IS NULL OR po.id = p_personal_id)
      AND (p_personal_tipo IS NULL OR p_personal_tipo = 'operativo')

    UNION ALL

    SELECT pa.id, 'administrativo'::text
    FROM public.personal_administrativo pa
    WHERE pa.empresa_id = p_empresa_id
      AND (p_personal_id IS NULL OR pa.id = p_personal_id)
      AND (p_personal_tipo IS NULL OR p_personal_tipo = 'administrativo')
  ),
  contrato_base AS (
    SELECT DISTINCT ON (d.personal_id, COALESCE(d.contrato_periodo_id, d.id))
      d.id AS contrato_id,
      d.personal_id,
      d.contrato_periodo_id,
      d.fecha_emision,
      d.fecha_vencimiento,
      COALESCE(d.es_indefinido, false) AS es_indefinido,
      d.estado_validacion,
      d.creado_en
    FROM public.personal_documentos d
    LEFT JOIN public.tipos_documento_empresa t ON t.id = d.tipo_documento_id
    WHERE d.empresa_id = p_empresa_id
      AND (
        (t.captura_snapshot_laboral = true AND t.documento_padre_tipo_id IS NULL)
        OR lower(COALESCE(t.categoria, '')) = 'contractual'
        OR lower(concat_ws(' ', t.codigo, t.nombre, t.id, d.tipo_doc)) LIKE '%contrato%'
        OR lower(concat_ws(' ', t.codigo, t.nombre, t.id, d.tipo_doc)) LIKE '%adenda%'
      )
    ORDER BY d.personal_id,
             COALESCE(d.contrato_periodo_id, d.id),
             CASE WHEN d.activo THEN 0 ELSE 1 END,
             d.version DESC,
             d.creado_en DESC,
             d.id DESC
  ),
  adenda_vigente AS (
    SELECT DISTINCT ON (a.contrato_referencia_id)
      a.contrato_referencia_id AS contrato_id,
      a.fecha_vencimiento AS fecha_vencimiento,
      a.estado_validacion AS estado_validacion
    FROM public.personal_documentos a
    WHERE a.empresa_id = p_empresa_id
      AND a.contrato_referencia_id IS NOT NULL
      AND a.fecha_vencimiento IS NOT NULL
    ORDER BY a.contrato_referencia_id,
             COALESCE(a.fecha_vigencia_cambio, a.fecha_emision) DESC NULLS LAST,
             a.creado_en DESC
  ),
  contratos_resueltos AS (
    SELECT cb.*,
           CASE WHEN cb.es_indefinido THEN NULL
                ELSE COALESCE(av.fecha_vencimiento, cb.fecha_vencimiento)
           END AS fecha_hasta_efectiva,
           CASE WHEN av.fecha_vencimiento IS NOT NULL THEN av.estado_validacion
                ELSE cb.estado_validacion
           END AS estado_validacion_efectivo
    FROM contrato_base cb
    LEFT JOIN adenda_vigente av ON av.contrato_id = cb.contrato_id
  ),
  contrato_seleccionado AS (
    SELECT DISTINCT ON (cr.personal_id) cr.*
    FROM contratos_resueltos cr
    ORDER BY cr.personal_id,
             CASE
               WHEN (cr.fecha_emision IS NULL OR cr.fecha_emision <= p_fecha)
                AND (cr.es_indefinido
                  OR cr.fecha_hasta_efectiva IS NULL
                  OR p_fecha <= cr.fecha_hasta_efectiva)
               THEN 0 ELSE 1
             END,
             CASE WHEN cr.fecha_emision IS NULL OR cr.fecha_emision <= p_fecha THEN 0 ELSE 1 END,
             cr.fecha_emision DESC NULLS LAST,
             cr.creado_en DESC,
             cr.contrato_id DESC
  )
  SELECT
    p_empresa_id,
    p.personal_id,
    p.personal_tipo,
    CASE
      WHEN cs.contrato_id IS NULL THEN false
      WHEN cs.fecha_emision IS NOT NULL AND p_fecha < cs.fecha_emision THEN false
      WHEN cs.es_indefinido THEN true
      WHEN cs.fecha_hasta_efectiva IS NULL THEN true
      ELSE p_fecha <= cs.fecha_hasta_efectiva
    END AS vigente,
    cs.fecha_emision AS fecha_desde,
    cs.fecha_hasta_efectiva AS fecha_hasta,
    cs.es_indefinido,
    cs.estado_validacion_efectivo AS estado_validacion,
    cs.contrato_id AS contrato_documento_id,
    cs.contrato_periodo_id
  FROM personas p
  LEFT JOIN contrato_seleccionado cs ON cs.personal_id = p.personal_id;
END;
$$;

COMMENT ON FUNCTION public.vigencia_efectiva_core(text, date, text, text) IS
'Resuelve la cobertura contractual por fecha, incluyendo periodos archivados y
tipos contractuales identificados por catalogo, codigo, nombre o categoria.';

REVOKE ALL ON FUNCTION public.vigencia_efectiva_core(text, date, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.vigencia_efectiva_core(text, date, text, text) TO service_role;

SELECT pg_notify('pgrst', 'reload schema');
