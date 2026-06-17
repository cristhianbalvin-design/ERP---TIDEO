-- ============================================================================
-- 262 · Actualizar seed de tipos de documento
-- ============================================================================

-- 1. Reemplazar función importar_plantilla_tipos_documento
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

END;
$$;

-- 2. Actualizar registros existentes según reglas
UPDATE public.tipos_documento_empresa
SET renovable = true,
    permite_firma_trabajador = false,
    captura_snapshot_laboral = false
WHERE nombre ILIKE '%SCTR%';

UPDATE public.tipos_documento_empresa
SET renovable = true,
    permite_firma_trabajador = false,
    captura_snapshot_laboral = false
WHERE nombre ILIKE '%Examen Médico%'
   OR nombre ILIKE '%Examen Medico%';

UPDATE public.tipos_documento_empresa
SET renovable = true,
    permite_firma_trabajador = false,
    captura_snapshot_laboral = false
WHERE nombre ILIKE '%Carnet Minero%';

UPDATE public.tipos_documento_empresa
SET renovable = true,
    permite_firma_trabajador = false,
    captura_snapshot_laboral = false
WHERE nombre ILIKE '%Trabajo en Altura%'
   OR nombre ILIKE '%Altura%';
