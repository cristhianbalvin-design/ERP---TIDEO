-- 690 · Aria: datos para jefes y gerentes (operación, órdenes de trabajo, personal, planilla, financiamiento,
-- comisiones y transporte) y estado de una orden de trabajo con lo que le falta. Solo lectura y aditiva.
-- Todas corren con los permisos de la persona (RLS) y exigen el permiso de lectura de su pantalla.

-- Operación: indicadores del Dashboard Gerencial de Operaciones (misma función que usa la pantalla).
CREATE OR REPLACE FUNCTION public.asistente_resumen_operaciones(p_empresa_id text, p_sociedad_id uuid DEFAULT NULL, p_desde date DEFAULT NULL, p_hasta date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
DECLARE
  v_hasta date := coalesce(p_hasta, (now() AT TIME ZONE 'America/Lima')::date);
  v_desde date := coalesce(p_desde, (date_trunc('month', coalesce(p_hasta, (now() AT TIME ZONE 'America/Lima')::date)) - interval '2 months')::date);
BEGIN
  PERFORM public.asistente_autorizar(p_empresa_id, 'dashboard', p_sociedad_id, true);
  IF v_hasta < v_desde THEN RAISE EXCEPTION 'Rango de fechas inválido'; END IF;
  RETURN public.ops_dashboard_gerencial(p_empresa_id, p_sociedad_id, v_desde, v_hasta);
END; $$;

-- Órdenes de trabajo: lista con señales de atención (programada vencida, días sin parte, partes por aprobar, sobrecosto).
CREATE OR REPLACE FUNCTION public.asistente_buscar_ots(p_empresa_id text, p_texto text DEFAULT NULL, p_estado text DEFAULT NULL, p_solo_atrasadas boolean DEFAULT false, p_sin_parte_dias integer DEFAULT NULL, p_limite integer DEFAULT 20, p_sociedad_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
DECLARE
  v_hoy date := (now() AT TIME ZONE 'America/Lima')::date;
  v_texto text := nullif(trim(left(coalesce(p_texto, ''), 200)), '');
  v_estado text := nullif(lower(trim(left(coalesce(p_estado, ''), 40))), '');
  v_limite integer := least(greatest(coalesce(p_limite, 20), 1), 50);
  v_costos boolean; v_filas jsonb; v_total integer;
BEGIN
  PERFORM public.asistente_autorizar(p_empresa_id, 'ot', p_sociedad_id, true);
  v_costos := public.usuario_puede(p_empresa_id, 'ot', 'ver_costos');
  WITH base AS (
    SELECT o.numero, o.servicio, o.estado, o.fecha_programada, o.fecha_fin, o.avance_pct, o.moneda, o.tipo_trabajo,
      cu.razon_social AS cliente,
      coalesce(po.nombre, pa.nombre) AS tecnico,
      coalesce(o.costo_estimado_ot, o.costo_estimado) AS estimado, coalesce(c.total, o.costo_real) AS costo_real,
      (o.estado = 'programada' AND o.fecha_programada::date < v_hoy) AS programada_vencida,
      (SELECT max(p.fecha)::date FROM public.partes_diarios p WHERE p.orden_trabajo_id = o.id) AS ultimo_parte,
      (SELECT count(*) FROM public.partes_diarios p WHERE p.orden_trabajo_id = o.id AND p.estado = 'en_revision') AS partes_por_aprobar
    FROM public.ordenes_trabajo o
    LEFT JOIN public.costos_ot c ON c.orden_trabajo_id = o.id
    LEFT JOIN public.cuentas cu ON cu.id::text = o.cuenta_id::text
    LEFT JOIN public.personal_operativo po ON po.id::text = o.tecnico_responsable_id::text
    LEFT JOIN public.personal_administrativo pa ON pa.id::text = o.tecnico_responsable_id::text
    WHERE o.empresa_id = p_empresa_id
      AND (p_sociedad_id IS NULL OR o.sociedad_id = p_sociedad_id)
      AND coalesce(o.estado, '') NOT IN ('anulada', 'anulado')
      AND (v_estado IS NULL OR o.estado = v_estado)
      AND (v_texto IS NULL OR public.aria_sin_tildes(coalesce(o.numero, '') || ' ' || coalesce(o.servicio, '') || ' ' || coalesce(cu.razon_social, '') || ' ' || coalesce(po.nombre, pa.nombre, ''))
           LIKE '%' || public.aria_sin_tildes(v_texto) || '%')
  ), filtradas AS (
    SELECT b.*, CASE WHEN b.estado = 'ejecucion' THEN v_hoy - coalesce(b.ultimo_parte, b.fecha_programada::date) END AS dias_sin_parte
    FROM base b
    WHERE (NOT coalesce(p_solo_atrasadas, false) OR b.programada_vencida)
      AND (p_sin_parte_dias IS NULL OR (b.estado = 'ejecucion' AND v_hoy - coalesce(b.ultimo_parte, b.fecha_programada::date) >= p_sin_parte_dias))
  )
  SELECT (SELECT count(*) FROM filtradas),
    coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (
      SELECT f.numero, f.servicio, f.cliente, f.tecnico, f.estado, f.tipo_trabajo, f.fecha_programada, f.fecha_fin, f.avance_pct,
        f.programada_vencida, f.dias_sin_parte, f.partes_por_aprobar,
        CASE WHEN v_costos THEN f.estimado END AS costo_estimado, CASE WHEN v_costos THEN f.costo_real END AS costo_real,
        CASE WHEN v_costos THEN f.moneda END AS moneda,
        CASE WHEN v_costos THEN (coalesce(f.estimado, 0) > 0 AND coalesce(f.costo_real, 0) > f.estimado) END AS con_sobrecosto
      FROM filtradas f
      ORDER BY f.programada_vencida DESC, f.dias_sin_parte DESC NULLS LAST, f.fecha_programada DESC NULLS LAST
      LIMIT v_limite) x), '[]'::jsonb)
  INTO v_total, v_filas;
  RETURN jsonb_build_object('filas', v_filas, 'cantidad_devuelta', jsonb_array_length(v_filas), 'total_coincidencias', v_total, 'fecha_hoy', v_hoy,
    'campos_omitidos_por_permiso', CASE WHEN v_costos THEN '[]'::jsonb ELSE '["costo_estimado","costo_real","con_sobrecosto"]'::jsonb END,
    'nota', 'programada_vencida: sigue programada y su fecha ya pasó. dias_sin_parte: días desde el último parte diario de una OT en ejecución.');
