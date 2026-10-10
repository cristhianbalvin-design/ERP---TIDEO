-- Catálogo global de componentes técnicos y personalización limitada por sociedad.
-- Los dibujos, zonas y medidas base son de solo lectura para clientes authenticated.
-- Ensayo SQL Editor: ejecutar todo el bloque y sustituir COMMIT por ROLLBACK.
BEGIN;

CREATE TABLE IF NOT EXISTS public.catalogo_componentes (
  id text PRIMARY KEY,
  nombre text NOT NULL,
  descripcion text,
  orden integer NOT NULL DEFAULT 0,
  svg text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.catalogo_componentes IS 'Catálogo global de dibujos técnicos controlados por el sistema; no editable desde clientes.';
COMMENT ON COLUMN public.catalogo_componentes.svg IS 'SVG técnico base del componente, almacenado íntegro como texto.';

CREATE TABLE IF NOT EXISTS public.catalogo_componente_zonas (
  componente_id text NOT NULL REFERENCES public.catalogo_componentes(id) ON DELETE CASCADE,
  id text NOT NULL,
  nombre text NOT NULL,
  orden integer NOT NULL DEFAULT 0,
  PRIMARY KEY (componente_id, id)
);
COMMENT ON TABLE public.catalogo_componente_zonas IS 'Zonas de medición que vienen definidas por el catálogo base.';

CREATE TABLE IF NOT EXISTS public.catalogo_componente_medidas (
  componente_id text NOT NULL,
  zona_id text NOT NULL,
  id text NOT NULL,
  nombre text NOT NULL,
  cota text NOT NULL,
  desde text,
  referencia text,
  orden integer NOT NULL DEFAULT 0,
  PRIMARY KEY (componente_id, zona_id, id),
  FOREIGN KEY (componente_id, zona_id) REFERENCES public.catalogo_componente_zonas(componente_id, id) ON DELETE CASCADE
);
COMMENT ON TABLE public.catalogo_componente_medidas IS 'Medidas base definidas por el catálogo; las sociedades solo crean overrides.';

CREATE TABLE IF NOT EXISTS public.catalogo_componentes_sociedad (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id text NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  sociedad_id uuid REFERENCES public.sociedades(id) ON DELETE CASCADE,
  componente_id text NOT NULL REFERENCES public.catalogo_componentes(id) ON DELETE CASCADE,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.catalogo_componentes_sociedad IS 'Activación de cada componente por empresa y sociedad (NULL solo en tenants sin multisociedad).';

CREATE UNIQUE INDEX IF NOT EXISTS catalogo_componentes_sociedad_scope_uq
  ON public.catalogo_componentes_sociedad (empresa_id, (coalesce(sociedad_id, '00000000-0000-0000-0000-000000000000'::uuid)), componente_id);
CREATE INDEX IF NOT EXISTS catalogo_componentes_sociedad_scope_idx
  ON public.catalogo_componentes_sociedad (empresa_id, sociedad_id, componente_id);

CREATE TABLE IF NOT EXISTS public.catalogo_componente_medidas_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id text NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  sociedad_id uuid REFERENCES public.sociedades(id) ON DELETE CASCADE,
  componente_id text NOT NULL,
  zona_id text NOT NULL,
  medida_id text NOT NULL,
  nombre text NOT NULL,
  cota text NOT NULL,
  desde text,
  referencia text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (componente_id, zona_id, medida_id) REFERENCES public.catalogo_componente_medidas(componente_id, zona_id, id) ON DELETE CASCADE
);
COMMENT ON TABLE public.catalogo_componente_medidas_overrides IS 'Overrides privados por empresa y sociedad; si no hay fila se usa el valor global.';
CREATE UNIQUE INDEX IF NOT EXISTS catalogo_componente_medidas_override_scope_uq
  ON public.catalogo_componente_medidas_overrides (empresa_id, (coalesce(sociedad_id, '00000000-0000-0000-0000-000000000000'::uuid)), componente_id, zona_id, medida_id);
CREATE INDEX IF NOT EXISTS catalogo_componente_medidas_override_scope_idx
  ON public.catalogo_componente_medidas_overrides (empresa_id, sociedad_id, componente_id);

ALTER TABLE public.catalogo_componentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalogo_componente_zonas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalogo_componente_medidas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalogo_componentes_sociedad ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalogo_componente_medidas_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS catalogo_componentes_read ON public.catalogo_componentes;
CREATE POLICY catalogo_componentes_read ON public.catalogo_componentes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS catalogo_componente_zonas_read ON public.catalogo_componente_zonas;
CREATE POLICY catalogo_componente_zonas_read ON public.catalogo_componente_zonas FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS catalogo_componente_medidas_read ON public.catalogo_componente_medidas;
CREATE POLICY catalogo_componente_medidas_read ON public.catalogo_componente_medidas FOR SELECT TO authenticated USING (true);

-- El helper centraliza permiso maestro, pertenencia al tenant, sociedad activa y alcance.
CREATE OR REPLACE FUNCTION public.catalogo_componentes_validar_contexto(
  p_empresa_id text, p_sociedad_id uuid, p_editar boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_multisociedad boolean; v_alcance uuid[];
BEGIN
  IF p_empresa_id IS NULL OR NOT public.usuario_tiene_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'No tienes acceso a esta empresa.' USING ERRCODE = '42501';
  END IF;
  IF p_editar THEN
    IF NOT public.usuario_puede(p_empresa_id, 'maestros', 'editar') THEN
      RAISE EXCEPTION 'Se requiere permiso de edición de Maestros.' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT (public.usuario_puede(p_empresa_id, 'maestros', 'ver') OR public.usuario_puede(p_empresa_id, 'maestros', 'editar')) THEN
    RAISE EXCEPTION 'Se requiere permiso de lectura de Maestros.' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(e.multisociedad_habilitado, false) INTO v_multisociedad
  FROM public.empresas e WHERE e.id = p_empresa_id;
  IF v_multisociedad AND p_sociedad_id IS NULL THEN
    RAISE EXCEPTION 'Selecciona una sociedad activa.' USING ERRCODE = '22023';
  END IF;
  IF p_sociedad_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.sociedades s WHERE s.id = p_sociedad_id AND s.empresa_id = p_empresa_id AND s.activa
  ) THEN
    RAISE EXCEPTION 'La sociedad indicada no pertenece a la empresa o está inactiva.' USING ERRCODE = '22023';
  END IF;
  v_alcance := public.usuario_alcance_sociedades(p_empresa_id);
  IF p_sociedad_id IS NOT NULL AND v_alcance IS NOT NULL AND NOT (p_sociedad_id = ANY(v_alcance)) THEN
    RAISE EXCEPTION 'La sociedad está fuera de tu alcance.' USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.catalogo_componentes_validar_contexto(text, uuid, boolean) FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS catalogo_componentes_sociedad_select ON public.catalogo_componentes_sociedad;
CREATE POLICY catalogo_componentes_sociedad_select ON public.catalogo_componentes_sociedad FOR SELECT TO authenticated
  USING (public.usuario_tiene_empresa(empresa_id) AND public.usuario_puede(empresa_id, 'maestros', 'ver')
    AND (sociedad_id IS NULL OR public.usuario_alcance_sociedades(empresa_id) IS NULL OR sociedad_id = ANY(public.usuario_alcance_sociedades(empresa_id))));
DROP POLICY IF EXISTS catalogo_componentes_sociedad_write ON public.catalogo_componentes_sociedad;
CREATE POLICY catalogo_componentes_sociedad_write ON public.catalogo_componentes_sociedad FOR ALL TO authenticated
  USING (public.usuario_tiene_empresa(empresa_id) AND public.usuario_puede(empresa_id, 'maestros', 'editar')
    AND (sociedad_id IS NULL OR public.usuario_alcance_sociedades(empresa_id) IS NULL OR sociedad_id = ANY(public.usuario_alcance_sociedades(empresa_id)))
    AND (sociedad_id IS NULL OR EXISTS (SELECT 1 FROM public.sociedades s WHERE s.id = sociedad_id AND s.empresa_id = empresa_id AND s.activa)))
  WITH CHECK (public.usuario_tiene_empresa(empresa_id) AND public.usuario_puede(empresa_id, 'maestros', 'editar')
    AND (sociedad_id IS NULL OR public.usuario_alcance_sociedades(empresa_id) IS NULL OR sociedad_id = ANY(public.usuario_alcance_sociedades(empresa_id)))
    AND (sociedad_id IS NULL OR EXISTS (SELECT 1 FROM public.sociedades s WHERE s.id = sociedad_id AND s.empresa_id = empresa_id AND s.activa)));

DROP POLICY IF EXISTS catalogo_componente_overrides_select ON public.catalogo_componente_medidas_overrides;
CREATE POLICY catalogo_componente_overrides_select ON public.catalogo_componente_medidas_overrides FOR SELECT TO authenticated
  USING (public.usuario_tiene_empresa(empresa_id) AND public.usuario_puede(empresa_id, 'maestros', 'ver')
    AND (sociedad_id IS NULL OR public.usuario_alcance_sociedades(empresa_id) IS NULL OR sociedad_id = ANY(public.usuario_alcance_sociedades(empresa_id))));
DROP POLICY IF EXISTS catalogo_componente_overrides_write ON public.catalogo_componente_medidas_overrides;
CREATE POLICY catalogo_componente_overrides_write ON public.catalogo_componente_medidas_overrides FOR ALL TO authenticated
  USING (public.usuario_tiene_empresa(empresa_id) AND public.usuario_puede(empresa_id, 'maestros', 'editar')
    AND (sociedad_id IS NULL OR public.usuario_alcance_sociedades(empresa_id) IS NULL OR sociedad_id = ANY(public.usuario_alcance_sociedades(empresa_id)))
    AND (sociedad_id IS NULL OR EXISTS (SELECT 1 FROM public.sociedades s WHERE s.id = sociedad_id AND s.empresa_id = empresa_id AND s.activa)))
  WITH CHECK (public.usuario_tiene_empresa(empresa_id) AND public.usuario_puede(empresa_id, 'maestros', 'editar')
    AND (sociedad_id IS NULL OR public.usuario_alcance_sociedades(empresa_id) IS NULL OR sociedad_id = ANY(public.usuario_alcance_sociedades(empresa_id)))
    AND (sociedad_id IS NULL OR EXISTS (SELECT 1 FROM public.sociedades s WHERE s.id = sociedad_id AND s.empresa_id = empresa_id AND s.activa)));

-- No se exponen escrituras directas. Las funciones públicas validan siempre empresa y sociedad.
REVOKE ALL ON public.catalogo_componentes, public.catalogo_componente_zonas, public.catalogo_componente_medidas,
  public.catalogo_componentes_sociedad, public.catalogo_componente_medidas_overrides FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.catalogo_componentes, public.catalogo_componente_zonas, public.catalogo_componente_medidas TO authenticated;

CREATE OR REPLACE FUNCTION public.catalogo_componentes_listar(p_empresa_id text, p_sociedad_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public.catalogo_componentes_validar_contexto(p_empresa_id, p_sociedad_id, false);
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id, 'nombre', c.nombre, 'descripcion', c.descripcion, 'orden', c.orden, 'svg', c.svg,
    'activo', coalesce(cs.activo, true),
    'zonas', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', z.id, 'nombre', z.nombre, 'orden', z.orden,
      'medidas', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', m.id, 'nombre', coalesce(o.nombre, m.nombre), 'cota', coalesce(o.cota, m.cota),
        'desde', coalesce(o.desde, m.desde), 'referencia', coalesce(o.referencia, m.referencia),
        'orden', m.orden, 'personalizado', o.id IS NOT NULL
      ) ORDER BY m.orden, m.id) FROM public.catalogo_componente_medidas m
        LEFT JOIN public.catalogo_componente_medidas_overrides o ON o.componente_id=m.componente_id AND o.zona_id=m.zona_id AND o.medida_id=m.id
          AND o.empresa_id=p_empresa_id AND o.sociedad_id IS NOT DISTINCT FROM p_sociedad_id
        WHERE m.componente_id=z.componente_id AND m.zona_id=z.id), '[]'::jsonb)
    ) ORDER BY z.orden, z.id) FROM public.catalogo_componente_zonas z WHERE z.componente_id=c.id), '[]'::jsonb)
  ) ORDER BY c.orden, c.id), '[]'::jsonb) INTO v_result
  FROM public.catalogo_componentes c
  LEFT JOIN public.catalogo_componentes_sociedad cs ON cs.componente_id=c.id AND cs.empresa_id=p_empresa_id AND cs.sociedad_id IS NOT DISTINCT FROM p_sociedad_id;
  RETURN v_result;
