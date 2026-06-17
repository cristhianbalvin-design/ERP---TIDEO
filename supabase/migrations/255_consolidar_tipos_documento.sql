-- ============================================================================
-- 255 · Consolidar tipos de documento
-- ============================================================================

-- 1a. Agregar campos a tipos_documento_empresa
ALTER TABLE public.tipos_documento_empresa
ADD COLUMN IF NOT EXISTS renovable boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS frecuencia_dias integer;

-- 1b. Actualizar los registros existentes con los valores correctos
UPDATE public.tipos_documento_empresa
SET renovable = false, frecuencia_dias = null;

UPDATE public.tipos_documento_empresa
SET renovable = true, frecuencia_dias = null
WHERE nombre ILIKE '%Contrato%';

UPDATE public.tipos_documento_empresa
SET renovable = true, frecuencia_dias = 30
WHERE nombre ILIKE '%SCTR%';

UPDATE public.tipos_documento_empresa
SET renovable = true, frecuencia_dias = 365
WHERE nombre ILIKE '%Médico%' OR nombre ILIKE '%médico%' OR nombre ILIKE '%Examen%';

UPDATE public.tipos_documento_empresa
SET renovable = false, frecuencia_dias = null
WHERE documento_padre_tipo_id IS NOT NULL;

-- 1c. Eliminar tipos_documento_config
DROP TABLE IF EXISTS public.tipos_documento_config CASCADE;

SELECT pg_notify('pgrst', 'reload schema');