END; $$;

-- Estado de una orden de trabajo y qué le falta para avanzar.
CREATE OR REPLACE FUNCTION public.asistente_estado_ot(p_empresa_id text, p_numero text)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
DECLARE
  v_num text := nullif(trim(left(coalesce(p_numero, ''), 60)), '');
  v_hoy date := (now() AT TIME ZONE 'America/Lima')::date;
  v_costos boolean; o record; v_tecnico text; v_cliente text; v_os text; v_real numeric;
  v_partes integer; v_aprobados integer; v_revision integer; v_ultimo date; v_pend text[] := '{}';
BEGIN
  PERFORM public.asistente_autorizar(p_empresa_id, 'ot');
  IF v_num IS NULL THEN RETURN jsonb_build_object('respuesta', 'falta_numero'); END IF;
  SELECT * INTO o FROM public.ordenes_trabajo t
   WHERE t.empresa_id = p_empresa_id AND (upper(t.numero) = upper(v_num) OR upper(t.numero) LIKE '%' || upper(v_num) || '%')
   ORDER BY (upper(t.numero) = upper(v_num)) DESC, t.created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('respuesta', 'no_encontrada', 'numero', v_num); END IF;
  v_costos := public.usuario_puede(p_empresa_id, 'ot', 'ver_costos');
  SELECT coalesce((SELECT nombre FROM public.personal_operativo WHERE id::text = o.tecnico_responsable_id::text),
                  (SELECT nombre FROM public.personal_administrativo WHERE id::text = o.tecnico_responsable_id::text)) INTO v_tecnico;
  SELECT razon_social INTO v_cliente FROM public.cuentas WHERE id::text = o.cuenta_id::text;
  SELECT numero INTO v_os FROM public.os_clientes WHERE id::text = o.os_cliente_id::text;
  SELECT total INTO v_real FROM public.costos_ot WHERE orden_trabajo_id = o.id;
  SELECT count(*), count(*) FILTER (WHERE estado = 'aprobado'), count(*) FILTER (WHERE estado = 'en_revision'), max(fecha)::date
    INTO v_partes, v_aprobados, v_revision, v_ultimo FROM public.partes_diarios WHERE orden_trabajo_id = o.id;
  IF o.estado = 'programada' THEN
    IF o.tecnico_responsable_id IS NULL THEN v_pend := array_append(v_pend, 'Asignar un técnico responsable: sin él no se puede iniciar la OT.'); END IF;
    IF o.centro_costo_id IS NULL THEN v_pend := array_append(v_pend, 'Asignar un centro de costo: sin él no se puede iniciar la OT.'); END IF;
    IF o.fecha_programada::date < v_hoy THEN v_pend := array_append(v_pend, 'Su fecha programada ya pasó y sigue sin iniciarse.'); END IF;
    IF array_length(v_pend, 1) IS NULL THEN v_pend := array_append(v_pend, 'Tiene técnico y centro de costo: se puede iniciar desde la Bandeja de OTs con Iniciar.'); END IF;
  ELSIF o.estado = 'ejecucion' THEN
    IF o.tecnico_responsable_id IS NULL THEN v_pend := array_append(v_pend, 'No tiene técnico responsable: es requisito para el acta de cierre.'); END IF;
    IF v_revision > 0 THEN v_pend := v_pend || format('Tiene %s parte(s) pendiente(s) de aprobar: mientras existan no se puede emitir el acta de conformidad.', v_revision); END IF;
    IF v_aprobados = 0 THEN v_pend := array_append(v_pend, 'Aún no tiene ningún parte aprobado: el acta de conformidad exige al menos uno.'); END IF;
    IF v_ultimo IS NULL OR v_hoy - v_ultimo >= 3 THEN v_pend := v_pend || format('No registra parte diario desde %s.', coalesce(to_char(v_ultimo, 'DD/MM/YYYY'), 'que se inició')); END IF;
    IF array_length(v_pend, 1) IS NULL THEN v_pend := array_append(v_pend, 'Cumple los requisitos para el acta: se cierra en Operaciones › Órdenes de Trabajo › Cierre & Conformidad.'); END IF;
  ELSE
    v_pend := array_append(v_pend, 'La OT ya está cerrada. Lo siguiente es valorizarla en la OS Cliente y facturarla.');
  END IF;
  RETURN jsonb_build_object('respuesta', 'ok', 'numero', o.numero, 'servicio', o.servicio, 'cliente', v_cliente, 'os_cliente', v_os,
    'estado', o.estado, 'tipo_trabajo', o.tipo_trabajo, 'tecnico_responsable', v_tecnico, 'tiene_centro_costo', o.centro_costo_id IS NOT NULL,
    'fecha_programada', o.fecha_programada, 'fecha_inicio_real', o.fecha_inicio_real, 'fecha_fin', o.fecha_fin, 'avance_pct', o.avance_pct,
    'partes', jsonb_build_object('total', v_partes, 'aprobados', v_aprobados, 'por_aprobar', v_revision, 'ultimo', v_ultimo),
    'costo_estimado', CASE WHEN v_costos THEN coalesce(o.costo_estimado_ot, o.costo_estimado) END,
    'costo_real', CASE WHEN v_costos THEN coalesce(v_real, o.costo_real) END, 'moneda', CASE WHEN v_costos THEN o.moneda END,
    'campos_omitidos_por_permiso', CASE WHEN v_costos THEN '[]'::jsonb ELSE '["costo_estimado","costo_real"]'::jsonb END,
    'que_le_falta', to_jsonb(v_pend));
