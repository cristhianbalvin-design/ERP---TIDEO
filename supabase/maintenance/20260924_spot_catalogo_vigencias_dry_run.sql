\set ON_ERROR_STOP on
\pset pager off
\pset format aligned
\pset null '[NULL]'
\echo '--- Vigencias SPOT: dry run ---'
begin;
\ir ../migrations/20260924090000_spot_catalogo_vigencias.sql
rollback;
\echo 'SPOT_VIGENCIAS_DRY_RUN_ROLLBACK_COMPLETED'
