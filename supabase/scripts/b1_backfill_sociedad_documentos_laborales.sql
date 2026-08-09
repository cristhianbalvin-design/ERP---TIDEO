-- Backfill supervisado B1 para solicitudes RRHH y constancias laborales.
--
-- NO es una migracion y NO debe ejecutarse automaticamente. Emite el
-- manifiesto completo antes de modificar datos, actualiza solo las 53 filas
-- derivables aprobadas y aborta si el universo difiere del diagnostico.

BEGIN;

SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '5min';

CREATE TEMP TABLE b1_tenants_permitidos (
  empresa_id text PRIMARY KEY,
  tenant text NOT NULL
) ON COMMIT DROP;

INSERT INTO b1_tenants_permitidos (empresa_id, tenant)
VALUES
  ('emp_2000000000', 'PRUEBA'),
  ('emp_20513453711', 'WHYNCO'),
  ('emp_20541435833', 'ZAHORY'),
  ('emp_20601829101', 'DIFESMAQ'),
  ('emp_20606120487', 'INGETEC');

LOCK TABLE
  public.empresas,
  public.sociedades,
  public.solicitudes_rrhh,
  public.portal_constancias_trabajo,
  public.personal_documentos,
  public.tipos_documento_empresa
IN SHARE ROW EXCLUSIVE MODE;

DO $verificar_tenants$
DECLARE
  v_invalidos jsonb;
BEGIN
  SELECT jsonb_agg(jsonb_build_object(
    'empresa_id', t.empresa_id,
    'tenant_esperado', t.tenant,
    'tenant_actual', coalesce(e.nombre_comercial, e.razon_social),
    'multisociedad_habilitado', e.multisociedad_habilitado
  ) ORDER BY t.empresa_id)
  INTO v_invalidos
  FROM b1_tenants_permitidos t
  LEFT JOIN public.empresas e ON e.id = t.empresa_id
  WHERE e.id IS NULL
     OR e.multisociedad_habilitado IS DISTINCT FROM true
     OR upper(coalesce(e.nombre_comercial, e.razon_social, '')) <> t.tenant;

  IF v_invalidos IS NOT NULL THEN
    RAISE EXCEPTION 'B1_TENANTS: lista blanca invalida: %', v_invalidos;
  END IF;
END
$verificar_tenants$;

CREATE TEMP TABLE b1_conteos_null_esperados (
  tipo_documento text NOT NULL,
  empresa_id text NOT NULL,
  filas integer NOT NULL,
  PRIMARY KEY (tipo_documento, empresa_id)
) ON COMMIT DROP;

INSERT INTO b1_conteos_null_esperados (tipo_documento, empresa_id, filas)
VALUES
  ('solicitud', 'emp_2000000000', 12),
  ('solicitud', 'emp_20513453711', 1),
  ('solicitud', 'emp_20541435833', 2),
  ('solicitud', 'emp_20601829101', 30),
  ('solicitud', 'emp_20606120487', 1),
  ('constancia', 'emp_2000000000', 6),
  ('constancia', 'emp_20541435833', 1),
  ('constancia', 'emp_20601829101', 11);

CREATE TEMP TABLE b1_objetivos (
  tipo_documento text NOT NULL,
  id text NOT NULL,
  empresa_id text NOT NULL,
  personal_id text NOT NULL,
  fecha_relevante date NOT NULL,
  sociedad_id_previa uuid,
  PRIMARY KEY (tipo_documento, id)
) ON COMMIT DROP;

INSERT INTO b1_objetivos (
  tipo_documento, id, empresa_id, personal_id, fecha_relevante,
  sociedad_id_previa
)
SELECT
  'solicitud', s.id::text, s.empresa_id, s.personal_id, s.fecha_inicio,
  s.sociedad_id
FROM public.solicitudes_rrhh s
JOIN b1_tenants_permitidos t ON t.empresa_id = s.empresa_id
WHERE s.sociedad_id IS NULL
UNION ALL
SELECT
  'constancia', c.id::text, c.empresa_id, c.personal_id,
  (c.created_at AT TIME ZONE 'UTC')::date,
  c.sociedad_id
FROM public.portal_constancias_trabajo c
JOIN b1_tenants_permitidos t ON t.empresa_id = c.empresa_id
WHERE c.sociedad_id IS NULL;

