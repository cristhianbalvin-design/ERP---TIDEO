-- Planner · Fase 0 · herencia de tareas y horas hacia las OT (aditiva)
-- Cadena: OS (cotización) -> hoja de costeo -> líneas de mano de obra -> ot_tareas por OT.
-- Regla: cada línea llega a la OT cuyo equipo coincide con el activo del diagnóstico;
-- las líneas sin equipo solo se heredan si la OS tiene una única OT. Idempotente.

ALTER TABLE public.ot_tareas
  ADD COLUMN IF NOT EXISTS familia_trabajo_id uuid,
  ADD COLUMN IF NOT EXISTS actividad_id text,
  ADD COLUMN IF NOT EXISTS cargo_id text,
  ADD COLUMN IF NOT EXISTS activo_id text,
  ADD COLUMN IF NOT EXISTS horas_maquina numeric,
  ADD COLUMN IF NOT EXISTS hoja_linea_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS uq_ot_tareas_hoja_linea ON public.ot_tareas (ot_id, hoja_linea_id) WHERE hoja_linea_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.planner_heredar_tareas_ot(p_ot_id text)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_ot public.ordenes_trabajo;
  v_cot text;
  v_hoja text;
  v_ots_os integer;
  v_n integer;
BEGIN
  SELECT * INTO v_ot FROM public.ordenes_trabajo WHERE id = p_ot_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'OT no encontrada o sin acceso'; END IF;
  IF v_ot.os_cliente_id IS NULL THEN RETURN 0; END IF;
  IF EXISTS (SELECT 1 FROM public.ot_tareas WHERE ot_id = p_ot_id) THEN RETURN 0; END IF;

  SELECT cotizacion_id INTO v_cot FROM public.os_clientes WHERE id = v_ot.os_cliente_id AND empresa_id = v_ot.empresa_id;
  IF v_cot IS NULL THEN RETURN 0; END IF;

  SELECT h.id INTO v_hoja FROM public.hojas_costeo h
   WHERE h.cotizacion_id = v_cot AND h.empresa_id = v_ot.empresa_id
     AND EXISTS (SELECT 1 FROM public.hoja_costeo_lineas_mano_obra l WHERE l.hoja_costeo_id = h.id)
   ORDER BY h.updated_at DESC NULLS LAST LIMIT 1;
  IF v_hoja IS NULL THEN RETURN 0; END IF;

  SELECT count(*) INTO v_ots_os FROM public.ordenes_trabajo WHERE os_cliente_id = v_ot.os_cliente_id AND empresa_id = v_ot.empresa_id;

  INSERT INTO public.ot_tareas (empresa_id, ot_id, titulo, descripcion, horas_estimadas, orden,
                                familia_trabajo_id, actividad_id, cargo_id, activo_id, horas_maquina, hoja_linea_id)
  SELECT v_ot.empresa_id, p_ot_id,
         COALESCE(ts.nombre, 'Tarea ' || l.orden::text),
         dl.hallazgo,
         l.horas, COALESCE(l.orden, 0),
         l.familia_trabajo_id, l.actividad_id, l.cargo_id, dl.activo_id, dl.horas_maquina, l.id
    FROM public.hoja_costeo_lineas_mano_obra l
    LEFT JOIN public.diagnostico_tecnico_lineas dl ON dl.id = l.diagnostico_linea_id
    LEFT JOIN public.tipos_servicio_interno ts ON ts.id = l.actividad_id
   WHERE l.hoja_costeo_id = v_hoja
     AND ( (dl.activo_id IS NOT NULL AND dl.activo_id = v_ot.equipo_id)
        OR (dl.activo_id IS NULL AND v_ots_os = 1) )
   ORDER BY l.orden;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;
GRANT EXECUTE ON FUNCTION public.planner_heredar_tareas_ot(text) TO authenticated;

DO $chk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='planner_heredar_tareas_ot') THEN RAISE EXCEPTION 'Falta planner_heredar_tareas_ot'; END IF;
  IF (SELECT count(*) FROM information_schema.columns WHERE table_name='ot_tareas' AND column_name IN ('familia_trabajo_id','actividad_id','cargo_id','activo_id','horas_maquina','hoja_linea_id')) <> 6 THEN
    RAISE EXCEPTION 'Faltan columnas nuevas en ot_tareas';
  END IF;
END $chk$;
