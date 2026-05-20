-- Vincula notas de crédito y débito a su factura de origen.
alter table public.facturas
  add column if not exists factura_origen_id text references public.facturas(id),
  add column if not exists motivo text;