CREATE TEMP TABLE b1_conteos_null_actuales ON COMMIT DROP AS
SELECT tipo_documento, empresa_id, count(*)::integer AS filas
FROM b1_objetivos
GROUP BY tipo_documento, empresa_id;

DO $verificar_universo$
DECLARE
  v_actual jsonb;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM b1_conteos_null_esperados e
    FULL JOIN b1_conteos_null_actuales a
      ON a.tipo_documento = e.tipo_documento
     AND a.empresa_id = e.empresa_id
    WHERE e.tipo_documento IS NULL
       OR a.tipo_documento IS NULL
       OR a.filas IS DISTINCT FROM e.filas
  ) THEN
    SELECT jsonb_agg(to_jsonb(a) ORDER BY a.tipo_documento, a.empresa_id)
    INTO v_actual
    FROM b1_conteos_null_actuales a;
    RAISE EXCEPTION 'B1_UNIVERSO: los NULL actuales no coinciden con el diagnostico: %', v_actual;
  END IF;

  IF (SELECT count(*) FROM b1_objetivos) <> 64 THEN
    RAISE EXCEPTION 'B1_UNIVERSO: se esperaban exactamente 64 filas NULL';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.solicitudes_rrhh s
    JOIN public.empresas e ON e.id = s.empresa_id
    LEFT JOIN b1_tenants_permitidos t ON t.empresa_id = s.empresa_id
    WHERE e.multisociedad_habilitado = true
      AND s.sociedad_id IS NULL
      AND t.empresa_id IS NULL
    UNION ALL
    SELECT 1
    FROM public.portal_constancias_trabajo c
    JOIN public.empresas e ON e.id = c.empresa_id
    LEFT JOIN b1_tenants_permitidos t ON t.empresa_id = c.empresa_id
    WHERE e.multisociedad_habilitado = true
      AND c.sociedad_id IS NULL
      AND t.empresa_id IS NULL
  ) THEN
    RAISE EXCEPTION 'B1_UNIVERSO: existen filas NULL en tenants multisociedad fuera de la lista blanca';
  END IF;
END
$verificar_universo$;

-- Reproduce resolverSociedadContratoVigente: contrato aprobado, activo, no
-- archivado, vigente en la fecha y no superado por su tipo sucesor.
CREATE TEMP TABLE b1_candidatos_base ON COMMIT DROP AS
SELECT
  o.tipo_documento,
  o.id,
  o.empresa_id,
  o.personal_id,
  o.fecha_relevante,
  pd.id AS contrato_id,
  pd.tipo_documento_id,
  pd.sociedad_id,
  pd.periodo_fecha_inicio,
  pd.fecha_emision,
  pd.periodo_fecha_fin,
  pd.fecha_vencimiento,
  pd.es_indefinido,
  td.tipo_sucesor_id
FROM b1_objetivos o
JOIN public.personal_documentos pd
  ON pd.empresa_id = o.empresa_id
 AND pd.personal_id = o.personal_id
LEFT JOIN public.tipos_documento_empresa td
  ON td.id = pd.tipo_documento_id
 AND td.empresa_id = pd.empresa_id
WHERE pd.sociedad_id IS NOT NULL
  AND pd.contrato_referencia_id IS NULL
  AND pd.activo IS TRUE
  AND pd.estado_validacion = 'aprobado'
  AND pd.periodo_estado IS DISTINCT FROM 'archivado'
  AND NOT (
    td.documento_padre_tipo_id IS NOT NULL
    OR lower(trim(coalesce(td.nombre, td.codigo, pd.tipo_doc, ''))) LIKE '%adenda%'
  )
  AND (
    lower(trim(coalesce(td.nombre, td.codigo, pd.tipo_doc, ''))) LIKE '%contrato%'
    OR lower(trim(coalesce(td.categoria, ''))) = 'contractual'
    OR coalesce(td.captura_snapshot_laboral, false)
  )
  AND (
    coalesce(pd.periodo_fecha_inicio, pd.fecha_emision) IS NULL
    OR coalesce(pd.periodo_fecha_inicio, pd.fecha_emision) <= o.fecha_relevante
  )
  AND (
    coalesce(pd.es_indefinido, false)
    OR coalesce(pd.periodo_fecha_fin, pd.fecha_vencimiento) IS NULL
    OR coalesce(pd.periodo_fecha_fin, pd.fecha_vencimiento) >= o.fecha_relevante
  );

