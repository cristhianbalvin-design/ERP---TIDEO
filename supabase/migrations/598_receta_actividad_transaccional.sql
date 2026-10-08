-- 598: Guardado atomico de recetas de actividad.
-- Decisiones: reemplazo completo con diff transaccional y permiso maestros/editar;
-- conservar ids existentes, validar tenant para actividad/tarea/cargo y bloquear
-- escrituras concurrentes por empresa y actividad. Solo recetaActividadService escribe.
-- Aplicar solo tras ensayo con ROLLBACK y revisión del líder; sin bloque de pruebas para evitar bloqueos largos sobre plantillas_actividad.

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $pre$
BEGIN
  ASSERT to_regclass('public.plantillas_actividad') IS NOT NULL,
    'PRECONDITION_FAILED: falta plantillas_actividad';
  ASSERT to_regclass('public.tipos_servicio_interno') IS NOT NULL,
    'PRECONDITION_FAILED: falta tipos_servicio_interno';
  ASSERT to_regclass('public.cargos_empresa') IS NOT NULL,
    'PRECONDITION_FAILED: falta cargos_empresa';
  ASSERT to_regprocedure('public.usuario_tiene_empresa(text)') IS NOT NULL
    AND to_regprocedure('public.usuario_puede(text,text,text)') IS NOT NULL,
    'PRECONDITION_FAILED: faltan helpers de permisos';
END
$pre$;

CREATE OR REPLACE FUNCTION public.validar_plantilla_actividad_referencias()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $fn$
DECLARE ae text; te text; ce text;
BEGIN
  IF NEW.actividad_id=NEW.tarea_id THEN
    RAISE EXCEPTION 'Una plantilla no puede autorreferenciarse.' USING ERRCODE='23514';
  END IF;
  SELECT empresa_id INTO ae FROM public.tipos_servicio_interno WHERE id=NEW.actividad_id;
  SELECT empresa_id INTO te FROM public.tipos_servicio_interno WHERE id=NEW.tarea_id;
  SELECT empresa_id INTO ce FROM public.cargos_empresa WHERE id=NEW.cargo_id;
  IF ae IS NULL OR te IS NULL OR ae IS DISTINCT FROM NEW.empresa_id OR te IS DISTINCT FROM NEW.empresa_id THEN
    RAISE EXCEPTION 'Las referencias de la plantilla deben pertenecer al mismo tenant.' USING ERRCODE='23514';
  END IF;
  IF NEW.cargo_id IS NOT NULL AND ce IS DISTINCT FROM NEW.empresa_id THEN
    RAISE EXCEPTION 'El cargo debe pertenecer al mismo tenant.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END
$fn$;

