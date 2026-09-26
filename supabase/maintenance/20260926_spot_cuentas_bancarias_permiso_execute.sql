\set ON_ERROR_STOP on
\pset pager off
\pset format aligned
\echo '--- Bloque 1 / R2: ejecucion ---'
begin;
\ir 20260926_spot_cuentas_bancarias_permiso_body.sql
commit;
\echo 'R2_EXECUTE_COMMITTED'
