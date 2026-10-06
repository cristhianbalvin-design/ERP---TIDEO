-- Precondiciones para aplicar 593; solo lectura.
DO $preconditions$
BEGIN
  ASSERT to_regclass('public.empresas') IS NOT NULL,
    'PRECONDITION_FAILED: no existe public.empresas';
  ASSERT to_regprocedure('public.inicializar_catalogos_diagnostico(text)') IS NOT NULL,
    'PRECONDITION_FAILED: falta inicializar_catalogos_diagnostico(text)';
  ASSERT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = to_regprocedure('public.inicializar_catalogos_diagnostico(text)')
      AND p.prorettype = 'integer'::regtype
  ), 'PRECONDITION_FAILED: inicializar_catalogos_diagnostico no retorna integer';
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'sembrar_catalogos_diagnostico_empresa_nueva'
  ),
    'PRECONDITION_FAILED: ya existe la función trigger 593';
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.empresas'::regclass
      AND tgname = 'trg_z_seed_diagnostico_catalogos_empresa_nueva'
      AND NOT tgisinternal
  ), 'PRECONDITION_FAILED: ya existe el trigger 593';
END
$preconditions$;
