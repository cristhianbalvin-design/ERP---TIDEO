-- 217: Matching 3 vías – datos de factura física en recepciones + tolerancia de precio en empresa_config
--
-- PARTE A: campos de factura física del proveedor en recepciones (todos nullable para no romper filas existentes)
-- PARTE B: campos de auditoría de validación de precio/cantidad
-- empresa_config: tolerancia_precio_compras configurable (default 5%)

alter table public.recepciones
  add column if not exists factura_proveedor_numero text,
  add column if not exists factura_proveedor_fecha   date,
  add column if not exists factura_proveedor_monto   numeric,
  add column if not exists archivo_factura_url       text,
  add column if not exists precio_diferente          boolean default false,
  add column if not exists cantidad_diferente        boolean default false;

alter table public.empresa_config
  add column if not exists tolerancia_precio_compras numeric default 5;

select pg_notify('pgrst', 'reload schema');
