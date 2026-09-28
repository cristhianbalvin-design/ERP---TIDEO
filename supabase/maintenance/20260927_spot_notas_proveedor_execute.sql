\set ON_ERROR_STOP on
\pset pager off
\echo '--- SPOT / Bloque 3c: ejecucion ---'
begin;
\ir 20260927_spot_notas_proveedor_body.sql
commit;
\echo 'B3C_EXECUTE_COMMITTED'
