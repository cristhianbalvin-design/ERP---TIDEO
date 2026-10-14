-- WMS punto 5 (PR 2): minas, proyectos de mina, almacenes perifericos y proyecto en la OT.
-- Aditiva: no cambia la logica de reserva (eso es el PR 3).

CREATE TABLE IF NOT EXISTS public.minas (
  id text PRIMARY KEY,
  empresa_id text NOT NULL REFERENCES public.empresas(id),
  cuenta_id text NOT NULL REFERENCES public.cuentas(id),
  codigo text NOT NULL,
  nombre text NOT NULL,
  estado text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','inactivo')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, codigo)
);
ALTER TABLE public.minas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS minas_select ON public.minas;
CREATE POLICY minas_select ON public.minas FOR SELECT USING (
  usuario_tiene_empresa(empresa_id) AND (
    usuario_puede(empresa_id, 'inventario', 'ver') OR usuario_puede(empresa_id, 'ot', 'ver') OR usuario_puede(empresa_id, 'ot', 'crear'))
);
DROP POLICY IF EXISTS minas_insert ON public.minas;
CREATE POLICY minas_insert ON public.minas FOR INSERT WITH CHECK (
  usuario_tiene_empresa(empresa_id) AND usuario_puede(empresa_id, 'inventario', 'crear')
);
DROP POLICY IF EXISTS minas_update ON public.minas;
CREATE POLICY minas_update ON public.minas FOR UPDATE USING (
  usuario_tiene_empresa(empresa_id) AND usuario_puede(empresa_id, 'inventario', 'editar')
) WITH CHECK (
  usuario_tiene_empresa(empresa_id) AND usuario_puede(empresa_id, 'inventario', 'editar')
);

ALTER TABLE public.proyectos ADD COLUMN IF NOT EXISTS mina_id text REFERENCES public.minas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS proyectos_mina_idx ON public.proyectos (mina_id) WHERE mina_id IS NOT NULL;

ALTER TABLE public.almacenes ADD COLUMN IF NOT EXISTS clase text NOT NULL DEFAULT 'central';
ALTER TABLE public.almacenes ADD COLUMN IF NOT EXISTS mina_id text REFERENCES public.minas(id) ON DELETE RESTRICT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'almacenes_clase_mina_chk') THEN
    ALTER TABLE public.almacenes ADD CONSTRAINT almacenes_clase_mina_chk CHECK (
      (clase = 'central' AND mina_id IS NULL) OR (clase = 'periferico' AND mina_id IS NOT NULL));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS almacenes_mina_idx ON public.almacenes (mina_id) WHERE mina_id IS NOT NULL;

