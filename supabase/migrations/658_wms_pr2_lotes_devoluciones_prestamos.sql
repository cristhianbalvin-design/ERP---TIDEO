-- 658 · WMS PR2: vencimientos y lotes (FEFO), devoluciones (cliente y taller), préstamo de herramientas y reporte valorizado/ABC.
-- Aditiva salvo dos ajustes acotados sobre la versión vigente de procesar_reserva_repuestos_ot y wms_reservar_demanda (FEFO).

-- ============================================================================
-- 1. Devoluciones
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.wms_devoluciones (
  id text PRIMARY KEY DEFAULT ('dev_' || replace(gen_random_uuid()::text, '-', '')),
  empresa_id text NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  sociedad_id uuid,
  numero text NOT NULL,
  origen text NOT NULL CHECK (origen IN ('cliente', 'taller')),
  almacen_id text NOT NULL REFERENCES public.almacenes(id) ON DELETE RESTRICT,
  ubicacion_cuarentena_id text NOT NULL REFERENCES public.ubicaciones(id) ON DELETE RESTRICT,
  guia_id text,
  orden_venta_id text,
  ot_id text,
  cuenta_id text,
  motivo text NOT NULL,
  observacion text,
  estado text NOT NULL DEFAULT 'en_inspeccion' CHECK (estado IN ('en_inspeccion', 'cerrada')),
  nc_estado text NOT NULL DEFAULT 'no_aplica' CHECK (nc_estado IN ('no_aplica', 'pendiente', 'emitida')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  cerrada_at timestamptz,
  cerrada_por uuid,
  UNIQUE (empresa_id, numero)
);
CREATE INDEX IF NOT EXISTS wms_devoluciones_empresa_idx ON public.wms_devoluciones (empresa_id, estado, created_at DESC);

CREATE TABLE IF NOT EXISTS public.wms_devolucion_lineas (
  id text PRIMARY KEY DEFAULT ('devl_' || replace(gen_random_uuid()::text, '-', '')),
  devolucion_id text NOT NULL REFERENCES public.wms_devoluciones(id) ON DELETE CASCADE,
  empresa_id text NOT NULL,
  material_id text NOT NULL REFERENCES public.materiales(id) ON DELETE RESTRICT,
  cantidad numeric(14,2) NOT NULL CHECK (cantidad > 0),
  costo_unitario numeric(14,4) NOT NULL DEFAULT 0,
  cantidad_liberada numeric(14,2) NOT NULL DEFAULT 0,
  cantidad_merma numeric(14,2) NOT NULL DEFAULT 0,
  kardex_entrada_id text,
  orden integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS wms_devolucion_lineas_dev_idx ON public.wms_devolucion_lineas (devolucion_id);

ALTER TABLE public.wms_devoluciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wms_devolucion_lineas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wms_devoluciones_select ON public.wms_devoluciones;
CREATE POLICY wms_devoluciones_select ON public.wms_devoluciones FOR SELECT
  USING (public.usuario_tiene_empresa(empresa_id)
         AND (public.usuario_puede(empresa_id, 'inventario', 'ver') OR public.usuario_puede(empresa_id, 'ventas', 'ver'))
         AND (public.usuario_alcance_sociedades(empresa_id) IS NULL OR sociedad_id = ANY (public.usuario_alcance_sociedades(empresa_id))));
DROP POLICY IF EXISTS wms_devolucion_lineas_select ON public.wms_devolucion_lineas;
CREATE POLICY wms_devolucion_lineas_select ON public.wms_devolucion_lineas FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.wms_devoluciones d WHERE d.id = devolucion_id));
REVOKE ALL ON public.wms_devoluciones, public.wms_devolucion_lineas FROM anon;
GRANT SELECT ON public.wms_devoluciones, public.wms_devolucion_lineas TO authenticated;

-- ============================================================================
-- 2. Préstamos de herramientas (sin kardex: la herramienta sigue en el almacén; baja el disponible)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.wms_prestamos (
  id text PRIMARY KEY DEFAULT ('pre_' || replace(gen_random_uuid()::text, '-', '')),
  empresa_id text NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  sociedad_id uuid,
  numero text NOT NULL,
  stock_id uuid NOT NULL REFERENCES public.stock(id) ON DELETE RESTRICT,
  material_id text NOT NULL REFERENCES public.materiales(id) ON DELETE RESTRICT,
  almacen_id text NOT NULL REFERENCES public.almacenes(id) ON DELETE RESTRICT,
  cantidad numeric(14,2) NOT NULL CHECK (cantidad > 0),
  cantidad_devuelta numeric(14,2) NOT NULL DEFAULT 0,
  cantidad_danada numeric(14,2) NOT NULL DEFAULT 0,
  cantidad_perdida numeric(14,2) NOT NULL DEFAULT 0,
  personal_id text NOT NULL,
  ot_id text,
  fecha_prestamo date NOT NULL DEFAULT current_date,
  fecha_devolucion_prevista date NOT NULL,
  estado text NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'cerrado')),
  observacion text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  cerrado_at timestamptz,
  UNIQUE (empresa_id, numero)
);
CREATE INDEX IF NOT EXISTS wms_prestamos_empresa_idx ON public.wms_prestamos (empresa_id, estado, fecha_devolucion_prevista);
ALTER TABLE public.wms_prestamos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wms_prestamos_select ON public.wms_prestamos;
CREATE POLICY wms_prestamos_select ON public.wms_prestamos FOR SELECT
  USING (public.usuario_tiene_empresa(empresa_id) AND public.usuario_puede(empresa_id, 'inventario', 'ver')
         AND (public.usuario_alcance_sociedades(empresa_id) IS NULL OR sociedad_id = ANY (public.usuario_alcance_sociedades(empresa_id))));
REVOKE ALL ON public.wms_prestamos FROM anon;
GRANT SELECT ON public.wms_prestamos TO authenticated;

