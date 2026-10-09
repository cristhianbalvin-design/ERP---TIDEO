-- 610: Agregar equipo y horas máquina estimadas a cada tarea de receta.
-- Las horas existentes siguen siendo horas-hombre; horas_maquina es un dato separado.
-- La lectura actual de la receta se hace directamente sobre plantillas_actividad.
-- Aplicada en producción el 2026-10-09 tras ensayo con ROLLBACK y revisión.

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $pre$
BEGIN
  ASSERT to_regclass('public.plantillas_actividad') IS NOT NULL,
    'PRECONDITION_FAILED: falta plantillas_actividad';
  ASSERT to_regclass('public.activos') IS NOT NULL,
    'PRECONDITION_FAILED: falta activos';
  ASSERT to_regclass('public.tipos_servicio_interno') IS NOT NULL
    AND to_regclass('public.cargos_empresa') IS NOT NULL,
    'PRECONDITION_FAILED: falta un catálogo de receta';
  ASSERT to_regprocedure('public.usuario_tiene_empresa(text)') IS NOT NULL
    AND to_regprocedure('public.usuario_puede(text,text,text)') IS NOT NULL,
    'PRECONDITION_FAILED: faltan helpers de permisos';
  ASSERT NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='plantillas_actividad'
      AND column_name IN ('activo_id','horas_maquina')
  ), 'PRECONDITION_FAILED: ya existe una columna que agrega esta migración';
END
$pre$;

-- Cada fila conserva sus horas-hombre y recibe por separado el equipo y sus horas.
ALTER TABLE public.plantillas_actividad
  ADD COLUMN activo_id text REFERENCES public.activos(id) ON DELETE RESTRICT,
  ADD COLUMN horas_maquina numeric NOT NULL DEFAULT 0,
  ADD CONSTRAINT plantillas_actividad_horas_maquina_check
    CHECK (horas_maquina >= 0),
  ADD CONSTRAINT plantillas_actividad_activo_horas_check
    CHECK (activo_id IS NOT NULL OR horas_maquina = 0);

CREATE INDEX plantillas_actividad_activo_idx
  ON public.plantillas_actividad(activo_id) WHERE activo_id IS NOT NULL;

COMMENT ON COLUMN public.plantillas_actividad.activo_id IS
  'Equipo opcional asignado a la tarea de la receta.';
COMMENT ON COLUMN public.plantillas_actividad.horas_maquina IS
  'Horas máquina estimadas para la tarea; es independiente de las horas-hombre.';

-- El trigger existente ya valida tenant para actividad, tarea y cargo;
-- se amplía para proteger también activo_id en escrituras directas.
CREATE OR REPLACE FUNCTION public.validar_plantilla_actividad_referencias()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $fn$
DECLARE
  ae text;
  te text;
  ce text;
  qe text;
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
  IF NEW.activo_id IS NOT NULL THEN
    SELECT empresa_id INTO qe FROM public.activos WHERE id=NEW.activo_id;
    IF qe IS DISTINCT FROM NEW.empresa_id THEN
      RAISE EXCEPTION 'El activo debe pertenecer al mismo tenant.' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END
$fn$;

