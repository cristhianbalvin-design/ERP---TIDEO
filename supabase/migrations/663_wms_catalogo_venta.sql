-- 663 · Catálogo de venta (Operaciones › Venta de repuestos › Catálogo y alta rápida desde la OV de Admin)
-- wms_catalogo_venta: lista el catálogo con costo promedio y disponible propio (sin custodia de terceros) y los materiales candidatos.
-- wms_catalogo_guardar: alta y edición; un producto por material; precio > 0; descuento 0-100; sin borrado (se desactiva).
-- Permiso: ver = pertenecer a la empresa; guardar = usuario_puede(empresa, 'ventas', 'crear' | 'editar').

CREATE OR REPLACE FUNCTION public.wms_catalogo_venta(p_empresa_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_items jsonb; v_mats jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.usuario_tiene_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'No tienes acceso a esta empresa.' USING ERRCODE = '42501';
  END IF;
  WITH disp AS (
    SELECT s.material_id, sum(coalesce(s.disponible, 0)) AS disponible
      FROM public.stock s
      JOIN public.almacenes a ON a.id = s.almacen_id AND coalesce(a.proposito, 'consumo_interno') <> 'custodia'
      JOIN public.ubicaciones u ON u.id = s.ubicacion_id AND u.propietario_cuenta_id IS NULL AND coalesce(u.uso, 'almacenaje') NOT IN ('cuarentena', 'merma')
     WHERE s.empresa_id = p_empresa_id
     GROUP BY 1)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'material_id', c.material_id, 'codigo', c.codigo, 'descripcion', c.descripcion, 'unidad', coalesce(m.unidad, c.unidad),
      'precio_lista', c.precio_lista, 'moneda', coalesce(c.moneda, 'PEN'), 'descuento_maximo_pct', coalesce(c.descuento_maximo_pct, 0),
      'activo', coalesce(c.activo, true), 'costo_promedio', coalesce(m.costo_promedio, 0), 'disponible', coalesce(d.disponible, 0),
      'updated_at', c.updated_at) ORDER BY c.codigo), '[]'::jsonb)
    INTO v_items
    FROM public.catalogo_venta c
    LEFT JOIN public.materiales m ON m.id = c.material_id
    LEFT JOIN disp d ON d.material_id = c.material_id
   WHERE c.empresa_id = p_empresa_id;
  WITH disp AS (
    SELECT s.material_id, sum(coalesce(s.disponible, 0)) AS disponible
      FROM public.stock s
      JOIN public.almacenes a ON a.id = s.almacen_id AND coalesce(a.proposito, 'consumo_interno') <> 'custodia'
      JOIN public.ubicaciones u ON u.id = s.ubicacion_id AND u.propietario_cuenta_id IS NULL AND coalesce(u.uso, 'almacenaje') NOT IN ('cuarentena', 'merma')
     WHERE s.empresa_id = p_empresa_id
     GROUP BY 1)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'material_id', m.id, 'codigo', m.codigo, 'descripcion', m.descripcion, 'unidad', m.unidad,
      'costo_promedio', coalesce(m.costo_promedio, 0), 'disponible', coalesce(d.disponible, 0),
      'en_catalogo', EXISTS (SELECT 1 FROM public.catalogo_venta c WHERE c.empresa_id = p_empresa_id AND c.material_id = m.id)) ORDER BY m.codigo), '[]'::jsonb)
    INTO v_mats
    FROM public.materiales m
    LEFT JOIN disp d ON d.material_id = m.id
   WHERE m.empresa_id = p_empresa_id AND coalesce(m.estado, 'activo') <> 'inactivo';
  RETURN jsonb_build_object('items', v_items, 'materiales', v_mats,
    'puede_crear', public.usuario_puede(p_empresa_id, 'ventas', 'crear'),
    'puede_editar', public.usuario_puede(p_empresa_id, 'ventas', 'editar'));
END $function$;

