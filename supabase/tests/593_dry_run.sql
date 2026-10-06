-- 593: siembra los catálogos de diagnóstico al crear una empresa.
-- La matriz de prioridad de 592 es global y no se inicializa por empresa.

BEGIN;

DO $preconditions$
BEGIN
  IF to_regclass('public.empresas') IS NULL THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED: no existe la tabla public.empresas';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'empresas' AND c.relkind IN ('r','p')
  ) THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED: public.empresas no es una tabla';
  END IF;
  IF to_regprocedure('public.inicializar_catalogos_diagnostico(text)') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM pg_proc p
       WHERE p.oid = to_regprocedure('public.inicializar_catalogos_diagnostico(text)')
         AND p.prorettype = 'integer'::regtype
     ) THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED: falta public.inicializar_catalogos_diagnostico(text) RETURNS integer';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'sembrar_catalogos_diagnostico_empresa_nueva'
  ) THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED: ya existe public.sembrar_catalogos_diagnostico_empresa_nueva()';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.empresas'::regclass
      AND tgname = 'trg_z_seed_diagnostico_catalogos_empresa_nueva'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED: ya existe el trigger trg_z_seed_diagnostico_catalogos_empresa_nueva';
  END IF;
END
$preconditions$;

CREATE OR REPLACE FUNCTION public.sembrar_catalogos_diagnostico_empresa_nueva()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  PERFORM public.inicializar_catalogos_diagnostico(NEW.id);
  RETURN NEW;
END
$fn$;

REVOKE ALL ON FUNCTION public.sembrar_catalogos_diagnostico_empresa_nueva() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_z_seed_diagnostico_catalogos_empresa_nueva
  AFTER INSERT ON public.empresas
  FOR EACH ROW
  EXECUTE FUNCTION public.sembrar_catalogos_diagnostico_empresa_nueva();

ROLLBACK;