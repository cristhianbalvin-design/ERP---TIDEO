-- 593: DRY-RUN COMPLETO (migración + comportamiento) en UNA transacción que termina en ROLLBACK.
BEGIN;
-- 593: siembra los catálogos de diagnóstico al crear una empresa.
-- La matriz de prioridad de 592 es global y no se inicializa por empresa.


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


-- Pruebas de comportamiento 593. Ejecutar después de 593; no persiste cambios.
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE _593_results (prueba text PRIMARY KEY, ok boolean NOT NULL, detalle text NOT NULL);

DO $behavior$
DECLARE
  v_id text := 't593_' || substr(md5(clock_timestamp()::text || random()::text), 1, 16);
  v_count bigint;
  v_retry integer;
BEGIN
  INSERT INTO public.empresas (id, razon_social, nombre_comercial, pais, moneda_base, zona_horaria, estado)
  VALUES (v_id, 'Prueba 593', 'Prueba 593', 'PE', 'PEN', 'America/Lima', 'suspendida');
  SELECT count(*) INTO v_count FROM public.diagnostico_catalogo_valores WHERE empresa_id = v_id;
  INSERT INTO _593_results VALUES ('empresa_nueva_32_catalogos', v_count = 32, format('filas=%s', v_count));
  v_retry := public.inicializar_catalogos_diagnostico(v_id);
  SELECT count(*) INTO v_count FROM public.diagnostico_catalogo_valores WHERE empresa_id = v_id;
  INSERT INTO _593_results VALUES ('reintento_idempotente', v_retry = 0 AND v_count = 32, format('insertadas_reintento=%s filas=%s', v_retry, v_count));
  DELETE FROM public.empresas WHERE id = v_id;
END
$behavior$;

INSERT INTO _593_results
SELECT 'funcion_trigger_no_ejecutable_por_roles_api',
       NOT has_function_privilege('anon', 'public.sembrar_catalogos_diagnostico_empresa_nueva()', 'EXECUTE')
       AND NOT has_function_privilege('authenticated', 'public.sembrar_catalogos_diagnostico_empresa_nueva()', 'EXECUTE'),
       format('anon=%s authenticated=%s',
         has_function_privilege('anon', 'public.sembrar_catalogos_diagnostico_empresa_nueva()', 'EXECUTE'),
         has_function_privilege('authenticated', 'public.sembrar_catalogos_diagnostico_empresa_nueva()', 'EXECUTE'));

DO $tenant_path$
DECLARE
  v_result jsonb;
  v_id text;
  v_count bigint;
  v_code text := 'grp_prueba_' || substr(md5(clock_timestamp()::text || random()::text), 1, 6);
BEGIN
  IF NOT public.usuario_es_superadmin_plataforma() THEN
    INSERT INTO _593_results VALUES ('crear_tenant_con_admin', false, 'SKIPPED: ejecutar como superadmin para satisfacer la guarda histórica del RPC');
    RETURN;
  END IF;
  v_result := public.crear_tenant_con_admin(
    'Prueba 593', v_code, 'Prueba 593', 'PE', 'PEN', 'America/Lima', 'suspendida', NULL, 'Admin prueba 593'
  );
  v_id := v_result ->> 'empresa_id';
  SELECT count(*) INTO v_count FROM public.diagnostico_catalogo_valores WHERE empresa_id = v_id;
  INSERT INTO _593_results VALUES ('crear_tenant_con_admin', v_count = 32, format('empresa_id=%s filas=%s', v_id, v_count));
END
$tenant_path$;

SELECT * FROM _593_results ORDER BY prueba;
ROLLBACK;
