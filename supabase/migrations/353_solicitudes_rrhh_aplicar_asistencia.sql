-- 353 · Puente manual: solicitudes RRHH confirmadas -> asistencia
--
-- La aplicación es siempre explícita desde RRHH. No existe trigger ni job que
-- la ejecute automáticamente. registros_asistencia.estado ya es text sin ENUM
-- ni CHECK, por lo que vacaciones/licencia_medica/permiso_sin_goce son valores
-- aditivos y no requieren reemplazar ninguna restricción previa.

ALTER TABLE public.solicitudes_rrhh
  ADD COLUMN IF NOT EXISTS aplicada_asistencia boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_registros_asistencia_solicitud_rrhh
  ON public.registros_asistencia (empresa_id, solicitud_rrhh_id)
  WHERE solicitud_rrhh_id IS NOT NULL;

COMMENT ON COLUMN public.registros_asistencia.estado IS
  'Estado de asistencia. Incluye completo, tardanza, horas_extra, incompleto, falta, falta_justificada, descanso, bajada, induccion, vacaciones, licencia_medica y permiso_sin_goce.';

CREATE OR REPLACE FUNCTION public.aplicar_solicitud_rrhh_a_asistencia(
  p_empresa_id text,
  p_solicitud_id uuid,
  p_confirmar_reemplazo boolean DEFAULT false,
  p_forzar_override boolean DEFAULT false,
  p_motivo_override text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_solicitud public.solicitudes_rrhh%ROWTYPE;
  v_estado_asistencia text;
  v_regimen_jornada text;
  v_conflictos jsonb := '[]'::jsonb;
  v_periodos_cerrados text;
  v_insertados integer := 0;
  v_reemplazados integer := 0;
BEGIN
  -- Evita carreras entre dos administradores que intenten aplicar la misma
  -- solicitud o solicitudes distintas para el mismo colaborador.
  SELECT * INTO v_solicitud
  FROM public.solicitudes_rrhh
  WHERE id = p_solicitud_id
    AND empresa_id = p_empresa_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOLICITUD_NO_ENCONTRADA: la solicitud no pertenece al tenant indicado.';
  END IF;

  IF NOT public.usuario_puede(p_empresa_id, 'solicitudes_rrhh', 'aprobar') THEN
    RAISE EXCEPTION 'PERMISO_DENEGADO: no tiene autorización para aplicar solicitudes a asistencia.';
  END IF;

  IF v_solicitud.estado IS DISTINCT FROM 'confirmada_rrhh' THEN
    RAISE EXCEPTION 'SOLICITUD_NO_CONFIRMADA: solo se puede aplicar una solicitud confirmada por RRHH.';
  END IF;

  IF v_solicitud.aplicada_asistencia THEN
    RAISE EXCEPTION 'SOLICITUD_YA_APLICADA: la solicitud ya fue aplicada a asistencia.';
  END IF;

  -- Defensa de servidor: la UI no ofrece esta vía a mineros y el RPC tampoco
  -- permite que alguien la fuerce por API antes de definir su semántica roster.
  IF v_solicitud.personal_tipo = 'operativo' THEN
    SELECT regimen_jornada INTO v_regimen_jornada
    FROM public.personal_operativo
    WHERE empresa_id = p_empresa_id AND id = v_solicitud.personal_id;
  ELSE
    SELECT regimen_jornada INTO v_regimen_jornada
    FROM public.personal_administrativo
    WHERE empresa_id = p_empresa_id AND id = v_solicitud.personal_id;
  END IF;

  IF COALESCE(v_regimen_jornada, 'general') = 'ciclo_acumulativo'
     OR COALESCE(v_regimen_jornada, '') LIKE 'minero_%' THEN
    RAISE EXCEPTION 'ASISTENCIA_MINERO_NO_DISPONIBLE: no disponible para régimen minero — pendiente de diseño.';
  END IF;

  v_estado_asistencia := CASE v_solicitud.tipo
    WHEN 'vacaciones' THEN 'vacaciones'
    WHEN 'licencia_medica' THEN 'licencia_medica'
    -- El tipo original queda preservado en solicitudes_rrhh; para asistencia,
    -- permiso con goce se consolida con licencia como ausencia sin descuento.
    WHEN 'permiso_con_goce' THEN 'licencia_medica'
    WHEN 'permiso_sin_goce' THEN 'permiso_sin_goce'
    ELSE NULL
  END;

  IF v_estado_asistencia IS NULL THEN
    RAISE EXCEPTION 'TIPO_SOLICITUD_NO_APLICABLE: el tipo % no se puede aplicar a asistencia.', v_solicitud.tipo;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_empresa_id || ':' || v_solicitud.personal_id));

  -- Mismo criterio de retro wall: solo períodos cerrados que intersectan el
  -- rango completo. No se altera nómina; se protege la corrección de asistencia.
  SELECT string_agg(pn.periodo, ', ' ORDER BY pn.anio, pn.mes, pn.quincena)
  INTO v_periodos_cerrados
  FROM public.periodos_nomina pn
  WHERE pn.empresa_id = p_empresa_id
    AND pn.estado = 'cerrado'
    AND (CASE WHEN pn.quincena = 2 THEN make_date(pn.anio, pn.mes, 16)
              ELSE make_date(pn.anio, pn.mes, 1) END) <= v_solicitud.fecha_fin
    AND COALESCE(
          pn.fecha_corte,
          (make_date(pn.anio, pn.mes, 1) + interval '1 month - 1 day')::date
        ) >= v_solicitud.fecha_inicio;

  IF v_periodos_cerrados IS NOT NULL THEN
    IF NOT p_forzar_override THEN
      RAISE EXCEPTION 'RETRO_WALL: no se puede aplicar la solicitud a asistencia porque se cruza con nómina cerrada en el/los período(s): %. Requiere autorización para forzar el cambio.', v_periodos_cerrados;
    END IF;

    IF NULLIF(btrim(COALESCE(p_motivo_override, '')), '') IS NULL THEN
      RAISE EXCEPTION 'RETRO_WALL: la justificación para forzar el cambio es obligatoria.';
    END IF;

    IF NOT public.personal_documentos_puede_forzar_retro(p_empresa_id, v_solicitud.personal_tipo) THEN
      RAISE EXCEPTION 'RETRO_WALL_PERMISO: no tiene autorización para forzar cambios retroactivos sobre nómina ya procesada.';
    END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', ra.id,
    'fecha', ra.fecha,
    'estado', ra.estado,
    'origen_registro', ra.origen_registro,
    'solicitud_rrhh_id', ra.solicitud_rrhh_id
  ) ORDER BY ra.fecha), '[]'::jsonb)
  INTO v_conflictos
  FROM public.registros_asistencia ra
  WHERE ra.empresa_id = p_empresa_id
    AND ra.trabajador_id = v_solicitud.personal_id
    AND ra.fecha BETWEEN v_solicitud.fecha_inicio AND v_solicitud.fecha_fin
    AND COALESCE(ra.estado, '') <> 'anulado';

  IF jsonb_array_length(v_conflictos) > 0 AND NOT p_confirmar_reemplazo THEN
    RETURN jsonb_build_object(
      'aplicada', false,
      'requiere_confirmar_conflictos', true,
      'conflictos', v_conflictos
    );
  END IF;

  -- Solo después de la confirmación explícita se reemplaza una marcación
  -- existente. Las fechas libres siempre se insertan como nuevos registros.
  IF p_confirmar_reemplazo THEN
    WITH actualizados AS (
      UPDATE public.registros_asistencia ra
      SET turno_id = NULL,
          hora_entrada = NULL,
          hora_salida = NULL,
          tardanza_minutos = 0,
          tardanza_min = 0,
          horas_extra = 0,
          horas_extra_min = 0,
          horas_trabajadas_min = 0,
          estado = v_estado_asistencia,
          justificacion = v_solicitud.motivo,
          es_falta = false,
          justificada = false,
          motivo_falta = NULL,
          notas = format('Aplicado manualmente desde solicitud RRHH %s.', v_solicitud.id),
          origen_registro = 'solicitud_rrhh',
          solicitud_rrhh_id = v_solicitud.id,
          regimen_jornada = 'general',
          updated_at = now()
      WHERE ra.empresa_id = p_empresa_id
        AND ra.trabajador_id = v_solicitud.personal_id
        AND ra.fecha BETWEEN v_solicitud.fecha_inicio AND v_solicitud.fecha_fin
        AND COALESCE(ra.estado, '') <> 'anulado'
      RETURNING 1
    )
    SELECT count(*) INTO v_reemplazados FROM actualizados;
  END IF;

  WITH insertados AS (
    INSERT INTO public.registros_asistencia (
      empresa_id, trabajador_tipo, trabajador_id, turno_id, fecha,
      hora_entrada, hora_salida, tardanza_minutos, tardanza_min,
      horas_extra, horas_extra_min, horas_trabajadas_min,
      estado, justificacion, es_falta, justificada, motivo_falta, notas,
      origen_registro, regimen_jornada, solicitud_rrhh_id
    )
    SELECT
      p_empresa_id, v_solicitud.personal_tipo, v_solicitud.personal_id, NULL, d.fecha,
      NULL, NULL, 0, 0, 0, 0, 0,
      v_estado_asistencia, v_solicitud.motivo, false, false, NULL,
      format('Aplicado manualmente desde solicitud RRHH %s.', v_solicitud.id),
      'solicitud_rrhh', 'general', v_solicitud.id
    FROM generate_series(v_solicitud.fecha_inicio, v_solicitud.fecha_fin, interval '1 day') AS d(fecha)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.registros_asistencia ra
      WHERE ra.empresa_id = p_empresa_id
        AND ra.trabajador_id = v_solicitud.personal_id
        AND ra.fecha = d.fecha::date
        AND COALESCE(ra.estado, '') <> 'anulado'
    )
    RETURNING 1
  )
  SELECT count(*) INTO v_insertados FROM insertados;

  UPDATE public.solicitudes_rrhh
  SET aplicada_asistencia = true
  WHERE id = v_solicitud.id
    AND empresa_id = p_empresa_id
    AND aplicada_asistencia = false;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SOLICITUD_YA_APLICADA: la solicitud fue aplicada por otra operación.';
  END IF;

  INSERT INTO public.auditoria (empresa_id, user_id, modulo, entidad, entidad_id, accion, valor_nuevo)
  VALUES (
    p_empresa_id, auth.uid(), 'rrhh', 'solicitudes_rrhh', v_solicitud.id::text, 'aplicar_a_asistencia',
    jsonb_build_object(
      'personal_id', v_solicitud.personal_id,
      'personal_tipo', v_solicitud.personal_tipo,
      'tipo_solicitud', v_solicitud.tipo,
      'estado_asistencia', v_estado_asistencia,
      'fecha_inicio', v_solicitud.fecha_inicio,
      'fecha_fin', v_solicitud.fecha_fin,
      'registros_insertados', v_insertados,
      'registros_reemplazados', v_reemplazados,
      'periodos_cerrados', v_periodos_cerrados,
      'motivo_override', CASE WHEN v_periodos_cerrados IS NULL THEN NULL ELSE btrim(p_motivo_override) END
    )
  );

  IF v_periodos_cerrados IS NOT NULL THEN
    INSERT INTO public.auditoria (empresa_id, user_id, modulo, entidad, entidad_id, accion, valor_nuevo)
    VALUES (
      p_empresa_id, auth.uid(), 'rrhh', 'solicitudes_rrhh', v_solicitud.id::text, 'retro_override_autorizado',
      jsonb_build_object(
        'personal_id', v_solicitud.personal_id,
        'personal_tipo', v_solicitud.personal_tipo,
        'periodos', v_periodos_cerrados,
        'motivo', btrim(p_motivo_override),
        'operacion', 'aplicar_solicitud_rrhh_a_asistencia'
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'aplicada', true,
    'solicitud_id', v_solicitud.id,
    'estado_asistencia', v_estado_asistencia,
    'registros_insertados', v_insertados,
    'registros_reemplazados', v_reemplazados,
    'conflictos_reemplazados', v_conflictos
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.aplicar_solicitud_rrhh_a_asistencia(text, uuid, boolean, boolean, text) TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
