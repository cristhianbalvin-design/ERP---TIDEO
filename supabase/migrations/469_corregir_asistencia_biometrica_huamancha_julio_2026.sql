-- Corrección puntual del lote biométrico que fue calculado con el turno minero
-- en lugar del horario asignado (08:00-17:30). El predicado es deliberadamente
-- estricto para no afectar ninguna otra marcación ni importación.
DO $$
DECLARE
  filas_actualizadas integer;
BEGIN
  UPDATE public.registros_asistencia
  SET
    turno_id = 'c5316ba7-bd5b-423a-aff5-9245629a8f45',
    estado = 'completo',
    tardanza_min = 0,
    horas_extra_min = 0,
    updated_at = now()
  WHERE empresa_id = 'emp_20601829101'
    AND trabajador_id = 'pop_1781014695900'
    AND fecha BETWEEN DATE '2026-07-02' AND DATE '2026-07-31'
    AND origen_registro = 'biometrico_importacion'
    AND estado = 'tardanza'
    AND tardanza_min = 60
    AND horas_extra_min = 30;

  GET DIAGNOSTICS filas_actualizadas = ROW_COUNT;
  IF filas_actualizadas <> 26 THEN
    RAISE EXCEPTION
      'Corrección de julio cancelada: se esperaban 26 registros y se encontraron %',
      filas_actualizadas;
  END IF;
END $$;