ALTER TABLE public.ordenes_trabajo ADD COLUMN IF NOT EXISTS proyecto_id text REFERENCES public.proyectos(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS ordenes_trabajo_proyecto_idx ON public.ordenes_trabajo (proyecto_id) WHERE proyecto_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.ordenes_trabajo_validar_proyecto() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_p public.proyectos%ROWTYPE;
BEGIN
  IF NEW.proyecto_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.proyecto_id IS NOT DISTINCT FROM OLD.proyecto_id THEN RETURN NEW; END IF;
  SELECT * INTO v_p FROM public.proyectos WHERE id = NEW.proyecto_id;
  IF NOT FOUND OR v_p.empresa_id <> NEW.empresa_id THEN
    RAISE EXCEPTION 'El proyecto no pertenece a la empresa de la OT.';
  END IF;
  IF lower(v_p.estado) <> 'activo' THEN
    RAISE EXCEPTION 'El proyecto % esta inactivo.', v_p.codigo;
  END IF;
  IF NEW.cuenta_id IS NOT NULL AND v_p.cuenta_id <> NEW.cuenta_id THEN
    RAISE EXCEPTION 'El proyecto % pertenece a otro cliente distinto al de la OT.', v_p.codigo;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS ordenes_trabajo_validar_proyecto_trg ON public.ordenes_trabajo;
CREATE TRIGGER ordenes_trabajo_validar_proyecto_trg BEFORE INSERT OR UPDATE OF proyecto_id ON public.ordenes_trabajo
  FOR EACH ROW EXECUTE FUNCTION public.ordenes_trabajo_validar_proyecto();

CREATE OR REPLACE FUNCTION public.wms_exigir_permiso(p_empresa_id text, p_pantalla text, p_accion text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesion.'; END IF;
  IF NOT usuario_tiene_empresa(p_empresa_id) THEN RAISE EXCEPTION 'No tienes acceso a esta empresa.'; END IF;
  IF NOT usuario_puede(p_empresa_id, p_pantalla, p_accion) THEN
    RAISE EXCEPTION 'No tienes permiso de % en %.', p_accion, p_pantalla;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.wms_listar_minas(p_empresa_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.wms_exigir_permiso(p_empresa_id, 'inventario', 'ver');
  RETURN jsonb_build_object(
    'minas', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', m.id, 'codigo', m.codigo, 'nombre', m.nombre, 'estado', m.estado,
        'cuenta_id', m.cuenta_id, 'cuenta_nombre', c.razon_social,
        'proyectos', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'codigo', p.codigo, 'nombre', p.nombre, 'estado', p.estado) ORDER BY p.codigo)
                               FROM public.proyectos p WHERE p.mina_id = m.id), '[]'::jsonb),
        'almacenes', COALESCE((SELECT jsonb_agg(jsonb_build_object(
              'id', a.id, 'codigo', a.codigo, 'nombre', a.nombre, 'estado', a.estado,
              'materiales', (SELECT count(DISTINCT s.material_id) FROM public.stock s WHERE s.almacen_id = a.id AND s.fisico > 0),
              'unidades', (SELECT COALESCE(sum(s.fisico), 0) FROM public.stock s WHERE s.almacen_id = a.id)
            ) ORDER BY a.codigo) FROM public.almacenes a WHERE a.mina_id = m.id AND a.empresa_id = p_empresa_id), '[]'::jsonb)
      ) ORDER BY m.nombre)
      FROM public.minas m LEFT JOIN public.cuentas c ON c.id = m.cuenta_id WHERE m.empresa_id = p_empresa_id), '[]'::jsonb),
    'proyectos_sin_mina', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'codigo', p.codigo, 'nombre', p.nombre, 'estado', p.estado, 'cuenta_id', p.cuenta_id, 'cuenta_nombre', c.razon_social) ORDER BY p.codigo)
      FROM public.proyectos p LEFT JOIN public.cuentas c ON c.id = p.cuenta_id
      WHERE p.empresa_id = p_empresa_id AND p.mina_id IS NULL), '[]'::jsonb),
    'almacenes_centrales', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'codigo', a.codigo, 'nombre', a.nombre) ORDER BY a.codigo)
      FROM public.almacenes a WHERE a.empresa_id = p_empresa_id AND a.clase = 'central' AND lower(COALESCE(a.estado, 'activo')) = 'activo'), '[]'::jsonb),
    'cuentas', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', x.id, 'razon_social', x.razon_social) ORDER BY x.razon_social)
      FROM (SELECT id, razon_social FROM public.cuentas WHERE empresa_id = p_empresa_id ORDER BY razon_social LIMIT 500) x), '[]'::jsonb)
  );
END $$;

CREATE OR REPLACE FUNCTION public.wms_guardar_mina(p_empresa_id text, p_id text, p_cuenta_id text, p_codigo text, p_nombre text, p_estado text DEFAULT 'activo') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_codigo text := upper(btrim(COALESCE(p_codigo, ''))); v_nombre text := btrim(COALESCE(p_nombre, '')); v_estado text := lower(COALESCE(NULLIF(btrim(p_estado), ''), 'activo')); v_id text := p_id; v_fila public.minas%ROWTYPE;
BEGIN
  PERFORM public.wms_exigir_permiso(p_empresa_id, 'inventario', CASE WHEN p_id IS NULL THEN 'crear' ELSE 'editar' END);
  IF v_codigo = '' OR v_nombre = '' THEN RAISE EXCEPTION 'El codigo y el nombre de la mina son obligatorios.'; END IF;
  IF v_estado NOT IN ('activo', 'inactivo') THEN RAISE EXCEPTION 'Estado de mina invalido.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cuentas WHERE id = p_cuenta_id AND empresa_id = p_empresa_id) THEN
    RAISE EXCEPTION 'El cliente seleccionado no pertenece a la empresa.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.minas WHERE empresa_id = p_empresa_id AND codigo = v_codigo AND id IS DISTINCT FROM p_id) THEN
    RAISE EXCEPTION 'Ya existe una mina con el codigo %.', v_codigo;
  END IF;
  IF p_id IS NULL THEN
    v_id := 'min_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12);
    INSERT INTO public.minas (id, empresa_id, cuenta_id, codigo, nombre, estado) VALUES (v_id, p_empresa_id, p_cuenta_id, v_codigo, v_nombre, v_estado) RETURNING * INTO v_fila;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.minas WHERE id = p_id AND empresa_id = p_empresa_id) THEN RAISE EXCEPTION 'La mina no existe.'; END IF;
    IF EXISTS (SELECT 1 FROM public.proyectos WHERE mina_id = p_id AND cuenta_id <> p_cuenta_id) THEN
      RAISE EXCEPTION 'La mina tiene proyectos de otro cliente; no se puede cambiar el cliente.';
    END IF;
    UPDATE public.minas SET cuenta_id = p_cuenta_id, codigo = v_codigo, nombre = v_nombre, estado = v_estado, updated_at = now()
      WHERE id = p_id AND empresa_id = p_empresa_id RETURNING * INTO v_fila;
  END IF;
  RETURN to_jsonb(v_fila);
