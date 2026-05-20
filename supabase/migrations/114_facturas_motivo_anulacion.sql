-- Agrega campo para motivo de anulación en facturas.
alter table public.facturas
  add column if not exists motivo_anulacion text;