END; $$;

-- Personal: dotación, ingresos y ceses, asistencia y solicitudes pendientes del periodo.
CREATE OR REPLACE FUNCTION public.asistente_resumen_personal(p_empresa_id text, p_desde date DEFAULT NULL, p_hasta date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
DECLARE
  v_hasta date := coalesce(p_hasta, (now() AT TIME ZONE 'America/Lima')::date);
  v_desde date := coalesce(p_desde, date_trunc('month', coalesce(p_hasta, (now() AT TIME ZONE 'America/Lima')::date))::date);
  v_res jsonb; v_asis jsonb := NULL; v_sol jsonb := NULL; v_omit jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sesión no autenticada'; END IF;
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN RAISE EXCEPTION 'Empresa no autorizada'; END IF;
  IF NOT (public.usuario_puede(p_empresa_id, 'rrhh_admin', 'ver') OR public.usuario_puede(p_empresa_id, 'rrhh_operativo', 'ver')) THEN
    RAISE EXCEPTION 'Falta permiso de lectura para rrhh_admin';
  END IF;
  IF v_hasta < v_desde THEN RAISE EXCEPTION 'Rango de fechas inválido'; END IF;
  WITH p AS (
    SELECT 'administrativo'::text AS tipo, id::text AS id, nombre, estado, fecha_ingreso, fecha_cese FROM public.personal_administrativo WHERE empresa_id = p_empresa_id
    UNION ALL
    SELECT 'operativo', id::text, nombre, estado, fecha_ingreso, fecha_cese FROM public.personal_operativo WHERE empresa_id = p_empresa_id
  )
  SELECT jsonb_build_object(
    'activos_administrativos', count(*) FILTER (WHERE tipo = 'administrativo' AND estado <> 'inactivo'),
    'activos_operativos', count(*) FILTER (WHERE tipo = 'operativo' AND estado <> 'inactivo'),
    'activos_total', count(*) FILTER (WHERE estado <> 'inactivo'),
    'inactivos', count(*) FILTER (WHERE estado = 'inactivo'),
    'ingresos_del_periodo', count(*) FILTER (WHERE fecha_ingreso BETWEEN v_desde AND v_hasta),
    'ceses_del_periodo', count(*) FILTER (WHERE fecha_cese BETWEEN v_desde AND v_hasta)) INTO v_res FROM p;
  IF public.usuario_puede(p_empresa_id, 'asistencia', 'ver') THEN
    WITH r AS (
      SELECT a.trabajador_id::text AS tid, a.es_falta, a.justificada, greatest(coalesce(a.tardanza_min, 0), coalesce(a.tardanza_minutos, 0)) AS tard
      FROM public.registros_asistencia a
      WHERE a.empresa_id = p_empresa_id AND a.fecha BETWEEN v_desde AND v_hasta AND a.anulado_en IS NULL
    ), nombres AS (
      SELECT id::text AS id, nombre FROM public.personal_administrativo WHERE empresa_id = p_empresa_id
      UNION ALL SELECT id::text, nombre FROM public.personal_operativo WHERE empresa_id = p_empresa_id
    )
    SELECT jsonb_build_object(
      'registros', count(*), 'faltas', count(*) FILTER (WHERE es_falta), 'faltas_injustificadas', count(*) FILTER (WHERE es_falta AND NOT coalesce(justificada, false)),
      'tardanzas', count(*) FILTER (WHERE tard > 0), 'minutos_de_tardanza', coalesce(sum(tard), 0),
      'personas_con_mas_tardanzas', coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM (
          SELECT coalesce(n.nombre, 'Sin nombre') AS nombre, count(*) AS tardanzas, sum(r2.tard) AS minutos
          FROM r r2 LEFT JOIN nombres n ON n.id = r2.tid WHERE r2.tard > 0 GROUP BY 1 ORDER BY 2 DESC, 3 DESC LIMIT 5) t), '[]'::jsonb),
      'personas_con_mas_faltas', coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM (
          SELECT coalesce(n.nombre, 'Sin nombre') AS nombre, count(*) AS faltas
          FROM r r2 LEFT JOIN nombres n ON n.id = r2.tid WHERE r2.es_falta GROUP BY 1 ORDER BY 2 DESC LIMIT 5) t), '[]'::jsonb))
    INTO v_asis FROM r;
  ELSE v_omit := v_omit || '["asistencia"]'::jsonb; END IF;
  IF public.usuario_puede(p_empresa_id, 'solicitudes_rrhh', 'ver') THEN
    SELECT jsonb_build_object(
      'pendientes_de_jefe', count(*) FILTER (WHERE estado = 'enviada'),
      'pendientes_de_rrhh', count(*) FILTER (WHERE estado = 'aprobada_jefe'),
      'pendientes_por_tipo', coalesce((SELECT jsonb_object_agg(tipo, n) FROM (SELECT tipo, count(*) n FROM public.solicitudes_rrhh WHERE empresa_id = p_empresa_id AND estado IN ('enviada', 'aprobada_jefe') GROUP BY 1) x), '{}'::jsonb))
    INTO v_sol FROM public.solicitudes_rrhh WHERE empresa_id = p_empresa_id;
  ELSE v_omit := v_omit || '["solicitudes"]'::jsonb; END IF;
  RETURN jsonb_build_object('desde', v_desde, 'hasta', v_hasta, 'personal', v_res, 'asistencia', v_asis, 'solicitudes', v_sol, 'campos_omitidos_por_permiso', v_omit);