-- ============================================================================
-- 3. Auxiliar: ubicación de cuarentena de un almacén
-- ============================================================================
CREATE OR REPLACE FUNCTION public.wms_ubicacion_cuarentena(p_almacen_id text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
  SELECT u.id FROM public.ubicaciones u
   WHERE u.almacen_id = p_almacen_id AND u.uso = 'cuarentena' AND coalesce(u.activo, true) AND u.propietario_cuenta_id IS NULL
   ORDER BY u.codigo LIMIT 1
$f$;
REVOKE ALL ON FUNCTION public.wms_ubicacion_cuarentena(text) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 4. Vencimientos y lotes
-- ============================================================================
CREATE OR REPLACE FUNCTION public.wms_lotes(p_empresa_id text, p_almacen_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE v_alc uuid[]; v jsonb;
BEGIN
  PERFORM public.wms_exigir(p_empresa_id, 'ver', 'No tienes permiso para ver el inventario.');
  v_alc := public.usuario_alcance_sociedades(p_empresa_id);
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'stock_id', s.id, 'material_id', s.material_id, 'codigo', m.codigo, 'descripcion', m.descripcion, 'unidad', m.unidad,
      'almacen_id', s.almacen_id, 'almacen_codigo', a.codigo, 'ubicacion_id', s.ubicacion_id, 'ubicacion', u.codigo, 'uso', u.uso,
      'lote', s.lote, 'vencimiento', s.vencimiento, 'dias', s.vencimiento - current_date,
      'fisico', s.fisico, 'disponible', s.disponible, 'reservado', s.reservado, 'costo_promedio', coalesce(m.costo_promedio, 0),
      'valor', round(coalesce(s.fisico, 0) * coalesce(m.costo_promedio, 0), 2),
      'tiene_cuarentena', public.wms_ubicacion_cuarentena(s.almacen_id) IS NOT NULL)
      ORDER BY s.vencimiento NULLS LAST, m.codigo, s.lote), '[]'::jsonb)
    INTO v
    FROM public.stock s JOIN public.materiales m ON m.id = s.material_id JOIN public.almacenes a ON a.id = s.almacen_id
    JOIN public.ubicaciones u ON u.id = s.ubicacion_id
   WHERE s.empresa_id = p_empresa_id AND coalesce(s.fisico, 0) > 0 AND (s.lote IS NOT NULL OR s.vencimiento IS NOT NULL)
     AND u.propietario_cuenta_id IS NULL AND a.proposito <> 'custodia'
     AND (p_almacen_id IS NULL OR s.almacen_id = p_almacen_id)
     AND (v_alc IS NULL OR s.sociedad_id = ANY (v_alc));
  RETURN v;
END $f$;

