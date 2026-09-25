-- Ejecución real del Paso 4. El cuerpo común contiene la migración y validaciones DO.
\encoding UTF8
show client_encoding;
begin;
set local role postgres;
\ir 20260924_spot_facturas_retencion_exclusion_body.sql
commit;
\echo STEP4_EXECUTION_COMMIT_COMPLETED