CREATE TEMP TABLE b1_candidatos ON COMMIT DROP AS
SELECT c.*
FROM b1_candidatos_base c
WHERE NOT EXISTS (
  SELECT 1
  FROM b1_candidatos_base sucesor
  WHERE sucesor.tipo_documento = c.tipo_documento
    AND sucesor.id = c.id
    AND sucesor.personal_id = c.personal_id
    AND sucesor.contrato_id <> c.contrato_id
    AND c.tipo_sucesor_id IS NOT NULL
    AND sucesor.tipo_documento_id = c.tipo_sucesor_id
);

CREATE TEMP TABLE b1_resolucion ON COMMIT DROP AS
SELECT
  o.*,
  count(DISTINCT c.sociedad_id)::integer AS sociedades_derivadas,
  CASE WHEN count(DISTINCT c.sociedad_id) = 1
    THEN min(c.sociedad_id::text)::uuid
    ELSE NULL
  END AS sociedad_id_esperada,
  coalesce(
    jsonb_agg(jsonb_build_object(
      'contrato_id', c.contrato_id,
      'sociedad_id', c.sociedad_id,
      'inicio', coalesce(c.periodo_fecha_inicio, c.fecha_emision),
      'fin', CASE WHEN c.es_indefinido THEN NULL
                  ELSE coalesce(c.periodo_fecha_fin, c.fecha_vencimiento) END
    ) ORDER BY c.contrato_id) FILTER (WHERE c.contrato_id IS NOT NULL),
    '[]'::jsonb
  ) AS contratos_vigentes
FROM b1_objetivos o
LEFT JOIN b1_candidatos c
  ON c.tipo_documento = o.tipo_documento
 AND c.id = o.id
GROUP BY
  o.tipo_documento, o.id, o.empresa_id, o.personal_id,
  o.fecha_relevante, o.sociedad_id_previa;

CREATE TEMP TABLE b1_manifiesto ON COMMIT DROP AS
SELECT
  r.tipo_documento,
  r.id,
  r.empresa_id,
  r.personal_id,
  r.fecha_relevante,
  r.sociedad_id_previa,
  r.sociedad_id_esperada,
  r.contratos_vigentes
FROM b1_resolucion r
WHERE r.sociedades_derivadas = 1;

CREATE TEMP TABLE b1_conteos_backfill_esperados (
  tipo_documento text NOT NULL,
  empresa_id text NOT NULL,
  filas integer NOT NULL,
  PRIMARY KEY (tipo_documento, empresa_id)
) ON COMMIT DROP;

INSERT INTO b1_conteos_backfill_esperados (tipo_documento, empresa_id, filas)
VALUES
  ('solicitud', 'emp_2000000000', 11),
  ('solicitud', 'emp_20513453711', 1),
  ('solicitud', 'emp_20541435833', 2),
  ('solicitud', 'emp_20601829101', 22),
  ('solicitud', 'emp_20606120487', 1),
  ('constancia', 'emp_2000000000', 6),
  ('constancia', 'emp_20541435833', 1),
  ('constancia', 'emp_20601829101', 9);

CREATE TEMP TABLE b1_conteos_backfill_actuales ON COMMIT DROP AS
SELECT tipo_documento, empresa_id, count(*)::integer AS filas
FROM b1_manifiesto
GROUP BY tipo_documento, empresa_id;

CREATE TEMP TABLE b1_revision_manual (
  tipo_documento text NOT NULL,
  id text NOT NULL,
  PRIMARY KEY (tipo_documento, id)
) ON COMMIT DROP;

INSERT INTO b1_revision_manual (tipo_documento, id)
VALUES
  ('solicitud', '001662bf-2faa-4bf3-a737-aa5c6c7815ab'),
  ('solicitud', 'f038595a-ecb4-41aa-ad55-9727f2fe9ac6'),
  ('solicitud', 'dd276b3d-06d6-44e2-a89b-97a24ed62eec'),
  ('solicitud', '27192ffc-62dd-49c3-94d9-f822f6c92fe0'),
  ('solicitud', '8d47c681-394a-4e2e-a067-183539c93051'),
  ('solicitud', '72baee8c-d857-411d-93ad-2dd7a3f734a3'),
  ('solicitud', '0e0c3af7-c85b-48c2-b777-bad8db405b6e'),
  ('solicitud', '98a589dd-4591-4372-806f-7cbef893c5c1'),
  ('solicitud', 'e06966ac-3e4d-4838-990d-deb4a5826191'),
  ('constancia', 'pct_fae09ecace0d'),
  ('constancia', 'pct_8dc6156a7fdf');

