-- 653 · WMS multipropósito: uso propio, venta, mixto y custodia de terceros.
-- Aditiva salvo un ajuste acotado a procesar_reserva_repuestos_ot (partiendo de su versión vigente):
-- la reserva de OT ya no toma stock de almacenes de venta o custodia ni de posiciones de terceros o en cuarentena.

-- ============================================================================
-- 1. Configuración: perfil por almacén, módulos por empresa, parámetros por material y almacén
-- ============================================================================
ALTER TABLE public.almacenes ADD COLUMN IF NOT EXISTS proposito text NOT NULL DEFAULT 'consumo_interno';
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'almacenes_proposito_chk') THEN
    ALTER TABLE public.almacenes ADD CONSTRAINT almacenes_proposito_chk
      CHECK (proposito IN ('consumo_interno', 'venta', 'mixto', 'custodia'));
  END IF;
END $c$;

CREATE TABLE IF NOT EXISTS public.empresa_wms_config (
  empresa_id text PRIMARY KEY REFERENCES public.empresas(id) ON DELETE CASCADE,
  modulos jsonb NOT NULL DEFAULT '{"consumo":true,"venta":false,"custodia":false,"conteos":true,"codigos":true,"lotes":false,"herramientas":false}'::jsonb,
  umbral_aprobacion_ajuste numeric(14,2) NOT NULL DEFAULT 500,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
ALTER TABLE public.empresa_wms_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS empresa_wms_config_select ON public.empresa_wms_config;
CREATE POLICY empresa_wms_config_select ON public.empresa_wms_config FOR SELECT
  USING (public.usuario_tiene_empresa(empresa_id));
REVOKE ALL ON public.empresa_wms_config FROM anon;
GRANT SELECT ON public.empresa_wms_config TO authenticated;

CREATE TABLE IF NOT EXISTS public.material_almacen_parametros (
  material_id text NOT NULL REFERENCES public.materiales(id) ON DELETE CASCADE,
  almacen_id text NOT NULL REFERENCES public.almacenes(id) ON DELETE CASCADE,
  empresa_id text NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  stock_minimo numeric(14,2) NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),
  punto_reorden numeric(14,2) NOT NULL DEFAULT 0 CHECK (punto_reorden >= 0),
  stock_maximo numeric(14,2) NOT NULL DEFAULT 0 CHECK (stock_maximo >= 0),
  stock_seguridad numeric(14,2) NOT NULL DEFAULT 0 CHECK (stock_seguridad >= 0),
  protegido_operaciones numeric(14,2) NOT NULL DEFAULT 0 CHECK (protegido_operaciones >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  PRIMARY KEY (material_id, almacen_id)
);
CREATE INDEX IF NOT EXISTS material_almacen_parametros_empresa_idx ON public.material_almacen_parametros (empresa_id, almacen_id);
ALTER TABLE public.material_almacen_parametros ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS material_almacen_parametros_select ON public.material_almacen_parametros;
CREATE POLICY material_almacen_parametros_select ON public.material_almacen_parametros FOR SELECT
  USING (public.usuario_tiene_empresa(empresa_id) AND public.usuario_puede(empresa_id, 'inventario', 'ver'));
REVOKE ALL ON public.material_almacen_parametros FROM anon;
GRANT SELECT ON public.material_almacen_parametros TO authenticated;

-- ============================================================================
-- 2. Custodia de terceros: dueño por posición, tarifas y liquidaciones
-- ============================================================================
ALTER TABLE public.ubicaciones ADD COLUMN IF NOT EXISTS propietario_cuenta_id text REFERENCES public.cuentas(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS ubicaciones_propietario_idx ON public.ubicaciones (propietario_cuenta_id) WHERE propietario_cuenta_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.custodia_tarifas (
  id text PRIMARY KEY DEFAULT ('ctf_' || replace(gen_random_uuid()::text, '-', '')),
  empresa_id text NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  cuenta_id text NOT NULL REFERENCES public.cuentas(id) ON DELETE RESTRICT,
  almacen_id text NOT NULL REFERENCES public.almacenes(id) ON DELETE RESTRICT,
  tarifa_posicion_dia numeric(14,2) NOT NULL DEFAULT 0 CHECK (tarifa_posicion_dia >= 0),
  tarifa_movimiento numeric(14,2) NOT NULL DEFAULT 0 CHECK (tarifa_movimiento >= 0),
  moneda text NOT NULL DEFAULT 'PEN' CHECK (moneda IN ('PEN', 'USD')),
  activo boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, cuenta_id, almacen_id)
);
ALTER TABLE public.custodia_tarifas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS custodia_tarifas_select ON public.custodia_tarifas;
CREATE POLICY custodia_tarifas_select ON public.custodia_tarifas FOR SELECT
  USING (public.usuario_tiene_empresa(empresa_id) AND public.usuario_puede(empresa_id, 'inventario', 'ver'));
REVOKE ALL ON public.custodia_tarifas FROM anon;
GRANT SELECT ON public.custodia_tarifas TO authenticated;

CREATE TABLE IF NOT EXISTS public.custodia_liquidaciones (
  id text PRIMARY KEY DEFAULT ('cliq_' || replace(gen_random_uuid()::text, '-', '')),
  empresa_id text NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  cuenta_id text NOT NULL REFERENCES public.cuentas(id) ON DELETE RESTRICT,
  almacen_id text NOT NULL REFERENCES public.almacenes(id) ON DELETE RESTRICT,
  desde date NOT NULL,
  hasta date NOT NULL,
  posiciones_dia numeric(14,2) NOT NULL,
  movimientos integer NOT NULL,
  importe numeric(14,2) NOT NULL,
  moneda text NOT NULL,
  venta_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (empresa_id, cuenta_id, almacen_id, desde, hasta)
);
ALTER TABLE public.custodia_liquidaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS custodia_liquidaciones_select ON public.custodia_liquidaciones;
CREATE POLICY custodia_liquidaciones_select ON public.custodia_liquidaciones FOR SELECT
  USING (public.usuario_tiene_empresa(empresa_id) AND public.usuario_puede(empresa_id, 'inventario', 'ver'));
REVOKE ALL ON public.custodia_liquidaciones FROM anon;
GRANT SELECT ON public.custodia_liquidaciones TO authenticated;

-- ============================================================================
-- 3. Demandas de salida genéricas (venta y custodia; la OT sigue con sus tablas)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.wms_demandas (
  id text PRIMARY KEY DEFAULT ('dem_' || replace(gen_random_uuid()::text, '-', '')),
  empresa_id text NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  sociedad_id uuid,
  almacen_id text NOT NULL REFERENCES public.almacenes(id) ON DELETE RESTRICT,
  canal text NOT NULL CHECK (canal IN ('venta', 'custodia')),
  numero text NOT NULL,
  origen_tipo text,
  origen_id text,
  cuenta_id text,
  destino text,
  fecha_requerida date,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'reservada', 'parcial', 'despachada', 'anulada')),
  observacion text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS wms_demandas_origen_uq ON public.wms_demandas (empresa_id, origen_tipo, origen_id) WHERE origen_id IS NOT NULL AND estado <> 'anulada';
CREATE INDEX IF NOT EXISTS wms_demandas_almacen_idx ON public.wms_demandas (empresa_id, almacen_id, estado);

CREATE TABLE IF NOT EXISTS public.wms_demanda_lineas (
  id text PRIMARY KEY DEFAULT ('deml_' || replace(gen_random_uuid()::text, '-', '')),
  demanda_id text NOT NULL REFERENCES public.wms_demandas(id) ON DELETE CASCADE,
  empresa_id text NOT NULL,
  material_id text NOT NULL REFERENCES public.materiales(id) ON DELETE RESTRICT,
  origen_linea_id text,
  descripcion text,
  precio_unitario numeric(14,4) NOT NULL DEFAULT 0,
  cantidad numeric(14,2) NOT NULL CHECK (cantidad > 0),
  cantidad_reservada numeric(14,2) NOT NULL DEFAULT 0,
  cantidad_despachada numeric(14,2) NOT NULL DEFAULT 0,
  orden integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS wms_demanda_lineas_demanda_idx ON public.wms_demanda_lineas (demanda_id);

CREATE TABLE IF NOT EXISTS public.wms_demanda_reservas (
  id text PRIMARY KEY DEFAULT ('demr_' || replace(gen_random_uuid()::text, '-', '')),
  linea_id text NOT NULL REFERENCES public.wms_demanda_lineas(id) ON DELETE CASCADE,
  empresa_id text NOT NULL,
  stock_id uuid NOT NULL REFERENCES public.stock(id) ON DELETE RESTRICT,
  cantidad numeric(14,2) NOT NULL CHECK (cantidad > 0),
  cantidad_despachada numeric(14,2) NOT NULL DEFAULT 0,
  cantidad_liberada numeric(14,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wms_demanda_reservas_linea_idx ON public.wms_demanda_reservas (linea_id);

ALTER TABLE public.wms_demandas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wms_demanda_lineas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wms_demanda_reservas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wms_demandas_select ON public.wms_demandas;
CREATE POLICY wms_demandas_select ON public.wms_demandas FOR SELECT
  USING (public.usuario_tiene_empresa(empresa_id) AND public.usuario_puede(empresa_id, 'inventario', 'ver')
         AND (public.usuario_alcance_sociedades(empresa_id) IS NULL OR sociedad_id = ANY (public.usuario_alcance_sociedades(empresa_id))));
DROP POLICY IF EXISTS wms_demanda_lineas_select ON public.wms_demanda_lineas;
CREATE POLICY wms_demanda_lineas_select ON public.wms_demanda_lineas FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.wms_demandas d WHERE d.id = demanda_id));
DROP POLICY IF EXISTS wms_demanda_reservas_select ON public.wms_demanda_reservas;
CREATE POLICY wms_demanda_reservas_select ON public.wms_demanda_reservas FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.wms_demanda_lineas l WHERE l.id = linea_id));
REVOKE ALL ON public.wms_demandas, public.wms_demanda_lineas, public.wms_demanda_reservas FROM anon;
GRANT SELECT ON public.wms_demandas, public.wms_demanda_lineas, public.wms_demanda_reservas TO authenticated;

