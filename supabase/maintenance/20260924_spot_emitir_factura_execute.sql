\set ON_ERROR_STOP on
\pset pager off
\pset format aligned
\pset null '[NULL]'
\echo '--- Paso 5: ejecucion ---'
begin;
\ir 20260924_spot_emitir_factura_body.sql
commit;
\echo 'STEP5_EXECUTION_COMMIT_COMPLETED'