DO $verificar_manifiesto$
DECLARE
  v_conteos jsonb;
  v_revision jsonb;
BEGIN
  IF (SELECT count(*) FROM b1_manifiesto) <> 53
     OR (SELECT count(*) FROM b1_manifiesto WHERE tipo_documento = 'solicitud') <> 37
     OR (SELECT count(*) FROM b1_manifiesto WHERE tipo_documento = 'constancia') <> 16 THEN
    RAISE EXCEPTION 'B1_MANIFIESTO: se esperaban 53 filas (37 solicitudes y 16 constancias)';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM b1_conteos_backfill_esperados e
    FULL JOIN b1_conteos_backfill_actuales a
      ON a.tipo_documento = e.tipo_documento
     AND a.empresa_id = e.empresa_id
    WHERE e.tipo_documento IS NULL
       OR a.tipo_documento IS NULL
       OR a.filas IS DISTINCT FROM e.filas
  ) THEN
    SELECT jsonb_agg(to_jsonb(a) ORDER BY a.tipo_documento, a.empresa_id)
    INTO v_conteos
    FROM b1_conteos_backfill_actuales a;
    RAISE EXCEPTION 'B1_MANIFIESTO: conteos derivables inesperados: %', v_conteos;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM b1_manifiesto m
    LEFT JOIN public.sociedades s
      ON s.id = m.sociedad_id_esperada
     AND s.empresa_id = m.empresa_id
     AND s.activa = true
    WHERE m.sociedad_id_previa IS NOT NULL
       OR m.sociedad_id_esperada IS NULL
       OR s.id IS NULL
  ) THEN
    RAISE EXCEPTION 'B1_MANIFIESTO: existe una sociedad derivada nula, ajena al tenant o inactiva';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT r.tipo_documento, r.id
      FROM b1_resolucion r
      WHERE r.sociedades_derivadas <> 1
      EXCEPT
      SELECT m.tipo_documento, m.id FROM b1_revision_manual m
    ) faltante
    UNION ALL
    SELECT 1
    FROM (
      SELECT m.tipo_documento, m.id FROM b1_revision_manual m
      EXCEPT
      SELECT r.tipo_documento, r.id
      FROM b1_resolucion r
      WHERE r.sociedades_derivadas <> 1
    ) sobrante
  ) THEN
    SELECT jsonb_agg(jsonb_build_object(
      'tipo_documento', r.tipo_documento,
      'id', r.id,
      'sociedades_derivadas', r.sociedades_derivadas
    ) ORDER BY r.tipo_documento, r.id)
    INTO v_revision
    FROM b1_resolucion r
    WHERE r.sociedades_derivadas <> 1;
    RAISE EXCEPTION 'B1_MANIFIESTO: los casos no derivables cambiaron: %', v_revision;
  END IF;
END
$verificar_manifiesto$;

-- MANIFIESTO: estos result sets se emiten antes de cualquier UPDATE.
SELECT
  m.tipo_documento,
  m.id,
  t.tenant,
  m.empresa_id,
  m.personal_id,
  m.fecha_relevante,
  m.sociedad_id_previa,
  m.sociedad_id_esperada,
  s.codigo AS sociedad_codigo,
  s.nombre AS sociedad_nombre,
  m.contratos_vigentes
FROM b1_manifiesto m
JOIN b1_tenants_permitidos t ON t.empresa_id = m.empresa_id
JOIN public.sociedades s ON s.id = m.sociedad_id_esperada
ORDER BY m.tipo_documento, t.tenant, m.fecha_relevante, m.id;

SELECT
  r.tipo_documento,
  r.id,
  t.tenant,
  r.empresa_id,
  r.personal_id,
  r.fecha_relevante,
  r.sociedades_derivadas,
  r.contratos_vigentes
FROM b1_resolucion r
JOIN b1_revision_manual x
  ON x.tipo_documento = r.tipo_documento
 AND x.id = r.id
JOIN b1_tenants_permitidos t ON t.empresa_id = r.empresa_id
ORDER BY r.tipo_documento, t.tenant, r.fecha_relevante, r.id;