CREATE OR REPLACE FUNCTION public.reemplazar_receta_actividad(
  p_empresa_id text,
  p_actividad_id text,
  p_filas jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $fn$
DECLARE
  v_fila jsonb;
  v_tarea_id text;
  v_cargo_id text;
  v_orden integer;
  v_tareas text[] := ARRAY[]::text[];
  v_insertadas integer := 0;
  v_actualizadas integer := 0;
  v_eliminadas integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Se requiere una sesión autenticada.' USING ERRCODE='42501';
  END IF;
  IF NOT public.usuario_tiene_empresa(p_empresa_id)
     OR NOT public.usuario_puede(p_empresa_id,'maestros','editar') THEN
    RAISE EXCEPTION 'No autorizado para modificar recetas de actividad.' USING ERRCODE='42501';
  END IF;
  IF p_empresa_id IS NULL OR p_actividad_id IS NULL THEN
    RAISE EXCEPTION 'La empresa y la actividad son obligatorias.' USING ERRCODE='22023';
  END IF;
  IF jsonb_typeof(p_filas) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Las filas de receta deben ser un arreglo JSON.' USING ERRCODE='22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('receta-actividad:'||p_empresa_id||':'||p_actividad_id,0));

  IF NOT EXISTS (
    SELECT 1 FROM public.tipos_servicio_interno
    WHERE id=p_actividad_id AND empresa_id=p_empresa_id
  ) THEN
    RAISE EXCEPTION 'La actividad no pertenece a la empresa.' USING ERRCODE='23514';
  END IF;

  FOR v_fila IN SELECT value FROM jsonb_array_elements(p_filas)
  LOOP
    IF jsonb_typeof(v_fila) IS DISTINCT FROM 'object'
       OR NOT (v_fila ? 'tarea_id') OR nullif(v_fila->>'tarea_id','') IS NULL
       OR NOT (v_fila ? 'orden') OR jsonb_typeof(v_fila->'orden') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'Cada fila requiere tarea_id y orden numérico.' USING ERRCODE='22023';
    END IF;
    v_tarea_id := v_fila->>'tarea_id';
    v_orden := (v_fila->>'orden')::integer;
    IF v_orden < 1 OR (v_fila->>'orden')::numeric <> v_orden THEN
      RAISE EXCEPTION 'El orden debe ser un entero positivo.' USING ERRCODE='22023';
    END IF;
    IF v_tarea_id=p_actividad_id THEN
      RAISE EXCEPTION 'Una actividad no puede agregarse como tarea de su propia receta.' USING ERRCODE='23514';
    END IF;
    IF v_tarea_id=ANY(v_tareas) THEN
      RAISE EXCEPTION 'La receta no puede repetir tareas.' USING ERRCODE='23505';
    END IF;
    v_tareas := array_append(v_tareas,v_tarea_id);
    v_cargo_id := nullif(v_fila->>'cargo_id','');
    IF NOT EXISTS (
      SELECT 1 FROM public.tipos_servicio_interno
      WHERE id=v_tarea_id AND empresa_id=p_empresa_id
    ) THEN
      RAISE EXCEPTION 'La tarea debe pertenecer a la misma empresa.' USING ERRCODE='23514';
    END IF;
    IF v_cargo_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.cargos_empresa
      WHERE id=v_cargo_id AND empresa_id=p_empresa_id
    ) THEN
      RAISE EXCEPTION 'El cargo debe pertenecer a la misma empresa.' USING ERRCODE='23514';
    END IF;
  END LOOP;

  DELETE FROM public.plantillas_actividad pa
  WHERE pa.empresa_id=p_empresa_id AND pa.actividad_id=p_actividad_id
    AND NOT (pa.tarea_id=ANY(v_tareas));
  GET DIAGNOSTICS v_eliminadas = ROW_COUNT;

  UPDATE public.plantillas_actividad pa
  SET cargo_id=nullif(f.cargo_id,''), orden=f.orden
  FROM jsonb_to_recordset(p_filas) AS f(tarea_id text,cargo_id text,orden integer)
  WHERE pa.empresa_id=p_empresa_id AND pa.actividad_id=p_actividad_id
    AND pa.tarea_id=f.tarea_id
    AND (pa.cargo_id IS DISTINCT FROM nullif(f.cargo_id,'') OR pa.orden IS DISTINCT FROM f.orden);
  GET DIAGNOSTICS v_actualizadas = ROW_COUNT;

  INSERT INTO public.plantillas_actividad(empresa_id,actividad_id,tarea_id,cargo_id,orden)
  SELECT p_empresa_id,p_actividad_id,f.tarea_id,nullif(f.cargo_id,''),f.orden
  FROM jsonb_to_recordset(p_filas) AS f(tarea_id text,cargo_id text,orden integer)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.plantillas_actividad pa
    WHERE pa.empresa_id=p_empresa_id AND pa.actividad_id=p_actividad_id AND pa.tarea_id=f.tarea_id
  );
  GET DIAGNOSTICS v_insertadas = ROW_COUNT;

  RETURN jsonb_build_object('insertadas',v_insertadas,'actualizadas',v_actualizadas,'eliminadas',v_eliminadas);
END
$fn$;

REVOKE ALL ON FUNCTION public.reemplazar_receta_actividad(text,text,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.reemplazar_receta_actividad(text,text,jsonb) TO authenticated;

DROP POLICY IF EXISTS plantillas_actividad_insert ON public.plantillas_actividad;
CREATE POLICY plantillas_actividad_insert ON public.plantillas_actividad FOR INSERT TO authenticated
  WITH CHECK (public.usuario_tiene_empresa(plantillas_actividad.empresa_id)
    AND public.usuario_puede(plantillas_actividad.empresa_id,'maestros','editar'));
DROP POLICY IF EXISTS plantillas_actividad_update ON public.plantillas_actividad;
CREATE POLICY plantillas_actividad_update ON public.plantillas_actividad FOR UPDATE TO authenticated
  USING (public.usuario_tiene_empresa(plantillas_actividad.empresa_id)
    AND public.usuario_puede(plantillas_actividad.empresa_id,'maestros','editar'))
  WITH CHECK (public.usuario_tiene_empresa(plantillas_actividad.empresa_id)
    AND public.usuario_puede(plantillas_actividad.empresa_id,'maestros','editar'));
DROP POLICY IF EXISTS plantillas_actividad_delete ON public.plantillas_actividad;
CREATE POLICY plantillas_actividad_delete ON public.plantillas_actividad FOR DELETE TO authenticated
  USING (public.usuario_tiene_empresa(plantillas_actividad.empresa_id)
    AND public.usuario_puede(plantillas_actividad.empresa_id,'maestros','editar'));

-- Verificación manual en tenant PRUEBA tras aplicar: guardar receta nueva, reordenar,
-- quitar tarea, rechazo sin permiso maestros/editar y rechazo de cargo o tarea de otra empresa.

COMMIT;