CREATE OR REPLACE FUNCTION public.wms_catalogo_guardar(
  p_empresa_id text, p_id text, p_material_id text, p_precio_lista numeric, p_moneda text,
  p_descuento_maximo_pct numeric DEFAULT 0, p_activo boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE m public.materiales%rowtype; c public.catalogo_venta%rowtype; v_id text; v_moneda text := upper(coalesce(nullif(btrim(p_moneda), ''), 'PEN'));
BEGIN
  IF auth.uid() IS NULL OR NOT public.usuario_tiene_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'No tienes acceso a esta empresa.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.usuario_puede(p_empresa_id, 'ventas', CASE WHEN p_id IS NULL THEN 'crear' ELSE 'editar' END) THEN
    RAISE EXCEPTION 'No tienes permiso para modificar el catálogo de venta.' USING ERRCODE = '42501';
  END IF;
  IF v_moneda NOT IN ('PEN', 'USD') THEN RAISE EXCEPTION 'Moneda no válida.'; END IF;
  IF p_precio_lista IS NULL OR p_precio_lista <= 0 THEN RAISE EXCEPTION 'Indica un precio de lista mayor a cero.'; END IF;
  IF coalesce(p_descuento_maximo_pct, 0) < 0 OR coalesce(p_descuento_maximo_pct, 0) > 100 THEN RAISE EXCEPTION 'El descuento máximo debe estar entre 0 y 100.'; END IF;

  IF p_id IS NULL THEN
    SELECT * INTO m FROM public.materiales WHERE id = p_material_id AND empresa_id = p_empresa_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'El material no existe en esta empresa.'; END IF;
    IF EXISTS (SELECT 1 FROM public.catalogo_venta WHERE empresa_id = p_empresa_id AND (material_id = m.id OR codigo = m.codigo)) THEN
      RAISE EXCEPTION 'El material % ya está en el catálogo; edítalo desde el listado.', m.codigo;
    END IF;
    v_id := 'cat_' || replace(gen_random_uuid()::text, '-', '');
    INSERT INTO public.catalogo_venta (id, empresa_id, material_id, codigo, descripcion, unidad, precio_lista, precio_lista_usd, moneda, descuento_maximo_pct, activo, created_at, updated_at)
    VALUES (v_id, p_empresa_id, m.id, m.codigo, m.descripcion, coalesce(m.unidad, 'NIU'), round(p_precio_lista, 2),
            CASE WHEN v_moneda = 'USD' THEN round(p_precio_lista, 2) ELSE 0 END, v_moneda, round(coalesce(p_descuento_maximo_pct, 0), 2), coalesce(p_activo, true), now(), now());
  ELSE
    SELECT * INTO c FROM public.catalogo_venta WHERE id = p_id AND empresa_id = p_empresa_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'El producto no existe en el catálogo.'; END IF;
    v_id := c.id;
    UPDATE public.catalogo_venta
       SET precio_lista = round(p_precio_lista, 2), precio_lista_usd = CASE WHEN v_moneda = 'USD' THEN round(p_precio_lista, 2) ELSE 0 END,
           moneda = v_moneda, descuento_maximo_pct = round(coalesce(p_descuento_maximo_pct, 0), 2), activo = coalesce(p_activo, true), updated_at = now()
     WHERE id = c.id;
  END IF;
  RETURN (SELECT to_jsonb(x) FROM public.catalogo_venta x WHERE x.id = v_id);
END $function$;

REVOKE ALL ON FUNCTION public.wms_catalogo_venta(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.wms_catalogo_guardar(text, text, text, numeric, text, numeric, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wms_catalogo_venta(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.wms_catalogo_guardar(text, text, text, numeric, text, numeric, boolean) TO authenticated;

DO $chk$
BEGIN
  IF NOT has_function_privilege('authenticated', 'public.wms_catalogo_venta(text)', 'execute')
     OR NOT has_function_privilege('authenticated', 'public.wms_catalogo_guardar(text,text,text,numeric,text,numeric,boolean)', 'execute')
     OR has_function_privilege('anon', 'public.wms_catalogo_guardar(text,text,text,numeric,text,numeric,boolean)', 'execute') THEN
    RAISE EXCEPTION '663: permisos incorrectos';
  END IF;
END $chk$;
