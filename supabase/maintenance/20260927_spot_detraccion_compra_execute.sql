\set ON_ERROR_STOP on
\pset pager off
\pset format aligned
\echo '--- SPOT / Bloque 3b-1: ejecucion ---'
begin;
\ir 20260927_spot_detraccion_compra_body.sql
commit;
\echo 'B3B1_EXECUTE_COMMITTED'
