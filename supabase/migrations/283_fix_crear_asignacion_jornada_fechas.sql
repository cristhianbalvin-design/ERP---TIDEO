-- ============================================================================
-- 283 · Fix crear_asignacion_jornada: no violar chk_asig_jornada_fechas
-- ============================================================================
-- Bug: al cerrar la asignación vigente anterior, el RPC hacía
--   update ... set fecha_fin = p_fecha_inicio - 1 where ... and fecha_fin is null
-- sin verificar que la asignación abierta ya empezara antes de p_fecha_inicio.
-- Si existía una asignación abierta con fecha_inicio posterior (o igual) a
-- p_fecha_inicio - 1 (datos de prueba con fechas futuras, por ejemplo), la
-- actualización dejaba fecha_fin < fecha_inicio y violaba
-- chk_asig_jornada_fechas, abortando la validación del documento que dispara
-- esta asignación (validarDocumentoPersonalCtx en context.jsx).
-- Fix: solo se cierran las asignaciones abiertas que efectivamente empezaron
-- antes de la nueva fecha de inicio.

CREATE OR REPLACE FUNCTION public.crear_asignacion_jornada(
  p_empresa_id          text,
  p_personal_id         text,
  p_personal_tipo       text,
  p_tipo_tramo          text,
  p_fecha_inicio        date,
  p_regimen_jornada     text    DEFAULT NULL,
  p_dias_ciclo_trabajo  integer DEFAULT NULL,
  p_dias_ciclo_descanso integer DEFAULT NULL,
  p_fecha_inicio_ciclo  date    DEFAULT NULL,
  p_turno_id            text    DEFAULT NULL,
  p_motivo              text    DEFAULT NULL
)
RETURNS public.personal_asignaciones_jornada
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.personal_asignaciones_jornada;
BEGIN
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Acceso denegado al tenant';
  END IF;

  -- Cerrar la asignación vigente anterior (si existe y empezó antes de la nueva)
  UPDATE public.personal_asignaciones_jornada
  SET fecha_fin = p_fecha_inicio - 1
  WHERE empresa_id    = p_empresa_id
    AND personal_id   = p_personal_id
    AND personal_tipo = p_personal_tipo
    AND fecha_fin IS NULL
    AND fecha_inicio  < p_fecha_inicio;

  -- Crear la nueva asignación
  INSERT INTO public.personal_asignaciones_jornada (
    empresa_id, personal_id, personal_tipo,
    tipo_tramo, fecha_inicio, fecha_fin,
    regimen_jornada,
    dias_ciclo_trabajo, dias_ciclo_descanso, fecha_inicio_ciclo,
    turno_id, motivo
  ) VALUES (
    p_empresa_id, p_personal_id, p_personal_tipo,
    p_tipo_tramo, p_fecha_inicio, NULL,
    p_regimen_jornada,
    p_dias_ciclo_trabajo, p_dias_ciclo_descanso, p_fecha_inicio_ciclo,
    p_turno_id, p_motivo
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

SELECT pg_notify('pgrst', 'reload schema');