END $$;

CREATE OR REPLACE FUNCTION public.wms_guardar_proyecto_mina(p_empresa_id text, p_mina_id text, p_proyecto_id text, p_codigo text, p_nombre text, p_estado text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_mina public.minas%ROWTYPE; v_proy public.proyectos%ROWTYPE; v_codigo text := upper(btrim(COALESCE(p_codigo, ''))); v_nombre text := btrim(COALESCE(p_nombre, '')); v_estado text := lower(NULLIF(btrim(COALESCE(p_estado, '')), ''));
BEGIN
  PERFORM public.wms_exigir_permiso(p_empresa_id, 'inventario', CASE WHEN p_proyecto_id IS NULL THEN 'crear' ELSE 'editar' END);
  SELECT * INTO v_mina FROM public.minas WHERE id = p_mina_id AND empresa_id = p_empresa_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'La mina no existe.'; END IF;
  IF v_mina.estado <> 'activo' THEN RAISE EXCEPTION 'La mina esta inactiva.'; END IF;
  IF v_estado IS NOT NULL AND v_estado NOT IN ('activo', 'inactivo') THEN RAISE EXCEPTION 'Estado de proyecto invalido.'; END IF;
  IF p_proyecto_id IS NULL THEN
    IF v_codigo = '' OR v_nombre = '' THEN RAISE EXCEPTION 'El codigo y el nombre del proyecto son obligatorios.'; END IF;
    IF EXISTS (SELECT 1 FROM public.proyectos WHERE empresa_id = p_empresa_id AND upper(codigo) = v_codigo) THEN
      RAISE EXCEPTION 'Ya existe un proyecto con el codigo %.', v_codigo;
    END IF;
    INSERT INTO public.proyectos (id, empresa_id, cuenta_id, codigo, nombre, estado, mina_id)
      VALUES ('pry_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12), p_empresa_id, v_mina.cuenta_id, v_codigo, v_nombre, COALESCE(v_estado, 'activo'), p_mina_id)
      RETURNING * INTO v_proy;
  ELSE
    SELECT * INTO v_proy FROM public.proyectos WHERE id = p_proyecto_id AND empresa_id = p_empresa_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'El proyecto no existe.'; END IF;
    IF v_proy.cuenta_id <> v_mina.cuenta_id THEN RAISE EXCEPTION 'El proyecto pertenece a otro cliente distinto al de la mina.'; END IF;
    UPDATE public.proyectos SET mina_id = p_mina_id, estado = COALESCE(v_estado, estado), updated_at = now()
      WHERE id = p_proyecto_id RETURNING * INTO v_proy;
  END IF;
  RETURN to_jsonb(v_proy);
END $$;

CREATE OR REPLACE FUNCTION public.wms_asignar_almacen_mina(p_empresa_id text, p_almacen_id text, p_mina_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_alm public.almacenes%ROWTYPE;
BEGIN
  PERFORM public.wms_exigir_permiso(p_empresa_id, 'inventario', 'editar');
  SELECT * INTO v_alm FROM public.almacenes WHERE id = p_almacen_id AND empresa_id = p_empresa_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'El almacen no existe.'; END IF;
  IF p_mina_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.minas WHERE id = p_mina_id AND empresa_id = p_empresa_id AND estado = 'activo') THEN
      RAISE EXCEPTION 'La mina no existe o esta inactiva.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.stock s JOIN public.ubicaciones u ON u.id = s.ubicacion_id
               WHERE s.almacen_id = p_almacen_id AND COALESCE(u.es_general, false) = false AND s.fisico > 0) THEN
      RAISE EXCEPTION 'El almacen tiene stock en ubicaciones distintas de la general; un periferico no maneja ubicaciones. Mueve ese stock primero.';
    END IF;
    UPDATE public.almacenes SET clase = 'periferico', mina_id = p_mina_id, updated_at = now() WHERE id = p_almacen_id RETURNING * INTO v_alm;
  ELSE
    UPDATE public.almacenes SET clase = 'central', mina_id = NULL, updated_at = now() WHERE id = p_almacen_id RETURNING * INTO v_alm;
  END IF;
  RETURN to_jsonb(v_alm);
END $$;

CREATE OR REPLACE FUNCTION public.wms_crear_almacen_periferico(p_empresa_id text, p_mina_id text, p_codigo text, p_nombre text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_codigo text := upper(btrim(COALESCE(p_codigo, ''))); v_nombre text := btrim(COALESCE(p_nombre, '')); v_alm public.almacenes%ROWTYPE;
BEGIN
  PERFORM public.wms_exigir_permiso(p_empresa_id, 'inventario', 'crear');
  IF v_codigo = '' OR v_nombre = '' THEN RAISE EXCEPTION 'El codigo y el nombre del almacen son obligatorios.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.minas WHERE id = p_mina_id AND empresa_id = p_empresa_id AND estado = 'activo') THEN
    RAISE EXCEPTION 'La mina no existe o esta inactiva.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.almacenes WHERE empresa_id = p_empresa_id AND upper(codigo) = v_codigo) THEN
    RAISE EXCEPTION 'Ya existe un almacen con el codigo %.', v_codigo;
  END IF;
  INSERT INTO public.almacenes (id, empresa_id, codigo, nombre, tipo, estado, clase, mina_id)
    VALUES ('alm_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12), p_empresa_id, v_codigo, v_nombre, 'Periferico', 'activo', 'periferico', p_mina_id)
    RETURNING * INTO v_alm;
  RETURN to_jsonb(v_alm);
END $$;

CREATE OR REPLACE FUNCTION public.wms_listar_proyectos_ot(p_empresa_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesion.'; END IF;
  IF NOT usuario_tiene_empresa(p_empresa_id) THEN RAISE EXCEPTION 'No tienes acceso a esta empresa.'; END IF;
  IF NOT (usuario_puede(p_empresa_id, 'ot', 'crear') OR usuario_puede(p_empresa_id, 'ot', 'ver') OR usuario_puede(p_empresa_id, 'inventario', 'ver')) THEN
    RAISE EXCEPTION 'No tienes permiso para ver proyectos.';
  END IF;
  RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', p.id, 'codigo', p.codigo, 'nombre', p.nombre, 'cuenta_id', p.cuenta_id,
      'mina_id', p.mina_id, 'mina_nombre', m.nombre) ORDER BY m.nombre NULLS LAST, p.codigo)
    FROM public.proyectos p LEFT JOIN public.minas m ON m.id = p.mina_id
    WHERE p.empresa_id = p_empresa_id AND lower(p.estado) = 'activo'), '[]'::jsonb);