-- ============================================================================
-- 4. Funciones auxiliares
-- ============================================================================
CREATE OR REPLACE FUNCTION public.wms_exigir(p_empresa_id text, p_accion text, p_mensaje text)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Se requiere una sesión autenticada.' USING ERRCODE = '42501'; END IF;
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN RAISE EXCEPTION 'No tienes acceso a esta empresa.' USING ERRCODE = '42501'; END IF;
  IF NOT public.usuario_puede(p_empresa_id, 'inventario', p_accion) THEN RAISE EXCEPTION '%', p_mensaje USING ERRCODE = '42501'; END IF;
END $f$;

CREATE OR REPLACE FUNCTION public.wms_nuevo_kardex_id()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE v text;
BEGIN
  LOOP
    v := 'kdx_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 18);
    PERFORM pg_advisory_xact_lock(hashtextextended('kardex-id:' || v, 0));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.kardex k WHERE k.id = v);
  END LOOP;
  RETURN v;
END $f$;

CREATE OR REPLACE FUNCTION public.wms_siguiente_numero(p_empresa_id text, p_tipo text, p_serie text, p_sociedad_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE v_id text; v_n integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('correlativo:' || p_empresa_id || ':' || p_tipo || ':' || p_serie || ':' || coalesce(p_sociedad_id::text, ''), 0));
  SELECT id, ultimo_numero INTO v_id, v_n FROM public.correlativos_documentos
   WHERE empresa_id = p_empresa_id AND tipo_documento = p_tipo AND serie = p_serie AND sociedad_id IS NOT DISTINCT FROM p_sociedad_id
   FOR UPDATE;
  IF v_id IS NULL THEN
    v_n := 1;
    INSERT INTO public.correlativos_documentos (id, empresa_id, tipo_documento, serie, sociedad_id, ultimo_numero, updated_at)
    VALUES ('cor_' || replace(gen_random_uuid()::text, '-', ''), p_empresa_id, p_tipo, p_serie, p_sociedad_id, 1, now());
  ELSE
    v_n := coalesce(v_n, 0) + 1;
    UPDATE public.correlativos_documentos SET ultimo_numero = v_n, updated_at = now() WHERE id = v_id;
  END IF;
  RETURN v_n;
END $f$;

