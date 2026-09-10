-- Detracción (SPOT) documentada en la factura.
-- A diferencia de la retención SUNAT, la detracción se cobra íntegramente
-- mediante un depósito adicional; por eso no se replica en CxC ni altera el
-- monto neto cobrable o el cálculo del saldo.
alter table public.facturas
  add column if not exists aplica_detraccion boolean not null default false,
  add column if not exists porcentaje_detraccion numeric(5,2),
  add column if not exists monto_detraccion numeric(14,2);

comment on column public.facturas.aplica_detraccion is
  'Indica si la factura está sujeta a detracción SPOT.';
comment on column public.facturas.porcentaje_detraccion is
  'Porcentaje SPOT informado manualmente, sin catálogo de tasas.';
comment on column public.facturas.monto_detraccion is
  'Monto que debe registrarse como cobro de medio de pago Detraccion.';

select pg_notify('pgrst', 'reload schema');
