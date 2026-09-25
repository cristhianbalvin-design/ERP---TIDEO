\set ON_ERROR_STOP on
\pset pager off
\echo '--- Paso 6 constancia: ejecucion ---'
begin;
\ir 20260924_spot_cobro_constancia_body.sql
commit;
\echo 'STEP6_CONSTANCIA_EXECUTION_COMMIT_COMPLETED'
