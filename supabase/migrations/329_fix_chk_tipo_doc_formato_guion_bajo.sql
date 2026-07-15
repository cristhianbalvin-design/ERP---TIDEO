-- ============================================================================
-- 329 · Fix: chk_tipo_doc_formato bloqueaba "Adenda contractual"
-- ============================================================================
-- El constraint (migración 259) solo permitía 'tdoc_' + alfanumérico, pero el
-- id de "Adenda contractual" (migración 243) es 'tdoc_adenda_' || empresa_id,
-- ej. tdoc_adenda_emp_20601829101, que incluye guiones bajos. Esto bloqueaba
-- la subida de cualquier adenda en todas las empresas.
-- ============================================================================

ALTER TABLE public.personal_documentos
DROP CONSTRAINT IF EXISTS chk_tipo_doc_formato;

ALTER TABLE public.personal_documentos
ADD CONSTRAINT chk_tipo_doc_formato
CHECK (
  tipo_doc ~ '^tdoc_[a-zA-Z0-9_]+$'
  OR tipo_doc ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
);