END; $$;

-- Planilla: últimos periodos procesados o cerrados, con su costo.
CREATE OR REPLACE FUNCTION public.asistente_resumen_planilla(p_empresa_id text, p_limite integer DEFAULT 6, p_sociedad_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
DECLARE v_filas jsonb;
BEGIN
  PERFORM public.asistente_autorizar(p_empresa_id, 'nomina', p_sociedad_id, true);
  SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) INTO v_filas FROM (
    SELECT pn.periodo, pn.estado, pn.fecha_inicio, pn.fecha_fin, pn.fecha_pago, pn.quincena, pn.moneda,
      d.trabajadores, d.remuneracion_bruta, d.total_descuentos, d.neto_a_pagar, d.cargas_del_empleador, d.costo_total_empresa
    FROM public.periodos_nomina pn
    JOIN LATERAL (
      SELECT count(DISTINCT nd.trabajador_id) AS trabajadores, round(sum(nd.remuneracion_bruta), 2) AS remuneracion_bruta,
        round(sum(nd.total_descuentos), 2) AS total_descuentos, round(sum(nd.neto), 2) AS neto_a_pagar,
        round(sum(nd.total_cargas), 2) AS cargas_del_empleador, round(sum(nd.costo_real_empresa), 2) AS costo_total_empresa
      FROM public.nomina_detalle nd WHERE nd.periodo_id = pn.id
    ) d ON d.trabajadores > 0
    WHERE pn.empresa_id = p_empresa_id AND (p_sociedad_id IS NULL OR pn.sociedad_id = p_sociedad_id) AND pn.estado IN ('cerrado', 'en_proceso')
    ORDER BY pn.fecha_fin DESC NULLS LAST LIMIT least(greatest(coalesce(p_limite, 6), 1), 12)) x;
  RETURN jsonb_build_object('periodos', v_filas, 'cantidad_devuelta', jsonb_array_length(v_filas),
    'nota', 'Solo periodos procesados (en_proceso) o cerrados. costo_total_empresa incluye la remuneración y las cargas del empleador.');
