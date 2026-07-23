-- La jornada solo puede existir dentro de contratos aprobados que cubran
-- todo su rango. Los contratos consecutivos (sin vacío) se encadenan.

-- Agregar un parámetro crea una sobrecarga en PostgreSQL; se retira primero la
-- firma anterior para que PostgREST exponga un único RPC no ambiguo.
DROP FUNCTION IF EXISTS public.crear_asignacion_jornada(
  text, text, text, text, date, text, integer, integer, date, text, text, boolean, text
);

CREATE OR REPLACE FUNCTION public.crear_asignacion_jornada(
  p_empresa_id text,
  p_personal_id text,
  p_personal_tipo text,
  p_tipo_tramo text,
  p_fecha_inicio date,
  p_regimen_jornada text DEFAULT NULL,
  p_dias_ciclo_trabajo integer DEFAULT NULL,
  p_dias_ciclo_descanso integer DEFAULT NULL,
  p_fecha_inicio_ciclo date DEFAULT NULL,
  p_turno_id text DEFAULT NULL,
  p_motivo text DEFAULT NULL,
  p_forzar_override boolean DEFAULT false,
  p_motivo_override text DEFAULT NULL,
  p_fecha_fin date DEFAULT NULL
)
RETURNS public.personal_asignaciones_jornada
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_row public.personal_asignaciones_jornada;
  v_usuario_id text;
  v_cursor date;
  v_fin_cobertura date;
  v_hay_cobertura boolean;
