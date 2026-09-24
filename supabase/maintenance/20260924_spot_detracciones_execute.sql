-- Ejecución real autorizada del Paso 3. El cuerpo común contiene la migración y validaciones DO.
\encoding UTF8
show client_encoding;
begin;
set local role postgres;
\ir 20260924_spot_detracciones_body.sql
commit;
\echo STEP3_EXECUTION_COMMIT_COMPLETED
