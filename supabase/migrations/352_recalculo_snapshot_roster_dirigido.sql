-- Recalcula un único snapshot de roster y protege los períodos de nómina cerrados.
-- No habilita ni modifica el recálculo masivo del período.

CREATE OR REPLACE FUNCTION public.recalcular_snapshot_roster_dirigido(
  p_empresa_id text,
  p_personal_id text,
  p_periodo_anio integer,
  p_periodo_mes integer,
  p_ajuste_id text,
  p_snapshot jsonb,
  p_calculado_por text DEFAULT NULL,
  p_forzar_override boolean DEFAULT false,
  p_motivo_override text DEFAULT NULL
)
RETURNS public.roster_minero_snapshots
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_snapshot public.roster_minero_snapshots%ROWTYPE;
  v_ajuste public.roster_minero_ajustes%ROWTYPE;
  v_resultado public.roster_minero_snapshots%ROWTYPE;
  v_periodos_cerrados text;
  v_periodo_cerrado boolean;
  v_mes_anterior integer;
  v_anio_anterior integer;
  v_balance_anterior numeric := 0;
  v_fecha_inicio date;
  v_fecha_fin date;
BEGIN
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'No tiene acceso a la empresa indicada.';
  END IF;

  IF p_periodo_mes NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'El mes del período no es válido.';
  END IF;

  v_fecha_inicio := make_date(p_periodo_anio, p_periodo_mes, 1);
  v_fecha_fin := (v_fecha_inicio + interval '1 month')::date;

  SELECT *
  INTO v_snapshot
  FROM public.roster_minero_snapshots
  WHERE empresa_id = p_empresa_id
    AND personal_id = p_personal_id
    AND periodo_anio = p_periodo_anio
    AND periodo_mes = p_periodo_mes
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe snapshot para el trabajador y período indicados.';
  END IF;

  SELECT *
  INTO v_ajuste
  FROM public.roster_minero_ajustes
  WHERE id = p_ajuste_id
    AND empresa_id = p_empresa_id
    AND personal_id = p_personal_id
    AND personal_tipo = v_snapshot.personal_tipo
    AND estado = 'aprobado'
    AND fecha >= v_fecha_inicio
    AND fecha < v_fecha_fin;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El ajuste indicado no está aprobado o no corresponde al trabajador y período.';
  END IF;

  IF v_snapshot.calculado_en IS NOT NULL
     AND COALESCE(v_ajuste.resuelto_en, v_ajuste.solicitado_en) <= v_snapshot.calculado_en THEN
    RAISE EXCEPTION 'El snapshot ya incluye el ajuste aprobado indicado.';
  END IF;

  IF NOT (p_snapshot ?& ARRAY[
    'personal_id', 'personal_tipo', 'regimen_jornada',
    'dias_ciclo_trabajo', 'dias_ciclo_descanso', 'dias_en_mina',
    'dias_induccion', 'dias_efectivos_descanso', 'dias_descanso_ganados',
    'dias_descanso_gozados', 'dias_pendientes_revision', 'balance_periodo'
  ]) THEN
    RAISE EXCEPTION 'El resultado dirigido del cálculo está incompleto.';
  END IF;

  IF p_snapshot->>'personal_id' IS DISTINCT FROM p_personal_id
     OR p_snapshot->>'personal_tipo' IS DISTINCT FROM v_snapshot.personal_tipo THEN
    RAISE EXCEPTION 'El resultado dirigido no corresponde al snapshot solicitado.';
  END IF;

  SELECT string_agg(pn.periodo, ', ' ORDER BY pn.anio, pn.mes, pn.quincena)
  INTO v_periodos_cerrados
  FROM public.periodos_nomina pn
  WHERE pn.empresa_id = p_empresa_id
    AND pn.anio = p_periodo_anio
    AND pn.mes = p_periodo_mes
    AND pn.estado = 'cerrado';

  v_periodo_cerrado := v_snapshot.periodo_cerrado OR v_periodos_cerrados IS NOT NULL;

  IF v_periodo_cerrado THEN
    IF NOT p_forzar_override THEN
      RAISE EXCEPTION 'RETRO_WALL: no se puede recalcular solo el snapshot de % porque ya existe nómina procesada en el/los período(s): %. Requiere autorización para forzar el cambio.',
        p_personal_id,
        COALESCE(v_periodos_cerrados, format('%s-%s', p_periodo_anio, lpad(p_periodo_mes::text, 2, '0')));
    END IF;

    IF NULLIF(btrim(COALESCE(p_motivo_override, '')), '') IS NULL THEN
      RAISE EXCEPTION 'RETRO_WALL: la justificación para forzar el cambio es obligatoria.';
    END IF;

    IF NOT public.personal_documentos_puede_forzar_retro(p_empresa_id, v_snapshot.personal_tipo) THEN
      RAISE EXCEPTION 'RETRO_WALL_PERMISO: no tiene autorización para forzar cambios retroactivos sobre nómina ya procesada.';
    END IF;
  END IF;

  v_mes_anterior := CASE WHEN p_periodo_mes = 1 THEN 12 ELSE p_periodo_mes - 1 END;
  v_anio_anterior := CASE WHEN p_periodo_mes = 1 THEN p_periodo_anio - 1 ELSE p_periodo_anio END;

  SELECT COALESCE(s.balance_acumulado, 0)
  INTO v_balance_anterior
  FROM public.roster_minero_snapshots s
  WHERE s.empresa_id = p_empresa_id
    AND s.personal_id = p_personal_id
    AND s.periodo_anio = v_anio_anterior
    AND s.periodo_mes = v_mes_anterior;

  v_balance_anterior := COALESCE(v_balance_anterior, 0);

  UPDATE public.roster_minero_snapshots
  SET
    personal_nombre = COALESCE(NULLIF(p_snapshot->>'personal_nombre', ''), personal_nombre),
    regimen_jornada = p_snapshot->>'regimen_jornada',
    dias_ciclo_trabajo = (p_snapshot->>'dias_ciclo_trabajo')::integer,
    dias_ciclo_descanso = (p_snapshot->>'dias_ciclo_descanso')::integer,
    dias_en_mina = (p_snapshot->>'dias_en_mina')::integer,
    dias_induccion = (p_snapshot->>'dias_induccion')::integer,
    dias_efectivos_descanso = (p_snapshot->>'dias_efectivos_descanso')::integer,
    dias_descanso_ganados = (p_snapshot->>'dias_descanso_ganados')::numeric,
    dias_descanso_gozados = (p_snapshot->>'dias_descanso_gozados')::integer,
    dias_pendientes_revision = (p_snapshot->>'dias_pendientes_revision')::integer,
    balance_periodo = (p_snapshot->>'balance_periodo')::numeric,
    balance_acumulado = v_balance_anterior + (p_snapshot->>'balance_periodo')::numeric,
    calculado_en = now(),
    calculado_por = p_calculado_por
  WHERE id = v_snapshot.id
  RETURNING * INTO v_resultado;

  IF v_periodo_cerrado THEN
    INSERT INTO public.auditoria (empresa_id, user_id, modulo, entidad, entidad_id, accion, valor_nuevo)
    VALUES (
      p_empresa_id,
      auth.uid(),
      'rrhh',
      'roster_minero_snapshots',
      v_snapshot.id,
      'retro_override_autorizado',
      jsonb_build_object(
        'personal_id', p_personal_id,
        'personal_tipo', v_snapshot.personal_tipo,
        'fecha', v_ajuste.fecha,
        'periodos', COALESCE(v_periodos_cerrados, format('%s-%s', p_periodo_anio, lpad(p_periodo_mes::text, 2, '0'))),
        'motivo', btrim(p_motivo_override)
      )
    );
  END IF;

  RETURN v_resultado;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.recalcular_snapshot_roster_dirigido(text, text, integer, integer, text, jsonb, text, boolean, text) TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
