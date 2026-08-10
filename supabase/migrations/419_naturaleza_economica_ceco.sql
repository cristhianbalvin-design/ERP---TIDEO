-- Fase 1.2: naturaleza economica explicita de CECO.
-- Idempotente. La columna queda NULL para todos los registros existentes.

SET ROLE postgres;

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '5min';

LOCK TABLE public.centros_costo IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.centros_costo
  ADD COLUMN IF NOT EXISTS naturaleza_economica text;

ALTER TABLE public.centros_costo
  DROP CONSTRAINT IF EXISTS centros_costo_naturaleza_economica_check;

ALTER TABLE public.centros_costo
  ADD CONSTRAINT centros_costo_naturaleza_economica_check
  CHECK (naturaleza_economica IS NULL OR naturaleza_economica IN ('productivo', 'apoyo', 'estructural'));

COMMENT ON COLUMN public.centros_costo.naturaleza_economica IS
  'Naturaleza economica manual: productivo, apoyo o estructural. NULL preserva los registros historicos sin clasificar.';

COMMIT;