-- Mueve un lote (lo disponible) a la ubicación de cuarentena de su almacén.
CREATE OR REPLACE FUNCTION public.wms_lote_a_cuarentena(p_empresa_id text, p_stock_id uuid, p_cantidad numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE s public.stock%rowtype; v_cua text; v_q numeric; v_r jsonb;
BEGIN
  PERFORM public.wms_exigir(p_empresa_id, 'crear', 'No tienes permiso para mover stock.');
  SELECT * INTO s FROM public.stock WHERE id = p_stock_id AND empresa_id = p_empresa_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'El lote no existe.'; END IF;
  v_cua := public.wms_ubicacion_cuarentena(s.almacen_id);
  IF v_cua IS NULL THEN RAISE EXCEPTION 'El almacén no tiene una ubicación de cuarentena. Créala en Ubicaciones.'; END IF;
  IF s.ubicacion_id = v_cua THEN RAISE EXCEPTION 'El lote ya está en cuarentena.'; END IF;
  v_q := coalesce(p_cantidad, s.disponible);
  IF v_q IS NULL OR v_q <= 0 OR v_q > coalesce(s.disponible, 0) THEN
    RAISE EXCEPTION 'Solo se puede mover lo disponible (% unidades); lo reservado se libera primero.', coalesce(s.disponible, 0);
  END IF;
  SELECT to_jsonb(t) INTO v_r FROM public.wms_transferir_stock(p_empresa_id, p_stock_id, s.almacen_id, v_cua, v_q, 'Lote ' || coalesce(s.lote, 'sin lote') || ' a cuarentena por vencimiento') t;
  RETURN v_r;
END $f$;

-- ============================================================================
-- 5. Devoluciones: registrar (entra a cuarentena) y cerrar inspección
-- ============================================================================
CREATE OR REPLACE FUNCTION public.wms_devolucion_registrar(p_empresa_id text, p_origen text, p_referencia_id text, p_motivo text, p_lineas jsonb, p_observacion text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE
  v_alc uuid[]; g public.guias_remision%rowtype; o public.ordenes_trabajo%rowtype; v_alm text; v_soc uuid; v_cua text; v_cuenta text; v_ov text;
  v_id text; v_num integer; v_numero text; it jsonb; v_q numeric; v_max numeric; v_costo numeric; v_kid text; v_orden integer := 0; v_ot text; v_guia text;
BEGIN
  PERFORM public.wms_exigir(p_empresa_id, 'crear', 'No tienes permiso para registrar devoluciones.');
  IF p_origen NOT IN ('cliente', 'taller') THEN RAISE EXCEPTION 'Origen de devolución no válido.'; END IF;
  IF nullif(btrim(coalesce(p_motivo, '')), '') IS NULL THEN RAISE EXCEPTION 'Indica el motivo de la devolución.'; END IF;
  IF p_lineas IS NULL OR jsonb_typeof(p_lineas) <> 'array' OR jsonb_array_length(p_lineas) = 0 THEN RAISE EXCEPTION 'Indica al menos un material devuelto.'; END IF;
  v_alc := public.usuario_alcance_sociedades(p_empresa_id);
  IF p_origen = 'cliente' THEN
    SELECT * INTO g FROM public.guias_remision WHERE id = p_referencia_id AND empresa_id = p_empresa_id;
    IF NOT FOUND OR g.tipo_origen <> 'despacho_venta' OR g.estado NOT IN ('emitida', 'en_transito', 'entregada') THEN
      RAISE EXCEPTION 'Elige una guía de venta emitida o entregada.';
    END IF;
    v_alm := g.almacen_origen_id; v_soc := g.sociedad_origen_id; v_ov := g.orden_venta_id; v_guia := g.id;
    SELECT cuenta_id INTO v_cuenta FROM public.ordenes_venta WHERE id = g.orden_venta_id;
  ELSE
    SELECT * INTO o FROM public.ordenes_trabajo WHERE id = p_referencia_id AND empresa_id = p_empresa_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'La OT no existe.'; END IF;
    v_soc := o.sociedad_id; v_ot := o.id; v_cuenta := o.cuenta_id;
    SELECT r.almacen_id INTO v_alm FROM public.ot_segmento_repuestos_reservas r WHERE r.ot_id = o.id AND r.cantidad_despachada > 0 ORDER BY r.created_at DESC LIMIT 1;
    IF v_alm IS NULL THEN RAISE EXCEPTION 'La OT no tiene repuestos despachados desde el almacén.'; END IF;
  END IF;
  IF v_alc IS NOT NULL AND NOT (v_soc = ANY (v_alc)) THEN RAISE EXCEPTION 'La sociedad del documento está fuera de tu alcance.' USING ERRCODE = '42501'; END IF;
  v_cua := public.wms_ubicacion_cuarentena(v_alm);
  IF v_cua IS NULL THEN RAISE EXCEPTION 'El almacén de origen no tiene una ubicación de cuarentena. Créala en Ubicaciones.'; END IF;

  v_num := public.wms_siguiente_numero(p_empresa_id, 'devolucion_wms', 'DEV', v_soc);
  v_numero := 'DEV-' || to_char(current_date, 'YY') || '-' || lpad(v_num::text, 4, '0');
  INSERT INTO public.wms_devoluciones (empresa_id, sociedad_id, numero, origen, almacen_id, ubicacion_cuarentena_id, guia_id, orden_venta_id, ot_id, cuenta_id, motivo, observacion, created_by)
  VALUES (p_empresa_id, v_soc, v_numero, p_origen, v_alm, v_cua, v_guia, v_ov, v_ot, v_cuenta, btrim(p_motivo), nullif(btrim(coalesce(p_observacion, '')), ''), auth.uid())
  RETURNING id INTO v_id;

  FOR it IN SELECT * FROM jsonb_array_elements(p_lineas) LOOP
    BEGIN v_q := (it->>'cantidad')::numeric; EXCEPTION WHEN others THEN v_q := NULL; END;
    IF v_q IS NULL OR v_q <= 0 THEN RAISE EXCEPTION 'Cantidad devuelta no válida.'; END IF;
    -- Tope: lo despachado (guía u OT) menos lo ya devuelto por ese mismo documento
    IF p_origen = 'cliente' THEN
      SELECT coalesce(sum(gl.cantidad), 0) INTO v_max FROM public.guias_remision_lineas gl WHERE gl.guia_id = g.id AND gl.material_id = it->>'material_id';
      v_max := v_max - coalesce((SELECT sum(l.cantidad) FROM public.wms_devolucion_lineas l JOIN public.wms_devoluciones d ON d.id = l.devolucion_id
                                  WHERE d.guia_id = g.id AND d.id <> v_id AND l.material_id = it->>'material_id'), 0);
    ELSE
      SELECT coalesce(sum(r.cantidad_despachada), 0) INTO v_max FROM public.ot_segmento_repuestos_reservas r WHERE r.ot_id = o.id AND r.material_id = it->>'material_id';
      v_max := v_max - coalesce((SELECT sum(l.cantidad) FROM public.wms_devolucion_lineas l JOIN public.wms_devoluciones d ON d.id = l.devolucion_id
                                  WHERE d.ot_id = o.id AND d.id <> v_id AND l.material_id = it->>'material_id'), 0);
    END IF;
    IF v_q > v_max THEN
      RAISE EXCEPTION 'Solo se pueden devolver % de % (lo despachado por ese documento menos lo ya devuelto).', greatest(v_max, 0),
        (SELECT codigo FROM public.materiales WHERE id = it->>'material_id');
    END IF;
    SELECT coalesce(costo_promedio, 0) INTO v_costo FROM public.materiales WHERE id = it->>'material_id' AND empresa_id = p_empresa_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'El material no existe.'; END IF;
    v_kid := public.wms_nuevo_kardex_id();
    PERFORM public.registrar_movimiento_atomico(
      p_kardex_id := v_kid, p_empresa_id := p_empresa_id, p_material_id := it->>'material_id', p_almacen_id := v_alm, p_sociedad_id := v_soc,
      p_tipo := 'entrada', p_motivo := CASE p_origen WHEN 'cliente' THEN 'devolucion_cliente' ELSE 'devolucion_taller' END,
      p_cantidad := v_q, p_costo_unitario := v_costo, p_costo_unitario_usd := 0, p_moneda := 'PEN',
      p_referencia_tipo := 'devolucion', p_referencia_id := v_id, p_nro_documento := v_numero,
      p_observacion := 'Devolución ' || v_numero || ' · ' || btrim(p_motivo), p_usuario_id := auth.uid(), p_ubicacion_id := v_cua, p_skip_costo_promedio := true);
    v_orden := v_orden + 1;
    INSERT INTO public.wms_devolucion_lineas (devolucion_id, empresa_id, material_id, cantidad, costo_unitario, kardex_entrada_id, orden)
    VALUES (v_id, p_empresa_id, it->>'material_id', v_q, v_costo, v_kid, v_orden);
  END LOOP;
  RETURN jsonb_build_object('id', v_id, 'numero', v_numero);
END $f$;

CREATE OR REPLACE FUNCTION public.wms_devolucion_cerrar(p_empresa_id text, p_devolucion_id text, p_lineas jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE
  d public.wms_devoluciones%rowtype; l public.wms_devolucion_lineas%rowtype; it jsonb; v_lib numeric; v_mer numeric; v_gen text; v_stock uuid; v_kid text;
BEGIN
  PERFORM public.wms_exigir(p_empresa_id, 'liberar', 'No tienes permiso para cerrar la inspección de devoluciones.');
  SELECT * INTO d FROM public.wms_devoluciones WHERE id = p_devolucion_id AND empresa_id = p_empresa_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La devolución no existe.'; END IF;
  IF d.estado <> 'en_inspeccion' THEN RAISE EXCEPTION 'La devolución ya está cerrada.'; END IF;
  SELECT u.id INTO v_gen FROM public.ubicaciones u WHERE u.almacen_id = d.almacen_id AND u.es_general LIMIT 1;
  IF v_gen IS NULL THEN RAISE EXCEPTION 'El almacén no tiene ubicación General.'; END IF;
  FOR l IN SELECT * FROM public.wms_devolucion_lineas WHERE devolucion_id = d.id ORDER BY orden FOR UPDATE LOOP
    SELECT x INTO it FROM jsonb_array_elements(coalesce(p_lineas, '[]'::jsonb)) x WHERE x->>'linea_id' = l.id;
    IF it IS NULL THEN RAISE EXCEPTION 'Indica el destino de todas las líneas.'; END IF;
    v_lib := coalesce(nullif(it->>'liberar', '')::numeric, 0); v_mer := coalesce(nullif(it->>'merma', '')::numeric, 0);
    IF v_lib < 0 OR v_mer < 0 OR v_lib + v_mer <> l.cantidad THEN
      RAISE EXCEPTION 'En cada línea, lo liberado más la merma debe sumar lo devuelto (% unidades).', l.cantidad;
    END IF;
    SELECT s.id INTO v_stock FROM public.stock s
     WHERE s.empresa_id = p_empresa_id AND s.material_id = l.material_id AND s.almacen_id = d.almacen_id AND s.ubicacion_id = d.ubicacion_cuarentena_id
       AND s.sociedad_id IS NOT DISTINCT FROM d.sociedad_id AND s.lote IS NULL AND s.serie IS NULL AND coalesce(s.disponible, 0) >= v_lib + v_mer
     LIMIT 1;
    IF v_stock IS NULL THEN RAISE EXCEPTION 'El stock en cuarentena ya no coincide con la devolución; revisa la ubicación de cuarentena.'; END IF;
    IF v_lib > 0 THEN
      PERFORM public.wms_liberar_cuarentena(p_empresa_id, v_stock, d.almacen_id, v_gen, v_lib, 'Inspección conforme · ' || d.numero, NULL);
    END IF;
    IF v_mer > 0 THEN
      v_kid := public.wms_nuevo_kardex_id();
      PERFORM public.registrar_movimiento_atomico(
        p_kardex_id := v_kid, p_empresa_id := p_empresa_id, p_material_id := l.material_id, p_almacen_id := d.almacen_id, p_sociedad_id := d.sociedad_id,
        p_tipo := 'salida', p_motivo := 'merma', p_cantidad := v_mer, p_costo_unitario := l.costo_unitario, p_costo_unitario_usd := 0, p_moneda := 'PEN',
        p_referencia_tipo := 'devolucion', p_referencia_id := d.id, p_nro_documento := d.numero,
        p_observacion := 'Merma por inspección · ' || d.numero, p_usuario_id := auth.uid(), p_ubicacion_id := d.ubicacion_cuarentena_id, p_skip_costo_promedio := true);
    END IF;
    UPDATE public.wms_devolucion_lineas SET cantidad_liberada = v_lib, cantidad_merma = v_mer WHERE id = l.id;
  END LOOP;
  UPDATE public.wms_devoluciones SET estado = 'cerrada', cerrada_at = now(), cerrada_por = auth.uid(),
    nc_estado = CASE WHEN origen = 'cliente' THEN 'pendiente' ELSE 'no_aplica' END
   WHERE id = d.id;
  RETURN jsonb_build_object('id', d.id, 'estado', 'cerrada', 'nc_estado', CASE WHEN d.origen = 'cliente' THEN 'pendiente' ELSE 'no_aplica' END);
END $f$;

-- Administración marca la nota de crédito como emitida (ventas editar o inventario editar)
CREATE OR REPLACE FUNCTION public.wms_devolucion_marcar_nc(p_empresa_id text, p_devolucion_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
BEGIN
  IF auth.uid() IS NULL OR NOT public.usuario_tiene_empresa(p_empresa_id)
     OR NOT (public.usuario_puede(p_empresa_id, 'ventas', 'editar') OR public.usuario_puede(p_empresa_id, 'inventario', 'editar')) THEN
    RAISE EXCEPTION 'No tienes permiso para actualizar la nota de crédito.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.wms_devoluciones SET nc_estado = 'emitida' WHERE id = p_devolucion_id AND empresa_id = p_empresa_id AND nc_estado = 'pendiente';
  IF NOT FOUND THEN RAISE EXCEPTION 'La devolución no tiene nota de crédito pendiente.'; END IF;
  RETURN jsonb_build_object('id', p_devolucion_id, 'nc_estado', 'emitida');
END $f$;

CREATE OR REPLACE FUNCTION public.wms_devoluciones_listar(p_empresa_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE v_alc uuid[]; v jsonb; v_guias jsonb; v_ots jsonb;
BEGIN
  PERFORM public.wms_exigir(p_empresa_id, 'ver', 'No tienes permiso para ver el inventario.');
  v_alc := public.usuario_alcance_sociedades(p_empresa_id);
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', d.id, 'numero', d.numero, 'origen', d.origen, 'estado', d.estado, 'nc_estado', d.nc_estado, 'motivo', d.motivo, 'observacion', d.observacion,
      'created_at', d.created_at, 'cerrada_at', d.cerrada_at, 'almacen_id', d.almacen_id,
      'ubicacion_cuarentena', (SELECT codigo FROM public.ubicaciones WHERE id = d.ubicacion_cuarentena_id),
      'guia_numero', (SELECT numero_completo FROM public.guias_remision WHERE id = d.guia_id),
      'ot_numero', (SELECT numero FROM public.ordenes_trabajo WHERE id = d.ot_id),
      'cliente', (SELECT coalesce(razon_social, nombre_comercial) FROM public.cuentas WHERE id = d.cuenta_id),
      'lineas', (SELECT jsonb_agg(jsonb_build_object('linea_id', l.id, 'material_id', l.material_id, 'codigo', m.codigo, 'descripcion', m.descripcion, 'unidad', m.unidad,
                  'cantidad', l.cantidad, 'liberada', l.cantidad_liberada, 'merma', l.cantidad_merma, 'costo_unitario', l.costo_unitario) ORDER BY l.orden)
                   FROM public.wms_devolucion_lineas l JOIN public.materiales m ON m.id = l.material_id WHERE l.devolucion_id = d.id))
      ORDER BY d.created_at DESC), '[]'::jsonb) INTO v
    FROM (SELECT * FROM public.wms_devoluciones WHERE empresa_id = p_empresa_id AND (v_alc IS NULL OR sociedad_id = ANY (v_alc)) ORDER BY created_at DESC LIMIT 100) d;
  -- Documentos de referencia para registrar: guías de venta y OT con despachos (últimos 180 días)
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'numero', g.numero_completo, 'cliente', g.destinatario_razon_social, 'fecha', g.fecha_emision,
      'lineas', (SELECT jsonb_agg(jsonb_build_object('material_id', gl.material_id, 'codigo', gl.codigo, 'descripcion', gl.descripcion, 'cantidad', gl.cantidad))
                   FROM public.guias_remision_lineas gl WHERE gl.guia_id = g.id AND gl.material_id IS NOT NULL)) ORDER BY g.fecha_emision DESC), '[]'::jsonb) INTO v_guias
    FROM public.guias_remision g
   WHERE g.empresa_id = p_empresa_id AND g.tipo_origen = 'despacho_venta' AND g.estado IN ('emitida', 'en_transito', 'entregada')
     AND g.fecha_emision > current_date - 180 AND (v_alc IS NULL OR g.sociedad_origen_id = ANY (v_alc));
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'numero' DESC), '[]'::jsonb) INTO v_ots FROM (
    SELECT jsonb_build_object('id', o.id, 'numero', o.numero, 'lineas', jsonb_agg(jsonb_build_object('material_id', r.material_id, 'codigo', m.codigo, 'descripcion', m.descripcion, 'cantidad', r.cantidad_despachada))) x
      FROM public.ot_segmento_repuestos_reservas r JOIN public.ordenes_trabajo o ON o.id = r.ot_id JOIN public.materiales m ON m.id = r.material_id
     WHERE r.empresa_id = p_empresa_id AND r.cantidad_despachada > 0 AND o.created_at > now() - interval '180 days'
       AND (v_alc IS NULL OR o.sociedad_id = ANY (v_alc))
     GROUP BY o.id) q;
  RETURN jsonb_build_object('devoluciones', v, 'guias', v_guias, 'ots', v_ots);
