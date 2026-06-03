-- Migration 177: Catálogo de tipos de gasto por empresa
-- Permite al admin configurar tipos de gasto con su mapeo a categoría ER.
-- Si la empresa no tiene tipos configurados, el frontend usa TIPOS_GASTO_DEFECTO.

CREATE TABLE IF NOT EXISTS tipos_gasto_empresa (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  TEXT        NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre      TEXT        NOT NULL,
  categoria_er TEXT        NOT NULL CHECK (categoria_er IN (
                  'Materiales', 'Servicios terceros', 'Logística',
                  'Administrativos', 'Comerciales', 'Gastos financieros'
               )),
  icono       TEXT        NOT NULL DEFAULT 'receipt',
  activo      BOOLEAN     NOT NULL DEFAULT true,
  orden       INTEGER     NOT NULL DEFAULT 0,
  creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tipos_gasto_empresa_empresa_idx
  ON tipos_gasto_empresa (empresa_id, activo, orden);

-- RLS
ALTER TABLE tipos_gasto_empresa ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_tipos_gasto" ON tipos_gasto_empresa
  USING (public.usuario_tiene_empresa(empresa_id));
