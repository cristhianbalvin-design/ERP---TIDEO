-- Ejecución real autorizada del Paso 2. No contiene validaciones.
\encoding UTF8
show client_encoding;
begin;
set local role postgres;
\ir ../migrations/20260924010000_spot_maestros_cuentas.sql
commit;
\echo STEP2_EXECUTION_COMMIT_COMPLETED
