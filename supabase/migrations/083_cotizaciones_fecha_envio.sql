-- 083 — Agrega fecha_envio a cotizaciones
-- Registra el momento exacto en que la cotización fue enviada al cliente.

alter table public.cotizaciones
  add column if not exists fecha_envio timestamptz;

select pg_notify('pgrst', 'reload schema');
