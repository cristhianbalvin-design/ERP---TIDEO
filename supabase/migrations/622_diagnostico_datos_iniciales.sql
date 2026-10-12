BEGIN;
SET LOCAL lock_timeout = '5s';

DO $pre$
BEGIN
  IF to_regclass('public.diagnosticos_tecnicos') IS NULL THEN RAISE EXCEPTION 'PRECONDITION_FAILED: falta diagnosticos_tecnicos'; END IF;
  IF to_regclass('public.personal_operativo') IS NULL THEN RAISE EXCEPTION 'PRECONDITION_FAILED: falta personal_operativo'; END IF;
  IF to_regclass('public.familia_trabajo') IS NULL THEN RAISE EXCEPTION 'PRECONDITION_FAILED: falta familia_trabajo'; END IF;
  IF to_regclass('public.activos') IS NULL THEN RAISE EXCEPTION 'PRECONDITION_FAILED: falta activos'; END IF;
  IF to_regclass('public.catalogo_componentes') IS NULL THEN RAISE EXCEPTION 'PRECONDITION_FAILED: falta catalogo_componentes'; END IF;
  IF to_regprocedure('public.usuario_puede(text,text,text)') IS NULL THEN RAISE EXCEPTION 'PRECONDITION_FAILED: falta usuario_puede(text,text,text)'; END IF;
  IF to_regprocedure('public.usuario_tiene_empresa(text)') IS NULL THEN RAISE EXCEPTION 'PRECONDITION_FAILED: falta usuario_tiene_empresa(text)'; END IF;
  IF to_regprocedure('public.usuario_puede_ver_diagnostico_padre(text,text,text,text)') IS NULL THEN RAISE EXCEPTION 'PRECONDITION_FAILED: falta usuario_puede_ver_diagnostico_padre(text,text,text,text)'; END IF;
END $pre$;

ALTER TABLE public.diagnosticos_tecnicos
  ADD COLUMN IF NOT EXISTS motivo text,
  ADD COLUMN IF NOT EXISTS tecnico_id text,
  ADD COLUMN IF NOT EXISTS fecha_inspeccion date,
  ADD COLUMN IF NOT EXISTS trabajos_evaluar uuid[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS diagnosticos_tecnicos_tecnico_idx
  ON public.diagnosticos_tecnicos(empresa_id, tecnico_id)
  WHERE tecnico_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validar_datos_iniciales_diagnostico()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_familia uuid;
BEGIN
  IF TG_OP='UPDATE' AND NEW.empresa_id IS NOT DISTINCT FROM OLD.empresa_id
    AND NEW.motivo IS NOT DISTINCT FROM OLD.motivo
    AND NEW.tecnico_id IS NOT DISTINCT FROM OLD.tecnico_id
    AND NEW.fecha_inspeccion IS NOT DISTINCT FROM OLD.fecha_inspeccion
    AND NEW.trabajos_evaluar IS NOT DISTINCT FROM OLD.trabajos_evaluar THEN
    RETURN NEW;
  END IF;
  IF NEW.tecnico_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.personal_operativo p
    WHERE p.id=NEW.tecnico_id AND p.empresa_id=NEW.empresa_id
  ) THEN
    RAISE EXCEPTION 'El técnico debe pertenecer a la misma empresa.' USING ERRCODE='23514';
  END IF;

  FOREACH v_familia IN ARRAY coalesce(NEW.trabajos_evaluar, '{}') LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.familia_trabajo f
      WHERE f.id=v_familia AND f.empresa_id=NEW.empresa_id AND f.activo
    ) THEN
      RAISE EXCEPTION 'Cada trabajo a evaluar debe ser una familia activa de la empresa.' USING ERRCODE='23514';
    END IF;
  END LOOP;

  IF TG_OP='UPDATE' AND OLD.estado='emitido' AND (
    NEW.motivo IS DISTINCT FROM OLD.motivo OR
    NEW.tecnico_id IS DISTINCT FROM OLD.tecnico_id OR
    NEW.fecha_inspeccion IS DISTINCT FROM OLD.fecha_inspeccion OR
    NEW.trabajos_evaluar IS DISTINCT FROM OLD.trabajos_evaluar
  ) THEN
    RAISE EXCEPTION 'Los datos iniciales de un diagnóstico emitido son inmutables.' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $fn$;

DO $trigger$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_validar_datos_iniciales_diagnostico'
    AND tgrelid='public.diagnosticos_tecnicos'::regclass AND NOT tgisinternal) THEN
    CREATE TRIGGER trg_validar_datos_iniciales_diagnostico
      BEFORE INSERT OR UPDATE ON public.diagnosticos_tecnicos
      FOR EACH ROW EXECUTE FUNCTION public.validar_datos_iniciales_diagnostico();
  END IF;