END; $$;

-- Financiamiento: deuda vigente por moneda y préstamos con mayor saldo.
CREATE OR REPLACE FUNCTION public.asistente_resumen_financiamiento(p_empresa_id text, p_sociedad_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
DECLARE v_mon jsonb; v_lista jsonb;
BEGIN
  PERFORM public.asistente_autorizar(p_empresa_id, 'financiamiento', p_sociedad_id, true);
  SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) INTO v_mon FROM (
    SELECT f.moneda, count(*) AS prestamos_vigentes, round(sum(f.monto_original), 2) AS monto_original,
      round(sum(f.saldo_pendiente), 2) AS saldo_pendiente, round(sum(f.cuota_mensual), 2) AS cuota_mensual_total,
      round(sum(f.intereses_pagados_total), 2) AS intereses_pagados
    FROM public.financiamientos f
    WHERE f.empresa_id = p_empresa_id AND f.estado = 'vigente' AND (p_sociedad_id IS NULL OR f.sociedad_id = p_sociedad_id) GROUP BY 1) x;
  SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) INTO v_lista FROM (
    SELECT f.codigo, f.entidad, f.tipo, f.moneda, f.saldo_pendiente, f.cuota_mensual, f.tasa_anual, f.plazo_meses, f.cuotas_pagadas, f.fecha_ultimo_pago
    FROM public.financiamientos f
    WHERE f.empresa_id = p_empresa_id AND f.estado = 'vigente' AND (p_sociedad_id IS NULL OR f.sociedad_id = p_sociedad_id)
    ORDER BY f.saldo_pendiente DESC NULLS LAST LIMIT 10) x;
  RETURN jsonb_build_object('por_moneda', v_mon, 'prestamos', v_lista);
