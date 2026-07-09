-- ============================================================================
-- 322 · Cleanup overloaded RPCs para subir documentos
-- ============================================================================
-- Se eliminan las firmas antiguas de las funciones que fueron modificadas
-- en las migraciones 320 y 321 (al añadir parámetros no se borró la firma
-- anterior, generando error de ambigüedad en PostgREST "Could not choose
-- the best candidate function").
-- ============================================================================

-- 1. Limpiar subir_documento_personal (firma actual tiene 21 params)
-- Firma con 19 params (previa a p_forzar_override, p_motivo_override)
DROP FUNCTION IF EXISTS public.subir_documento_personal(text, text, text, text, text, text, date, date, text, text, text, jsonb, text, jsonb, date, text, text, text, boolean);
-- Firma con 18 params (previa a p_es_indefinido)
DROP FUNCTION IF EXISTS public.subir_documento_personal(text, text, text, text, text, text, date, date, text, text, text, jsonb, text, jsonb, date, text, text, text);
-- Firma con 17 params (previa a p_origen)
DROP FUNCTION IF EXISTS public.subir_documento_personal(text, text, text, text, text, text, date, date, text, text, text, jsonb, text, jsonb, date, text, text);

-- 2. Limpiar subir_version_documento (firma actual tiene 22 params)
-- Firma con 20 params
DROP FUNCTION IF EXISTS public.subir_version_documento(text, text, text, text, text, text, uuid, date, date, text, text, text, jsonb, text, jsonb, date, text, text, text, boolean);
-- Firma con 19 params
DROP FUNCTION IF EXISTS public.subir_version_documento(text, text, text, text, text, text, uuid, date, date, text, text, text, jsonb, text, jsonb, date, text, text, text);
-- Firma con 18 params
DROP FUNCTION IF EXISTS public.subir_version_documento(text, text, text, text, text, text, uuid, date, date, text, text, text, jsonb, text, jsonb, date, text, text);

-- 3. Limpiar nuevo_contrato_periodo (firma actual tiene 15 params)
-- Firma con 13 params
DROP FUNCTION IF EXISTS public.nuevo_contrato_periodo(text, text, text, text, text, text, date, date, text, jsonb, text, text, boolean);
-- Firma con 12 params
DROP FUNCTION IF EXISTS public.nuevo_contrato_periodo(text, text, text, text, text, text, date, date, text, jsonb, text, text);

-- 4. Limpiar corregir_documento_personal (firma actual tiene 9 params)
-- Firma con 7 params
DROP FUNCTION IF EXISTS public.corregir_documento_personal(text, date, date, jsonb, text, text, text);

-- 5. Limpiar renovar_documento (firma actual tiene 17 params, añadida en 321)
-- Firma con 16 params (previa a p_contrato_periodo_id)
DROP FUNCTION IF EXISTS public.renovar_documento(text, text, text, text, text, text, date, date, text, text, text, jsonb, text, jsonb, date, text);

-- Notificar a PostgREST para recargar el esquema
SELECT pg_notify('pgrst', 'reload schema');
