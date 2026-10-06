-- Mutación deliberada de la precondición de 592.
-- La tabla se crea dentro de la misma transacción solo para simular que ya existía.
-- No se modifica la migración: la aserción es la misma guardia que usa 592.

BEGIN;

CREATE TABLE public.diagnostico_catalogo_defaults(id integer);

DO $$
BEGIN
  ASSERT to_regclass('public.diagnostico_catalogo_defaults') IS NULL,
    'PRECONDITION_FAILED: diagnostico_catalogo_defaults ya existe';
END $$;

ROLLBACK;