END; $$;

-- Comisiones: por vendedor y estado en el periodo.
CREATE OR REPLACE FUNCTION public.asistente_resumen_comisiones(p_empresa_id text, p_desde date DEFAULT NULL, p_hasta date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
DECLARE
  v_hasta date := coalesce(p_hasta, (now() AT TIME ZONE 'America/Lima')::date);
  v_desde date := coalesce(p_desde, (date_trunc('month', coalesce(p_hasta, (now() AT TIME ZONE 'America/Lima')::date)) - interval '2 months')::date);
  v_vend jsonb; v_est jsonb;
BEGIN
  PERFORM public.asistente_autorizar(p_empresa_id, 'comisiones');
  SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) INTO v_vend FROM (
    SELECT coalesce(c.vendedor_nombre, 'Sin vendedor') AS vendedor, count(*) AS comisiones,
      round(sum(c.monto_cobrado), 2) AS monto_cobrado_a_clientes, round(sum(coalesce(c.monto_total, c.monto_comision)), 2) AS comision_total,
      round(sum(coalesce(c.monto_total, c.monto_comision)) FILTER (WHERE c.estado = 'pendiente_aprobacion'), 2) AS por_aprobar,
      round(sum(coalesce(c.monto_total, c.monto_comision)) FILTER (WHERE c.estado = 'aprobada'), 2) AS aprobada_por_pagar,
      round(sum(coalesce(c.monto_total, c.monto_comision)) FILTER (WHERE c.estado = 'pagada'), 2) AS pagada
    FROM public.comisiones c
    WHERE c.empresa_id = p_empresa_id AND (c.creado_en AT TIME ZONE 'America/Lima')::date BETWEEN v_desde AND v_hasta AND c.estado <> 'rechazada'
    GROUP BY 1 ORDER BY 4 DESC NULLS LAST LIMIT 15) x;
  SELECT coalesce(jsonb_object_agg(estado, n), '{}'::jsonb) INTO v_est FROM (
    SELECT c.estado, count(*) n FROM public.comisiones c
    WHERE c.empresa_id = p_empresa_id AND (c.creado_en AT TIME ZONE 'America/Lima')::date BETWEEN v_desde AND v_hasta GROUP BY 1) x;
  RETURN jsonb_build_object('desde', v_desde, 'hasta', v_hasta, 'por_vendedor', v_vend, 'cantidad_por_estado', v_est,
    'nota', 'Los importes están en la moneda de cada cobro; la tabla de comisiones no guarda la moneda, así que no los presentes con S/ ni US$ ni los sumes entre vendedores como si fueran una sola moneda.');
