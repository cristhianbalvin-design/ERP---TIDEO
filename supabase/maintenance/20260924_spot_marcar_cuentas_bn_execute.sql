\set ON_ERROR_STOP on
\pset pager off
\pset format aligned
\pset null '[NULL]'
\echo '--- Paso 9: ejecucion ---'
begin;
\ir ../migrations/20260924080000_spot_marcar_cuentas_bn.sql
commit;
\echo 'STEP9_EXECUTION_COMMIT_COMPLETED'
