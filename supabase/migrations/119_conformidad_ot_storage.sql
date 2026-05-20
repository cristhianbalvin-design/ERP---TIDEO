-- Bucket para documentos de conformidad física de OT
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'conformidades-ot', 'conformidades-ot', true,
  10485760,
  ARRAY['application/pdf','image/png','image/jpeg','image/webp']
) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "conf_ot_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'conformidades-ot');

CREATE POLICY "conf_ot_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'conformidades-ot');

-- Campos de conformidad en cierres_tecnicos
ALTER TABLE cierres_tecnicos
  ADD COLUMN IF NOT EXISTS conformidad_archivo_url    TEXT,
  ADD COLUMN IF NOT EXISTS conformidad_archivo_nombre TEXT,
  ADD COLUMN IF NOT EXISTS token_conformidad          UUID UNIQUE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS conformidad_nombre         TEXT,
  ADD COLUMN IF NOT EXISTS conformidad_dni            TEXT,
  ADD COLUMN IF NOT EXISTS conformidad_fecha          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS conformidad_ip             TEXT;

-- RPC pública: obtener datos para página de firma
CREATE OR REPLACE FUNCTION get_ot_conformidad_publica(p_token UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_cierre cierres_tecnicos;
  v_ot     ordenes_trabajo;
BEGIN
  SELECT * INTO v_cierre FROM cierres_tecnicos WHERE token_conformidad = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'token_invalido');
  END IF;
  IF v_cierre.conformidad_fecha IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'ya_firmada',
      'nombre', v_cierre.conformidad_nombre,
      'fecha',  v_cierre.conformidad_fecha
    );
  END IF;
  SELECT * INTO v_ot FROM ordenes_trabajo WHERE id = v_cierre.orden_trabajo_id;
  RETURN jsonb_build_object(
    'status', 'ok',
    'ot', jsonb_build_object(
      'numero',      v_ot.numero,
      'servicio',    v_ot.servicio,
      'descripcion', v_ot.descripcion,
      'fecha_cierre', v_cierre.fecha_cierre,
      'descripcion_trabajo', v_cierre.descripcion_trabajo
    )
  );
END;
$$;

-- RPC pública: registrar firma digital del cliente
CREATE OR REPLACE FUNCTION registrar_conformidad_ot(
  p_token  UUID,
  p_nombre TEXT,
  p_dni    TEXT,
  p_ip     TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE cierres_tecnicos SET
    conformidad_nombre = p_nombre,
    conformidad_dni    = p_dni,
    conformidad_fecha  = now(),
    conformidad_ip     = p_ip
  WHERE token_conformidad = p_token AND conformidad_fecha IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ya_firmada_o_invalida');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;
