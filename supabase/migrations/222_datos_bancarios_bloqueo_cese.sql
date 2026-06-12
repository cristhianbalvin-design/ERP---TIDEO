-- GAP-03: Datos bancarios en personal_operativo y personal_administrativo
ALTER TABLE personal_operativo
  ADD COLUMN IF NOT EXISTS datos_bancarios jsonb DEFAULT '[]'::jsonb;

ALTER TABLE personal_administrativo
  ADD COLUMN IF NOT EXISTS datos_bancarios jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN personal_operativo.datos_bancarios IS
  'Array de cuentas bancarias. Cada objeto: {id, banco, numero_cuenta, cci, tipo_cuenta, moneda, es_principal}';
COMMENT ON COLUMN personal_administrativo.datos_bancarios IS
  'Array de cuentas bancarias. Cada objeto: {id, banco, numero_cuenta, cci, tipo_cuenta, moneda, es_principal}';

-- GAP-12: Auditoría de bloqueo de acceso al sistema por cese
ALTER TABLE personal_operativo
  ADD COLUMN IF NOT EXISTS usuario_bloqueado_en timestamptz,
  ADD COLUMN IF NOT EXISTS usuario_bloqueado_por text;

ALTER TABLE personal_administrativo
  ADD COLUMN IF NOT EXISTS usuario_bloqueado_en timestamptz,
  ADD COLUMN IF NOT EXISTS usuario_bloqueado_por text;
