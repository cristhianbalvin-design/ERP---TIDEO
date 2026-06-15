-- Añade columnas de fechas de seguimiento a ordenes_compra
ALTER TABLE public.ordenes_compra
  ADD COLUMN IF NOT EXISTS fecha_confirmada date,
  ADD COLUMN IF NOT EXISTS fecha_en_transito date;

-- Backfill: para OC ya confirmadas sin fecha, usar updated_at como aproximación
UPDATE public.ordenes_compra
SET fecha_confirmada = updated_at::date
WHERE estado IN ('confirmada','en_transito','recibida_parcial','recibida_total','cerrada')
  AND fecha_confirmada IS NULL;
