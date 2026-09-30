-- La fecha de asistencia es la fecha de inicio de la jornada. La salida puede
-- ocurrir al día siguiente, incluso cuando el turno programado no es nocturno.
ALTER TABLE public.registros_asistencia
  ADD COLUMN IF NOT EXISTS fecha_salida date;

-- Compatibilidad histórica: los turnos nocturnos y las salidas menores que la
-- entrada ya representaban una jornada que terminaba al día siguiente.
UPDATE public.registros_asistencia ra
SET fecha_salida = CASE
  WHEN ra.hora_salida IS NULL THEN NULL
  WHEN t.cruza_medianoche IS TRUE OR ra.hora_salida < ra.hora_entrada THEN ra.fecha + 1
  ELSE ra.fecha
END
FROM public.turnos t
WHERE t.id = ra.turno_id
  AND ra.fecha_salida IS NULL;

UPDATE public.registros_asistencia ra
SET fecha_salida = CASE
  WHEN ra.hora_salida IS NULL THEN NULL
  WHEN ra.hora_salida < ra.hora_entrada THEN ra.fecha + 1
  ELSE ra.fecha
END
WHERE ra.fecha_salida IS NULL;

CREATE INDEX IF NOT EXISTS idx_registros_asistencia_fecha_salida
  ON public.registros_asistencia (empresa_id, fecha_salida);

COMMENT ON COLUMN public.registros_asistencia.fecha_salida IS
  'Fecha calendario real de salida; fecha conserva el inicio de la jornada.';
