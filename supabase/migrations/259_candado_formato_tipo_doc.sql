-- ============================================================================
-- 259 · Candado: Formato de tipo_doc
-- ============================================================================

-- 1. Eliminar datos corruptos restantes (preventivo)
DELETE FROM public.personal_documentos
WHERE NOT (
  tipo_doc ~ '^tdoc_[a-zA-Z0-9]+$'
  OR tipo_doc ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
);

-- 2. Aplicar el constraint
ALTER TABLE public.personal_documentos
DROP CONSTRAINT IF EXISTS chk_tipo_doc_formato;

ALTER TABLE public.personal_documentos
ADD CONSTRAINT chk_tipo_doc_formato
CHECK (
  tipo_doc ~ '^tdoc_[a-zA-Z0-9]+$'
  OR tipo_doc ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
);
