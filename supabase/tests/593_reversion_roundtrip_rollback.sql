-- Round-trip reversible de la reversión 593; reporta que no quedan objetos.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TEMP TABLE _593_roundtrip (prueba text PRIMARY KEY, ok boolean NOT NULL, detalle text NOT NULL);
CREATE TEMP TABLE _593_before AS
SELECT tgname, pg_get_triggerdef(oid) AS trigger_def
FROM pg_trigger
WHERE tgrelid = 'public.empresas'::regclass
  AND tgname = 'trg_z_seed_diagnostico_catalogos_empresa_nueva'
  AND NOT tgisinternal;
CREATE TEMP TABLE _593_fn_before AS
SELECT pg_get_functiondef(p.oid) AS function_def, p.proacl::text AS acl,
       p.prosecdef, p.proconfig::text AS config
FROM pg_proc p
WHERE p.oid = to_regprocedure('public.sembrar_catalogos_diagnostico_empresa_nueva()');

DROP TRIGGER trg_z_seed_diagnostico_catalogos_empresa_nueva ON public.empresas;
DROP FUNCTION public.sembrar_catalogos_diagnostico_empresa_nueva();

INSERT INTO _593_roundtrip
SELECT 'revert elimina solo trigger_y_funcion',
       (SELECT count(*) FROM _593_before) = 1
       AND (SELECT count(*) FROM _593_fn_before) = 1
       AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.empresas'::regclass AND tgname='trg_z_seed_diagnostico_catalogos_empresa_nueva' AND NOT tgisinternal)
       AND to_regprocedure('public.sembrar_catalogos_diagnostico_empresa_nueva()') IS NULL,
       format('triggers_antes=%s funciones_antes=%s', (SELECT count(*) FROM _593_before), (SELECT count(*) FROM _593_fn_before));

SELECT * FROM _593_roundtrip ORDER BY prueba;
-- El ROLLBACK restaura el estado exacto previo, incluidas definición, ACL y trigger.
ROLLBACK;
