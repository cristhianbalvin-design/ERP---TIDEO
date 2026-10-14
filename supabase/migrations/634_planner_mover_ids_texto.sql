-- planner_asignaciones.id es text; planner_mover_fecha_asignacion y planner_mover_asignacion
-- recibían uuid y comparaban text = uuid (error 42883), así que mover fechas u OT nunca funcionaba.
-- Aplicada en producción el 2026-10-14 con apply_migration (634_planner_mover_ids_texto).
CREATE OR REPLACE FUNCTION public.planner_mover_fecha_asignacion(p_tabla text, p_id uuid, p_fecha date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ot_id text;
  v_emp text;
  v_estado text;
  v_row jsonb;
BEGIN
  IF p_tabla = 'planner_asignaciones' THEN
    SELECT ot_id, empresa_id INTO v_ot_id, v_emp FROM public.planner_asignaciones WHERE id = p_id::text AND estado = 'programado' FOR UPDATE;
  ELSIF p_tabla = 'planner_asignaciones_equipo' THEN
    SELECT ot_id, empresa_id INTO v_ot_id, v_emp FROM public.planner_asignaciones_equipo WHERE id = p_id AND estado = 'programado' FOR UPDATE;
  ELSE
    RAISE EXCEPTION 'Tipo de asignación no válido';
  END IF;
  IF v_ot_id IS NULL THEN RAISE EXCEPTION 'Asignación no encontrada, no programada o sin acceso'; END IF;

  SELECT estado INTO v_estado FROM public.ordenes_trabajo WHERE id = v_ot_id AND empresa_id = v_emp;
  IF v_estado IN ('anulada','cerrada','cerrado_conforme','valorizada') THEN
    RAISE EXCEPTION 'La OT está % y no admite cambios de planificación', v_estado;
  END IF;

  IF p_tabla = 'planner_asignaciones' THEN
    UPDATE public.planner_asignaciones SET fecha = p_fecha WHERE id = p_id::text;
    SELECT to_jsonb(x) INTO v_row FROM public.planner_asignaciones x WHERE x.id = p_id::text;
  ELSE
    UPDATE public.planner_asignaciones_equipo SET fecha = p_fecha WHERE id = p_id;
    SELECT to_jsonb(x) INTO v_row FROM public.planner_asignaciones_equipo x WHERE x.id = p_id;
  END IF;

  PERFORM public.planner_sincronizar_ocupaciones_ot(v_ot_id);
  RETURN v_row;
END $function$;

CREATE OR REPLACE FUNCTION public.planner_mover_asignacion(p_asignacion_id uuid, p_ot_destino text, p_motivo text DEFAULT NULL::text)
 RETURNS planner_asignaciones
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE a public.planner_asignaciones; v_estado text;
BEGIN
  SELECT * INTO a FROM public.planner_asignaciones WHERE id = p_asignacion_id::text FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Asignación no encontrada o sin acceso'; END IF;
  IF a.estado <> 'programado' THEN RAISE EXCEPTION 'Solo se pueden mover asignaciones programadas (estado actual: %)', a.estado; END IF;
  SELECT estado INTO v_estado FROM public.ordenes_trabajo WHERE id = p_ot_destino AND empresa_id = a.empresa_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'La OT destino no existe en la empresa'; END IF;
  IF v_estado IN ('anulada','cerrada','cerrado_conforme','valorizada') THEN
    RAISE EXCEPTION 'La OT destino está % y no admite asignaciones; reábrela primero', v_estado;
  END IF;
  IF EXISTS (SELECT 1 FROM public.planner_asignaciones x WHERE x.empresa_id=a.empresa_id AND x.ot_id=p_ot_destino AND x.tecnico_id=a.tecnico_id AND x.fecha=a.fecha AND x.id<>a.id) THEN
    RAISE EXCEPTION 'El técnico ya está asignado a la OT destino ese día';
  END IF;
  UPDATE public.planner_asignaciones
     SET ot_id = p_ot_destino, estado = 'programado', motivo_reprogramacion = COALESCE(p_motivo, motivo_reprogramacion), tarea_id = NULL
   WHERE id = a.id RETURNING * INTO a;
  RETURN a;
END $function$;

DO $$
BEGIN
  IF position('p_id::text' in pg_get_functiondef('public.planner_mover_fecha_asignacion'::regproc)) = 0
     OR position('p_asignacion_id::text' in pg_get_functiondef('public.planner_mover_asignacion'::regproc)) = 0 THEN
    RAISE EXCEPTION 'Las funciones no quedaron corregidas';
  END IF;
END $$;
