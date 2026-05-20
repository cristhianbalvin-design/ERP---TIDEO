-- Historial de movimientos del acuerdo de comisión por oportunidad
CREATE TABLE IF NOT EXISTS acuerdo_comision_historial (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    TEXT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  oportunidad_id TEXT NOT NULL,
  accion        TEXT NOT NULL,  -- propuesta | envio | retiro | aprobacion | rechazo | ajuste_gerente
  actor_nombre  TEXT,
  actor_id      UUID,
  acuerdo_pct   NUMERIC(5,2),
  acuerdo_bonificacion NUMERIC(14,2),
  justificacion TEXT,
  motivo        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE acuerdo_comision_historial ENABLE ROW LEVEL SECURITY;

CREATE POLICY "acuerdo_hist_select" ON acuerdo_comision_historial
  FOR SELECT USING (
    empresa_id IN (
      SELECT ue.empresa_id FROM public.usuarios_empresas ue
      WHERE ue.user_id = auth.uid() AND ue.estado = 'activo'
    )
  );

CREATE POLICY "acuerdo_hist_insert" ON acuerdo_comision_historial
  FOR INSERT TO authenticated
  WITH CHECK (
    empresa_id IN (
      SELECT ue.empresa_id FROM public.usuarios_empresas ue
      WHERE ue.user_id = auth.uid() AND ue.estado = 'activo'
    )
  );

CREATE INDEX IF NOT EXISTS idx_acuerdo_hist_opp
  ON acuerdo_comision_historial (oportunidad_id, created_at DESC);
