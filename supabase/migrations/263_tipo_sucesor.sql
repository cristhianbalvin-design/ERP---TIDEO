-- ============================================================================
-- 263 · Tipo Sucesor
-- ============================================================================

-- 1. Agregar campo a tipos_documento_empresa
ALTER TABLE public.tipos_documento_empresa
ADD COLUMN IF NOT EXISTS tipo_sucesor_id text
REFERENCES public.tipos_documento_empresa(id)
ON DELETE SET NULL;

-- 2. Configurar la relación para los tipos existentes en todos los tenants
UPDATE public.tipos_documento_empresa tp
SET tipo_sucesor_id = (
  SELECT id FROM public.tipos_documento_empresa ts
  WHERE ts.empresa_id = tp.empresa_id
  AND ts.nombre = 'Contrato Laboral'
  LIMIT 1
)
WHERE tp.nombre = 'Contrato Primigenio'
AND EXISTS (
  SELECT 1 FROM public.tipos_documento_empresa ts
  WHERE ts.empresa_id = tp.empresa_id
  AND ts.nombre = 'Contrato Laboral'
)
AND tp.tipo_sucesor_id IS NULL;

-- 3. Actualizar la función importar_plantilla_tipos_documento
CREATE OR REPLACE FUNCTION public.importar_plantilla_tipos_documento(p_empresa_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plantilla jsonb := '[
    {"codigo":"TDOC-001", "nombre":"SCTR", "ambito":"Operativo", "exige_vencimiento":true, "dias_alerta":30, "es_habilitante":true, "requiere_validacion":true, "orden":1, "renovable":true, "permite_firma_trabajador":false, "captura_snapshot_laboral":false},
    {"codigo":"TDOC-002", "nombre":"Examen Médico Ocupacional", "ambito":"Ambos", "exige_vencimiento":true, "dias_alerta":30, "es_habilitante":true, "requiere_validacion":true, "orden":2, "renovable":true, "permite_firma_trabajador":false, "captura_snapshot_laboral":false},
    {"codigo":"TDOC-003", "nombre":"Entrega de EPP", "ambito":"Operativo", "exige_vencimiento":false, "dias_alerta":0, "es_habilitante":true, "requiere_validacion":false, "orden":3, "renovable":false, "permite_firma_trabajador":false, "captura_snapshot_laboral":false},
    {"codigo":"TDOC-004", "nombre":"Licencia de Conducir", "ambito":"Operativo", "exige_vencimiento":true, "dias_alerta":30, "es_habilitante":true, "requiere_validacion":false, "orden":4, "renovable":false, "permite_firma_trabajador":false, "captura_snapshot_laboral":false},
    {"codigo":"TDOC-005", "nombre":"Carnet Minero", "ambito":"Operativo", "exige_vencimiento":true, "dias_alerta":30, "es_habilitante":true, "requiere_validacion":true, "orden":5, "renovable":true, "permite_firma_trabajador":false, "captura_snapshot_laboral":false},
    {"codigo":"TDOC-006", "nombre":"Cert. Trabajo en Altura", "ambito":"Operativo", "exige_vencimiento":true, "dias_alerta":30, "es_habilitante":true, "requiere_validacion":true, "orden":6, "renovable":true, "permite_firma_trabajador":false, "captura_snapshot_laboral":false},
    {"codigo":"TDOC-007", "nombre":"DNI", "ambito":"Ambos", "exige_vencimiento":false, "dias_alerta":0, "es_habilitante":false, "requiere_validacion":false, "orden":7, "renovable":false, "permite_firma_trabajador":false, "captura_snapshot_laboral":false},
    {"codigo":"DOC-PRIM", "nombre":"Contrato Primigenio", "ambito":"Ambos", "exige_vencimiento":true, "dias_alerta":7, "es_habilitante":true, "requiere_validacion":true, "orden":8, "renovable":false, "permite_firma_trabajador":false, "captura_snapshot_laboral":true},
    {"codigo":"DOC-001", "nombre":"Contrato Laboral", "ambito":"Ambos", "exige_vencimiento":true, "dias_alerta":7, "es_habilitante":true, "requiere_validacion":true, "orden":9, "renovable":true, "permite_firma_trabajador":true, "captura_snapshot_laboral":true},
    {"codigo":"TDOC-009", "nombre":"Credencial de Acceso", "ambito":"Ambos", "exige_vencimiento":true, "dias_alerta":15, "es_habilitante":false, "requiere_validacion":true, "orden":10, "renovable":false, "permite_firma_trabajador":false, "captura_snapshot_laboral":false},
    {"codigo":"DOC-ADENDA", "nombre":"Adenda contractual", "ambito":"Ambos", "exige_vencimiento":true, "dias_alerta":7, "es_habilitante":false, "requiere_validacion":true, "orden":11, "renovable":false, "permite_firma_trabajador":false, "captura_snapshot_laboral":true}
  ]'::jsonb;
  rec jsonb;
BEGIN
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN
    -- Al ser llamado programáticamente desde un trigger o un proceso batch, podríamos no tener el contexto JWT
    -- Si es así, esta verificación fallará. En la versión anterior también estaba.
    RAISE EXCEPTION 'Sin acceso a la empresa %', p_empresa_id;
  END IF;

  FOR rec IN SELECT jsonb_array_elements(v_plantilla)
  LOOP
    INSERT INTO public.tipos_documento_empresa (
      id, empresa_id, codigo, nombre, ambito,
      exige_vencimiento, dias_alerta, es_habilitante, requiere_validacion,
      estado, orden,
      renovable, permite_firma_trabajador, captura_snapshot_laboral
    ) VALUES (
      'tdoc_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 18),
      p_empresa_id,
      rec->>'codigo',
      rec->>'nombre',
      rec->>'ambito',
      COALESCE((rec->>'exige_vencimiento')::boolean, false),
      COALESCE((rec->>'dias_alerta')::integer, 0),
      COALESCE((rec->>'es_habilitante')::boolean, false),
      COALESCE((rec->>'requiere_validacion')::boolean, false),
      'activo',
      COALESCE((rec->>'orden')::integer, 0),
      COALESCE((rec->>'renovable')::boolean, false),
      COALESCE((rec->>'permite_firma_trabajador')::boolean, false),
      COALESCE((rec->>'captura_snapshot_laboral')::boolean, false)
    )
    ON CONFLICT (empresa_id, codigo) DO NOTHING;
  END LOOP;

  -- Vincular Adenda al Contrato Laboral
  UPDATE public.tipos_documento_empresa
  SET documento_padre_tipo_id = (
      SELECT id FROM public.tipos_documento_empresa
      WHERE empresa_id = p_empresa_id AND codigo = 'DOC-001'
      LIMIT 1
  )
  WHERE empresa_id = p_empresa_id AND codigo = 'DOC-ADENDA' AND documento_padre_tipo_id IS NULL;

  -- Vincular Contrato Primigenio a Contrato Laboral (Sucesor)
  UPDATE public.tipos_documento_empresa
  SET tipo_sucesor_id = (
    SELECT id FROM public.tipos_documento_empresa
    WHERE empresa_id = p_empresa_id AND nombre = 'Contrato Laboral'
    LIMIT 1
  )
  WHERE empresa_id = p_empresa_id AND nombre = 'Contrato Primigenio' AND tipo_sucesor_id IS NULL;

END;
$$;


-- 4. Actualizar lógica de alertas y estado (calcular_habilitaciones_personal)
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

-- 5. Recrear vista
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