END $$;

REVOKE ALL ON FUNCTION public.wms_exigir_permiso(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wms_exigir_permiso(text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.wms_listar_minas(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.wms_guardar_mina(text, text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.wms_guardar_proyecto_mina(text, text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.wms_asignar_almacen_mina(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.wms_crear_almacen_periferico(text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.wms_listar_proyectos_ot(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wms_listar_minas(text), public.wms_guardar_mina(text, text, text, text, text, text),
  public.wms_guardar_proyecto_mina(text, text, text, text, text, text), public.wms_asignar_almacen_mina(text, text, text),
  public.wms_crear_almacen_periferico(text, text, text, text), public.wms_listar_proyectos_ot(text) TO authenticated, service_role;

-- Comprobacion: si algo falta o la restriccion no actua, la migracion se revierte entera.
DO $$
DECLARE v_n int;
BEGIN
  IF to_regclass('public.minas') IS NULL THEN RAISE EXCEPTION 'Falta la tabla minas'; END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.minas'::regclass) THEN RAISE EXCEPTION 'minas sin RLS'; END IF;
  SELECT count(*) INTO v_n FROM information_schema.columns WHERE table_schema = 'public' AND (
    (table_name = 'proyectos' AND column_name = 'mina_id') OR (table_name = 'almacenes' AND column_name IN ('clase', 'mina_id'))
    OR (table_name = 'ordenes_trabajo' AND column_name = 'proyecto_id'));
  IF v_n <> 4 THEN RAISE EXCEPTION 'Faltan columnas (%/4)', v_n; END IF;
  SELECT count(*) INTO v_n FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN
    ('wms_listar_minas', 'wms_guardar_mina', 'wms_guardar_proyecto_mina', 'wms_asignar_almacen_mina', 'wms_crear_almacen_periferico', 'wms_listar_proyectos_ot', 'wms_exigir_permiso');
  IF v_n <> 7 THEN RAISE EXCEPTION 'Faltan funciones (%/7)', v_n; END IF;
  IF EXISTS (SELECT 1 FROM public.almacenes WHERE clase = 'periferico' AND mina_id IS NULL) THEN RAISE EXCEPTION 'Almacenes perifericos sin mina'; END IF;
  BEGIN
    INSERT INTO public.almacenes (id, empresa_id, codigo, nombre, clase, mina_id)
      SELECT 'chk_' || md5(random()::text), id, 'CHK-X', 'chk', 'periferico', NULL FROM public.empresas LIMIT 1;
    RAISE EXCEPTION 'La restriccion clase/mina no se aplico';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
