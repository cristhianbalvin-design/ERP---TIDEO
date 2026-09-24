\set ON_ERROR_STOP on
\pset pager off
\echo '--- Paso 6: ejecucion ---'
begin;
\ir 20260924_spot_registrar_cobro_body.sql
commit;
\echo 'STEP6_EXECUTION_COMMIT_COMPLETED'
