-- Planner · Fase 0 · RPC transaccionales (aditiva)
-- 1) Sincroniza planner_ocupaciones de una OT con sus asignaciones programadas, validando la capacidad del puesto.
-- 2) Mueve de día una asignación de persona o de equipo y sincroniza la ocupación en la misma transacción.

CREATE OR REPLACE FUNCTION public.planner_sincronizar_ocupaciones_ot(p_ot_id text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_ot public.ordenes_trabajo;
  r record;
  v_cap integer;
  v_dia date;
  v_act integer;
  v_id uuid;
  v_puestos uuid[] := ARRAY[]::uuid[];
BEGIN
  SELECT * INTO v_ot FROM public.ordenes_trabajo WHERE id = p_ot_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'OT no encontrada o sin acceso'; END IF;

  FOR r IN
    SELECT s.puesto_id, min(s.fecha) AS d1, max(s.fecha) AS d2, (array_agg(s.sociedad_id))[1] AS soc
      FROM (
        SELECT a.puesto_id, a.fecha, a.sociedad_id
          FROM public.planner_asignaciones a
         WHERE a.empresa_id = v_ot.empresa_id AND a.ot_id = p_ot_id
           AND a.estado = 'programado' AND a.puesto_id IS NOT NULL
        UNION ALL
        SELECT m.puesto_id, e.fecha, e.sociedad_id
          FROM public.planner_asignaciones_equipo e
          JOIN public.planner_maquinas_taller m ON m.id = e.maquina_id
         WHERE e.empresa_id = v_ot.empresa_id AND e.ot_id = p_ot_id
           AND e.estado = 'programado' AND m.puesto_id IS NOT NULL
      ) s
     GROUP BY s.puesto_id
  LOOP
    v_puestos := v_puestos || r.puesto_id;
    SELECT capacidad INTO v_cap FROM public.planner_puestos WHERE id = r.puesto_id;

    FOR v_dia IN SELECT generate_series(r.d1, r.d2, interval '1 day')::date LOOP
      SELECT count(*) INTO v_act
        FROM public.planner_ocupaciones o
       WHERE o.puesto_id = r.puesto_id AND o.estado <> 'cancelado' AND o.ot_id <> p_ot_id
         AND v_dia BETWEEN o.fecha_desde AND o.fecha_hasta;
      IF v_act >= COALESCE(v_cap, 1) THEN
        RAISE EXCEPTION 'El puesto supera su capacidad el %', v_dia;
      END IF;
    END LOOP;

    SELECT o.id INTO v_id FROM public.planner_ocupaciones o
     WHERE o.empresa_id = v_ot.empresa_id AND o.ot_id = p_ot_id
       AND o.puesto_id = r.puesto_id AND o.estado <> 'cancelado'
     ORDER BY o.created_at LIMIT 1;

    IF v_id IS NULL THEN
      INSERT INTO public.planner_ocupaciones (empresa_id, sociedad_id, ot_id, puesto_id, fecha_desde, fecha_hasta, estado)
      VALUES (v_ot.empresa_id, COALESCE(r.soc, v_ot.sociedad_id), p_ot_id, r.puesto_id, r.d1, r.d2, 'programado')
      RETURNING id INTO v_id;
    ELSE
      UPDATE public.planner_ocupaciones SET fecha_desde = r.d1, fecha_hasta = r.d2, estado = 'programado' WHERE id = v_id;
    END IF;

    UPDATE public.planner_ocupaciones SET estado = 'cancelado'
     WHERE empresa_id = v_ot.empresa_id AND ot_id = p_ot_id AND puesto_id = r.puesto_id
       AND estado <> 'cancelado' AND id <> v_id;
  END LOOP;

  UPDATE public.planner_ocupaciones SET estado = 'cancelado'
   WHERE empresa_id = v_ot.empresa_id AND ot_id = p_ot_id AND estado <> 'cancelado'
     AND NOT (puesto_id = ANY (v_puestos));
END $$;
GRANT EXECUTE ON FUNCTION public.planner_sincronizar_ocupaciones_ot(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.planner_mover_fecha_asignacion(p_tabla text, p_id uuid, p_fecha date)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_ot_id text;
  v_emp text;
  v_estado text;
  v_row jsonb;
BEGIN
  IF p_tabla = 'planner_asignaciones' THEN
    SELECT ot_id, empresa_id INTO v_ot_id, v_emp FROM public.planner_asignaciones WHERE id = p_id AND estado = 'programado' FOR UPDATE;
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
    UPDATE public.planner_asignaciones SET fecha = p_fecha WHERE id = p_id;
    SELECT to_jsonb(x) INTO v_row FROM public.planner_asignaciones x WHERE x.id = p_id;
  ELSE
    UPDATE public.planner_asignaciones_equipo SET fecha = p_fecha WHERE id = p_id;
    SELECT to_jsonb(x) INTO v_row FROM public.planner_asignaciones_equipo x WHERE x.id = p_id;
  END IF;

  PERFORM public.planner_sincronizar_ocupaciones_ot(v_ot_id);
  RETURN v_row;
END $$;
GRANT EXECUTE ON FUNCTION public.planner_mover_fecha_asignacion(text, uuid, date) TO authenticated;

DO $chk$
BEGIN
  IF (SELECT count(*) FROM pg_proc WHERE proname IN ('planner_sincronizar_ocupaciones_ot','planner_mover_fecha_asignacion')) <> 2 THEN
    RAISE EXCEPTION 'Faltan las funciones RPC del Planner';
  END IF;
END $chk$;
