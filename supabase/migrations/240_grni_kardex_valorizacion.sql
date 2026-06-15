-- GRNI: entradas fisicas de OC pendientes de factura y ajuste posterior de costo.
ALTER TABLE public.kardex
  ADD COLUMN IF NOT EXISTS valorizacion_estado text NOT NULL DEFAULT 'definitivo',
  ADD COLUMN IF NOT EXISTS orden_compra_id text,
  ADD COLUMN IF NOT EXISTS orden_compra_item_idx integer,
  ADD COLUMN IF NOT EXISTS precio_unitario_provisional numeric(14,4),
  ADD COLUMN IF NOT EXISTS precio_unitario_real numeric(14,4),
  ADD COLUMN IF NOT EXISTS recepcion_id text,
  ADD COLUMN IF NOT EXISTS valorizado_at timestamptz;

UPDATE public.kardex
SET valorizacion_estado = 'definitivo'
WHERE valorizacion_estado IS NULL;

CREATE INDEX IF NOT EXISTS idx_kardex_grni_oc
  ON public.kardex (empresa_id, orden_compra_id, valorizacion_estado)
  WHERE anulado = false;

CREATE INDEX IF NOT EXISTS idx_kardex_grni_pendiente
  ON public.kardex (empresa_id, valorizacion_estado)
  WHERE anulado = false AND valorizacion_estado = 'pendiente_factura';
