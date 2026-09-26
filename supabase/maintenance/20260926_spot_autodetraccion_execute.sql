\set ON_ERROR_STOP on
\pset pager off
\echo '--- SPOT Bloque 2 / autodetraccion: ejecucion ---'
begin;
\ir 20260926_spot_autodetraccion_body.sql
commit;
\echo 'SPOT2_EXECUTE_COMMIT_COMPLETED'
