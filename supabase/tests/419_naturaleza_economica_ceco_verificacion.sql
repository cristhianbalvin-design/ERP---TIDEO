-- Fase 1.2, version de verificacion. Revierte todos los cambios.

SET ROLE postgres;

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '5min';

LOCK TABLE public.centros_costo IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.centros_costo ADD COLUMN IF NOT EXISTS naturaleza_economica text;
ALTER TABLE public.centros_costo DROP CONSTRAINT IF EXISTS centros_costo_naturaleza_economica_check;
ALTER TABLE public.centros_costo ADD CONSTRAINT centros_costo_naturaleza_economica_check
  CHECK (naturaleza_economica IS NULL OR naturaleza_economica IN ('productivo', 'apoyo', 'estructural'));

CREATE TEMP TABLE verificar_ceco_419 (
  naturaleza_economica text,
  CONSTRAINT verificar_ceco_419_naturaleza_check
    CHECK (naturaleza_economica IS NULL OR naturaleza_economica IN ('productivo', 'apoyo', 'estructural'))
) ON COMMIT DROP;

INSERT INTO verificar_ceco_419 (naturaleza_economica)
VALUES (NULL), ('productivo'), ('apoyo'), ('estructural');

DO $valores$
BEGIN
  BEGIN
    INSERT INTO verificar_ceco_419 (naturaleza_economica) VALUES ('otro');
    RAISE EXCEPTION 'CECO_NATURALEZA: se acepto un valor fuera del catalogo.';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END
$valores$;

ROLLBACK;
