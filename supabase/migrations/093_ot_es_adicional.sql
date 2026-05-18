-- Marca las OTs creadas fuera del presupuesto original de la OS Cliente
ALTER TABLE ordenes_trabajo
  ADD COLUMN IF NOT EXISTS es_adicional BOOLEAN NOT NULL DEFAULT FALSE;
