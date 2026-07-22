-- ============================================================================
-- 345 · Backfill nominativo de jornadas inconsistentes sin nómina procesada
-- ============================================================================
-- Diagnóstico previo: solo Juan (pop_1783959070510) y Mariano Cárdenas
-- (pop_1780692098054) tienen nomina_detalle en un periodo cerrado (Julio 2026).
-- Esos dos se excluyen deliberadamente: deben pasar por la autorización del
-- retro wall existente. Esta migración no crea un atajo.

DO $$
DECLARE
  v_afectados integer;
BEGIN
  -- Las cinco identidades deben seguir siendo exactamente las auditadas.
  SELECT count(*) INTO v_afectados
  FROM public.personal_operativo
  WHERE (id, empresa_id, regimen_jornada) IN (
    ('pop_1781013965295','emp_20601829101','minero_14x7'),
    ('pop_1782165495769','emp_20601829101','minero_14x7'),
    ('pop_1782749952187','emp_20541435833','minero_14x7'),
    ('pop_1782752131987','emp_20541435833','minero_20x10'),
    ('pop_1783517440400','emp_20601829101','minero_14x7')
  );
  IF v_afectados <> 5 THEN
    RAISE EXCEPTION 'BACKFILL_JORNADA_ABORTADO: se esperaban 5 identidades exactas y se encontraron %', v_afectados;
  END IF;

  -- Confirmar que ninguno de estos cinco tiene nómina ya procesada.
  IF EXISTS (
    SELECT 1
    FROM public.nomina_detalle nd
    WHERE nd.trabajador_id IN (
      'pop_1781013965295','pop_1782165495769','pop_1782749952187',
      'pop_1782752131987','pop_1783517440400'
    )
  ) THEN
    RAISE EXCEPTION 'BACKFILL_JORNADA_RETRO_WALL: apareció nómina procesada para uno de los cinco casos seguros';
  END IF;

  -- Capcha: conserva la fecha real 2026-06-25; corrige 20/10 -> 14/7.
  UPDATE public.personal_asignaciones_jornada
  SET dias_ciclo_trabajo = 14,
      dias_ciclo_descanso = 7,
      motivo = 'Backfill fuente única: ficha minero_14x7'
  WHERE id = 'asig_182dbc932e0a'
    AND personal_id = 'pop_1781013965295'
    AND fecha_fin IS NULL
    AND regimen_jornada = 'ciclo_acumulativo'
    AND (dias_ciclo_trabajo, dias_ciclo_descanso) = (20,10);
  GET DIAGNOSTICS v_afectados = ROW_COUNT;
  IF v_afectados <> 1 THEN
    RAISE EXCEPTION 'BACKFILL_JORNADA_ABORTADO: tramo esperado de Capcha no coincide';
  END IF;

  -- Gallardo: conserva la fecha real 2026-07-01; corrige 2/1 -> 14/7.
  UPDATE public.personal_asignaciones_jornada
  SET dias_ciclo_trabajo = 14,
      dias_ciclo_descanso = 7,
      motivo = 'Backfill fuente única: ficha minero_14x7'
  WHERE id = 'asig_4ac02f43871b'
    AND personal_id = 'pop_1782165495769'
    AND fecha_fin IS NULL
    AND regimen_jornada = 'ciclo_acumulativo'
    AND (dias_ciclo_trabajo, dias_ciclo_descanso) = (2,1);
  GET DIAGNOSTICS v_afectados = ROW_COUNT;
  IF v_afectados <> 1 THEN
    RAISE EXCEPTION 'BACKFILL_JORNADA_ABORTADO: tramo esperado de Gallardo no coincide';
  END IF;

  -- Badillo: fecha_inicio_ciclo ya registrada en ficha (2026-06-03).
  INSERT INTO public.personal_asignaciones_jornada (
    empresa_id, personal_id, personal_tipo, tipo_tramo, fecha_inicio,
    regimen_jornada, dias_ciclo_trabajo, dias_ciclo_descanso,
    fecha_inicio_ciclo, motivo
  )
  SELECT empresa_id, id, 'operativo', 'normal', fecha_inicio_ciclo,
    'ciclo_acumulativo', 14, 7, fecha_inicio_ciclo,
    'Backfill fuente única: ficha minero_14x7'
  FROM public.personal_operativo
  WHERE id = 'pop_1782749952187'
    AND empresa_id = 'emp_20541435833'
    AND regimen_jornada = 'minero_14x7'
    AND fecha_inicio_ciclo = DATE '2026-06-03'
    AND NOT EXISTS (
      SELECT 1 FROM public.personal_asignaciones_jornada a
      WHERE a.personal_id = 'pop_1782749952187' AND a.fecha_fin IS NULL
    );
  GET DIAGNOSTICS v_afectados = ROW_COUNT;
  IF v_afectados <> 1 THEN
    RAISE EXCEPTION 'BACKFILL_JORNADA_ABORTADO: no se pudo crear el tramo de Badillo';
  END IF;

  -- Espíritu: fecha_inicio_ciclo ya registrada en ficha (2026-06-01).
  INSERT INTO public.personal_asignaciones_jornada (
    empresa_id, personal_id, personal_tipo, tipo_tramo, fecha_inicio,
    regimen_jornada, dias_ciclo_trabajo, dias_ciclo_descanso,
    fecha_inicio_ciclo, motivo
  )
  SELECT empresa_id, id, 'operativo', 'normal', fecha_inicio_ciclo,
    'ciclo_acumulativo', 20, 10, fecha_inicio_ciclo,
    'Backfill fuente única: ficha minero_20x10'
  FROM public.personal_operativo
  WHERE id = 'pop_1782752131987'
    AND empresa_id = 'emp_20541435833'
    AND regimen_jornada = 'minero_20x10'
    AND fecha_inicio_ciclo = DATE '2026-06-01'
    AND NOT EXISTS (
      SELECT 1 FROM public.personal_asignaciones_jornada a
      WHERE a.personal_id = 'pop_1782752131987' AND a.fecha_fin IS NULL
    );
  GET DIAGNOSTICS v_afectados = ROW_COUNT;
  IF v_afectados <> 1 THEN
    RAISE EXCEPTION 'BACKFILL_JORNADA_ABORTADO: no se pudo crear el tramo de Espíritu';
  END IF;

  -- Ismael: el contrato aprobado aporta la fecha real 2026-07-15.
  INSERT INTO public.personal_asignaciones_jornada (
    empresa_id, personal_id, personal_tipo, tipo_tramo, fecha_inicio,
    regimen_jornada, dias_ciclo_trabajo, dias_ciclo_descanso,
    fecha_inicio_ciclo, motivo
  )
  SELECT po.empresa_id, po.id, 'operativo', 'normal', d.fecha_emision,
    'ciclo_acumulativo', 14, 7, d.fecha_emision,
    'Backfill fuente única: contrato aprobado minero_14x7'
  FROM public.personal_operativo po
  JOIN LATERAL (
    SELECT pd.fecha_emision
    FROM public.personal_documentos pd
    WHERE pd.personal_id = po.id
      AND pd.personal_tipo = 'operativo'
      AND pd.estado_validacion = 'aprobado'
      AND pd.condiciones_laborales ->> 'regimen_jornada' = 'minero_14x7'
      AND pd.fecha_emision IS NOT NULL
    ORDER BY pd.fecha_emision DESC, pd.id DESC
    LIMIT 1
  ) d ON true
  WHERE po.id = 'pop_1783517440400'
    AND po.empresa_id = 'emp_20601829101'
    AND po.regimen_jornada = 'minero_14x7'
    AND d.fecha_emision = DATE '2026-07-15'
    AND NOT EXISTS (
      SELECT 1 FROM public.personal_asignaciones_jornada a
      WHERE a.personal_id = 'pop_1783517440400' AND a.fecha_fin IS NULL
    );
  GET DIAGNOSTICS v_afectados = ROW_COUNT;
  IF v_afectados <> 1 THEN
    RAISE EXCEPTION 'BACKFILL_JORNADA_ABORTADO: no se pudo crear el tramo de Ismael';
  END IF;
END;
$$;

SELECT pg_notify('pgrst', 'reload schema');
