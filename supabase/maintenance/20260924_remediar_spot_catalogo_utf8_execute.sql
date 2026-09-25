-- Incidente Paso 1: envoltura de ejecucion real.
-- Se ejecuta solo tras autorizacion explicita.

\encoding UTF8
show client_encoding;

begin;
set local role postgres;
\ir 20260924_remediar_spot_catalogo_utf8_body.sql
commit;
\echo EXECUTION_COMMIT_COMPLETED
