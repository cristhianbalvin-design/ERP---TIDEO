-- La fecha de asistencia es la fecha de inicio de la jornada. La salida puede
-- ocurrir al día siguiente, incluso cuando el turno programado no es nocturno.
ALTER TABLE public.registros_asistencia
  ADD COLUMN IF NOT EXISTS fecha_salida date;

-- Compatibilidad histórica: los turnos nocturnos y las salidas menores que la
-- entrada ya representaban una jornada que terminaba al día siguiente.
-- Los registros históricos sin fecha_salida se interpretan en la aplicación:
-- una salida menor que la entrada corresponde al día siguiente. No se hace un
-- UPDATE masivo aquí porque registros antiguos de mobile_pwa pueden activar
-- validaciones de geolocalización al tocar la fila.

CREATE INDEX IF NOT EXISTS idx_registros_asistencia_fecha_salida
  ON public.registros_asistencia (empresa_id, fecha_salida);

COMMENT ON COLUMN public.registros_asistencia.fecha_salida IS
  'Fecha calendario real de salida; fecha conserva el inicio de la jornada.';
