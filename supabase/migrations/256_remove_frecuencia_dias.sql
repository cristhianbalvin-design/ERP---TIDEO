-- Migration 256: Remove frecuencia_dias

ALTER TABLE "public"."tipos_documento_empresa"
DROP COLUMN IF EXISTS "frecuencia_dias";