END; $$;

-- Transporte: viajes del periodo por estado, ingreso estimado y rutas más frecuentes.
CREATE OR REPLACE FUNCTION public.asistente_resumen_transporte(p_empresa_id text, p_desde date DEFAULT NULL, p_hasta date DEFAULT NULL, p_sociedad_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
DECLARE
  v_hasta date := coalesce(p_hasta, ((now() AT TIME ZONE 'America/Lima')::date + 30));
  v_desde date := coalesce(p_desde, date_trunc('month', (now() AT TIME ZONE 'America/Lima')::date)::date);
  v_res jsonb;
BEGIN
  PERFORM public.asistente_autorizar(p_empresa_id, 'transporte_comercial', p_sociedad_id, true);
  IF v_hasta < v_desde THEN RAISE EXCEPTION 'Rango de fechas inválido'; END IF;
  WITH v AS (
    SELECT * FROM public.transporte_viajes t
    WHERE t.empresa_id = p_empresa_id AND (p_sociedad_id IS NULL OR t.sociedad_id = p_sociedad_id)
      AND t.fecha_programada::date BETWEEN v_desde AND v_hasta
  )
  SELECT jsonb_build_object(
    'viajes', (SELECT count(*) FROM v),
    'por_estado', coalesce((SELECT jsonb_object_agg(estado, n) FROM (SELECT estado, count(*) n FROM v GROUP BY 1) x), '{}'::jsonb),
    'programados_sin_unidad', (SELECT count(*) FROM v WHERE estado = 'programado' AND vehiculo_id IS NULL),
    'programados_sin_conductor', (SELECT count(*) FROM v WHERE estado = 'programado' AND conductor_id IS NULL),
    'ingreso_estimado_por_moneda', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT moneda, round(sum(ingreso_estimado), 2) AS ingreso_estimado, count(*) AS viajes FROM v WHERE estado <> 'cancelado' GROUP BY 1) x), '[]'::jsonb),
    'rutas_mas_frecuentes', coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT origen_nombre AS origen, destino_nombre AS destino, count(*) AS viajes FROM v GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 5) x), '[]'::jsonb))
  INTO v_res;
  RETURN jsonb_build_object('desde', v_desde, 'hasta', v_hasta) || v_res;
END; $$;

REVOKE ALL ON FUNCTION public.asistente_resumen_operaciones(text, uuid, date, date), public.asistente_buscar_ots(text, text, text, boolean, integer, integer, uuid),
  public.asistente_estado_ot(text, text), public.asistente_resumen_personal(text, date, date), public.asistente_resumen_planilla(text, integer, uuid),
  public.asistente_resumen_financiamiento(text, uuid), public.asistente_resumen_comisiones(text, date, date), public.asistente_resumen_transporte(text, date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.asistente_resumen_operaciones(text, uuid, date, date), public.asistente_buscar_ots(text, text, text, boolean, integer, integer, uuid),
  public.asistente_estado_ot(text, text), public.asistente_resumen_personal(text, date, date), public.asistente_resumen_planilla(text, integer, uuid),
  public.asistente_resumen_financiamiento(text, uuid), public.asistente_resumen_comisiones(text, date, date), public.asistente_resumen_transporte(text, date, date, uuid) TO authenticated;

DO $$ BEGIN
  IF (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('asistente_resumen_operaciones', 'asistente_buscar_ots', 'asistente_estado_ot', 'asistente_resumen_personal', 'asistente_resumen_planilla', 'asistente_resumen_financiamiento', 'asistente_resumen_comisiones', 'asistente_resumen_transporte')) <> 8 THEN
    RAISE EXCEPTION '690: faltan funciones';
  END IF;
  IF has_function_privilege('anon', 'public.asistente_resumen_planilla(text, integer, uuid)', 'EXECUTE') THEN RAISE EXCEPTION '690: anon puede ejecutar'; END IF;
END $$;
