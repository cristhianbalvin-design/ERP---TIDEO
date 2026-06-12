-- Agrega columna items (JSONB) a solpe_interna para almacenar líneas de material/servicio
ALTER TABLE solpe_interna
  ADD COLUMN IF NOT EXISTS items jsonb DEFAULT '[]';
