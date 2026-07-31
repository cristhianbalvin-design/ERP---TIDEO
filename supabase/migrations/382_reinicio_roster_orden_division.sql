-- ============================================================================
-- 382 · Reinicio de roster: dividir sin invalidar temporalmente el ancla
-- ============================================================================
-- Al retirar el inicio de un tramo abierto, la versión 381 actualizaba primero
-- la fila original. El trigger de asistencia_ciclos_mineros validaba entonces
-- fecha_inicio_ciclo contra una jornada que ya empezaba después del ancla y
-- emitía JORNADA_NO_ASIGNADA, aunque la jornada original sí cubría la fecha.
--
-- La corrección es exclusivamente del RPC: para una división se insertan todos
-- los segmentos conservados mientras la jornada original todavía existe y,
-- solo después, se elimina la original. Así el trigger derivado puede validar
-- el ancla contra la fuente original durante toda la operación transaccional.

CREATE OR REPLACE FUNCTION public.reiniciar_roster_minero(
  p_empresa_id text,
  p_sede_id text,
  p_fecha_inicio date,
  p_fecha_fin date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_preview jsonb;
  v_bloqueos jsonb;
  v_impacto record;
  v_jornada public.personal_asignaciones_jornada%ROWTYPE;
  v_rango_original daterange;
  v_restantes datemultirange;
  v_segmento daterange;
  v_segmentos_conservados integer;
  v_primer_nuevo_id text;
  v_nuevo_id text;
  v_eliminadas integer := 0;
  v_divididas integer := 0;
  v_snapshots_eliminados integer := 0;
  v_trabajadores integer := 0;
  v_jornadas_ids jsonb := '[]'::jsonb;
BEGIN
  v_preview := public.previsualizar_reinicio_roster_minero(
    p_empresa_id, p_sede_id, p_fecha_inicio, p_fecha_fin
  );
  v_bloqueos := COALESCE(v_preview->'bloqueos', '[]'::jsonb);

  IF COALESCE((v_preview->>'jornadas_bloqueadas')::integer, 0) > 0 THEN
    INSERT INTO public.auditoria (
      empresa_id, user_id, modulo, entidad, entidad_id, accion, valor_nuevo
    ) VALUES (
      p_empresa_id,
      auth.uid(),
      'rrhh',
      'personal_asignaciones_jornada',
      p_sede_id,
      'reinicio_roster_bloqueado',
      jsonb_build_object(
        'unidad_minera_id', p_sede_id,
        'unidad_minera', v_preview->>'unidad_minera',
        'fecha_inicio', p_fecha_inicio,
        'fecha_fin', p_fecha_fin,
        'bloqueos', v_bloqueos
      )
    );
    RETURN jsonb_build_object(
      'ok', false,
      'codigo', 'RETRO_WALL',
      'mensaje', 'El reinicio se cruza con nómina ya procesada. No se modificó ningún dato.',
      'bloqueos', v_bloqueos
    );
  END IF;

  DROP TABLE IF EXISTS pg_temp.reinicio_roster_impactos_tx;

  CREATE TEMP TABLE reinicio_roster_impactos_tx
  ON COMMIT DROP
  AS
  SELECT *
  FROM public.reinicio_roster_minero_impactos(
    p_empresa_id, p_sede_id, p_fecha_inicio, p_fecha_fin
  );

  PERFORM 1
  FROM public.personal_asignaciones_jornada j
  WHERE j.id IN (SELECT jornada_id FROM reinicio_roster_impactos_tx)
  ORDER BY j.id
  FOR UPDATE;

  SELECT count(DISTINCT personal_id),
         COALESCE(jsonb_agg(jornada_id ORDER BY jornada_id), '[]'::jsonb)
  INTO v_trabajadores, v_jornadas_ids
  FROM reinicio_roster_impactos_tx;

  IF NOT EXISTS (SELECT 1 FROM reinicio_roster_impactos_tx) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'trabajadores_afectados', 0,
      'jornadas_eliminadas', 0,
      'jornadas_divididas', 0,
      'snapshots_eliminados', 0
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM reinicio_roster_impactos_tx
    WHERE cardinality(periodos_bloqueados) > 0
  ) THEN
    RAISE EXCEPTION
      'RETRO_WALL: el impacto cambió durante la confirmación y ahora se cruza con nómina procesada. No se modificó ningún dato.';
  END IF;

  PERFORM set_config('tideo.reinicio_roster_interno', '1', true);

  FOR v_impacto IN
    SELECT * FROM reinicio_roster_impactos_tx
    ORDER BY personal_id, jornada_fecha_inicio, jornada_id
  LOOP
    SELECT * INTO STRICT v_jornada
    FROM public.personal_asignaciones_jornada
    WHERE id = v_impacto.jornada_id
    FOR UPDATE;

    v_rango_original := CASE
      WHEN v_jornada.fecha_fin IS NULL
        THEN daterange(v_jornada.fecha_inicio, NULL, '[)')
      ELSE daterange(v_jornada.fecha_inicio, v_jornada.fecha_fin, '[]')
    END;
    v_restantes := datemultirange(v_rango_original) - v_impacto.remociones;

    IF isempty(v_restantes) THEN
      DELETE FROM public.personal_asignaciones_jornada
      WHERE id = v_jornada.id;
      v_eliminadas := v_eliminadas + 1;
      CONTINUE;
    END IF;

    v_divididas := v_divididas + 1;
    v_segmentos_conservados := 0;
    v_primer_nuevo_id := NULL;

    -- Orden deliberado: la fila original debe seguir cubriendo el ancla del
    -- ciclo mientras los triggers derivados validan los segmentos nuevos.
    FOR v_segmento IN SELECT unnest(v_restantes)
    LOOP
      INSERT INTO public.personal_asignaciones_jornada (
        empresa_id, personal_id, personal_tipo, tipo_tramo,
        fecha_inicio, fecha_fin, regimen_jornada,
        dias_ciclo_trabajo, dias_ciclo_descanso, fecha_inicio_ciclo,
        turno_id, motivo, created_at,
        retro_override_por, retro_override_en, retro_override_motivo
      ) VALUES (
        v_jornada.empresa_id,
        v_jornada.personal_id,
        v_jornada.personal_tipo,
        v_jornada.tipo_tramo,
        lower(v_segmento),
        CASE WHEN upper_inf(v_segmento) THEN NULL ELSE upper(v_segmento) - 1 END,
        v_jornada.regimen_jornada,
        v_jornada.dias_ciclo_trabajo,
        v_jornada.dias_ciclo_descanso,
        v_jornada.fecha_inicio_ciclo,
        v_jornada.turno_id,
        v_jornada.motivo,
        v_jornada.created_at,
        v_jornada.retro_override_por,
        v_jornada.retro_override_en,
        v_jornada.retro_override_motivo
      )
      RETURNING id INTO v_nuevo_id;

      v_segmentos_conservados := v_segmentos_conservados + 1;
      v_primer_nuevo_id := COALESCE(v_primer_nuevo_id, v_nuevo_id);
    END LOOP;

    IF v_segmentos_conservados = 0 THEN
      RAISE EXCEPTION 'REINICIO_ROSTER_ERROR_INTERNO: no se generaron segmentos conservados.';
    END IF;

    DELETE FROM public.personal_asignaciones_jornada
    WHERE id = v_jornada.id;

    -- El vínculo documental es único. Se transfiere después de eliminar la
    -- fuente para no violar uq_asignacion_jornada_documento_origen.
    IF v_jornada.documento_origen_id IS NOT NULL THEN
      UPDATE public.personal_asignaciones_jornada
      SET documento_origen_id = v_jornada.documento_origen_id
      WHERE id = v_primer_nuevo_id;
    END IF;
  END LOOP;

  PERFORM set_config('tideo.reinicio_roster_interno', '0', true);

  DELETE FROM public.roster_minero_snapshots s
  WHERE s.empresa_id = p_empresa_id
    AND s.periodo_anio = extract(year FROM p_fecha_inicio)::integer
    AND s.periodo_mes = extract(month FROM p_fecha_inicio)::integer
    AND s.personal_id IN (
      SELECT DISTINCT personal_id FROM reinicio_roster_impactos_tx
    );
  GET DIAGNOSTICS v_snapshots_eliminados = ROW_COUNT;

  INSERT INTO public.auditoria (
    empresa_id, user_id, modulo, entidad, entidad_id, accion, valor_nuevo
  ) VALUES (
    p_empresa_id,
    auth.uid(),
    'rrhh',
    'personal_asignaciones_jornada',
    p_sede_id,
    'reinicio_roster_minero',
    jsonb_build_object(
      'unidad_minera_id', p_sede_id,
      'unidad_minera', v_preview->>'unidad_minera',
      'fecha_inicio', p_fecha_inicio,
      'fecha_fin', p_fecha_fin,
      'trabajadores_afectados', v_trabajadores,
      'jornadas_eliminadas', v_eliminadas,
      'jornadas_divididas', v_divididas,
      'snapshots_eliminados', v_snapshots_eliminados,
      'jornadas_ids', v_jornadas_ids,
      'bloqueos', '[]'::jsonb
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'trabajadores_afectados', v_trabajadores,
    'jornadas_eliminadas', v_eliminadas,
    'jornadas_divididas', v_divididas,
    'snapshots_eliminados', v_snapshots_eliminados
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reiniciar_roster_minero(
  text, text, date, date
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reiniciar_roster_minero(
  text, text, date, date
) TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
