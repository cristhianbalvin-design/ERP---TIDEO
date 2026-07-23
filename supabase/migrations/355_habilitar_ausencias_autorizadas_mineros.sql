-- 355 · Permite aplicar manualmente solicitudes RRHH a asistencia minera.
-- La grilla ya interpreta los cuatro estados de ausencia sin alterar el ciclo.

DO $$
DECLARE
  v_def text;
  v_inicio integer;
  v_fin integer;
BEGIN
  SELECT pg_get_functiondef(
    'public.aplicar_solicitud_rrhh_a_asistencia(text, uuid, boolean, boolean, text)'::regprocedure
  ) INTO v_def;

  v_inicio := strpos(v_def, '  IF v_solicitud.personal_tipo = ''operativo'' THEN');
  v_fin := strpos(v_def, '  v_estado_asistencia := CASE');

  IF position('ASISTENCIA_MINERO_NO_DISPONIBLE' IN v_def) = 0
     OR v_inicio = 0
     OR v_fin <= v_inicio THEN
    RAISE EXCEPTION
      'No se encontró el bloqueo minero esperado en aplicar_solicitud_rrhh_a_asistencia; se aborta para no modificar una definición inesperada.';
  END IF;

  -- Quita exclusivamente la defensa que impedía el puente para mineros. El
  -- resto de la función (confirmación, conflictos, retro wall y auditoría)
  -- permanece intacto.
  v_def := substring(v_def FROM 1 FOR v_inicio - 1)
    || '  -- Las ausencias autorizadas también se aplican a régimen minero.' || E'\n'
    || substring(v_def FROM v_fin);

  EXECUTE v_def;
END;
$$;

SELECT pg_notify('pgrst', 'reload schema');
