-- TIDEO ERP — Migración 158: Sincronización de Schema para Finanzas
-- Agrega columnas operativas y de estado UI que el frontend envía y no existían, para prevenir rechazos silenciosos.

-- ─── 1. valorizaciones: tipo y campos adicionales ─────────────
alter table public.valorizaciones
  add column if not exists tipo text,
  add column if not exists notas text,
  add column if not exists modelo_calculo text,
  add column if not exists ot_ids jsonb default '[]',
  add column if not exists items jsonb default '[]',
  add column if not exists historial jsonb default '[]',
  add column if not exists fecha_aprobacion date,
  add column if not exists motivo_anulacion text;

-- ─── 2. facturas: concepto, condición pago, etc. ─────────────
alter table public.facturas
  add column if not exists concepto text,
  add column if not exists condicion_pago text,
  add column if not exists archivo_url text,
  add column if not exists subtotal numeric(14,2),
  add column if not exists igv numeric(14,2);

-- ─── 3. cxc: concepto ─────────────
alter table public.cxc
  add column if not exists concepto text,
  add column if not exists moneda text default 'PEN';

select pg_notify('pgrst', 'reload schema');
