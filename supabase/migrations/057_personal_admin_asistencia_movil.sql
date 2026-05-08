-- Habilitacion explicita de app de control de asistencia para personal administrativo.
-- El login sigue enlazandose por email, pero este campo decide si puede marcar
-- asistencia desde la app movil.

ALTER TABLE public.personal_administrativo
  ADD COLUMN IF NOT EXISTS acceso_asistencia_movil boolean DEFAULT false;

UPDATE public.personal_administrativo
SET acceso_asistencia_movil = COALESCE(acceso_asistencia_movil, false);

SELECT pg_notify('pgrst', 'reload schema');
