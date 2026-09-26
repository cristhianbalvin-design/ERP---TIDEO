\set ON_ERROR_STOP on
\pset pager off
\echo '--- Bloque 1 / R1: ejecucion ---'
begin;
\ir 20260926_spot_facturacion_permiso_body.sql
commit;
\echo 'R1_EXECUTION_COMMIT_COMPLETED'
