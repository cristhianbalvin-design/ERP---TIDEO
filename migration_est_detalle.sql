-- MIGRACIÓN: agregar est_detalle JSONB a ordenes_trabajo
-- Ejecutar en: Supabase Dashboard → SQL Editor

ALTER TABLE public.ordenes_trabajo
ADD COLUMN IF NOT EXISTS est_detalle jsonb DEFAULT '{}'::jsonb;
