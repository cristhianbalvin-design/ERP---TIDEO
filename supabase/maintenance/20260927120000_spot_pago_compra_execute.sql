\set ON_ERROR_STOP on
\echo '--- SPOT / Bloque 3b-2: execute ---'
begin;
\ir 20260927120000_spot_pago_compra_body.sql
commit;
\echo 'B3B2_EXECUTE_COMMITTED'
