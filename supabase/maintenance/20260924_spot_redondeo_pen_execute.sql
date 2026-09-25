\set ON_ERROR_STOP on
\pset pager off
\pset format aligned
\pset null '[NULL]'
\echo '--- Paso redondeo SPOT PEN: ejecución ---'
begin;
\ir 20260924_spot_redondeo_pen_body.sql
commit;
