-- TIDEO ERP — Ventas: condición de pago, vínculo CxC y protección doble conteo ER.
-- Agrega 5 campos a la tabla ventas. No modifica ninguna columna existente.
-- NOTA: cxc.id y facturas.id son text (no uuid), por lo que las FKs también son text.

-- 1. condicion_pago: distingue si la venta es al contado o a crédito.
alter table public.ventas
  add column if not exists condicion_pago text not null default 'contado'
    check (condicion_pago in ('contado', 'credito'));

-- 2. dias_credito: plazo en días, solo relevante cuando condicion_pago = 'credito'.
alter table public.ventas
  add column if not exists dias_credito integer;

-- 3. fecha_vencimiento: fecha calculada como fecha + dias_credito (computada en app).
alter table public.ventas
  add column if not exists fecha_vencimiento date;

-- 4. cxc_id: referencia (text) a la CxC generada automáticamente para ventas a crédito.
alter table public.ventas
  add column if not exists cxc_id text references public.cxc(id) on delete set null;

-- 5. origen_factura_id: marca ventas que ya están contabilizadas como factura.
--    El ER excluye estas ventas de loadVentas para evitar doble conteo.
alter table public.ventas
  add column if not exists origen_factura_id text references public.facturas(id) on delete set null;

-- Índice para búsqueda de ventas con origen_factura_id (usado por loadVentas del ER).
create index if not exists ventas_origen_factura_idx on public.ventas (empresa_id, origen_factura_id)
  where origen_factura_id is not null;

-- Índice para búsqueda de ventas por cxc vinculada.
create index if not exists ventas_cxc_id_idx on public.ventas (cxc_id)
  where cxc_id is not null;

select pg_notify('pgrst', 'reload schema');