END $$;

CREATE OR REPLACE FUNCTION public.catalogo_componentes_guardar_override(
  p_empresa_id text, p_sociedad_id uuid, p_componente_id text, p_zona_id text, p_medida_id text,
  p_nombre text, p_cota text, p_desde text, p_referencia text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.catalogo_componentes_validar_contexto(p_empresa_id, p_sociedad_id, true);
  IF NOT EXISTS (SELECT 1 FROM public.catalogo_componente_medidas WHERE componente_id=p_componente_id AND zona_id=p_zona_id AND id=p_medida_id) THEN
    RAISE EXCEPTION 'La medida base no existe.' USING ERRCODE='22023';
  END IF;
  IF nullif(btrim(p_nombre),'') IS NULL OR nullif(btrim(p_cota),'') IS NULL THEN
    RAISE EXCEPTION 'El nombre y la cota son obligatorios.' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.catalogo_componente_medidas_overrides (empresa_id,sociedad_id,componente_id,zona_id,medida_id,nombre,cota,desde,referencia)
  VALUES (p_empresa_id,p_sociedad_id,p_componente_id,p_zona_id,p_medida_id,btrim(p_nombre),btrim(p_cota),nullif(btrim(p_desde),''),nullif(btrim(p_referencia),''))
  ON CONFLICT (empresa_id, (coalesce(sociedad_id, '00000000-0000-0000-0000-000000000000'::uuid)), componente_id, zona_id, medida_id)
  DO UPDATE SET nombre=EXCLUDED.nombre,cota=EXCLUDED.cota,desde=EXCLUDED.desde,referencia=EXCLUDED.referencia,updated_at=now();
END $$;

CREATE OR REPLACE FUNCTION public.catalogo_componentes_restablecer_override(p_empresa_id text, p_sociedad_id uuid, p_componente_id text, p_zona_id text, p_medida_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.catalogo_componentes_validar_contexto(p_empresa_id, p_sociedad_id, true);
  DELETE FROM public.catalogo_componente_medidas_overrides WHERE empresa_id=p_empresa_id
    AND sociedad_id IS NOT DISTINCT FROM p_sociedad_id AND componente_id=p_componente_id AND zona_id=p_zona_id AND medida_id=p_medida_id;
END $$;

CREATE OR REPLACE FUNCTION public.catalogo_componentes_cambiar_estado(p_empresa_id text, p_sociedad_id uuid, p_componente_id text, p_activo boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.catalogo_componentes_validar_contexto(p_empresa_id, p_sociedad_id, true);
  IF NOT EXISTS (SELECT 1 FROM public.catalogo_componentes WHERE id=p_componente_id) THEN
    RAISE EXCEPTION 'El componente base no existe.' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.catalogo_componentes_sociedad (empresa_id,sociedad_id,componente_id,activo)
  VALUES (p_empresa_id,p_sociedad_id,p_componente_id,p_activo)
  ON CONFLICT (empresa_id, (coalesce(sociedad_id, '00000000-0000-0000-0000-000000000000'::uuid)), componente_id)
  DO UPDATE SET activo=EXCLUDED.activo,updated_at=now();
END $$;

REVOKE ALL ON FUNCTION public.catalogo_componentes_listar(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.catalogo_componentes_guardar_override(text, uuid, text, text, text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.catalogo_componentes_restablecer_override(text, uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.catalogo_componentes_cambiar_estado(text, uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.catalogo_componentes_listar(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.catalogo_componentes_guardar_override(text, uuid, text, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.catalogo_componentes_restablecer_override(text, uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.catalogo_componentes_cambiar_estado(text, uuid, text, boolean) TO authenticated;

-- Verificación del esquema; tras ejecutar también seed_catalogo_componentes.sql deben existir 7 dibujos.
DO $$ BEGIN
  ASSERT to_regclass('public.catalogo_componentes') IS NOT NULL, 'Falta catalogo_componentes';
  ASSERT to_regclass('public.catalogo_componente_zonas') IS NOT NULL, 'Falta catalogo_componente_zonas';
  ASSERT to_regclass('public.catalogo_componente_medidas') IS NOT NULL, 'Falta catalogo_componente_medidas';
  ASSERT to_regclass('public.catalogo_componentes_sociedad') IS NOT NULL, 'Falta activación por sociedad';
  ASSERT to_regclass('public.catalogo_componente_medidas_overrides') IS NOT NULL, 'Faltan overrides por sociedad';
  ASSERT has_table_privilege('authenticated', 'public.catalogo_componentes', 'SELECT'), 'Falta lectura authenticated del catálogo global';
  ASSERT NOT has_table_privilege('authenticated', 'public.catalogo_componentes', 'INSERT'), 'No debe permitirse INSERT a clientes';
  ASSERT has_function_privilege('authenticated', 'public.catalogo_componentes_guardar_override(text,uuid,text,text,text,text,text,text,text)', 'EXECUTE'), 'Falta RPC de guardado';
END $$;

-- Para validar el seed luego de ejecutarlo: SELECT count(*) FROM public.catalogo_componentes; -- esperado: 7
COMMIT;
