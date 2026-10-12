-- 623: los trabajos ya no se eligen al crear el diagnostico de mantenimiento;
-- nacen de los hallazgos (cada hallazgo propone su trabajo). Se relaja la
-- validacion de crear_diagnostico_tecnico_inicial: p_trabajos_evaluar es opcional.
-- Migracion aditiva: solo CREATE OR REPLACE de la funcion, misma firma.

CREATE OR REPLACE FUNCTION public.crear_diagnostico_tecnico_inicial(
  p_empresa_id text, p_tipo text, p_recepcion_id text DEFAULT NULL::text,
  p_oportunidad_id text DEFAULT NULL::text, p_motivo text DEFAULT NULL::text,
  p_tecnico_id text DEFAULT NULL::text, p_fecha_inspeccion date DEFAULT NULL::date,
  p_trabajos_evaluar uuid[] DEFAULT '{}'::uuid[])
 RETURNS diagnosticos_tecnicos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_result public.diagnosticos_tecnicos%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.usuario_tiene_empresa(p_empresa_id)
    OR NOT public.usuario_puede(p_empresa_id,'diagnostico_tecnico','crear') THEN
    RAISE EXCEPTION 'No tienes permiso para crear diagnósticos técnicos.' USING ERRCODE='42501';
  END IF;
  IF p_tipo NOT IN ('mantenimiento','fabricacion') THEN
    RAISE EXCEPTION 'Tipo de diagnóstico no válido.' USING ERRCODE='22023';
  END IF;
  IF p_tipo='mantenimiento' AND (p_recepcion_id IS NULL OR p_oportunidad_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Selecciona una recepción válida.' USING ERRCODE='22023';
  END IF;
  IF p_tipo='fabricacion' AND (p_oportunidad_id IS NULL OR p_recepcion_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Selecciona una oportunidad válida.' USING ERRCODE='22023';
  END IF;
  IF NOT public.usuario_puede_ver_diagnostico_padre(p_tipo,p_empresa_id,p_recepcion_id,p_oportunidad_id) THEN
    RAISE EXCEPTION 'La referencia no está disponible para esta empresa y alcance.' USING ERRCODE='42501';
  END IF;
  IF p_tipo='mantenimiento' AND (nullif(btrim(coalesce(p_motivo,'')),'') IS NULL
    OR p_tecnico_id IS NULL OR p_fecha_inspeccion IS NULL) THEN
    RAISE EXCEPTION 'Completa motivo, técnico y fecha.' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.diagnosticos_tecnicos(
    empresa_id,tipo,recepcion_id,oportunidad_id,estado,motivo,tecnico_id,fecha_inspeccion,trabajos_evaluar,elaborado_por
  ) VALUES (
    p_empresa_id,p_tipo,p_recepcion_id,p_oportunidad_id,'borrador',nullif(btrim(p_motivo),''),
    p_tecnico_id,p_fecha_inspeccion,coalesce(p_trabajos_evaluar,'{}'),auth.uid()
  ) RETURNING * INTO v_result;
  RETURN v_result;
END $function$;

DO $verify$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='crear_diagnostico_tecnico_inicial';
  IF v_def IS NULL OR v_def LIKE '%cardinality(coalesce(p_trabajos_evaluar%' THEN
    RAISE EXCEPTION '623: la validacion de trabajos sigue activa';
  END IF;
END $verify$;
