-- Reversión manual de 593: elimina únicamente el trigger y su función.
-- UTF-8 sin BOM. Ejecutar dentro de una transacción.

BEGIN;

DROP TRIGGER trg_z_seed_diagnostico_catalogos_empresa_nueva ON public.empresas;
DROP FUNCTION public.sembrar_catalogos_diagnostico_empresa_nueva();

COMMIT;
