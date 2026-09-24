\set ON_ERROR_STOP on
\pset pager off
\echo '--- Paso 7: ejecucion ---'
begin;
\ir 20260924_spot_emitir_nota_body.sql
commit;
\echo 'STEP7_EXECUTION_COMMIT_COMPLETED'
