-- 319 — Fase 2: función consolidada de vigencia laboral efectiva
-- Punto único de verdad para "¿está esta persona vigente en la fecha X?",
-- resuelto a partir de la cadena Contrato principal (activo) + Adendas
-- vinculadas por contrato_referencia_id. No altera datos (solo lectura).
--
-- Decisiones de diseño (acordadas antes de implementar):
--   1. Alcance: solo el ciclo laboral vigente/más reciente (contrato con
--      activo=true). No reconstruye historial de ceses/reingresos previos.
--   2. estado_validacion: se expone como dato informativo; esta función NO
--      decide bloqueo de asistencia (eso lo resuelve cada módulo consumidor).
--   3. Adendas: la adenda MÁS RECIENTE (por fecha_vigencia_cambio, luego
--      fecha_emision, luego creado_en) que tenga fecha_vencimiento no nula
--      reemplaza la fecha fin del contrato base — puede extender o acortar.

CREATE OR REPLACE FUNCTION public.vigencia_efectiva(
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
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Acceso denegado al tenant';
  END IF;

  RETURN QUERY
  WITH personas AS (
    SELECT po.id AS personal_id, 'operativo'::text AS personal_tipo
    FROM   public.personal_operativo po
    WHERE  po.empresa_id = p_empresa_id
      AND  (p_personal_id IS NULL OR po.id = p_personal_id)
      AND  (p_personal_tipo IS NULL OR p_personal_tipo = 'operativo')

    UNION ALL

    SELECT pa.id, 'administrativo'::text
    FROM   public.personal_administrativo pa
    WHERE  pa.empresa_id = p_empresa_id
      AND  (p_personal_id IS NULL OR pa.id = p_personal_id)
      AND  (p_personal_tipo IS NULL OR p_personal_tipo = 'administrativo')
  ),

  -- Contrato principal del ciclo vigente: el documento activo cuyo tipo es
  -- "Contrato" y no "Adenda" (mismo criterio que procesar_sin_contrato_digital,
  -- migración 249: catálogo captura_snapshot_laboral, con fallback de texto
  -- para tipos legado sin tipo_documento_id).
  contrato_base AS (
    SELECT DISTINCT ON (d.personal_id)
      d.id                  AS contrato_id,
      d.personal_id,
      d.contrato_periodo_id,
      d.fecha_emision,
      d.fecha_vencimiento,
      COALESCE(d.es_indefinido, false) AS es_indefinido,
      d.estado_validacion
    FROM   public.personal_documentos d
    LEFT   JOIN public.tipos_documento_empresa t ON t.id = d.tipo_documento_id
    WHERE  d.empresa_id = p_empresa_id
      AND  d.activo = true
      AND  (
        (t.captura_snapshot_laboral = true AND t.documento_padre_tipo_id IS NULL)
        OR (
          lower(COALESCE(d.tipo_doc, '')) LIKE '%contrato%'
          AND lower(COALESCE(d.tipo_doc, '')) NOT LIKE '%adenda%'
        )
      )
    ORDER  BY d.personal_id, d.fecha_emision DESC NULLS LAST, d.creado_en DESC
  ),

  -- Adenda más reciente de cada contrato base que trae fecha_vencimiento propia.
  adenda_vigente AS (
    SELECT DISTINCT ON (a.contrato_referencia_id)
      a.contrato_referencia_id AS contrato_id,
      a.fecha_vencimiento      AS fecha_vencimiento,
      a.estado_validacion      AS estado_validacion
    FROM   public.personal_documentos a
    WHERE  a.empresa_id = p_empresa_id
      AND  a.contrato_referencia_id IS NOT NULL
      AND  a.fecha_vencimiento IS NOT NULL
    ORDER  BY a.contrato_referencia_id,
              COALESCE(a.fecha_vigencia_cambio, a.fecha_emision) DESC NULLS LAST,
              a.creado_en DESC
  )

  SELECT
    p_empresa_id,
    p.personal_id,
    p.personal_tipo,
    CASE
      WHEN cb.contrato_id IS NULL                              THEN false
      WHEN p_fecha < cb.fecha_emision                          THEN false
      WHEN cb.es_indefinido                                    THEN true
      WHEN COALESCE(av.fecha_vencimiento, cb.fecha_vencimiento) IS NULL THEN true
      ELSE p_fecha <= COALESCE(av.fecha_vencimiento, cb.fecha_vencimiento)
    END AS vigente,
    cb.fecha_emision AS fecha_desde,
    CASE WHEN cb.es_indefinido THEN NULL
         ELSE COALESCE(av.fecha_vencimiento, cb.fecha_vencimiento)
    END AS fecha_hasta,
    cb.es_indefinido,
    CASE WHEN av.fecha_vencimiento IS NOT NULL THEN av.estado_validacion
         ELSE cb.estado_validacion
    END AS estado_validacion,
    cb.contrato_id AS contrato_documento_id,
    cb.contrato_periodo_id
  FROM personas p
  LEFT JOIN contrato_base   cb ON cb.personal_id = p.personal_id
  LEFT JOIN adenda_vigente  av ON av.contrato_id  = cb.contrato_id;
END;
$$;

COMMENT ON FUNCTION public.vigencia_efectiva(text, date, text, text) IS
'Punto único de verdad para vigencia laboral. Para cada persona (o una sola si
se pasan p_personal_id/p_personal_tipo), evalúa la cadena Contrato principal
activo + Adenda más reciente vinculada, en la fecha p_fecha (default hoy).

Campos del resultado:
  vigente               - true si la persona tiene contrato principal activo
                           y p_fecha cae dentro de [fecha_desde, fecha_hasta].
  fecha_desde            - fecha_emision del contrato principal del ciclo vigente.
  fecha_hasta             - fin efectivo: la fecha_vencimiento de la adenda más
                           reciente si existe, si no la del contrato base;
                           NULL si es_indefinido o si no hay fecha de fin.
  es_indefinido           - true si el contrato base es indefinido (sin vencimiento).
  estado_validacion       - estado (pendiente/aprobado/rechazado) del documento
                           que determina fecha_hasta (adenda si la hay, si no el
                           contrato). Dato informativo: esta función NO decide
                           bloqueo, cada módulo interpreta este estado.
  contrato_documento_id   - id del documento de contrato principal (trazabilidad).
  contrato_periodo_id    - id del período contractual ancla del ciclo vigente.

Limitación conocida: solo resuelve el ciclo laboral más reciente (el contrato
con activo=true). No reconstruye historial de ceses/reingresos previos ni
antiguos contrato_periodo_id archivados.';

REVOKE ALL ON FUNCTION public.vigencia_efectiva(text, date, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.vigencia_efectiva(text, date, text, text) TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