END $trigger$;
REVOKE ALL ON FUNCTION public.validar_datos_iniciales_diagnostico() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.crear_diagnostico_tecnico_inicial(
  p_empresa_id text,
  p_tipo text,
  p_recepcion_id text DEFAULT NULL,
  p_oportunidad_id text DEFAULT NULL,
  p_motivo text DEFAULT NULL,
  p_tecnico_id text DEFAULT NULL,
  p_fecha_inspeccion date DEFAULT NULL,
  p_trabajos_evaluar uuid[] DEFAULT '{}'
)
RETURNS public.diagnosticos_tecnicos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
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
    OR p_tecnico_id IS NULL OR p_fecha_inspeccion IS NULL OR cardinality(coalesce(p_trabajos_evaluar,'{}'))=0) THEN
    RAISE EXCEPTION 'Completa motivo, trabajos a evaluar, técnico y fecha.' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.diagnosticos_tecnicos(
    empresa_id,tipo,recepcion_id,oportunidad_id,estado,motivo,tecnico_id,fecha_inspeccion,trabajos_evaluar,elaborado_por
  ) VALUES (
    p_empresa_id,p_tipo,p_recepcion_id,p_oportunidad_id,'borrador',nullif(btrim(p_motivo),''),
    p_tecnico_id,p_fecha_inspeccion,coalesce(p_trabajos_evaluar,'{}'),auth.uid()
  ) RETURNING * INTO v_result;
  RETURN v_result;
END $fn$;
REVOKE ALL ON FUNCTION public.crear_diagnostico_tecnico_inicial(text,text,text,text,text,text,date,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crear_diagnostico_tecnico_inicial(text,text,text,text,text,text,date,uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.obtener_datos_iniciales_diagnostico_tecnico(p_empresa_id text,p_diagnostico_id text)
RETURNS TABLE (
  diagnostico_id text,
  motivo text,
  tecnico_id text,
  tecnico_nombre text,
  fecha_inspeccion date,
  trabajos_evaluar uuid[],
  componente_catalogo_id text,
  componente_nombre text,
  componente_svg text,
  tipo_activo text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT public.usuario_tiene_empresa(p_empresa_id)
    OR NOT public.usuario_puede(p_empresa_id,'diagnostico_tecnico','ver') THEN RETURN; END IF;
  RETURN QUERY
  SELECT d.id,d.motivo,d.tecnico_id,p.nombre,d.fecha_inspeccion,d.trabajos_evaluar,
    a.componente_catalogo_id,c.nombre,c.svg,a.tipo_activo
  FROM public.diagnosticos_tecnicos d
  LEFT JOIN public.personal_operativo p ON p.id=d.tecnico_id AND p.empresa_id=d.empresa_id
  LEFT JOIN public.activos a ON a.id=d.activo_id AND a.empresa_id=d.empresa_id
  LEFT JOIN public.catalogo_componentes c ON c.id=a.componente_catalogo_id
  WHERE d.id=p_diagnostico_id AND d.empresa_id=p_empresa_id
    AND public.usuario_puede_ver_diagnostico_padre(d.tipo,d.empresa_id,d.recepcion_id,d.oportunidad_id);
END $fn$;
REVOKE ALL ON FUNCTION public.obtener_datos_iniciales_diagnostico_tecnico(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.obtener_datos_iniciales_diagnostico_tecnico(text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.listar_tecnicos_diagnostico(p_empresa_id text)
RETURNS TABLE(id text,nombre text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT p.id,p.nombre
  FROM public.personal_operativo p
  WHERE p.empresa_id=p_empresa_id
    AND coalesce(lower(p.estado),'activo') IN ('activo','habilitado')
    AND public.usuario_tiene_empresa(p_empresa_id)
    AND public.usuario_puede(p_empresa_id,'diagnostico_tecnico','ver')
  ORDER BY p.nombre,p.id
$fn$;
REVOKE ALL ON FUNCTION public.listar_tecnicos_diagnostico(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.listar_tecnicos_diagnostico(text) TO authenticated;

DO $verify$
BEGIN
  IF (SELECT count(*)=4 FROM information_schema.columns WHERE table_schema='public' AND table_name='diagnosticos_tecnicos' AND column_name IN ('motivo','tecnico_id','fecha_inspeccion','trabajos_evaluar')) IS NOT TRUE THEN RAISE EXCEPTION 'VERIFY_FAILED: faltan columnas de datos iniciales'; END IF;
  IF to_regprocedure('public.crear_diagnostico_tecnico_inicial(text,text,text,text,text,text,date,uuid[])') IS NULL THEN RAISE EXCEPTION 'VERIFY_FAILED: falta la RPC para crear el borrador'; END IF;
  IF to_regprocedure('public.obtener_datos_iniciales_diagnostico_tecnico(text,text)') IS NULL THEN RAISE EXCEPTION 'VERIFY_FAILED: falta la RPC de lectura inicial'; END IF;
  IF to_regprocedure('public.listar_tecnicos_diagnostico(text)') IS NULL THEN RAISE EXCEPTION 'VERIFY_FAILED: falta la RPC de t?cnicos'; END IF;
  IF (SELECT count(*)=1 FROM pg_trigger WHERE tgname='trg_validar_datos_iniciales_diagnostico' AND tgrelid='public.diagnosticos_tecnicos'::regclass AND NOT tgisinternal) IS NOT TRUE THEN RAISE EXCEPTION 'VERIFY_FAILED: falta el trigger de validaci?n e inmutabilidad'; END IF;
END $verify$;
COMMIT;

-- Verificación posterior opcional (no muta datos):
-- SELECT column_name,data_type FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='diagnosticos_tecnicos'
--   AND column_name IN ('motivo','tecnico_id','fecha_inspeccion','trabajos_evaluar') ORDER BY column_name;
-- SELECT to_regprocedure('public.crear_diagnostico_tecnico_inicial(text,text,text,text,text,text,date,uuid[])'),
--        to_regprocedure('public.obtener_datos_iniciales_diagnostico_tecnico(text,text)'),
--        to_regprocedure('public.listar_tecnicos_diagnostico(text)');
