-- Campos descriptivos para mostrar comisiones aunque las relaciones cambien o carguen tarde.
alter table public.comisiones
  add column if not exists os_cliente_numero text,
  add column if not exists factura_numero text,
  add column if not exists oportunidad_nombre text,
  add column if not exists nota_acuerdo text;

select pg_notify('pgrst', 'reload schema');