-- Se conserva la firma (text,text,jsonb): cargo_id y horas actuales siguen funcionando.
-- Las filas que omiten activo_id y horas_maquina guardan NULL y cero, respectivamente.
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
  v_activo_id text;
  v_orden integer;
  v_horas numeric;
  v_horas_maquina numeric;
  v_rol text;
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

  SELECT rol INTO v_rol FROM public.tipos_servicio_interno
  WHERE id=p_actividad_id AND empresa_id=p_empresa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La actividad no pertenece a la empresa.' USING ERRCODE='23514';
  END IF;
  IF v_rol IS DISTINCT FROM 'actividad' THEN
    RAISE EXCEPTION 'El tipo de servicio principal debe tener rol actividad.' USING ERRCODE='23514';
  END IF;

  FOR v_fila IN SELECT value FROM jsonb_array_elements(p_filas)
  LOOP
    IF jsonb_typeof(v_fila) IS DISTINCT FROM 'object'
       OR NOT (v_fila ? 'tarea_id') OR nullif(v_fila->>'tarea_id','') IS NULL
       OR NOT (v_fila ? 'orden') OR jsonb_typeof(v_fila->'orden') IS DISTINCT FROM 'number'
       OR ((v_fila ? 'horas') AND jsonb_typeof(v_fila->'horas') IS DISTINCT FROM 'number')
       OR ((v_fila ? 'activo_id') AND jsonb_typeof(v_fila->'activo_id') NOT IN ('string','null'))
       OR ((v_fila ? 'horas_maquina') AND jsonb_typeof(v_fila->'horas_maquina') NOT IN ('number','null')) THEN
      RAISE EXCEPTION 'Cada fila requiere tarea_id y orden numérico; horas, activo_id y horas_maquina deben tener tipo válido.' USING ERRCODE='22023';
    END IF;
    v_tarea_id := v_fila->>'tarea_id';
    v_orden := (v_fila->>'orden')::integer;
    v_horas := coalesce((v_fila->>'horas')::numeric,0);
    v_activo_id := nullif(v_fila->>'activo_id','');
    v_horas_maquina := coalesce((v_fila->>'horas_maquina')::numeric,0);
    IF v_orden < 1 OR (v_fila->>'orden')::numeric <> v_orden THEN
      RAISE EXCEPTION 'El orden debe ser un entero positivo.' USING ERRCODE='22023';
    END IF;
    IF v_horas < 0 THEN
      RAISE EXCEPTION 'Las horas estimadas no pueden ser negativas.' USING ERRCODE='22023';
    END IF;
    IF v_horas_maquina < 0 THEN
      RAISE EXCEPTION 'Las horas máquina no pueden ser negativas.' USING ERRCODE='22023';
    END IF;
    IF v_activo_id IS NULL AND v_horas_maquina <> 0 THEN
      RAISE EXCEPTION 'Las horas máquina deben ser cero cuando no se asigna un activo.' USING ERRCODE='23514';
    END IF;
    IF v_tarea_id=p_actividad_id THEN
      RAISE EXCEPTION 'Una actividad no puede agregarse como tarea de su propia receta.' USING ERRCODE='23514';
    END IF;
    IF v_tarea_id=ANY(v_tareas) THEN
      RAISE EXCEPTION 'La receta no puede repetir tareas.' USING ERRCODE='23505';
    END IF;
    v_tareas := array_append(v_tareas,v_tarea_id);
    v_cargo_id := nullif(v_fila->>'cargo_id','');
    SELECT rol INTO v_rol FROM public.tipos_servicio_interno
      WHERE id=v_tarea_id AND empresa_id=p_empresa_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La tarea debe pertenecer a la misma empresa.' USING ERRCODE='23514';
    END IF;
    IF v_rol IS DISTINCT FROM 'tarea' THEN
      RAISE EXCEPTION 'Cada elemento de la receta debe tener rol tarea.' USING ERRCODE='23514';
    END IF;
    IF v_cargo_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.cargos_empresa
      WHERE id=v_cargo_id AND empresa_id=p_empresa_id
    ) THEN
      RAISE EXCEPTION 'El cargo debe pertenecer a la misma empresa.' USING ERRCODE='23514';
    END IF;
    IF v_activo_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.activos
      WHERE id=v_activo_id AND empresa_id=p_empresa_id AND estado<>'dado_baja'
    ) THEN
      RAISE EXCEPTION 'El activo debe existir, no estar dado de baja y pertenecer a la misma empresa.' USING ERRCODE='23514';
    END IF;
  END LOOP;

  DELETE FROM public.plantillas_actividad pa
  WHERE pa.empresa_id=p_empresa_id AND pa.actividad_id=p_actividad_id
    AND NOT (pa.tarea_id=ANY(v_tareas));
  GET DIAGNOSTICS v_eliminadas = ROW_COUNT;

  UPDATE public.plantillas_actividad pa
  SET cargo_id=nullif(f.cargo_id,''), orden=f.orden, horas=coalesce(f.horas,0),
      activo_id=nullif(f.activo_id,''), horas_maquina=coalesce(f.horas_maquina,0)
  FROM jsonb_to_recordset(p_filas) AS f(tarea_id text,cargo_id text,orden integer,horas numeric,activo_id text,horas_maquina numeric)
  WHERE pa.empresa_id=p_empresa_id AND pa.actividad_id=p_actividad_id
    AND pa.tarea_id=f.tarea_id
    AND (pa.cargo_id IS DISTINCT FROM nullif(f.cargo_id,'')
      OR pa.orden IS DISTINCT FROM f.orden OR pa.horas IS DISTINCT FROM coalesce(f.horas,0)
      OR pa.activo_id IS DISTINCT FROM nullif(f.activo_id,'')
      OR pa.horas_maquina IS DISTINCT FROM coalesce(f.horas_maquina,0));
  GET DIAGNOSTICS v_actualizadas = ROW_COUNT;

  INSERT INTO public.plantillas_actividad(empresa_id,actividad_id,tarea_id,cargo_id,orden,horas,activo_id,horas_maquina)
  SELECT p_empresa_id,p_actividad_id,f.tarea_id,nullif(f.cargo_id,''),f.orden,
         coalesce(f.horas,0),nullif(f.activo_id,''),coalesce(f.horas_maquina,0)
  FROM jsonb_to_recordset(p_filas) AS f(tarea_id text,cargo_id text,orden integer,horas numeric,activo_id text,horas_maquina numeric)
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

-- Ensayo: confirmar que las filas existentes recibieron los valores por defecto.
DO $ensayo$
DECLARE
  v_total bigint;
  v_distintas bigint;
BEGIN
  SELECT count(*),count(*) FILTER (WHERE activo_id IS NOT NULL OR horas_maquina IS DISTINCT FROM 0)
    INTO v_total,v_distintas
  FROM public.plantillas_actividad;
  ASSERT v_distintas=0,
    format('ENSAYO_FAILED: %s filas existentes no tienen activo_id NULL y horas_maquina 0',v_distintas);
END
$ensayo$;

-- Verificación posterior a la aplicación:
-- SELECT count(*) AS filas, count(*) FILTER (WHERE activo_id IS NOT NULL) AS con_activo,
--        count(*) FILTER (WHERE horas_maquina < 0 OR (activo_id IS NULL AND horas_maquina <> 0)) AS inconsistentes
-- FROM public.plantillas_actividad;
-- SELECT id,empresa_id,actividad_id,tarea_id,cargo_id,horas,activo_id,horas_maquina,orden
-- FROM public.plantillas_actividad ORDER BY empresa_id,actividad_id,orden;
-- SELECT count(*) AS referencias_a_activo_fuera_de_tenant
-- FROM public.plantillas_actividad pa JOIN public.activos a ON a.id=pa.activo_id
-- WHERE a.empresa_id IS DISTINCT FROM pa.empresa_id;

COMMIT;
