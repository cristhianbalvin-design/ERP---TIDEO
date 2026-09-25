\set ON_ERROR_STOP on
\pset pager off
\pset format aligned
\pset null '[NULL]'
\echo '--- Vigencias SPOT: ejecucion ---'
begin;
\ir ../migrations/20260924090000_spot_catalogo_vigencias.sql
commit;
\echo 'SPOT_VIGENCIAS_EXECUTION_COMMIT_COMPLETED'
