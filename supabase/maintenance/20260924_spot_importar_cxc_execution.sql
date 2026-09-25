\set ON_ERROR_STOP on
\pset pager off
\pset format aligned
\pset null '[NULL]'
\echo '--- Paso 8: ejecucion ---'
begin;
\ir 20260924_spot_importar_cxc_body.sql
commit;
\echo 'STEP8_EXECUTION_COMMIT_COMPLETED'