BEGIN
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Acceso denegado al tenant';
  END IF;

  IF p_fecha_inicio IS NULL THEN
    RAISE EXCEPTION 'JORNADA_SIN_FECHA_INICIO: la fecha de inicio es obligatoria';
  END IF;
  IF p_fecha_fin IS NOT NULL AND p_fecha_fin < p_fecha_inicio THEN
    RAISE EXCEPTION 'JORNADA_RANGO_INVALIDO: la fecha de fin no puede ser anterior a la fecha de inicio';
  END IF;

  -- La cobertura se evalúa por fechas de vigencia, no por el flag activo del
  -- documento: un contrato anterior sigue siendo necesario para cubrir su tramo.
  -- Para una jornada sin fecha_fin se exige una cadena continua hasta un contrato
  -- indefinido; para una jornada finita, basta cubrir hasta su fecha_fin.
  v_cursor := p_fecha_inicio;
  LOOP
    SELECT true, x.fecha_fin
    INTO v_hay_cobertura, v_fin_cobertura
    FROM (
      SELECT
        COALESCE(d.periodo_fecha_inicio, d.fecha_vigencia_cambio, d.fecha_emision) AS fecha_inicio,
        CASE WHEN d.es_indefinido THEN NULL
             ELSE COALESCE(d.periodo_fecha_fin, d.fecha_vencimiento) END AS fecha_fin
      FROM public.personal_documentos d
      LEFT JOIN public.tipos_documento_empresa td ON td.id = d.tipo_documento_id
      WHERE d.empresa_id = p_empresa_id
        AND d.personal_id = p_personal_id
        AND d.personal_tipo = p_personal_tipo
        AND d.estado_validacion IN ('aprobado', 'validado')
        AND COALESCE(d.periodo_estado, 'vigente') NOT IN ('rechazado', 'anulado')
        AND (
          COALESCE(td.captura_snapshot_laboral, false)
          OR lower(COALESCE(d.tipo_doc, '')) LIKE '%contrato%'
          OR lower(COALESCE(d.tipo_doc, '')) LIKE '%adenda%'
        )
    ) x
    WHERE x.fecha_inicio IS NOT NULL
      AND x.fecha_inicio <= v_cursor
      AND (x.fecha_fin IS NULL OR x.fecha_fin >= v_cursor)
    ORDER BY x.fecha_fin DESC NULLS LAST
    LIMIT 1;

    IF NOT COALESCE(v_hay_cobertura, false) THEN
      RAISE EXCEPTION 'JORNADA_SIN_COBERTURA_CONTRACTUAL: La jornada debe estar dentro del rango de un contrato vigente. No se encontró contrato que cubra la fecha seleccionada.';
    END IF;

    IF v_fin_cobertura IS NULL OR (p_fecha_fin IS NOT NULL AND v_fin_cobertura >= p_fecha_fin) THEN
      EXIT;
    END IF;

    v_cursor := v_fin_cobertura + 1;
    v_hay_cobertura := false;
    v_fin_cobertura := NULL;
  END LOOP;

  IF p_forzar_override AND NOT public.personal_documentos_puede_forzar_retro(p_empresa_id, p_personal_tipo) THEN
    RAISE EXCEPTION 'No tiene autorización para forzar cambios retroactivos sobre nómina ya procesada.';
  END IF;

  IF p_forzar_override THEN
    SELECT id INTO v_usuario_id FROM public.usuarios WHERE id = auth.uid()::text LIMIT 1;
  END IF;

  IF p_tipo_tramo = 'normal' AND NOT (
    (p_regimen_jornada = 'general' AND p_dias_ciclo_trabajo IS NULL
      AND p_dias_ciclo_descanso IS NULL AND p_fecha_inicio_ciclo IS NULL)
    OR (p_regimen_jornada = 'ciclo_acumulativo'
      AND (p_dias_ciclo_trabajo, p_dias_ciclo_descanso) IN ((14,7),(20,10),(28,14),(2,1))
      AND p_fecha_inicio_ciclo IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'JORNADA_PRESET_INVALIDO: seleccione un régimen predefinido';
  END IF;

  UPDATE public.personal_asignaciones_jornada
  SET fecha_fin = p_fecha_inicio - 1,
      retro_override_por = CASE WHEN p_forzar_override THEN v_usuario_id ELSE NULL END,
      retro_override_en = CASE WHEN p_forzar_override THEN now() ELSE NULL END,
      retro_override_motivo = CASE WHEN p_forzar_override THEN p_motivo_override ELSE NULL END
  WHERE empresa_id = p_empresa_id
    AND personal_id = p_personal_id
    AND personal_tipo = p_personal_tipo
    AND fecha_fin IS NULL
    AND fecha_inicio < p_fecha_inicio;

  SELECT * INTO v_row
  FROM public.personal_asignaciones_jornada
  WHERE empresa_id = p_empresa_id
    AND personal_id = p_personal_id
    AND personal_tipo = p_personal_tipo
    AND fecha_inicio = p_fecha_inicio
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_row.id IS NOT NULL THEN
    UPDATE public.personal_asignaciones_jornada
    SET tipo_tramo = p_tipo_tramo,
        fecha_fin = p_fecha_fin,
        regimen_jornada = p_regimen_jornada,
        dias_ciclo_trabajo = p_dias_ciclo_trabajo,
        dias_ciclo_descanso = p_dias_ciclo_descanso,
        fecha_inicio_ciclo = p_fecha_inicio_ciclo,
        turno_id = p_turno_id,
        motivo = p_motivo,
        retro_override_por = CASE WHEN p_forzar_override THEN v_usuario_id ELSE NULL END,
        retro_override_en = CASE WHEN p_forzar_override THEN now() ELSE NULL END,
        retro_override_motivo = CASE WHEN p_forzar_override THEN p_motivo_override ELSE NULL END
    WHERE id = v_row.id
    RETURNING * INTO v_row;
  ELSE
    INSERT INTO public.personal_asignaciones_jornada (
      empresa_id, personal_id, personal_tipo, tipo_tramo, fecha_inicio, fecha_fin,
      regimen_jornada, dias_ciclo_trabajo, dias_ciclo_descanso,
      fecha_inicio_ciclo, turno_id, motivo,
      retro_override_por, retro_override_en, retro_override_motivo
    ) VALUES (
      p_empresa_id, p_personal_id, p_personal_tipo, p_tipo_tramo, p_fecha_inicio, p_fecha_fin,
      p_regimen_jornada, p_dias_ciclo_trabajo, p_dias_ciclo_descanso,
      p_fecha_inicio_ciclo, p_turno_id, p_motivo,
      CASE WHEN p_forzar_override THEN v_usuario_id ELSE NULL END,
      CASE WHEN p_forzar_override THEN now() ELSE NULL END,
      CASE WHEN p_forzar_override THEN p_motivo_override ELSE NULL END
    ) RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;

SELECT pg_notify('pgrst', 'reload schema');
