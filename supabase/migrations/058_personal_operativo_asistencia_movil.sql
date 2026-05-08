-- Habilitacion explicita de app de control de asistencia para personal operativo.
-- Estandariza el mismo criterio usado en personal administrativo:
-- el acceso a campo movil y el acceso a asistencia movil son permisos separados.

ALTER TABLE public.personal_operativo
  ADD COLUMN IF NOT EXISTS acceso_asistencia_movil boolean DEFAULT false;

UPDATE public.personal_operativo
SET acceso_asistencia_movil = COALESCE(acceso_asistencia_movil, false);

SELECT pg_notify('pgrst', 'reload schema');
