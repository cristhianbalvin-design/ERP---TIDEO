-- Incidente Paso 1: envoltura de dry run.
-- Esta envoltura nunca persiste cambios.

\encoding UTF8
show client_encoding;

begin;
set local role postgres;
\ir 20260924_remediar_spot_catalogo_utf8_body.sql
rollback;
\echo DRY_RUN_ROLLBACK_COMPLETED
