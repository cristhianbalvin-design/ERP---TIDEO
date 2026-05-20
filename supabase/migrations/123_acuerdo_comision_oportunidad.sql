-- Campos de acuerdo de comisión por oportunidad
ALTER TABLE oportunidades
  ADD COLUMN IF NOT EXISTS acuerdo_pct             NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS acuerdo_bonificacion    NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS acuerdo_justificacion   TEXT,
  ADD COLUMN IF NOT EXISTS acuerdo_estado          TEXT DEFAULT 'sin_acuerdo'
    CONSTRAINT oportunidades_acuerdo_estado_check
    CHECK (acuerdo_estado IN ('sin_acuerdo','borrador','pendiente','aprobado','rechazado')),
  ADD COLUMN IF NOT EXISTS acuerdo_aprobado_por    TEXT,
  ADD COLUMN IF NOT EXISTS acuerdo_aprobado_id     UUID,
  ADD COLUMN IF NOT EXISTS acuerdo_fecha_aprobacion TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS acuerdo_motivo_rechazo  TEXT;

-- Tabla de notificaciones persistentes (cross-user)
CREATE TABLE IF NOT EXISTS notificaciones_sistema (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  TEXT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL,
  texto       TEXT NOT NULL,
  leida       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE notificaciones_sistema ENABLE ROW LEVEL SECURITY;

-- Cada usuario solo ve sus propias notificaciones
CREATE POLICY "notif_select_own" ON notificaciones_sistema
  FOR SELECT USING (auth.uid() = user_id);

-- Cualquier usuario autenticado de la empresa puede insertar notificaciones para otros
CREATE POLICY "notif_insert_auth" ON notificaciones_sistema
  FOR INSERT TO authenticated
  WITH CHECK (empresa_id IN (
    SELECT ue.empresa_id FROM public.usuarios_empresas ue
    WHERE ue.user_id = auth.uid() AND ue.estado = 'activo'
  ));

-- Solo el destinatario puede marcarlas como leídas
CREATE POLICY "notif_update_own" ON notificaciones_sistema
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_notif_sistema_user
  ON notificaciones_sistema (user_id, leida, created_at DESC);
