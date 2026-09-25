-- PWA Compras: campos persistentes del comprobante de gasto de campo.
ALTER TABLE public.compras_gastos
  ADD COLUMN IF NOT EXISTS ruc_proveedor text,
  ADD COLUMN IF NOT EXISTS num_comprobante text;
