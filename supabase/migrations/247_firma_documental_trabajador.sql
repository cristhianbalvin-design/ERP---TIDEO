-- 247 — Flujo de firma contractual RRHH → Trabajador
-- Agrega estado_firma y referencia entre documento enviado y documento firmado.
-- Idempotente: usa ADD COLUMN IF NOT EXISTS.

ALTER TABLE public.personal_documentos
  ADD COLUMN IF NOT EXISTS estado_firma text
    NOT NULL DEFAULT 'no_requiere'
    CHECK (estado_firma IN ('no_requiere','pendiente_trabajador','firmado_trabajador','no_aplica')),
  ADD COLUMN IF NOT EXISTS documento_enviado_a_firma_id text
    REFERENCES public.personal_documentos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS enviado_a_firma_en timestamptz,
  ADD COLUMN IF NOT EXISTS enviado_a_firma_mensaje text;

COMMENT ON COLUMN public.personal_documentos.estado_firma IS
  'no_requiere (default) = doc interno sin firma del trabajador; pendiente_trabajador = RRHH envió a firma; firmado_trabajador = trabajador firmó o subió PDF firmado; no_aplica = tipo de doc sin firma requerida';

COMMENT ON COLUMN public.personal_documentos.documento_enviado_a_firma_id IS
  'Cuando el trabajador sube el firmado, este campo en el nuevo registro apunta al doc original que RRHH envió a firma';

SELECT pg_notify('pgrst', 'reload schema');
