\set ON_ERROR_STOP on
\pset pager off
\pset format aligned
\echo '--- SPOT / Bloque 3a: ejecucion ---'
begin;
\ir 20260927_spot_proveedor_cuentas_bancarias_body.sql
commit;
\echo 'B3A_EXECUTE_COMMITTED'
