-- Migration: 316_posiciones_archivables.sql
-- Agrega columna 'activa' a la tabla posiciones para soportar el archivado lógico (soft delete)

ALTER TABLE public.posiciones 
ADD COLUMN activa BOOLEAN DEFAULT true NOT NULL;

-- Agregamos un índice para acelerar filtrados de posiciones activas
CREATE INDEX IF NOT EXISTS idx_posiciones_activa ON public.posiciones (activa);
