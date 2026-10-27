-- 651 · WMS · Gemelo digital del almacén
-- Plano de planta por almacén (dimensiones, puertas, zonas y racks) y RPC que lo guarda
-- y genera/actualiza las ubicaciones (zona > rack > posición, zona > piso).
-- Aditiva: tabla nueva, columna nueva con default, dos funciones nuevas.

CREATE TABLE IF NOT EXISTS public.almacen_planos (
  almacen_id text PRIMARY KEY,
  empresa_id text NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  layout jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT almacen_planos_empresa_almacen_fk FOREIGN KEY (empresa_id, almacen_id)
    REFERENCES public.almacenes(empresa_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS almacen_planos_empresa_idx ON public.almacen_planos (empresa_id);

ALTER TABLE public.almacen_planos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS almacen_planos_select ON public.almacen_planos;
CREATE POLICY almacen_planos_select ON public.almacen_planos FOR SELECT
  USING (public.usuario_tiene_empresa(empresa_id) AND public.usuario_puede(empresa_id, 'inventario', 'ver'));
-- Sin políticas de escritura: el plano solo se guarda con wms_guardar_plano_almacen.
REVOKE ALL ON public.almacen_planos FROM anon;
GRANT SELECT ON public.almacen_planos TO authenticated;

-- Marca las ubicaciones que administra el plano (las manuales y la General no se tocan).
ALTER TABLE public.ubicaciones ADD COLUMN IF NOT EXISTS origen_plano boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.wms_guardar_plano_almacen(
  p_empresa_id text, p_almacen_id text, p_layout jsonb, p_version integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_version_actual integer;
  v_nueva integer;
  v_ancho numeric; v_largo numeric;
  z jsonb; r jsonb; d record;
  v_zcod text; v_rcod text; v_uso text; v_padre text; v_padre_id text; v_id text;
  v_cx numeric; v_cy numeric; v_largo_r numeric; v_rot integer;
  v_mod integer; v_niv integer; v_piso integer; v_cols integer; v_cap integer;
  v_usa_planta boolean := false;
  v_creadas integer := 0; v_actualizadas integer := 0; v_desactivadas integer := 0;
  c_mod_w constant numeric := 2.2; c_rack_d constant numeric := 1.1; c_paso constant numeric := 2.2;
BEGIN
  IF NOT (public.usuario_tiene_empresa(p_empresa_id) AND public.usuario_puede(p_empresa_id, 'inventario', 'editar')) THEN
    RAISE EXCEPTION 'No tienes permiso para editar el plano del almacén.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.almacenes a WHERE a.id = p_almacen_id AND a.empresa_id = p_empresa_id) THEN
    RAISE EXCEPTION 'El almacén no existe en esta empresa.';
  END IF;

  SELECT ap.version INTO v_version_actual FROM public.almacen_planos ap WHERE ap.almacen_id = p_almacen_id FOR UPDATE;
  IF coalesce(v_version_actual, 0) <> coalesce(p_version, 0) THEN
    RAISE EXCEPTION 'Otra persona guardó el plano mientras editabas. Recarga para ver la última versión.';
  END IF;

  -- Validación básica del plano
  v_ancho := (p_layout->>'ancho')::numeric; v_largo := (p_layout->>'largo')::numeric;
  IF v_ancho IS NULL OR v_largo IS NULL OR v_ancho < 8 OR v_largo < 6 OR v_ancho > 200 OR v_largo > 200 THEN
    RAISE EXCEPTION 'Las dimensiones del plano no son válidas (ancho 8–200 m, largo 6–200 m).';
  END IF;
  IF jsonb_typeof(coalesce(p_layout->'zonas', '[]')) <> 'array' OR jsonb_typeof(coalesce(p_layout->'racks', '[]')) <> 'array' THEN
    RAISE EXCEPTION 'El plano no tiene el formato esperado.';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS tmp_plano_ubi (codigo text, nombre text, tipo text, uso text, padre text, nivel int) ON COMMIT DROP;
  TRUNCATE tmp_plano_ubi;

  -- Zonas y sus posiciones de piso
  FOR z IN SELECT * FROM jsonb_array_elements(coalesce(p_layout->'zonas', '[]')) LOOP
    v_zcod := upper(btrim(z->>'cod'));
    v_uso := coalesce(z->>'uso', 'almacenaje');
    IF v_zcod !~ '^[A-Z0-9][A-Z0-9_-]{0,11}$' THEN RAISE EXCEPTION 'Código de zona no válido: %', coalesce(z->>'cod', '(vacío)'); END IF;
    IF v_zcod = 'PLANTA' THEN RAISE EXCEPTION 'El código PLANTA está reservado para el área general del plano.'; END IF;
    IF v_uso NOT IN ('almacenaje', 'recepcion', 'cuarentena', 'despacho', 'merma') THEN RAISE EXCEPTION 'Uso de zona no válido: %', v_uso; END IF;
    INSERT INTO tmp_plano_ubi VALUES (v_zcod, coalesce(nullif(btrim(z->>'nombre'), ''), v_zcod), 'zona', v_uso, NULL, 1);
    v_piso := coalesce((z->>'piso')::int, 0);
    v_cols := greatest(0, floor(((z->>'w')::numeric - 0.4) / c_paso));
    v_cap := v_cols * greatest(0, floor(((z->>'h')::numeric - 1.4) / c_paso));
    IF v_piso < 0 OR v_piso > v_cap THEN RAISE EXCEPTION 'Zona %: caben % posiciones de piso y se pidieron %.', v_zcod, v_cap, v_piso; END IF;
    FOR i IN 1..v_piso LOOP
      INSERT INTO tmp_plano_ubi VALUES (v_zcod || '-' || lpad(i::text, 2, '0'), coalesce(nullif(btrim(z->>'nombre'), ''), v_zcod) || ' · piso ' || i, 'piso', v_uso, v_zcod, 2);
    END LOOP;
  END LOOP;

  -- Racks y sus posiciones (módulo-nivel)
  FOR r IN SELECT * FROM jsonb_array_elements(coalesce(p_layout->'racks', '[]')) LOOP
    v_rcod := upper(btrim(r->>'cod'));
    v_mod := (r->>'mod')::int; v_niv := (r->>'niv')::int; v_rot := coalesce((r->>'rot')::int, 0);
    IF v_rcod !~ '^[A-Z0-9]{1,3}$' THEN RAISE EXCEPTION 'Código de rack no válido: %', coalesce(r->>'cod', '(vacío)'); END IF;
    IF v_mod IS NULL OR v_mod < 1 OR v_mod > 20 OR v_niv IS NULL OR v_niv < 1 OR v_niv > 8 THEN
      RAISE EXCEPTION 'Rack %: módulos 1–20 y niveles 1–8.', v_rcod;
    END IF;
    v_largo_r := v_mod * c_mod_w;
    v_cx := (r->>'x')::numeric + CASE WHEN v_rot = 90 THEN c_rack_d / 2 ELSE v_largo_r / 2 END;
    v_cy := (r->>'y')::numeric + CASE WHEN v_rot = 90 THEN v_largo_r / 2 ELSE c_rack_d / 2 END;
    -- zona que contiene el centro del rack; si no hay, el área general PLANTA
    SELECT upper(btrim(zz->>'cod')), coalesce(zz->>'uso', 'almacenaje') INTO v_padre, v_uso
      FROM jsonb_array_elements(coalesce(p_layout->'zonas', '[]')) zz
     WHERE v_cx BETWEEN (zz->>'x')::numeric AND (zz->>'x')::numeric + (zz->>'w')::numeric
       AND v_cy BETWEEN (zz->>'y')::numeric AND (zz->>'y')::numeric + (zz->>'h')::numeric
     LIMIT 1;
    IF v_padre IS NULL THEN v_padre := 'PLANTA'; v_uso := 'almacenaje'; v_usa_planta := true; END IF;
    INSERT INTO tmp_plano_ubi VALUES (v_rcod, 'Rack ' || v_rcod, 'rack', v_uso, v_padre, 2);
    FOR m IN 1..v_mod LOOP
      FOR n IN 1..v_niv LOOP
        INSERT INTO tmp_plano_ubi VALUES (v_rcod || '-' || lpad(m::text, 2, '0') || '-' || n, 'Rack ' || v_rcod || ' · módulo ' || m || ' · nivel ' || n, 'posicion', v_uso, v_rcod, 3);
      END LOOP;
    END LOOP;
    v_padre := NULL;
  END LOOP;
  IF v_usa_planta THEN INSERT INTO tmp_plano_ubi VALUES ('PLANTA', 'Planta del almacén', 'zona', 'almacenaje', NULL, 1); END IF;

  SELECT codigo INTO v_id FROM tmp_plano_ubi GROUP BY codigo HAVING count(*) > 1 LIMIT 1;
  IF v_id IS NOT NULL THEN RAISE EXCEPTION 'El código % se repite en el plano.', v_id; END IF;
  IF EXISTS (SELECT 1 FROM tmp_plano_ubi t JOIN public.ubicaciones u ON u.almacen_id = p_almacen_id AND u.codigo = t.codigo AND u.es_general) THEN
    RAISE EXCEPTION 'Un código del plano coincide con la ubicación General del almacén.';
  END IF;

  -- Crear o actualizar en orden de jerarquía
  FOR d IN SELECT * FROM tmp_plano_ubi ORDER BY nivel, codigo LOOP
    v_padre_id := NULL;
    IF d.padre IS NOT NULL THEN
      SELECT u.id INTO v_padre_id FROM public.ubicaciones u WHERE u.almacen_id = p_almacen_id AND u.codigo = d.padre;
    END IF;
    SELECT u.id INTO v_id FROM public.ubicaciones u WHERE u.almacen_id = p_almacen_id AND u.codigo = d.codigo;
    IF v_id IS NULL THEN
      INSERT INTO public.ubicaciones (empresa_id, almacen_id, codigo, nombre, tipo, padre_id, uso, activo, origen_plano, created_by)
      VALUES (p_empresa_id, p_almacen_id, d.codigo, d.nombre, d.tipo, v_padre_id, d.uso, true, true, auth.uid());
      v_creadas := v_creadas + 1;
    ELSE
      UPDATE public.ubicaciones u SET nombre = d.nombre, tipo = d.tipo, padre_id = v_padre_id, uso = d.uso,
             activo = true, origen_plano = true, updated_at = now()
       WHERE u.id = v_id
         AND (u.nombre, u.tipo, coalesce(u.padre_id, ''), u.uso, u.activo, u.origen_plano)
             IS DISTINCT FROM (d.nombre, d.tipo, coalesce(v_padre_id, ''), d.uso, true, true);
      IF FOUND THEN v_actualizadas := v_actualizadas + 1; END IF;
    END IF;
    v_id := NULL;
  END LOOP;

  -- Desactivar las del plano que ya no existen (nunca si tienen stock)
  FOR d IN SELECT u.id, u.codigo FROM public.ubicaciones u
            WHERE u.almacen_id = p_almacen_id AND u.origen_plano AND u.activo
              AND NOT EXISTS (SELECT 1 FROM tmp_plano_ubi t WHERE t.codigo = u.codigo)
            ORDER BY CASE u.tipo WHEN 'posicion' THEN 1 WHEN 'piso' THEN 1 WHEN 'rack' THEN 2 ELSE 3 END LOOP
    IF EXISTS (SELECT 1 FROM public.stock s WHERE s.ubicacion_id = d.id AND (coalesce(s.fisico, 0) <> 0 OR coalesce(s.reservado, 0) <> 0)) THEN
      RAISE EXCEPTION 'No se puede quitar % del plano: tiene stock. Mueve el stock primero.', d.codigo;
    END IF;
    IF EXISTS (SELECT 1 FROM public.ubicaciones h WHERE h.padre_id = d.id AND h.activo AND NOT h.origen_plano) THEN
      RAISE EXCEPTION 'No se puede quitar % del plano: tiene ubicaciones creadas a mano dentro.', d.codigo;
    END IF;
    IF EXISTS (SELECT 1 FROM public.stock s WHERE s.ubicacion_id = d.id) THEN
      RAISE EXCEPTION 'No se puede quitar % del plano: tiene registros de stock en cero. Consolida el stock antes.', d.codigo;
    END IF;
    UPDATE public.ubicaciones SET activo = false, updated_at = now() WHERE id = d.id;
    v_desactivadas := v_desactivadas + 1;
  END LOOP;

  INSERT INTO public.almacen_planos (almacen_id, empresa_id, layout, version, updated_by)
  VALUES (p_almacen_id, p_empresa_id, p_layout, 1, auth.uid())
  ON CONFLICT (almacen_id) DO UPDATE SET layout = EXCLUDED.layout, version = public.almacen_planos.version + 1,
    updated_at = now(), updated_by = auth.uid()
  RETURNING version INTO v_nueva;

  RETURN jsonb_build_object('version', v_nueva, 'creadas', v_creadas, 'actualizadas', v_actualizadas,
    'desactivadas', v_desactivadas, 'total', (SELECT count(*) FROM tmp_plano_ubi));
END $function$;

REVOKE ALL ON FUNCTION public.wms_guardar_plano_almacen(text, text, jsonb, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wms_guardar_plano_almacen(text, text, jsonb, integer) TO authenticated;

-- Último movimiento por ubicación y material (para «días sin movimiento»). Respeta el RLS de kardex.
CREATE OR REPLACE FUNCTION public.wms_gemelo_ultimos_movimientos(p_empresa_id text, p_almacen_id text)
RETURNS TABLE (ubicacion_id text, material_id text, fecha timestamptz, tipo text, motivo text, nro_documento text, referencia_tipo text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT DISTINCT ON (k.ubicacion_id, k.material_id)
         k.ubicacion_id, k.material_id, k.fecha, k.tipo, k.motivo, k.nro_documento, k.referencia_tipo
    FROM public.kardex k
   WHERE k.empresa_id = p_empresa_id AND k.almacen_id = p_almacen_id
     AND k.ubicacion_id IS NOT NULL AND NOT coalesce(k.anulado, false)
   ORDER BY k.ubicacion_id, k.material_id, k.fecha DESC, k.created_at DESC;
$function$;

REVOKE ALL ON FUNCTION public.wms_gemelo_ultimos_movimientos(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wms_gemelo_ultimos_movimientos(text, text) TO authenticated;

-- Comprobación
DO $chk$
BEGIN
  IF to_regclass('public.almacen_planos') IS NULL THEN RAISE EXCEPTION 'No se creó almacen_planos'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ubicaciones' AND column_name = 'origen_plano') THEN
    RAISE EXCEPTION 'No se creó ubicaciones.origen_plano';
  END IF;
  IF to_regprocedure('public.wms_guardar_plano_almacen(text,text,jsonb,integer)') IS NULL
     OR to_regprocedure('public.wms_gemelo_ultimos_movimientos(text,text)') IS NULL THEN
    RAISE EXCEPTION 'No se crearon las funciones del gemelo';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ubicaciones WHERE origen_plano) THEN
    RAISE EXCEPTION 'origen_plano debería nacer en false para todas las ubicaciones existentes';
  END IF;
END $chk$;
