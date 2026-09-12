-- Resumen del wizard de Hoja de Costeo.
-- Ambos campos son nulos/0 seguros para las hojas históricas: no se recalcula ni altera datos legados.
BEGIN;

ALTER TABLE public.hojas_costeo
  ADD COLUMN IF NOT EXISTS total_activos numeric DEFAULT 0;

ALTER TABLE public.hojas_costeo
  ADD COLUMN IF NOT EXISTS gasto_administrativo_manual_pct numeric;

COMMENT ON COLUMN public.hojas_costeo.total_activos IS
  'Depreciación asignada por las líneas relacionales de activos de la Hoja de Costeo.';

COMMENT ON COLUMN public.hojas_costeo.gasto_administrativo_manual_pct IS
  'Porcentaje manual en proporción (0.10 = 10%) aplicado exclusivamente a esta Hoja de Costeo.';

-- Obliga a PostgREST a reconocer las columnas nuevas antes de que el wizard
-- vuelva a consultarlas. Sin esta recarga puede mantenerse el 400 transitorio
-- aunque el ALTER TABLE ya se haya aplicado.
SELECT pg_notify('pgrst', 'reload schema');

COMMIT;
