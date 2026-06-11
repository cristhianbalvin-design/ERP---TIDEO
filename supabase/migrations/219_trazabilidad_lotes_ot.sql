-- Índice compuesto para consultas de trazabilidad por lote en kardex.
-- Cubre el filtro empresa_id + material_id + lote que usa el tab "Trazabilidad por Lote".
CREATE INDEX IF NOT EXISTS idx_kardex_empresa_material_lote
  ON kardex (empresa_id, material_id, lote);