CREATE TEMP TABLE b1_actualizados (
  tipo_documento text NOT NULL,
  id text NOT NULL,
  PRIMARY KEY (tipo_documento, id)
) ON COMMIT DROP;

WITH actualizados AS (
  UPDATE public.solicitudes_rrhh s
  SET sociedad_id = m.sociedad_id_esperada
  FROM b1_manifiesto m
  WHERE m.tipo_documento = 'solicitud'
    AND m.id = s.id::text
    AND m.empresa_id = s.empresa_id
    AND s.sociedad_id IS NULL
  RETURNING s.id::text AS id
)
INSERT INTO b1_actualizados (tipo_documento, id)
SELECT 'solicitud', id FROM actualizados;

WITH actualizados AS (
  UPDATE public.portal_constancias_trabajo c
  SET sociedad_id = m.sociedad_id_esperada
  FROM b1_manifiesto m
  WHERE m.tipo_documento = 'constancia'
    AND m.id = c.id::text
    AND m.empresa_id = c.empresa_id
    AND c.sociedad_id IS NULL
  RETURNING c.id::text AS id
)
INSERT INTO b1_actualizados (tipo_documento, id)
SELECT 'constancia', id FROM actualizados;

DO $verificar_resultado$
BEGIN
  IF (SELECT count(*) FROM b1_actualizados) <> 53
     OR (SELECT count(*) FROM b1_actualizados WHERE tipo_documento = 'solicitud') <> 37
     OR (SELECT count(*) FROM b1_actualizados WHERE tipo_documento = 'constancia') <> 16 THEN
    RAISE EXCEPTION 'B1_RESULTADO: el UPDATE no modifico exactamente 53 filas (37 solicitudes y 16 constancias)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM b1_manifiesto m
    FULL JOIN b1_actualizados a
      ON a.tipo_documento = m.tipo_documento
     AND a.id = m.id
    WHERE m.id IS NULL OR a.id IS NULL
  ) THEN
    RAISE EXCEPTION 'B1_RESULTADO: el conjunto actualizado difiere del manifiesto';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM b1_manifiesto m
    JOIN public.solicitudes_rrhh s
      ON m.tipo_documento = 'solicitud'
     AND m.id = s.id::text
    WHERE s.sociedad_id IS DISTINCT FROM m.sociedad_id_esperada
    UNION ALL
    SELECT 1
    FROM b1_manifiesto m
    JOIN public.portal_constancias_trabajo c
      ON m.tipo_documento = 'constancia'
     AND m.id = c.id::text
    WHERE c.sociedad_id IS DISTINCT FROM m.sociedad_id_esperada
  ) THEN
    RAISE EXCEPTION 'B1_RESULTADO: alguna fila no conserva la sociedad manifestada';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM b1_revision_manual x
    JOIN public.solicitudes_rrhh s
      ON x.tipo_documento = 'solicitud'
     AND x.id = s.id::text
    WHERE s.sociedad_id IS NOT NULL
    UNION ALL
    SELECT 1
    FROM b1_revision_manual x
    JOIN public.portal_constancias_trabajo c
      ON x.tipo_documento = 'constancia'
     AND x.id = c.id::text
    WHERE c.sociedad_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'B1_RESULTADO: se modifico un caso reservado para revision manual';
  END IF;

  IF (
    SELECT count(*)
    FROM public.solicitudes_rrhh s
    JOIN b1_tenants_permitidos t ON t.empresa_id = s.empresa_id
    WHERE s.sociedad_id IS NULL
  ) <> 9 THEN
    RAISE EXCEPTION 'B1_RESULTADO: deben quedar exactamente 9 solicitudes para revision manual';
  END IF;

  IF (
    SELECT count(*)
    FROM public.portal_constancias_trabajo c
    JOIN b1_tenants_permitidos t ON t.empresa_id = c.empresa_id
    WHERE c.sociedad_id IS NULL
  ) <> 2 THEN
    RAISE EXCEPTION 'B1_RESULTADO: deben quedar exactamente 2 constancias para revision manual';
  END IF;
END
$verificar_resultado$;

SELECT tipo_documento, count(*) AS filas_actualizadas
FROM b1_actualizados
GROUP BY tipo_documento
ORDER BY tipo_documento;

COMMIT;