END $f$;

-- ============================================================================
-- 6. Préstamo de herramientas
-- ============================================================================
CREATE OR REPLACE FUNCTION public.wms_prestar(p_empresa_id text, p_stock_id uuid, p_cantidad numeric, p_personal_id text, p_fecha_devolucion date, p_ot_id text DEFAULT NULL, p_observacion text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE s public.stock%rowtype; u public.ubicaciones%rowtype; v_alc uuid[]; v_num integer; v_numero text; v_id text;
BEGIN
  PERFORM public.wms_exigir(p_empresa_id, 'despachar', 'No tienes permiso para prestar herramientas.');
  SELECT * INTO s FROM public.stock WHERE id = p_stock_id AND empresa_id = p_empresa_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La herramienta no existe en el almacén.'; END IF;
  v_alc := public.usuario_alcance_sociedades(p_empresa_id);
  IF v_alc IS NOT NULL AND NOT (s.sociedad_id = ANY (v_alc)) THEN RAISE EXCEPTION 'La sociedad del stock está fuera de tu alcance.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO u FROM public.ubicaciones WHERE id = s.ubicacion_id;
  IF u.propietario_cuenta_id IS NOT NULL OR u.uso IN ('cuarentena', 'merma') THEN RAISE EXCEPTION 'Solo se prestan herramientas propias en ubicaciones de almacenaje.'; END IF;
  IF p_cantidad IS NULL OR p_cantidad <= 0 OR p_cantidad > coalesce(s.disponible, 0) THEN RAISE EXCEPTION 'Solo hay % disponibles para prestar.', coalesce(s.disponible, 0); END IF;
  IF s.serie IS NOT NULL AND p_cantidad <> 1 THEN RAISE EXCEPTION 'Una herramienta con serie se presta de a una.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.personal_operativo p WHERE p.id = p_personal_id AND p.empresa_id = p_empresa_id) THEN RAISE EXCEPTION 'Elige a la persona que recibe la herramienta.'; END IF;
  IF p_fecha_devolucion IS NULL OR p_fecha_devolucion < current_date THEN RAISE EXCEPTION 'La fecha de devolución debe ser hoy o posterior.'; END IF;
  IF p_ot_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ordenes_trabajo o WHERE o.id = p_ot_id AND o.empresa_id = p_empresa_id) THEN RAISE EXCEPTION 'La OT no existe.'; END IF;
  UPDATE public.stock SET disponible = disponible - p_cantidad, reservado = coalesce(reservado, 0) + p_cantidad, updated_at = now() WHERE id = s.id;
  v_num := public.wms_siguiente_numero(p_empresa_id, 'prestamo_wms', 'PRE', s.sociedad_id);
  v_numero := 'PRE-' || to_char(current_date, 'YY') || '-' || lpad(v_num::text, 4, '0');
  INSERT INTO public.wms_prestamos (empresa_id, sociedad_id, numero, stock_id, material_id, almacen_id, cantidad, personal_id, ot_id, fecha_devolucion_prevista, observacion, created_by)
  VALUES (p_empresa_id, s.sociedad_id, v_numero, s.id, s.material_id, s.almacen_id, p_cantidad, p_personal_id, p_ot_id, p_fecha_devolucion,
          nullif(btrim(coalesce(p_observacion, '')), ''), auth.uid())
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'numero', v_numero);
END $f$;

