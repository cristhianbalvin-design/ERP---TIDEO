-- Fallback configurable por empresa para calcular vencimientos de CxC.

ALTER TABLE IF EXISTS public.empresa_config
  ADD COLUMN IF NOT EXISTS condicion_pago_defecto text DEFAULT '30 días';

UPDATE public.empresa_config
SET condicion_pago_defecto = '30 días'
WHERE condicion_pago_defecto IS NULL OR btrim(condicion_pago_defecto) = '';

SELECT pg_notify('pgrst', 'reload schema');
