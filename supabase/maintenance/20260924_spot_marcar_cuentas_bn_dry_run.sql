\set ON_ERROR_STOP on
\pset pager off
\pset format aligned
\pset null '[NULL]'
\echo '--- Paso 9: dry run ---'
begin;
\ir ../migrations/20260924080000_spot_marcar_cuentas_bn.sql
rollback;
\echo 'STEP9_DRY_RUN_ROLLBACK_COMPLETED'