CREATE OR REPLACE FUNCTION public.wms_recibir_prestamo(p_empresa_id text, p_prestamo_id text, p_cantidad numeric, p_estado text, p_observacion text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE p public.wms_prestamos%rowtype; s public.stock%rowtype; v_pend numeric; v_cua text; v_kid text; v_costo numeric;
BEGIN
  PERFORM public.wms_exigir(p_empresa_id, 'despachar', 'No tienes permiso para recibir herramientas.');
  SELECT * INTO p FROM public.wms_prestamos WHERE id = p_prestamo_id AND empresa_id = p_empresa_id FOR UPDATE;
  IF NOT FOUND OR p.estado <> 'activo' THEN RAISE EXCEPTION 'El préstamo no está activo.'; END IF;
  IF p_estado NOT IN ('bueno', 'danado', 'perdido') THEN RAISE EXCEPTION 'Estado de devolución no válido.'; END IF;
  v_pend := p.cantidad - p.cantidad_devuelta - p.cantidad_danada - p.cantidad_perdida;
  IF p_cantidad IS NULL OR p_cantidad <= 0 OR p_cantidad > v_pend THEN RAISE EXCEPTION 'Quedan % por devolver.', v_pend; END IF;
  SELECT * INTO s FROM public.stock WHERE id = p.stock_id FOR UPDATE;
  IF coalesce(s.reservado, 0) < p_cantidad THEN RAISE EXCEPTION 'El stock del préstamo cambió; revisa el inventario.' USING ERRCODE = '40001'; END IF;
  UPDATE public.stock SET reservado = reservado - p_cantidad, disponible = coalesce(disponible, 0) + p_cantidad, updated_at = now() WHERE id = s.id;
  IF p_estado = 'danado' THEN
    v_cua := public.wms_ubicacion_cuarentena(s.almacen_id);
    IF v_cua IS NULL THEN RAISE EXCEPTION 'El almacén no tiene una ubicación de cuarentena para herramientas dañadas. Créala en Ubicaciones.'; END IF;
    PERFORM public.wms_transferir_stock(p_empresa_id, s.id, s.almacen_id, v_cua, p_cantidad, 'Herramienta dañada · ' || p.numero);
  ELSIF p_estado = 'perdido' THEN
    SELECT coalesce(costo_promedio, 0) INTO v_costo FROM public.materiales WHERE id = s.material_id;
    v_kid := public.wms_nuevo_kardex_id();
    PERFORM public.registrar_movimiento_atomico(
      p_kardex_id := v_kid, p_empresa_id := p_empresa_id, p_material_id := s.material_id, p_almacen_id := s.almacen_id, p_sociedad_id := s.sociedad_id,
      p_tipo := 'salida', p_motivo := 'perdida_herramienta', p_cantidad := p_cantidad, p_costo_unitario := v_costo, p_costo_unitario_usd := 0, p_moneda := 'PEN',
      p_lote := s.lote, p_serie := s.serie, p_vencimiento := s.vencimiento, p_referencia_tipo := 'prestamo', p_referencia_id := p.id, p_nro_documento := p.numero,
      p_observacion := 'Herramienta perdida · ' || p.numero || coalesce(' · ' || nullif(btrim(coalesce(p_observacion, '')), ''), ''),
      p_usuario_id := auth.uid(), p_ubicacion_id := s.ubicacion_id, p_skip_costo_promedio := true);
  END IF;
  UPDATE public.wms_prestamos SET
    cantidad_devuelta = cantidad_devuelta + CASE WHEN p_estado = 'bueno' THEN p_cantidad ELSE 0 END,
    cantidad_danada = cantidad_danada + CASE WHEN p_estado = 'danado' THEN p_cantidad ELSE 0 END,
    cantidad_perdida = cantidad_perdida + CASE WHEN p_estado = 'perdido' THEN p_cantidad ELSE 0 END,
    estado = CASE WHEN v_pend - p_cantidad <= 0 THEN 'cerrado' ELSE 'activo' END,
    cerrado_at = CASE WHEN v_pend - p_cantidad <= 0 THEN now() ELSE NULL END,
    observacion = coalesce(nullif(btrim(coalesce(p_observacion, '')), ''), observacion)
   WHERE id = p.id;
  RETURN jsonb_build_object('id', p.id, 'pendiente', v_pend - p_cantidad);
END $f$;

CREATE OR REPLACE FUNCTION public.wms_prestamos_resumen(p_empresa_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE v_alc uuid[]; v_pre jsonb; v_disp jsonb; v_per jsonb; v_ots jsonb;
BEGIN
  PERFORM public.wms_exigir(p_empresa_id, 'ver', 'No tienes permiso para ver el inventario.');
  v_alc := public.usuario_alcance_sociedades(p_empresa_id);
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'numero', p.numero, 'estado', p.estado, 'material_id', p.material_id, 'codigo', m.codigo, 'descripcion', m.descripcion, 'unidad', m.unidad,
      'serie', s.serie, 'almacen_codigo', a.codigo, 'ubicacion', u.codigo,
      'cantidad', p.cantidad, 'devuelta', p.cantidad_devuelta, 'danada', p.cantidad_danada, 'perdida', p.cantidad_perdida,
      'pendiente', p.cantidad - p.cantidad_devuelta - p.cantidad_danada - p.cantidad_perdida,
      'personal_id', p.personal_id, 'personal', po.nombre, 'personal_codigo', po.codigo, 'ot_id', p.ot_id, 'ot_numero', o.numero,
      'fecha_prestamo', p.fecha_prestamo, 'fecha_devolucion_prevista', p.fecha_devolucion_prevista, 'dias_vencido', current_date - p.fecha_devolucion_prevista,
      'observacion', p.observacion, 'cerrado_at', p.cerrado_at)
      ORDER BY (p.estado = 'activo') DESC, p.fecha_devolucion_prevista, p.numero), '[]'::jsonb) INTO v_pre
    FROM public.wms_prestamos p JOIN public.materiales m ON m.id = p.material_id JOIN public.stock s ON s.id = p.stock_id
    JOIN public.almacenes a ON a.id = p.almacen_id LEFT JOIN public.ubicaciones u ON u.id = s.ubicacion_id
    LEFT JOIN public.personal_operativo po ON po.id = p.personal_id LEFT JOIN public.ordenes_trabajo o ON o.id = p.ot_id
   WHERE p.empresa_id = p_empresa_id AND (v_alc IS NULL OR p.sociedad_id = ANY (v_alc))
     AND (p.estado = 'activo' OR p.cerrado_at > now() - interval '90 days');
  SELECT coalesce(jsonb_agg(jsonb_build_object('stock_id', s.id, 'material_id', s.material_id, 'codigo', m.codigo, 'descripcion', m.descripcion, 'unidad', m.unidad,
      'serie', s.serie, 'almacen_codigo', a.codigo, 'ubicacion', u.codigo, 'disponible', s.disponible, 'sociedad_id', s.sociedad_id,
      'es_herramienta', (a.tipo ILIKE '%herram%' OR m.codigo ILIKE 'HER%' OR m.familia ILIKE '%herram%'))
      ORDER BY (a.tipo ILIKE '%herram%' OR m.codigo ILIKE 'HER%' OR m.familia ILIKE '%herram%') DESC, m.codigo), '[]'::jsonb) INTO v_disp
    FROM public.stock s JOIN public.materiales m ON m.id = s.material_id JOIN public.almacenes a ON a.id = s.almacen_id JOIN public.ubicaciones u ON u.id = s.ubicacion_id
   WHERE s.empresa_id = p_empresa_id AND coalesce(s.disponible, 0) > 0 AND u.propietario_cuenta_id IS NULL AND u.uso NOT IN ('cuarentena', 'merma')
     AND a.proposito IN ('consumo_interno', 'mixto') AND (v_alc IS NULL OR s.sociedad_id = ANY (v_alc));
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'codigo', p.codigo, 'nombre', p.nombre) ORDER BY p.nombre), '[]'::jsonb) INTO v_per
    FROM public.personal_operativo p WHERE p.empresa_id = p_empresa_id AND coalesce(p.estado_laboral, 'activo') = 'activo';
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'numero', o.numero) ORDER BY o.numero DESC), '[]'::jsonb) INTO v_ots
    FROM public.ordenes_trabajo o WHERE o.empresa_id = p_empresa_id AND o.estado IN ('programada', 'ejecucion') AND (v_alc IS NULL OR o.sociedad_id = ANY (v_alc));
  RETURN jsonb_build_object('prestamos', v_pre, 'disponibles', v_disp, 'personal', v_per, 'ots', v_ots);
