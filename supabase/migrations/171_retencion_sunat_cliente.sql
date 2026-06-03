-- Retención SUNAT por cliente agente de retención.
-- Gap: cuando un cliente está designado por SUNAT como Agente de Retención del IGV,
-- retiene el 3% del precio de venta al momento de pagarnos. No es un gasto, es crédito fiscal.

-- 1. Configuración por cliente (en tabla cuentas, donde se guardan las condiciones comerciales)
alter table public.cuentas
  add column if not exists agente_retencion_sunat boolean not null default false,
  add column if not exists tasa_retencion_sunat numeric(5,2) not null default 3.00;

-- 2. Factura: campos inmutables al momento de emisión
alter table public.facturas
  add column if not exists aplica_retencion boolean not null default false,
  add column if not exists monto_retencion numeric(14,2) not null default 0,
  add column if not exists monto_neto_cobrable numeric(14,2);

-- 3. CxC: copia del monto retenido para cobranza y conciliación
alter table public.cxc
  add column if not exists monto_retencion numeric(14,2) not null default 0;

select pg_notify('pgrst', 'reload schema');
