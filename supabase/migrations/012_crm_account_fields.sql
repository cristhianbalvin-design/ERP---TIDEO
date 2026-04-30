-- TIDEO ERP - Campos comerciales usados por la UI en cuentas.
-- Ejecutar en proyectos existentes antes de probar altas CRM desde frontend.

alter table public.cuentas add column if not exists tamano text;
alter table public.cuentas add column if not exists telefono text;
alter table public.cuentas add column if not exists email text;
alter table public.cuentas add column if not exists direccion text;
alter table public.cuentas add column if not exists responsable_comercial text;
alter table public.cuentas add column if not exists responsable_cs text;
alter table public.cuentas add column if not exists fuente_origen text;
alter table public.cuentas add column if not exists riesgo_churn text;
alter table public.cuentas add column if not exists health_score numeric(5,2);
alter table public.cuentas add column if not exists saldo_cxc numeric(14,2) default 0;
alter table public.cuentas add column if not exists margen_acumulado numeric(14,2);
alter table public.cuentas add column if not exists fecha_ultima_compra date;
