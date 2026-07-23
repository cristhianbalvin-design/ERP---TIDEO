-- 354 · Conserva la semántica de permiso con goce en asistencia.
-- registros_asistencia.estado es text sin ENUM ni CHECK: el valor es aditivo.

COMMENT ON COLUMN public.registros_asistencia.estado IS
  'Estado de asistencia. Incluye completo, tardanza, horas_extra, incompleto, falta, falta_justificada, descanso, bajada, induccion, vacaciones, licencia_medica, permiso_con_goce y permiso_sin_goce.';

DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(
    'public.aplicar_solicitud_rrhh_a_asistencia(text, uuid, boolean, boolean, text)'::regprocedure
  )
  INTO v_def;

  IF position('WHEN ''permiso_con_goce'' THEN ''licencia_medica''' IN v_def) = 0 THEN
    RAISE EXCEPTION
      'No se encontró el mapeo previo de permiso_con_goce en aplicar_solicitud_rrhh_a_asistencia; se aborta para no modificar una definición inesperada.';
  END IF;

  v_def := replace(
    v_def,
    'WHEN ''permiso_con_goce'' THEN ''licencia_medica''',
    'WHEN ''permiso_con_goce'' THEN ''permiso_con_goce'''
  );

  EXECUTE v_def;
END;
$$;

SELECT pg_notify('pgrst', 'reload schema');