END $f$;

-- ============================================================================
-- 7. Reporte valorizado y ABC (stock propio; consumo valorizado 12 meses)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.wms_reporte_valorizado(p_empresa_id text, p_almacen_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE v_alc uuid[]; v_filas jsonb; v_alm jsonb;
BEGIN
  PERFORM public.wms_exigir(p_empresa_id, 'ver', 'No tienes permiso para ver el inventario.');
  v_alc := public.usuario_alcance_sociedades(p_empresa_id);
  WITH st AS (
    SELECT s.material_id, s.almacen_id, sum(coalesce(s.fisico, 0)) AS fisico
      FROM public.stock s JOIN public.almacenes a ON a.id = s.almacen_id LEFT JOIN public.ubicaciones u ON u.id = s.ubicacion_id
     WHERE s.empresa_id = p_empresa_id AND a.proposito <> 'custodia' AND (u.id IS NULL OR u.propietario_cuenta_id IS NULL)
       AND (p_almacen_id IS NULL OR s.almacen_id = p_almacen_id) AND (v_alc IS NULL OR s.sociedad_id = ANY (v_alc))
     GROUP BY 1, 2 HAVING sum(coalesce(s.fisico, 0)) > 0),
  mat AS (SELECT material_id, sum(fisico) AS fisico FROM st GROUP BY 1),
  sal AS (
    SELECT k.material_id, sum(abs(k.cantidad) * coalesce(k.costo_unitario, 0)) FILTER (WHERE k.fecha > now() - interval '365 days') AS consumo,
           max(k.fecha) AS ultima
      FROM public.kardex k
     WHERE k.empresa_id = p_empresa_id AND k.tipo = 'salida' AND NOT coalesce(k.anulado, false)
       AND coalesce(k.motivo, '') NOT IN ('ajuste_conteo', 'transferencia', 'transferencia_guia', 'salida_custodia', 'merma', 'perdida_herramienta')
       AND (p_almacen_id IS NULL OR k.almacen_id = p_almacen_id) AND k.material_id IN (SELECT material_id FROM mat)
     GROUP BY 1),
  base AS (
    SELECT m.id, m.codigo, m.descripcion, m.unidad, coalesce(m.familia, 'General') AS familia, mat.fisico, coalesce(m.costo_promedio, 0) AS costo,
           round(mat.fisico * coalesce(m.costo_promedio, 0), 2) AS valor, coalesce(sal.consumo, 0) AS consumo, sal.ultima
      FROM mat JOIN public.materiales m ON m.id = mat.material_id LEFT JOIN sal ON sal.material_id = mat.material_id),
  abc AS (
    SELECT b.*, CASE WHEN b.consumo <= 0 THEN 'sin_movimiento'
                     WHEN sum(b.consumo) OVER (ORDER BY b.consumo DESC, b.codigo) - b.consumo < 0.8 * sum(b.consumo) OVER () THEN 'A'
                     WHEN sum(b.consumo) OVER (ORDER BY b.consumo DESC, b.codigo) - b.consumo < 0.95 * sum(b.consumo) OVER () THEN 'B'
                     ELSE 'C' END AS clase
      FROM base b)
  SELECT coalesce(jsonb_agg(jsonb_build_object('material_id', id, 'codigo', codigo, 'descripcion', descripcion, 'unidad', unidad, 'familia', familia,
      'fisico', fisico, 'costo_promedio', costo, 'valor', valor, 'consumo_12m', round(consumo, 2), 'ultima_salida', ultima, 'clase', clase,
      'sin_salida_90', ultima IS NULL OR ultima < now() - interval '90 days') ORDER BY valor DESC, codigo), '[]'::jsonb)
    INTO v_filas FROM abc;
  SELECT coalesce(jsonb_agg(jsonb_build_object('almacen_id', a.id, 'codigo', a.codigo, 'nombre', a.nombre,
      'valor', (SELECT round(sum(st2.fisico * coalesce(m.costo_promedio, 0)), 2) FROM public.stock st2 JOIN public.materiales m ON m.id = st2.material_id
                 LEFT JOIN public.ubicaciones u ON u.id = st2.ubicacion_id
                WHERE st2.almacen_id = a.id AND (u.id IS NULL OR u.propietario_cuenta_id IS NULL) AND (v_alc IS NULL OR st2.sociedad_id = ANY (v_alc))))
      ORDER BY a.codigo), '[]'::jsonb) INTO v_alm
    FROM public.almacenes a
   WHERE a.empresa_id = p_empresa_id AND a.proposito <> 'custodia' AND (p_almacen_id IS NULL OR a.id = p_almacen_id)
     AND EXISTS (SELECT 1 FROM public.stock s WHERE s.almacen_id = a.id AND s.fisico > 0);
  RETURN jsonb_build_object('materiales', v_filas, 'almacenes', v_alm);
END $f$;

-- ============================================================================
-- 8. FEFO: las reservas toman primero el lote que vence antes y nunca uno vencido
-- ============================================================================
DO $m$
DECLARE
  v_def text := pg_get_functiondef('public.procesar_reserva_repuestos_ot(text)'::regprocedure);
  v_lote text := E'         and s.lote is null\n';
  v_ord text := E'       order by case when a.clase = ''periferico'' then 0 else 1 end,\n                coalesce(s.disponible, 0) desc, s.id\n';
BEGIN
  IF position('s.vencimiento' IN v_def) > 0 THEN RETURN; END IF;
  IF position(v_lote IN v_def) = 0 OR position(v_ord IN v_def) = 0 THEN RAISE EXCEPTION 'procesar_reserva_repuestos_ot no coincide con la versión esperada'; END IF;
  v_def := replace(v_def, v_lote, E'         and (s.vencimiento is null or s.vencimiento >= current_date)\n');
  v_def := replace(v_def, v_ord, E'       order by case when a.clase = ''periferico'' then 0 else 1 end,\n                s.vencimiento nulls last, coalesce(s.disponible, 0) desc, s.id\n');
  EXECUTE v_def;
END $m$;

DO $m$
DECLARE
  v_def text := pg_get_functiondef('public.wms_reservar_demanda(text)'::regprocedure);
  v_ord text := 'ORDER BY u.codigo, st.id';
  v_otros text := 'AND u.propietario_cuenta_id IS NULL AND u.uso NOT IN (''cuarentena'', ''merma'');';
BEGIN
  IF position('st.vencimiento' IN v_def) > 0 THEN RETURN; END IF;
  IF position(v_ord IN v_def) = 0 OR position(v_otros IN v_def) = 0 THEN RAISE EXCEPTION 'wms_reservar_demanda no coincide con la versión esperada'; END IF;
  v_def := replace(v_def, v_ord, 'AND (st.vencimiento IS NULL OR st.vencimiento >= current_date) ORDER BY st.vencimiento NULLS LAST, u.codigo, st.id');
  v_def := replace(v_def, v_otros, 'AND u.propietario_cuenta_id IS NULL AND u.uso NOT IN (''cuarentena'', ''merma'') AND (st.vencimiento IS NULL OR st.vencimiento >= current_date);');
  EXECUTE v_def;
END $m$;

-- ============================================================================
-- Permisos
-- ============================================================================
DO $g$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'wms_lotes(text,text)', 'wms_lote_a_cuarentena(text,uuid,numeric)',
    'wms_devolucion_registrar(text,text,text,text,jsonb,text)', 'wms_devolucion_cerrar(text,text,jsonb)',
    'wms_devolucion_marcar_nc(text,text)', 'wms_devoluciones_listar(text)',
    'wms_prestar(text,uuid,numeric,text,date,text,text)', 'wms_recibir_prestamo(text,text,numeric,text,text)', 'wms_prestamos_resumen(text)',
    'wms_reporte_valorizado(text,text)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
END $g$;

-- ============================================================================
-- Comprobación
-- ============================================================================
DO $chk$
BEGIN
  IF to_regclass('public.wms_devoluciones') IS NULL OR to_regclass('public.wms_prestamos') IS NULL THEN RAISE EXCEPTION 'faltan tablas'; END IF;
  IF position('s.vencimiento nulls last' IN pg_get_functiondef('public.procesar_reserva_repuestos_ot(text)'::regprocedure)) = 0 THEN RAISE EXCEPTION 'FEFO no aplicado en OT'; END IF;
  IF position('st.vencimiento NULLS LAST' IN pg_get_functiondef('public.wms_reservar_demanda(text)'::regprocedure)) = 0 THEN RAISE EXCEPTION 'FEFO no aplicado en demandas'; END IF;
  IF has_function_privilege('anon', 'public.wms_prestar(text,uuid,numeric,text,date,text,text)', 'execute') THEN RAISE EXCEPTION 'anon no debe ejecutar'; END IF;
  IF has_function_privilege('authenticated', 'public.wms_ubicacion_cuarentena(text)', 'execute') THEN RAISE EXCEPTION 'auxiliar expuesta'; END IF;
END $chk$;