-- Reserva lo pendiente de una demanda (interna; no se expone)
CREATE OR REPLACE FUNCTION public.wms_reservar_demanda(p_demanda_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE
  d public.wms_demandas%rowtype; l record; s record;
  v_prop text; v_pend numeric; v_take numeric; v_protegido numeric; v_otros numeric; v_tomable numeric;
  v_faltantes jsonb := '[]'::jsonb; v_total_pend numeric := 0;
BEGIN
  SELECT * INTO d FROM public.wms_demandas WHERE id = p_demanda_id FOR UPDATE;
  SELECT proposito INTO v_prop FROM public.almacenes WHERE id = d.almacen_id;
  FOR l IN SELECT * FROM public.wms_demanda_lineas WHERE demanda_id = d.id ORDER BY orden, id FOR UPDATE LOOP
    v_pend := l.cantidad - l.cantidad_reservada - l.cantidad_despachada;
    IF v_pend <= 0 THEN CONTINUE; END IF;
    -- Cuánto puede tomar este canal: en almacén mixto, ventas no toma lo protegido para operaciones
    v_tomable := v_pend;
    IF d.canal = 'venta' AND v_prop = 'mixto' THEN
      SELECT coalesce(p.protegido_operaciones, 0) INTO v_protegido FROM public.material_almacen_parametros p
       WHERE p.material_id = l.material_id AND p.almacen_id = d.almacen_id;
      SELECT coalesce(sum(st.disponible), 0) INTO v_otros FROM public.stock st
        JOIN public.ubicaciones u ON u.id = st.ubicacion_id
       WHERE st.empresa_id = d.empresa_id AND st.almacen_id = d.almacen_id AND st.material_id = l.material_id
         AND st.sociedad_id IS NOT DISTINCT FROM d.sociedad_id AND u.propietario_cuenta_id IS NULL AND u.uso NOT IN ('cuarentena', 'merma');
      v_tomable := least(v_pend, greatest(v_otros - coalesce(v_protegido, 0), 0));
    END IF;
    FOR s IN
      SELECT st.* FROM public.stock st JOIN public.ubicaciones u ON u.id = st.ubicacion_id
       WHERE st.empresa_id = d.empresa_id AND st.almacen_id = d.almacen_id AND st.material_id = l.material_id
         AND st.sociedad_id IS NOT DISTINCT FROM d.sociedad_id AND coalesce(st.disponible, 0) > 0
         AND u.uso NOT IN ('cuarentena', 'merma')
         AND ((d.canal = 'custodia' AND u.propietario_cuenta_id = d.cuenta_id) OR (d.canal <> 'custodia' AND u.propietario_cuenta_id IS NULL))
       ORDER BY u.codigo, st.id
       FOR UPDATE OF st
    LOOP
      EXIT WHEN v_tomable <= 0;
      v_take := least(v_tomable, s.disponible);
      UPDATE public.stock SET disponible = disponible - v_take, reservado = coalesce(reservado, 0) + v_take, updated_at = now() WHERE id = s.id;
      INSERT INTO public.wms_demanda_reservas (linea_id, empresa_id, stock_id, cantidad) VALUES (l.id, d.empresa_id, s.id, v_take);
      UPDATE public.wms_demanda_lineas SET cantidad_reservada = cantidad_reservada + v_take WHERE id = l.id;
      v_tomable := v_tomable - v_take; v_pend := v_pend - v_take;
    END LOOP;
    IF v_pend > 0 THEN
      v_total_pend := v_total_pend + v_pend;
      v_faltantes := v_faltantes || jsonb_build_object('material_id', l.material_id, 'faltante', v_pend);
    END IF;
  END LOOP;
  UPDATE public.wms_demandas SET estado = CASE WHEN v_total_pend = 0 THEN 'reservada' ELSE 'parcial' END, updated_at = now()
   WHERE id = d.id AND estado IN ('pendiente', 'reservada', 'parcial');
  RETURN jsonb_build_object('demanda_id', d.id, 'faltantes', v_faltantes);
END $f$;
REVOKE ALL ON FUNCTION public.wms_reservar_demanda(text) FROM PUBLIC, anon, authenticated;

-- Libera todo lo reservado y no despachado de una demanda (interna)
CREATE OR REPLACE FUNCTION public.wms_liberar_demanda_interno(p_demanda_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE r record; v_q numeric;
BEGIN
  FOR r IN SELECT rv.* FROM public.wms_demanda_reservas rv JOIN public.wms_demanda_lineas l ON l.id = rv.linea_id
            WHERE l.demanda_id = p_demanda_id AND rv.cantidad - rv.cantidad_despachada - rv.cantidad_liberada > 0 FOR UPDATE OF rv LOOP
    v_q := r.cantidad - r.cantidad_despachada - r.cantidad_liberada;
    UPDATE public.stock SET reservado = greatest(coalesce(reservado, 0) - v_q, 0), disponible = coalesce(disponible, 0) + v_q, updated_at = now() WHERE id = r.stock_id;
    UPDATE public.wms_demanda_reservas SET cantidad_liberada = cantidad_liberada + v_q WHERE id = r.id;
    UPDATE public.wms_demanda_lineas SET cantidad_reservada = greatest(cantidad_reservada - v_q, 0) WHERE id = r.linea_id;
  END LOOP;
END $f$;
REVOKE ALL ON FUNCTION public.wms_liberar_demanda_interno(text) FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 5. Configuración y parámetros
-- ============================================================================
CREATE OR REPLACE FUNCTION public.wms_guardar_configuracion(p_empresa_id text, p_modulos jsonb, p_umbral numeric, p_almacenes jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE a jsonb; v_mod jsonb := '{}'::jsonb; k text;
BEGIN
  PERFORM public.wms_exigir(p_empresa_id, 'editar', 'No tienes permiso para configurar el almacén.');
  FOREACH k IN ARRAY ARRAY['consumo', 'venta', 'custodia', 'conteos', 'codigos', 'lotes', 'herramientas'] LOOP
    v_mod := v_mod || jsonb_build_object(k, coalesce((p_modulos->>k)::boolean, false));
  END LOOP;
  IF p_umbral IS NULL OR p_umbral < 0 THEN RAISE EXCEPTION 'El umbral de aprobación debe ser cero o mayor.'; END IF;
  INSERT INTO public.empresa_wms_config (empresa_id, modulos, umbral_aprobacion_ajuste, updated_at, updated_by)
  VALUES (p_empresa_id, v_mod, round(p_umbral, 2), now(), auth.uid())
  ON CONFLICT (empresa_id) DO UPDATE SET modulos = EXCLUDED.modulos, umbral_aprobacion_ajuste = EXCLUDED.umbral_aprobacion_ajuste, updated_at = now(), updated_by = auth.uid();
  FOR a IN SELECT * FROM jsonb_array_elements(coalesce(p_almacenes, '[]'::jsonb)) LOOP
    IF (a->>'proposito') NOT IN ('consumo_interno', 'venta', 'mixto', 'custodia') THEN RAISE EXCEPTION 'Propósito no válido: %', a->>'proposito'; END IF;
    IF (a->>'proposito') <> 'custodia' AND EXISTS (SELECT 1 FROM public.ubicaciones u WHERE u.almacen_id = a->>'id' AND u.propietario_cuenta_id IS NOT NULL) THEN
      RAISE EXCEPTION 'El almacén tiene posiciones asignadas a clientes de custodia; libéralas antes de cambiar su propósito.';
    END IF;
    UPDATE public.almacenes SET proposito = a->>'proposito', updated_at = now() WHERE id = a->>'id' AND empresa_id = p_empresa_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'El almacén % no existe en esta empresa.', a->>'id'; END IF;
  END LOOP;
  RETURN jsonb_build_object('modulos', v_mod);
END $f$;

CREATE OR REPLACE FUNCTION public.wms_guardar_parametros(p_empresa_id text, p_filas jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE r jsonb; n integer := 0; v_min numeric; v_reo numeric; v_max numeric; v_seg numeric; v_pro numeric;
BEGIN
  PERFORM public.wms_exigir(p_empresa_id, 'editar', 'No tienes permiso para editar parámetros de stock.');
  FOR r IN SELECT * FROM jsonb_array_elements(coalesce(p_filas, '[]'::jsonb)) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.materiales m WHERE m.id = r->>'material_id' AND m.empresa_id = p_empresa_id)
       OR NOT EXISTS (SELECT 1 FROM public.almacenes a WHERE a.id = r->>'almacen_id' AND a.empresa_id = p_empresa_id) THEN
      RAISE EXCEPTION 'Material o almacén fuera de la empresa.';
    END IF;
    v_min := coalesce((r->>'stock_minimo')::numeric, 0); v_reo := coalesce((r->>'punto_reorden')::numeric, 0);
    v_max := coalesce((r->>'stock_maximo')::numeric, 0); v_seg := coalesce((r->>'stock_seguridad')::numeric, 0);
    v_pro := coalesce((r->>'protegido_operaciones')::numeric, 0);
    IF least(v_min, v_reo, v_max, v_seg, v_pro) < 0 THEN RAISE EXCEPTION 'Los parámetros no pueden ser negativos.'; END IF;
    IF v_max > 0 AND (v_min > v_max OR v_reo > v_max) THEN RAISE EXCEPTION 'El mínimo y el punto de reorden no pueden superar al máximo.'; END IF;
    INSERT INTO public.material_almacen_parametros (material_id, almacen_id, empresa_id, stock_minimo, punto_reorden, stock_maximo, stock_seguridad, protegido_operaciones, updated_at, updated_by)
    VALUES (r->>'material_id', r->>'almacen_id', p_empresa_id, v_min, v_reo, v_max, v_seg, v_pro, now(), auth.uid())
    ON CONFLICT (material_id, almacen_id) DO UPDATE SET stock_minimo = EXCLUDED.stock_minimo, punto_reorden = EXCLUDED.punto_reorden,
      stock_maximo = EXCLUDED.stock_maximo, stock_seguridad = EXCLUDED.stock_seguridad, protegido_operaciones = EXCLUDED.protegido_operaciones,
      updated_at = now(), updated_by = auth.uid();
    n := n + 1;
  END LOOP;
  RETURN n;
END $f$;

-- ============================================================================
-- 6. Canal venta: confirmar / anular orden de venta (llamadas desde Administración)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.wms_confirmar_orden_venta(p_empresa_id text, p_ov_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE ov public.ordenes_venta%rowtype; v_alc uuid[]; v_dem text; v_res jsonb; v_prop text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.usuario_tiene_empresa(p_empresa_id) THEN RAISE EXCEPTION 'No tienes acceso a esta empresa.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO ov FROM public.ordenes_venta WHERE id = p_ov_id AND empresa_id = p_empresa_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orden de venta no encontrada.'; END IF;
  v_alc := public.usuario_alcance_sociedades(p_empresa_id);
  IF v_alc IS NOT NULL AND NOT (ov.sociedad_id = ANY (v_alc)) THEN RAISE EXCEPTION 'La sociedad de la orden está fuera de tu alcance.' USING ERRCODE = '42501'; END IF;
  IF ov.estado <> 'pendiente' THEN RAISE EXCEPTION 'La orden ya está en estado "%".', ov.estado; END IF;
  IF ov.almacen_despacho_id IS NULL THEN RAISE EXCEPTION 'La orden no tiene almacén de despacho asignado.'; END IF;
  SELECT proposito INTO v_prop FROM public.almacenes WHERE id = ov.almacen_despacho_id;
  IF v_prop NOT IN ('venta', 'mixto') THEN
    RAISE EXCEPTION 'El almacén de despacho es de %; elige un almacén de venta o mixto (Configuración del WMS).',
      CASE v_prop WHEN 'custodia' THEN 'custodia de terceros' ELSE 'consumo interno' END;
  END IF;
  INSERT INTO public.wms_demandas (empresa_id, sociedad_id, almacen_id, canal, numero, origen_tipo, origen_id, cuenta_id, destino, fecha_requerida, created_by)
  VALUES (p_empresa_id, ov.sociedad_id, ov.almacen_despacho_id, 'venta', ov.numero, 'orden_venta', ov.id, ov.cuenta_id,
          coalesce(ov.cliente_nombre, 'Cliente'), ov.fecha_entrega, auth.uid())
  RETURNING id INTO v_dem;
  INSERT INTO public.wms_demanda_lineas (demanda_id, empresa_id, material_id, origen_linea_id, descripcion, precio_unitario, cantidad, orden)
  SELECT v_dem, p_empresa_id, l.material_id, l.id, l.descripcion, coalesce(l.precio_neto, l.precio_unitario, 0), l.cantidad - coalesce(l.cantidad_despachada, 0), coalesce(l.orden, 0)
    FROM public.ordenes_venta_lineas l
   WHERE l.orden_venta_id = ov.id AND l.material_id IS NOT NULL AND l.cantidad - coalesce(l.cantidad_despachada, 0) > 0;
  v_res := public.wms_reservar_demanda(v_dem);
  UPDATE public.ordenes_venta SET estado = 'confirmada', updated_at = now() WHERE id = ov.id;
  RETURN v_res;
END $f$;

CREATE OR REPLACE FUNCTION public.wms_anular_orden_venta(p_empresa_id text, p_ov_id text, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE ov public.ordenes_venta%rowtype; v_alc uuid[]; d record;
BEGIN
  IF auth.uid() IS NULL OR NOT public.usuario_tiene_empresa(p_empresa_id) THEN RAISE EXCEPTION 'No tienes acceso a esta empresa.' USING ERRCODE = '42501'; END IF;
  IF nullif(btrim(coalesce(p_motivo, '')), '') IS NULL THEN RAISE EXCEPTION 'El motivo de anulación es obligatorio.'; END IF;
  SELECT * INTO ov FROM public.ordenes_venta WHERE id = p_ov_id AND empresa_id = p_empresa_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Orden de venta no encontrada.'; END IF;
  v_alc := public.usuario_alcance_sociedades(p_empresa_id);
  IF v_alc IS NOT NULL AND NOT (ov.sociedad_id = ANY (v_alc)) THEN RAISE EXCEPTION 'La sociedad de la orden está fuera de tu alcance.' USING ERRCODE = '42501'; END IF;
  IF ov.estado = 'anulada' THEN RAISE EXCEPTION 'La orden ya está anulada.'; END IF;
  IF EXISTS (SELECT 1 FROM public.ordenes_venta_lineas l WHERE l.orden_venta_id = ov.id AND coalesce(l.cantidad_despachada, 0) > 0) THEN
    RAISE EXCEPTION 'La orden ya tiene despachos; anula primero la guía de remisión.';
  END IF;
  FOR d IN SELECT id FROM public.wms_demandas WHERE empresa_id = p_empresa_id AND origen_tipo = 'orden_venta' AND origen_id = ov.id AND estado <> 'anulada' LOOP
    PERFORM public.wms_liberar_demanda_interno(d.id);
    UPDATE public.wms_demandas SET estado = 'anulada', observacion = btrim(p_motivo), updated_at = now() WHERE id = d.id;
  END LOOP;
  UPDATE public.ordenes_venta SET estado = 'anulada', anulado = true, anulado_motivo = btrim(p_motivo), anulado_por = auth.uid(), anulado_at = now(), updated_at = now()
   WHERE id = ov.id;
  RETURN jsonb_build_object('orden_venta_id', ov.id, 'estado', 'anulada');
END $f$;

-- ============================================================================
-- 7. Despacho de demandas (venta con guía, custodia entrega al cliente)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.wms_despachar_demanda(p_empresa_id text, p_demanda_id text, p_lineas jsonb, p_guia jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE
  d public.wms_demandas%rowtype; v_alc uuid[]; it jsonb; l public.wms_demanda_lineas%rowtype; r record; st public.stock%rowtype;
  v_cant numeric; v_resta numeric; v_take numeric; v_costo numeric; v_kid text; v_kids text[] := '{}'; v_motivo text;
  v_guia_id text; v_serie text; v_num integer; v_numc text; ov public.ordenes_venta%rowtype; v_lin jsonb := '[]'::jsonb;
  v_pend_total numeric; v_almacen public.almacenes%rowtype; v_orden integer := 0; v_peso numeric;
BEGIN
  PERFORM public.wms_exigir(p_empresa_id, 'despachar', 'No tienes permiso para despachar.');
  SELECT * INTO d FROM public.wms_demandas WHERE id = p_demanda_id AND empresa_id = p_empresa_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El pedido no existe.'; END IF;
  v_alc := public.usuario_alcance_sociedades(p_empresa_id);
  IF v_alc IS NOT NULL AND NOT (d.sociedad_id = ANY (v_alc)) THEN RAISE EXCEPTION 'La sociedad del pedido está fuera de tu alcance.' USING ERRCODE = '42501'; END IF;
  IF d.estado IN ('despachada', 'anulada') THEN RAISE EXCEPTION 'El pedido ya está %.', d.estado; END IF;
  IF p_lineas IS NULL OR jsonb_typeof(p_lineas) <> 'array' OR jsonb_array_length(p_lineas) = 0 THEN RAISE EXCEPTION 'Indica al menos una línea a despachar.'; END IF;
  SELECT * INTO v_almacen FROM public.almacenes WHERE id = d.almacen_id;
  v_motivo := CASE d.canal WHEN 'venta' THEN 'venta' ELSE 'salida_custodia' END;
  IF d.canal = 'venta' THEN
    SELECT * INTO ov FROM public.ordenes_venta WHERE id = d.origen_id FOR UPDATE;
    IF p_guia IS NULL THEN RAISE EXCEPTION 'La venta requiere los datos de la guía de remisión.'; END IF;
    IF nullif(btrim(coalesce(p_guia->>'llegada_direccion', '')), '') IS NULL THEN RAISE EXCEPTION 'Indica el punto de llegada de la guía.'; END IF;
  END IF;

  FOR it IN SELECT * FROM jsonb_array_elements(p_lineas) LOOP
    BEGIN v_cant := (it->>'cantidad')::numeric; EXCEPTION WHEN others THEN v_cant := NULL; END;
    IF v_cant IS NULL OR v_cant < 0 THEN RAISE EXCEPTION 'Cantidad no válida.'; END IF;
    IF v_cant = 0 THEN CONTINUE; END IF;
    SELECT * INTO l FROM public.wms_demanda_lineas WHERE id = it->>'linea_id' AND demanda_id = d.id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'La línea no pertenece al pedido.'; END IF;
    IF v_cant > l.cantidad_reservada THEN RAISE EXCEPTION 'Solo hay % reservados para %; no se puede despachar %.', l.cantidad_reservada, coalesce(l.descripcion, l.material_id), v_cant; END IF;
    SELECT CASE WHEN d.canal = 'custodia' THEN 0 ELSE coalesce(m.costo_promedio, 0) END INTO v_costo FROM public.materiales m WHERE m.id = l.material_id;
    v_resta := v_cant;
    FOR r IN SELECT * FROM public.wms_demanda_reservas WHERE linea_id = l.id AND cantidad - cantidad_despachada - cantidad_liberada > 0 ORDER BY created_at, id FOR UPDATE LOOP
      EXIT WHEN v_resta <= 0;
      v_take := least(v_resta, r.cantidad - r.cantidad_despachada - r.cantidad_liberada);
      SELECT * INTO st FROM public.stock WHERE id = r.stock_id FOR UPDATE;
      IF coalesce(st.reservado, 0) < v_take THEN RAISE EXCEPTION 'La reserva cambió; actualiza la pantalla.' USING ERRCODE = '40001'; END IF;
      UPDATE public.stock SET reservado = reservado - v_take, disponible = coalesce(disponible, 0) + v_take, updated_at = now() WHERE id = st.id;
      v_kid := public.wms_nuevo_kardex_id();
      PERFORM public.registrar_movimiento_atomico(
        p_kardex_id := v_kid, p_empresa_id := p_empresa_id, p_material_id := st.material_id, p_almacen_id := st.almacen_id,
        p_sociedad_id := st.sociedad_id, p_tipo := 'salida', p_motivo := v_motivo, p_cantidad := v_take, p_costo_unitario := v_costo,
        p_costo_unitario_usd := 0, p_moneda := 'PEN', p_lote := st.lote, p_serie := st.serie, p_vencimiento := st.vencimiento,
        p_referencia_tipo := CASE d.canal WHEN 'venta' THEN 'orden_venta' ELSE 'custodia' END,
        p_referencia_id := coalesce(d.origen_id, d.id), p_nro_documento := d.numero,
        p_observacion := CASE d.canal WHEN 'venta' THEN 'Venta ' || d.numero || ' · ' || coalesce(d.destino, '') ELSE 'Entrega de custodia ' || d.numero || ' · ' || coalesce(d.destino, '') END,
        p_usuario_id := auth.uid(), p_ubicacion_id := st.ubicacion_id, p_skip_costo_promedio := true);
      UPDATE public.wms_demanda_reservas SET cantidad_despachada = cantidad_despachada + v_take WHERE id = r.id;
      v_kids := v_kids || v_kid; v_resta := v_resta - v_take;
    END LOOP;
    IF v_resta > 0 THEN RAISE EXCEPTION 'No se pudo despachar la cantidad completa.' USING ERRCODE = '40001'; END IF;
    UPDATE public.wms_demanda_lineas SET cantidad_reservada = cantidad_reservada - v_cant, cantidad_despachada = cantidad_despachada + v_cant WHERE id = l.id;
    IF d.canal = 'venta' AND l.origen_linea_id IS NOT NULL THEN
      UPDATE public.ordenes_venta_lineas SET cantidad_despachada = coalesce(cantidad_despachada, 0) + v_cant WHERE id = l.origen_linea_id;
    END IF;
    v_orden := v_orden + 1;
    v_lin := v_lin || jsonb_build_object('material_id', l.material_id, 'cantidad', v_cant, 'precio', l.precio_unitario, 'descripcion', l.descripcion, 'orden', v_orden);
  END LOOP;
  IF v_orden = 0 THEN RAISE EXCEPTION 'Indica una cantidad mayor a cero en al menos una línea.'; END IF;

  SELECT coalesce(sum(cantidad - cantidad_despachada), 0) INTO v_pend_total FROM public.wms_demanda_lineas WHERE demanda_id = d.id;
  UPDATE public.wms_demandas SET estado = CASE WHEN v_pend_total = 0 THEN 'despachada' ELSE 'parcial' END, updated_at = now() WHERE id = d.id;

  IF d.canal = 'venta' THEN
    UPDATE public.ordenes_venta o SET estado = CASE
        WHEN NOT EXISTS (SELECT 1 FROM public.ordenes_venta_lineas x WHERE x.orden_venta_id = o.id AND coalesce(x.cantidad_despachada, 0) < x.cantidad) THEN 'despachada'
        ELSE 'parcialmente_despachada' END, updated_at = now()
     WHERE o.id = d.origen_id;
    v_serie := coalesce(nullif(btrim(p_guia->>'serie'), ''), 'T001');
    v_num := public.wms_siguiente_numero(p_empresa_id, 'guia_remision', v_serie, d.sociedad_id);
    v_numc := v_serie || '-' || lpad(v_num::text, 8, '0');
    v_guia_id := 'gr_' || replace(gen_random_uuid()::text, '-', '');
    v_peso := coalesce(nullif(p_guia->>'peso_bruto_total', '')::numeric, 0);
    INSERT INTO public.guias_remision (id, empresa_id, serie, numero, numero_completo, fecha_emision, fecha_inicio_traslado, tipo_origen, motivo_traslado,
      modalidad, orden_venta_id, almacen_origen_id, sociedad_origen_id, partida_direccion, llegada_direccion, llegada_ubigeo, destinatario_ruc_dni,
      destinatario_razon_social, peso_bruto_total, unidad_peso, transportista_id, transportista_ruc, transportista_razon_social, vehiculo_id, vehiculo_placa,
      conductor_id, conductor_nombre, conductor_dni, conductor_brevete, estado, kardex_salida_ids, created_by, created_at, updated_at)
    VALUES (v_guia_id, p_empresa_id, v_serie, v_num, v_numc, current_date,
      coalesce(nullif(p_guia->>'fecha_inicio_traslado', '')::date, current_date), 'despacho_venta', '01',
      coalesce(nullif(p_guia->>'modalidad', ''), 'remitente'), d.origen_id, d.almacen_id, d.sociedad_id,
      coalesce(nullif(btrim(p_guia->>'partida_direccion'), ''), coalesce(v_almacen.direccion, v_almacen.ubicacion, v_almacen.nombre)),
      btrim(p_guia->>'llegada_direccion'), nullif(p_guia->>'llegada_ubigeo', ''),
      coalesce(ov.cliente_ruc_dni, ''), coalesce(ov.cliente_nombre, d.destino, ''), v_peso, 'KGM',
      nullif(p_guia->>'transportista_id', ''), nullif(p_guia->>'transportista_ruc', ''), nullif(p_guia->>'transportista_razon_social', ''),
      nullif(p_guia->>'vehiculo_id', ''), nullif(p_guia->>'vehiculo_placa', ''), nullif(p_guia->>'conductor_id', ''),
      nullif(p_guia->>'conductor_nombre', ''), nullif(p_guia->>'conductor_dni', ''), nullif(p_guia->>'conductor_brevete', ''),
      'emitida', to_jsonb(v_kids), auth.uid(), now(), now());
    INSERT INTO public.guias_remision_lineas (id, empresa_id, guia_id, material_id, descripcion, codigo, unidad, cantidad, peso_unitario, peso_total, precio_unitario, valor_total, moneda, orden)
    SELECT 'grl_' || replace(gen_random_uuid()::text, '-', ''), p_empresa_id, v_guia_id, x->>'material_id', coalesce(x->>'descripcion', m.descripcion), m.codigo,
           coalesce(m.unidad, 'NIU'), (x->>'cantidad')::numeric, 0, 0, (x->>'precio')::numeric, round((x->>'cantidad')::numeric * (x->>'precio')::numeric, 2),
           coalesce(ov.moneda, 'PEN'), (x->>'orden')::integer
      FROM jsonb_array_elements(v_lin) x JOIN public.materiales m ON m.id = x->>'material_id';
  END IF;
  RETURN jsonb_build_object('demanda_id', d.id, 'estado', CASE WHEN v_pend_total = 0 THEN 'despachada' ELSE 'parcial' END,
    'guia_id', v_guia_id, 'guia_numero', v_numc, 'kardex_ids', to_jsonb(v_kids));
END $f$;

CREATE OR REPLACE FUNCTION public.wms_reintentar_reserva(p_empresa_id text, p_demanda_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE d public.wms_demandas%rowtype;
BEGIN
  PERFORM public.wms_exigir(p_empresa_id, 'despachar', 'No tienes permiso para reservar.');
  SELECT * INTO d FROM public.wms_demandas WHERE id = p_demanda_id AND empresa_id = p_empresa_id;
  IF NOT FOUND OR d.estado IN ('despachada', 'anulada') THEN RAISE EXCEPTION 'El pedido no admite nueva reserva.'; END IF;
  RETURN public.wms_reservar_demanda(d.id);
END $f$;

-- Cola unificada de salida: OT (reservas existentes) + demandas de venta y custodia
CREATE OR REPLACE FUNCTION public.wms_cola_despachos(p_empresa_id text, p_almacen_id text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE v_alc uuid[]; v_ot jsonb; v_dem jsonb;
BEGIN
  PERFORM public.wms_exigir(p_empresa_id, 'ver', 'No tienes permiso para ver el inventario.');
  v_alc := public.usuario_alcance_sociedades(p_empresa_id);
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'fecha_requerida' NULLS LAST, x->>'numero'), '[]'::jsonb) INTO v_ot FROM (
    SELECT jsonb_build_object('id', o.id, 'canal', 'ot', 'numero', coalesce(o.numero, o.id), 'destino', 'Taller · ' || coalesce(o.numero, o.id),
      'almacen_id', min(r.almacen_id), 'fecha_requerida', coalesce(o.fecha_programada::text, o.created_at::date::text),
      'estado', 'reservada', 'lineas', jsonb_agg(jsonb_build_object(
        'linea_id', sr.id, 'material_id', sr.material_id, 'codigo', m.codigo, 'descripcion', m.descripcion, 'unidad', m.unidad,
        'pendiente', r.cantidad_reservada - r.cantidad_despachada - r.cantidad_liberada, 'ubicacion', u.codigo, 'almacen_id', r.almacen_id)
        ORDER BY u.codigo)) x
      FROM public.ot_segmento_repuestos_reservas r
      JOIN public.ordenes_trabajo o ON o.id = r.ot_id
      JOIN public.ot_segmento_repuestos sr ON sr.id = r.ot_segmento_repuesto_id
      JOIN public.materiales m ON m.id = r.material_id
      LEFT JOIN public.stock s ON s.id = r.stock_id
      LEFT JOIN public.ubicaciones u ON u.id = s.ubicacion_id
     WHERE r.empresa_id = p_empresa_id AND r.cantidad_reservada - r.cantidad_despachada - r.cantidad_liberada > 0
       AND o.estado IN ('programada', 'ejecucion')
       AND (p_almacen_id IS NULL OR r.almacen_id = p_almacen_id)
       AND (v_alc IS NULL OR o.sociedad_id = ANY (v_alc))
     GROUP BY o.id) q;
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'fecha_requerida' NULLS LAST, x->>'numero'), '[]'::jsonb) INTO v_dem FROM (
    SELECT jsonb_build_object('id', d.id, 'canal', d.canal, 'numero', d.numero, 'destino', d.destino, 'almacen_id', d.almacen_id,
      'origen_id', d.origen_id, 'cuenta_id', d.cuenta_id, 'fecha_requerida', d.fecha_requerida, 'estado', d.estado,
      'lineas', (SELECT jsonb_agg(jsonb_build_object('linea_id', l.id, 'material_id', l.material_id, 'codigo', m.codigo, 'descripcion', coalesce(l.descripcion, m.descripcion),
          'unidad', m.unidad, 'cantidad', l.cantidad, 'reservada', l.cantidad_reservada, 'despachada', l.cantidad_despachada, 'precio', l.precio_unitario,
          'ubicacion', (SELECT string_agg(DISTINCT u.codigo, ', ') FROM public.wms_demanda_reservas rv JOIN public.stock s ON s.id = rv.stock_id JOIN public.ubicaciones u ON u.id = s.ubicacion_id
                         WHERE rv.linea_id = l.id AND rv.cantidad - rv.cantidad_despachada - rv.cantidad_liberada > 0)) ORDER BY l.orden, l.id)
        FROM public.wms_demanda_lineas l JOIN public.materiales m ON m.id = l.material_id WHERE l.demanda_id = d.id)) x
      FROM public.wms_demandas d
     WHERE d.empresa_id = p_empresa_id AND d.estado IN ('pendiente', 'reservada', 'parcial')
       AND (p_almacen_id IS NULL OR d.almacen_id = p_almacen_id)
       AND (v_alc IS NULL OR d.sociedad_id = ANY (v_alc))) q;
  RETURN v_ot || v_dem;
END $f$;

-- ============================================================================
-- 8. Custodia de terceros
-- ============================================================================
CREATE OR REPLACE FUNCTION public.wms_custodia_asignar(p_empresa_id text, p_almacen_id text, p_cuenta_id text, p_ubicaciones text[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE u record; n integer := 0;
BEGIN
  PERFORM public.wms_exigir(p_empresa_id, 'editar', 'No tienes permiso para asignar posiciones.');
  IF NOT EXISTS (SELECT 1 FROM public.almacenes a WHERE a.id = p_almacen_id AND a.empresa_id = p_empresa_id AND a.proposito = 'custodia') THEN
    RAISE EXCEPTION 'El almacén debe tener propósito «Custodia de terceros».';
  END IF;
  IF p_cuenta_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.cuentas c WHERE c.id = p_cuenta_id AND c.empresa_id = p_empresa_id) THEN
    RAISE EXCEPTION 'El cliente no existe en esta empresa.';
  END IF;
  FOR u IN SELECT * FROM public.ubicaciones WHERE almacen_id = p_almacen_id AND id = ANY (p_ubicaciones) FOR UPDATE LOOP
    IF u.es_general THEN RAISE EXCEPTION 'La ubicación General no se asigna a clientes.'; END IF;
    IF u.propietario_cuenta_id IS DISTINCT FROM p_cuenta_id AND EXISTS (SELECT 1 FROM public.stock s WHERE s.ubicacion_id = u.id AND (s.fisico > 0 OR s.reservado > 0)) THEN
      RAISE EXCEPTION 'La posición % tiene mercadería; no se puede cambiar de dueño.', u.codigo;
    END IF;
    UPDATE public.ubicaciones SET propietario_cuenta_id = p_cuenta_id, updated_at = now() WHERE id = u.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END $f$;

CREATE OR REPLACE FUNCTION public.wms_custodia_guardar_tarifa(p_empresa_id text, p_cuenta_id text, p_almacen_id text, p_tarifa_posicion_dia numeric, p_tarifa_movimiento numeric, p_moneda text DEFAULT 'PEN')
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE v_id text;
BEGIN
  PERFORM public.wms_exigir(p_empresa_id, 'editar', 'No tienes permiso para editar tarifas de custodia.');
  IF NOT EXISTS (SELECT 1 FROM public.cuentas c WHERE c.id = p_cuenta_id AND c.empresa_id = p_empresa_id)
     OR NOT EXISTS (SELECT 1 FROM public.almacenes a WHERE a.id = p_almacen_id AND a.empresa_id = p_empresa_id AND a.proposito = 'custodia') THEN
    RAISE EXCEPTION 'Cliente o almacén de custodia no válido.';
  END IF;
  INSERT INTO public.custodia_tarifas (empresa_id, cuenta_id, almacen_id, tarifa_posicion_dia, tarifa_movimiento, moneda)
  VALUES (p_empresa_id, p_cuenta_id, p_almacen_id, round(coalesce(p_tarifa_posicion_dia, 0), 2), round(coalesce(p_tarifa_movimiento, 0), 2), coalesce(p_moneda, 'PEN'))
  ON CONFLICT (empresa_id, cuenta_id, almacen_id) DO UPDATE SET tarifa_posicion_dia = EXCLUDED.tarifa_posicion_dia,
    tarifa_movimiento = EXCLUDED.tarifa_movimiento, moneda = EXCLUDED.moneda, activo = true, updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END $f$;

CREATE OR REPLACE FUNCTION public.wms_custodia_ingreso(p_empresa_id text, p_ubicacion_id text, p_material_id text, p_cantidad numeric, p_sociedad_id uuid, p_documento text DEFAULT NULL, p_observacion text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE u public.ubicaciones%rowtype; v_kid text; v_cliente text;
BEGIN
  PERFORM public.wms_exigir(p_empresa_id, 'crear', 'No tienes permiso para registrar ingresos.');
  SELECT * INTO u FROM public.ubicaciones WHERE id = p_ubicacion_id AND empresa_id = p_empresa_id;
  IF NOT FOUND OR u.propietario_cuenta_id IS NULL THEN RAISE EXCEPTION 'La posición no está asignada a un cliente de custodia.'; END IF;
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN RAISE EXCEPTION 'La cantidad debe ser mayor a cero.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.materiales m WHERE m.id = p_material_id AND m.empresa_id = p_empresa_id) THEN RAISE EXCEPTION 'El material no existe.'; END IF;
  SELECT razon_social INTO v_cliente FROM public.cuentas WHERE id = u.propietario_cuenta_id;
  v_kid := public.wms_nuevo_kardex_id();
  PERFORM public.registrar_movimiento_atomico(
    p_kardex_id := v_kid, p_empresa_id := p_empresa_id, p_material_id := p_material_id, p_almacen_id := u.almacen_id,
    p_sociedad_id := p_sociedad_id, p_tipo := 'entrada', p_motivo := 'ingreso_custodia', p_cantidad := p_cantidad, p_costo_unitario := 0,
    p_costo_unitario_usd := 0, p_moneda := 'PEN', p_lote := NULL, p_serie := NULL, p_vencimiento := NULL,
    p_referencia_tipo := 'custodia', p_referencia_id := u.propietario_cuenta_id, p_nro_documento := nullif(btrim(coalesce(p_documento, '')), ''),
    p_observacion := 'Ingreso de custodia · ' || coalesce(v_cliente, '') || coalesce(' · ' || nullif(btrim(coalesce(p_observacion, '')), ''), ''),
    p_usuario_id := auth.uid(), p_ubicacion_id := u.id, p_skip_costo_promedio := true);
  RETURN v_kid;
END $f$;

CREATE OR REPLACE FUNCTION public.wms_custodia_crear_retiro(p_empresa_id text, p_almacen_id text, p_cuenta_id text, p_sociedad_id uuid, p_lineas jsonb, p_fecha date DEFAULT NULL, p_observacion text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE v_dem text; v_n integer; v_cliente text; it jsonb; v_orden integer := 0;
BEGIN
  PERFORM public.wms_exigir(p_empresa_id, 'crear', 'No tienes permiso para registrar retiros.');
  SELECT razon_social INTO v_cliente FROM public.cuentas WHERE id = p_cuenta_id AND empresa_id = p_empresa_id;
  IF v_cliente IS NULL THEN RAISE EXCEPTION 'El cliente no existe.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.almacenes a WHERE a.id = p_almacen_id AND a.empresa_id = p_empresa_id AND a.proposito = 'custodia') THEN RAISE EXCEPTION 'Almacén de custodia no válido.'; END IF;
  IF p_lineas IS NULL OR jsonb_array_length(p_lineas) = 0 THEN RAISE EXCEPTION 'Indica al menos un material a retirar.'; END IF;
  v_n := public.wms_siguiente_numero(p_empresa_id, 'retiro_custodia', 'CUS', NULL);
  INSERT INTO public.wms_demandas (empresa_id, sociedad_id, almacen_id, canal, numero, origen_tipo, cuenta_id, destino, fecha_requerida, observacion, created_by)
  VALUES (p_empresa_id, p_sociedad_id, p_almacen_id, 'custodia', 'CUS-' || to_char(current_date, 'YY') || '-' || lpad(v_n::text, 4, '0'), 'retiro_custodia', p_cuenta_id,
          'Retiro de ' || v_cliente, coalesce(p_fecha, current_date), nullif(btrim(coalesce(p_observacion, '')), ''), auth.uid())
  RETURNING id INTO v_dem;
  FOR it IN SELECT * FROM jsonb_array_elements(p_lineas) LOOP
    v_orden := v_orden + 1;
    INSERT INTO public.wms_demanda_lineas (demanda_id, empresa_id, material_id, cantidad, orden)
    VALUES (v_dem, p_empresa_id, it->>'material_id', (it->>'cantidad')::numeric, v_orden);
  END LOOP;
  RETURN public.wms_reservar_demanda(v_dem);
END $f$;

CREATE OR REPLACE FUNCTION public.wms_custodia_liquidacion(p_empresa_id text, p_cuenta_id text, p_almacen_id text, p_desde date, p_hasta date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE t public.custodia_tarifas%rowtype; v_pd numeric := 0; v_mov integer := 0; v_dias jsonb;
BEGIN
  PERFORM public.wms_exigir(p_empresa_id, 'ver', 'No tienes permiso para ver el inventario.');
  IF p_hasta < p_desde THEN RAISE EXCEPTION 'El rango de fechas no es válido.'; END IF;
  SELECT * INTO t FROM public.custodia_tarifas WHERE empresa_id = p_empresa_id AND cuenta_id = p_cuenta_id AND almacen_id = p_almacen_id;
  -- Posiciones ocupadas por día: saldo de cada posición del cliente al cierre de cada día (saldo actual menos movimientos posteriores)
  WITH dias AS (SELECT generate_series(p_desde, p_hasta, interval '1 day')::date AS dia),
  pos AS (SELECT u.id FROM public.ubicaciones u WHERE u.almacen_id = p_almacen_id AND u.propietario_cuenta_id = p_cuenta_id),
  saldo AS (SELECT s.ubicacion_id, sum(s.fisico) AS fisico FROM public.stock s WHERE s.ubicacion_id IN (SELECT id FROM pos) GROUP BY 1),
  movs AS (SELECT k.ubicacion_id, k.fecha, CASE WHEN k.tipo ILIKE '%salida%' THEN -abs(k.cantidad) ELSE abs(k.cantidad) END AS delta
             FROM public.kardex k WHERE k.ubicacion_id IN (SELECT id FROM pos) AND NOT coalesce(k.anulado, false) AND k.fecha > p_desde::timestamptz),
  ocup AS (SELECT d.dia, p.id, coalesce(sa.fisico, 0) - coalesce((SELECT sum(m.delta) FROM movs m WHERE m.ubicacion_id = p.id AND m.fecha >= (d.dia + 1)::timestamptz), 0) AS saldo
             FROM dias d CROSS JOIN pos p LEFT JOIN saldo sa ON sa.ubicacion_id = p.id)
  SELECT coalesce(jsonb_agg(jsonb_build_object('dia', dia, 'ocupadas', n) ORDER BY dia), '[]'::jsonb), coalesce(sum(n), 0)
    INTO v_dias, v_pd
    FROM (SELECT dia, count(*) FILTER (WHERE saldo > 0) AS n FROM ocup GROUP BY dia) z;
  SELECT count(*) INTO v_mov FROM public.kardex k JOIN public.ubicaciones u ON u.id = k.ubicacion_id
   WHERE u.almacen_id = p_almacen_id AND u.propietario_cuenta_id = p_cuenta_id AND NOT coalesce(k.anulado, false)
     AND k.motivo IN ('ingreso_custodia', 'salida_custodia') AND k.fecha >= p_desde::timestamptz AND k.fecha < (p_hasta + 1)::timestamptz;
  RETURN jsonb_build_object('posiciones_dia', v_pd, 'movimientos', v_mov,
    'tarifa_posicion_dia', coalesce(t.tarifa_posicion_dia, 0), 'tarifa_movimiento', coalesce(t.tarifa_movimiento, 0), 'moneda', coalesce(t.moneda, 'PEN'),
    'importe_almacenaje', round(v_pd * coalesce(t.tarifa_posicion_dia, 0), 2), 'importe_movimientos', round(v_mov * coalesce(t.tarifa_movimiento, 0), 2),
    'importe', round(v_pd * coalesce(t.tarifa_posicion_dia, 0), 2) + round(v_mov * coalesce(t.tarifa_movimiento, 0), 2), 'dias', v_dias,
    'liquidacion', (SELECT to_jsonb(l) FROM public.custodia_liquidaciones l WHERE l.empresa_id = p_empresa_id AND l.cuenta_id = p_cuenta_id AND l.almacen_id = p_almacen_id AND l.desde = p_desde AND l.hasta = p_hasta));
END $f$;

CREATE OR REPLACE FUNCTION public.wms_custodia_enviar_ventas(p_empresa_id text, p_cuenta_id text, p_almacen_id text, p_desde date, p_hasta date, p_sociedad_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE liq jsonb; v_cliente text; v_venta jsonb; v_items jsonb := '[]'::jsonb; v_id text;
BEGIN
  PERFORM public.wms_exigir(p_empresa_id, 'ver', 'No tienes permiso para ver el inventario.');
  IF EXISTS (SELECT 1 FROM public.custodia_liquidaciones l WHERE l.empresa_id = p_empresa_id AND l.cuenta_id = p_cuenta_id AND l.almacen_id = p_almacen_id AND l.desde = p_desde AND l.hasta = p_hasta) THEN
    RAISE EXCEPTION 'Este período ya se envió a Ventas.';
  END IF;
  liq := public.wms_custodia_liquidacion(p_empresa_id, p_cuenta_id, p_almacen_id, p_desde, p_hasta);
  IF (liq->>'importe')::numeric <= 0 THEN RAISE EXCEPTION 'No hay importe por liquidar en el período (revisa la tarifa y la ocupación).'; END IF;
  SELECT razon_social INTO v_cliente FROM public.cuentas WHERE id = p_cuenta_id AND empresa_id = p_empresa_id;
  IF (liq->>'importe_almacenaje')::numeric > 0 THEN
    v_items := v_items || jsonb_build_object('descripcion', 'Almacenaje: ' || (liq->>'posiciones_dia') || ' posiciones-día', 'cantidad', (liq->>'posiciones_dia')::numeric, 'precio_unitario', (liq->>'tarifa_posicion_dia')::numeric, 'afecto_igv', true);
  END IF;
  IF (liq->>'importe_movimientos')::numeric > 0 THEN
    v_items := v_items || jsonb_build_object('descripcion', 'Movimientos de ingreso y salida', 'cantidad', (liq->>'movimientos')::numeric, 'precio_unitario', (liq->>'tarifa_movimiento')::numeric, 'afecto_igv', true);
  END IF;
  v_venta := public.venta_guardar(p_empresa_id,
    jsonb_build_object('tipo_venta', 'con_comprobante', 'moneda', liq->>'moneda', 'condicion_pago', 'contado', 'sociedad_id', p_sociedad_id,
      'cuenta_id', p_cuenta_id, 'cliente_nombre_snapshot', v_cliente, 'tipo_comprobante_previsto', 'factura',
      'concepto', 'Servicio de almacenaje del ' || to_char(p_desde, 'DD/MM/YYYY') || ' al ' || to_char(p_hasta, 'DD/MM/YYYY')),
    v_items);
  v_id := coalesce(v_venta->>'id', v_venta->'venta'->>'id');
  INSERT INTO public.custodia_liquidaciones (empresa_id, cuenta_id, almacen_id, desde, hasta, posiciones_dia, movimientos, importe, moneda, venta_id, created_by)
  VALUES (p_empresa_id, p_cuenta_id, p_almacen_id, p_desde, p_hasta, (liq->>'posiciones_dia')::numeric, (liq->>'movimientos')::integer, (liq->>'importe')::numeric, liq->>'moneda', v_id, auth.uid());
  RETURN jsonb_build_object('venta_id', v_id, 'importe', liq->'importe');
END $f$;

-- ============================================================================
-- 9. Conteos
-- ============================================================================
CREATE OR REPLACE FUNCTION public.wms_iniciar_conteo(p_empresa_id text, p_almacen_id text, p_sociedad_id uuid, p_tipo text, p_nombre text,
  p_ubicacion_prefijo text DEFAULT NULL, p_clase text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE v_id text; v_cod text; v_n integer; v_items jsonb;
BEGIN
  PERFORM public.wms_exigir(p_empresa_id, 'crear', 'No tienes permiso para iniciar conteos.');
  IF p_tipo NOT IN ('ciclico', 'zona', 'total') THEN RAISE EXCEPTION 'Tipo de conteo no válido.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.almacenes a WHERE a.id = p_almacen_id AND a.empresa_id = p_empresa_id) THEN RAISE EXCEPTION 'Almacén no válido.'; END IF;
  WITH consumo AS (
    SELECT k.material_id, sum(abs(k.cantidad) * coalesce(k.costo_unitario, 0)) AS valor FROM public.kardex k
     WHERE k.empresa_id = p_empresa_id AND k.almacen_id = p_almacen_id AND k.tipo = 'salida' AND NOT coalesce(k.anulado, false) AND k.fecha > now() - interval '365 days'
     GROUP BY 1),
  abc AS (SELECT material_id, CASE WHEN acum <= 0.8 THEN 'A' WHEN acum <= 0.95 THEN 'B' ELSE 'C' END AS clase
            FROM (SELECT material_id, sum(valor) OVER (ORDER BY valor DESC, material_id) / nullif(sum(valor) OVER (), 0) AS acum FROM consumo) z),
  filas AS (
    SELECT s.material_id, s.almacen_id, s.ubicacion_id, u.codigo AS ucod, u.nombre AS unom, s.fisico, s.lote, s.serie, s.vencimiento,
           m.codigo, m.descripcion, m.unidad, m.familia, m.tipo_control, coalesce(m.costo_promedio, 0) AS costo, coalesce(abc.clase, 'C') AS clase
      FROM public.stock s JOIN public.materiales m ON m.id = s.material_id JOIN public.ubicaciones u ON u.id = s.ubicacion_id
      LEFT JOIN abc ON abc.material_id = s.material_id
     WHERE s.empresa_id = p_empresa_id AND s.almacen_id = p_almacen_id AND s.sociedad_id IS NOT DISTINCT FROM p_sociedad_id
       AND (s.fisico > 0 OR s.reservado > 0)
       AND (p_ubicacion_prefijo IS NULL OR u.codigo ILIKE p_ubicacion_prefijo || '%')
       AND (p_clase IS NULL OR coalesce(abc.clase, 'C') = p_clase))
  SELECT coalesce(jsonb_agg(jsonb_build_object('material_id', material_id, 'almacen_id', almacen_id, 'sku', codigo, 'nombre', descripcion,
    'categoria', coalesce(familia, 'General'), 'unidad', coalesce(unidad, 'und'), 'ubicacion_id', ubicacion_id, 'ubicacion_codigo', ucod, 'ubicacion_nombre', unom,
    'tipo_control', coalesce(tipo_control, 'sin_control'), 'teorico', fisico, 'fisico', NULL, 'diferencia', NULL, 'lote', lote, 'serie', serie,
    'vencimiento', vencimiento, 'costo', costo, 'clase', clase) ORDER BY ucod, codigo), '[]'::jsonb) INTO v_items FROM filas;
  IF jsonb_array_length(v_items) = 0 THEN RAISE EXCEPTION 'No hay stock que contar con ese filtro.'; END IF;
  v_n := public.wms_siguiente_numero(p_empresa_id, 'conteo_inventario', 'CNT', NULL);
  v_cod := 'CNT-' || to_char(current_date, 'YYYY') || '-' || lpad(v_n::text, 4, '0');
  WHILE EXISTS (SELECT 1 FROM public.inventario_conteos WHERE empresa_id = p_empresa_id AND codigo = v_cod) LOOP
    v_n := public.wms_siguiente_numero(p_empresa_id, 'conteo_inventario', 'CNT', NULL);
    v_cod := 'CNT-' || to_char(current_date, 'YYYY') || '-' || lpad(v_n::text, 4, '0');
  END LOOP;
  v_id := 'cnt_' || replace(gen_random_uuid()::text, '-', '');
  INSERT INTO public.inventario_conteos (id, empresa_id, sociedad_id, codigo, nombre, tipo, almacen_id, zona, estado, items, ajustes_generados, creado_por, created_at, updated_at)
  VALUES (v_id, p_empresa_id, p_sociedad_id, v_cod, coalesce(nullif(btrim(coalesce(p_nombre, '')), ''), v_cod), p_tipo, p_almacen_id,
          nullif(btrim(coalesce(p_ubicacion_prefijo, '')), ''), 'en_proceso', v_items, false, auth.uid(), now(), now());
  RETURN jsonb_build_object('id', v_id, 'codigo', v_cod, 'items', jsonb_array_length(v_items));
END $f$;

CREATE OR REPLACE FUNCTION public.wms_guardar_conteo(p_empresa_id text, p_conteo_id text, p_contados jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE c public.inventario_conteos%rowtype; v_items jsonb; x jsonb; v_i integer; v_f numeric;
BEGIN
  PERFORM public.wms_exigir(p_empresa_id, 'crear', 'No tienes permiso para registrar conteos.');
  SELECT * INTO c FROM public.inventario_conteos WHERE id = p_conteo_id AND empresa_id = p_empresa_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conteo no encontrado.'; END IF;
  IF c.estado <> 'en_proceso' THEN RAISE EXCEPTION 'El conteo ya no admite cambios (estado %).', c.estado; END IF;
  v_items := c.items;
  FOR x IN SELECT * FROM jsonb_array_elements(coalesce(p_contados, '[]'::jsonb)) LOOP
    v_i := (x->>'idx')::integer;
    IF v_i < 0 OR v_i >= jsonb_array_length(v_items) THEN RAISE EXCEPTION 'Línea de conteo no válida.'; END IF;
    v_f := nullif(x->>'fisico', '')::numeric;
    IF v_f IS NOT NULL AND v_f < 0 THEN RAISE EXCEPTION 'La cantidad contada no puede ser negativa.'; END IF;
    v_items := jsonb_set(v_items, ARRAY[v_i::text, 'fisico'], coalesce(to_jsonb(v_f), 'null'::jsonb));
    v_items := jsonb_set(v_items, ARRAY[v_i::text, 'diferencia'],
      CASE WHEN v_f IS NULL THEN 'null'::jsonb ELSE to_jsonb(v_f - (v_items->v_i->>'teorico')::numeric) END);
  END LOOP;
  UPDATE public.inventario_conteos SET items = v_items, updated_at = now() WHERE id = c.id;
  RETURN jsonb_build_object('id', c.id);
END $f$;

CREATE OR REPLACE FUNCTION public.wms_aplicar_ajustes_conteo(p_conteo_id text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE c public.inventario_conteos%rowtype; x jsonb; v_d numeric; n integer := 0; v_kid text;
BEGIN
  SELECT * INTO c FROM public.inventario_conteos WHERE id = p_conteo_id FOR UPDATE;
  FOR x IN SELECT * FROM jsonb_array_elements(c.items) LOOP
    v_d := nullif(x->>'diferencia', '')::numeric;
    IF v_d IS NULL OR v_d = 0 THEN CONTINUE; END IF;
    v_kid := public.wms_nuevo_kardex_id();
    PERFORM public.registrar_movimiento_atomico(
      p_kardex_id := v_kid, p_empresa_id := c.empresa_id, p_material_id := x->>'material_id', p_almacen_id := x->>'almacen_id',
      p_sociedad_id := c.sociedad_id, p_tipo := CASE WHEN v_d > 0 THEN 'entrada' ELSE 'salida' END, p_motivo := 'ajuste_conteo',
      p_cantidad := abs(v_d), p_costo_unitario := coalesce((x->>'costo')::numeric, 0), p_costo_unitario_usd := 0, p_moneda := 'PEN',
      p_lote := x->>'lote', p_serie := x->>'serie', p_vencimiento := nullif(x->>'vencimiento', '')::date,
      p_referencia_tipo := 'conteo', p_referencia_id := c.id, p_nro_documento := c.codigo,
      p_observacion := 'Ajuste por conteo ' || c.codigo, p_usuario_id := auth.uid(), p_ubicacion_id := x->>'ubicacion_id', p_skip_costo_promedio := true);
    n := n + 1;
  END LOOP;
  RETURN n;
END $f$;
REVOKE ALL ON FUNCTION public.wms_aplicar_ajustes_conteo(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.wms_cerrar_conteo(p_empresa_id text, p_conteo_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE c public.inventario_conteos%rowtype; v_valor numeric; v_umbral numeric; v_faltan integer; n integer;
BEGIN
  PERFORM public.wms_exigir(p_empresa_id, 'crear', 'No tienes permiso para cerrar conteos.');
  SELECT * INTO c FROM public.inventario_conteos WHERE id = p_conteo_id AND empresa_id = p_empresa_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conteo no encontrado.'; END IF;
  IF c.estado <> 'en_proceso' THEN RAISE EXCEPTION 'El conteo ya no está en proceso.'; END IF;
  SELECT count(*) FILTER (WHERE x->>'fisico' IS NULL OR x->'fisico' = 'null'::jsonb),
         coalesce(sum(abs(coalesce(nullif(x->>'diferencia', '')::numeric, 0)) * coalesce((x->>'costo')::numeric, 0)), 0)
    INTO v_faltan, v_valor FROM jsonb_array_elements(c.items) x;
  IF v_faltan > 0 THEN RAISE EXCEPTION 'Faltan % líneas por contar.', v_faltan; END IF;
  SELECT coalesce(umbral_aprobacion_ajuste, 500) INTO v_umbral FROM public.empresa_wms_config WHERE empresa_id = p_empresa_id;
  v_umbral := coalesce(v_umbral, 500);
  IF v_valor > v_umbral THEN
    UPDATE public.inventario_conteos SET estado = 'por_aprobar', cerrado_por = auth.uid(), updated_at = now() WHERE id = c.id;
    RETURN jsonb_build_object('estado', 'por_aprobar', 'valor_diferencias', round(v_valor, 2), 'umbral', v_umbral);
  END IF;
  n := public.wms_aplicar_ajustes_conteo(c.id);
  UPDATE public.inventario_conteos SET estado = 'cerrado', ajustes_generados = true, cerrado_por = auth.uid(), cerrado_at = now(), updated_at = now() WHERE id = c.id;
  RETURN jsonb_build_object('estado', 'cerrado', 'ajustes', n, 'valor_diferencias', round(v_valor, 2));
END $f$;

CREATE OR REPLACE FUNCTION public.wms_aprobar_conteo(p_empresa_id text, p_conteo_id text, p_aprobar boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE c public.inventario_conteos%rowtype; n integer;
BEGIN
  PERFORM public.wms_exigir(p_empresa_id, 'editar', 'No tienes permiso para aprobar ajustes de inventario.');
  SELECT * INTO c FROM public.inventario_conteos WHERE id = p_conteo_id AND empresa_id = p_empresa_id FOR UPDATE;
  IF NOT FOUND OR c.estado <> 'por_aprobar' THEN RAISE EXCEPTION 'El conteo no está pendiente de aprobación.'; END IF;
  IF c.cerrado_por = auth.uid() THEN RAISE EXCEPTION 'Quien cerró el conteo no puede aprobar sus propios ajustes.'; END IF;
  IF NOT p_aprobar THEN
    UPDATE public.inventario_conteos SET estado = 'en_proceso', updated_at = now() WHERE id = c.id;
    RETURN jsonb_build_object('estado', 'en_proceso');
  END IF;
  n := public.wms_aplicar_ajustes_conteo(c.id);
  UPDATE public.inventario_conteos SET estado = 'cerrado', ajustes_generados = true, cerrado_at = now(), updated_at = now() WHERE id = c.id;
  RETURN jsonb_build_object('estado', 'cerrado', 'ajustes', n);
END $f$;

-- ============================================================================
-- 10. Reserva de OT: no toma stock de almacenes de venta/custodia ni de posiciones de terceros o en cuarentena
-- ============================================================================
DO $m$
DECLARE
  v_def text := pg_get_functiondef('public.procesar_reserva_repuestos_ot(text)'::regprocedure);
  v_viejo text := E'           a.clase = ''central''\n           or (a.clase = ''periferico'' and v_mina_id is not null and a.mina_id = v_mina_id)\n         )\n';
BEGIN
  IF position('proposito' IN v_def) > 0 THEN RETURN; END IF;
  IF position(v_viejo IN v_def) = 0 THEN RAISE EXCEPTION 'procesar_reserva_repuestos_ot no coincide con la versión esperada'; END IF;
  v_def := replace(v_def, v_viejo, v_viejo
    || E'         and coalesce(a.proposito, ''consumo_interno'') in (''consumo_interno'', ''mixto'')\n'
    || E'         and not exists (select 1 from public.ubicaciones ux where ux.id = s.ubicacion_id and (ux.propietario_cuenta_id is not null or ux.uso in (''cuarentena'', ''merma'')))\n');
  EXECUTE v_def;
END $m$;

-- ============================================================================
-- Permisos de ejecución
-- ============================================================================
DO $g$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'wms_guardar_configuracion(text,jsonb,numeric,jsonb)', 'wms_guardar_parametros(text,jsonb)',
    'wms_confirmar_orden_venta(text,text)', 'wms_anular_orden_venta(text,text,text)',
    'wms_despachar_demanda(text,text,jsonb,jsonb)', 'wms_reintentar_reserva(text,text)', 'wms_cola_despachos(text,text)',
    'wms_custodia_asignar(text,text,text,text[])', 'wms_custodia_guardar_tarifa(text,text,text,numeric,numeric,text)',
    'wms_custodia_ingreso(text,text,text,numeric,uuid,text,text)', 'wms_custodia_crear_retiro(text,text,text,uuid,jsonb,date,text)',
    'wms_custodia_liquidacion(text,text,text,date,date)', 'wms_custodia_enviar_ventas(text,text,text,date,date,uuid)',
    'wms_iniciar_conteo(text,text,uuid,text,text,text,text)', 'wms_guardar_conteo(text,text,jsonb)',
    'wms_cerrar_conteo(text,text)', 'wms_aprobar_conteo(text,text,boolean)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', f);
  END LOOP;
  FOREACH f IN ARRAY ARRAY['wms_exigir(text,text,text)', 'wms_nuevo_kardex_id()', 'wms_siguiente_numero(text,text,text,uuid)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
END $g$;

-- ============================================================================
-- Comprobación
-- ============================================================================
DO $chk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'almacenes' AND column_name = 'proposito') THEN RAISE EXCEPTION 'falta almacenes.proposito'; END IF;
  IF EXISTS (SELECT 1 FROM public.almacenes WHERE proposito <> 'consumo_interno') THEN RAISE EXCEPTION 'los almacenes existentes deben nacer como consumo_interno'; END IF;
  IF to_regclass('public.wms_demandas') IS NULL OR to_regclass('public.material_almacen_parametros') IS NULL OR to_regclass('public.custodia_tarifas') IS NULL THEN RAISE EXCEPTION 'faltan tablas'; END IF;
  IF position('proposito' IN pg_get_functiondef('public.procesar_reserva_repuestos_ot(text)'::regprocedure)) = 0 THEN RAISE EXCEPTION 'no se ajustó procesar_reserva_repuestos_ot'; END IF;
  IF has_function_privilege('anon', 'public.wms_despachar_demanda(text,text,jsonb,jsonb)', 'execute') THEN RAISE EXCEPTION 'anon no debe ejecutar'; END IF;
END $chk$;
