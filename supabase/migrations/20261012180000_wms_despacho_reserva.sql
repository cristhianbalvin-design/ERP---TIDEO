-- WMS Fase 2b-C: despacho a taller que consume la reserva de repuestos de una OT,
-- liberación de reserva y conciliación con el cierre técnico.
--
-- Cambios:
--  1. ot_segmento_repuestos_reservas: cantidad_despachada / cantidad_liberada.
--  2. ot_segmento_repuestos: estados despachado_parcial, despachado, liberado.
--  3. ot_segmento_repuestos_acciones: bitácora de despachos y liberaciones.
--  4. usuario_puede: acciones 'despachar' y 'liberar' leídas de permisos_extra
--     (puede_despachar / puede_liberar) de la fila de la pantalla.
--  5. registrar_movimiento_atomico (guardián): motivo despacho_taller (solo salida,
--     exige inventario/despachar).
--  6. RPC wms_reservas_ot (lectura), wms_despachar_reserva_ot, wms_liberar_reserva_ot
--     y wms_conciliar_cierre_ot.
--
-- Las funciones 4 y 5 se parchean sobre la definición vigente (pg_get_functiondef)
-- con anclas verificadas: si el cuerpo remoto cambió, la migración aborta.

-- 1. Cantidades por reserva -------------------------------------------------
ALTER TABLE public.ot_segmento_repuestos_reservas
  ADD COLUMN IF NOT EXISTS cantidad_despachada numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cantidad_liberada   numeric(14,2) NOT NULL DEFAULT 0;

ALTER TABLE public.ot_segmento_repuestos_reservas
  DROP CONSTRAINT IF EXISTS ot_segmento_repuestos_reservas_consumo_check;
ALTER TABLE public.ot_segmento_repuestos_reservas
  ADD CONSTRAINT ot_segmento_repuestos_reservas_consumo_check
  CHECK (cantidad_despachada >= 0 AND cantidad_liberada >= 0
         AND cantidad_despachada + cantidad_liberada <= cantidad_reservada);

-- 2. Estados de línea -------------------------------------------------------
ALTER TABLE public.ot_segmento_repuestos
  DROP CONSTRAINT IF EXISTS ot_segmento_repuestos_estado_check;
ALTER TABLE public.ot_segmento_repuestos
  ADD CONSTRAINT ot_segmento_repuestos_estado_check
  CHECK (estado = ANY (ARRAY['estimado','reservado','reservado_parcial_solpe',
    'despachado_parcial','despachado','liberado','consumido','anulado']::text[]));

-- 3. Bitácora ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ot_segmento_repuestos_acciones (
  id text PRIMARY KEY DEFAULT ('acc_' || substr(replace(gen_random_uuid()::text,'-',''),1,18)),
  empresa_id text NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  sociedad_id uuid REFERENCES public.sociedades(id) ON DELETE SET NULL,
  ot_id text NOT NULL REFERENCES public.ordenes_trabajo(id) ON DELETE CASCADE,
  ot_segmento_repuesto_id text NOT NULL REFERENCES public.ot_segmento_repuestos(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('despacho','liberacion','cierre_ot')),
  cantidad numeric(14,2) NOT NULL CHECK (cantidad > 0),
  motivo text,
  recibe_en_taller text,
  observacion text,
  kardex_ids text[] NOT NULL DEFAULT '{}',
  usuario_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ot_segmento_repuestos_acciones_ot_idx
  ON public.ot_segmento_repuestos_acciones (empresa_id, ot_id, created_at DESC);
ALTER TABLE public.ot_segmento_repuestos_acciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ops_ot_segmento_repuestos_acciones_select ON public.ot_segmento_repuestos_acciones;
CREATE POLICY ops_ot_segmento_repuestos_acciones_select ON public.ot_segmento_repuestos_acciones
  FOR SELECT TO authenticated
  USING (public.usuario_tiene_empresa(empresa_id)
         AND public.usuario_puede(empresa_id, 'inventario', 'ver')
         AND (public.usuario_alcance_sociedades(empresa_id) IS NULL
              OR sociedad_id = ANY (public.usuario_alcance_sociedades(empresa_id))));
REVOKE ALL ON public.ot_segmento_repuestos_acciones FROM PUBLIC, anon;
GRANT SELECT ON public.ot_segmento_repuestos_acciones TO authenticated;
GRANT ALL ON public.ot_segmento_repuestos_acciones TO service_role;

-- 4. usuario_puede: despachar / liberar ------------------------------------
DO $patch_puede$
DECLARE
  v_oid oid := 'public.usuario_puede(text,text,text)'::regprocedure;
  v_def text := pg_get_functiondef(v_oid);
  v_anchor text := 'else false';
  v_new text;
BEGIN
  IF v_def LIKE '%puede_despachar%' THEN RETURN; END IF;
  IF (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 THEN
    RAISE EXCEPTION 'usuario_puede cambió: ancla "else false" no es única.';
  END IF;
  v_new := replace(v_def, v_anchor,
    E'when ''despachar'' then coalesce(pr.permisos_extra->>''puede_despachar'','''') = ''true''\n' ||
    E'          when ''liberar'' then coalesce(pr.permisos_extra->>''puede_liberar'','''') = ''true''\n' ||
    E'          else false');
  EXECUTE v_new;
END
$patch_puede$;

-- 5. Guardián: motivo despacho_taller --------------------------------------
DO $patch_guardian$
DECLARE
  v_oid oid := 'public.registrar_movimiento_atomico(text,text,text,text,uuid,text,text,numeric,numeric,numeric,text,text,text,date,text,text,text,text,text,uuid,text,text,integer,numeric,numeric,text,boolean,text)'::regprocedure;
  v_def text := pg_get_functiondef(v_oid);
  v_a1 text := '''devolucion_proveedor'',''consumo_ot'',''despacho_guia''';
  v_a2 text := E'    ELSIF p_motivo IN (''despacho_guia'',''transferencia_guia'',''transferencia'')';
  v_new text;
BEGIN
  IF v_def LIKE '%despacho_taller%' THEN RETURN; END IF;
  IF (length(v_def) - length(replace(v_def, v_a1, ''))) / length(v_a1) <> 1
     OR (length(v_def) - length(replace(v_def, v_a2, ''))) / length(v_a2) <> 1 THEN
    RAISE EXCEPTION 'El guardián cambió: anclas no únicas.';
  END IF;
  v_new := replace(v_def, v_a1, '''devolucion_proveedor'',''consumo_ot'',''despacho_guia'',''despacho_taller''');
  v_new := replace(v_new, v_a2,
    E'    ELSIF p_motivo = ''despacho_taller'' THEN\n' ||
    E'      IF NOT public.usuario_puede(p_empresa_id, ''inventario'', ''despachar'') THEN\n' ||
    E'        RAISE EXCEPTION ''No tienes permiso para despachar repuestos a taller.'' USING ERRCODE=''42501'';\n' ||
    E'      END IF;\n' || v_a2);
  EXECUTE v_new;
END
$patch_guardian$;

-- Helper interno: recalcula el estado de una línea ---------------------------
CREATE OR REPLACE FUNCTION public.wms_recalcular_estado_linea_repuesto(p_linea_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_est numeric; v_estado text; v_res numeric; v_desp numeric; v_lib numeric; v_pend numeric; v_nuevo text;
BEGIN
  SELECT l.cantidad_estimada, l.estado INTO v_est, v_estado
    FROM public.ot_segmento_repuestos l WHERE l.id = p_linea_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT coalesce(sum(r.cantidad_reservada),0), coalesce(sum(r.cantidad_despachada),0), coalesce(sum(r.cantidad_liberada),0)
    INTO v_res, v_desp, v_lib FROM public.ot_segmento_repuestos_reservas r WHERE r.ot_segmento_repuesto_id = p_linea_id;
  IF v_res = 0 THEN RETURN v_estado; END IF;
  v_pend := v_res - v_desp - v_lib;
  IF v_pend > 0 THEN
    IF v_desp > 0 THEN v_nuevo := 'despachado_parcial';
    ELSIF v_estado IN ('despachado_parcial','despachado','liberado') THEN
      v_nuevo := CASE WHEN v_res < v_est THEN 'reservado_parcial_solpe' ELSE 'reservado' END;
    ELSE v_nuevo := v_estado; END IF;
  ELSE
    IF v_desp >= v_est THEN v_nuevo := 'despachado';
    ELSIF v_desp > 0 THEN v_nuevo := 'despachado_parcial';
    ELSE v_nuevo := 'liberado'; END IF;
  END IF;
  IF v_nuevo IS DISTINCT FROM v_estado THEN
    UPDATE public.ot_segmento_repuestos SET estado = v_nuevo, updated_at = now() WHERE id = p_linea_id;
  END IF;
  RETURN v_nuevo;
END
$fn$;

-- 6a. Lectura ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.wms_reservas_ot(p_empresa_id text, p_ot_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_alcance uuid[];
  v_out jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Se requiere una sesión autenticada.' USING ERRCODE='42501'; END IF;
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'No tienes acceso a esta empresa.' USING ERRCODE='42501';
  END IF;
  IF NOT public.usuario_puede(p_empresa_id,'inventario','ver') THEN
    RAISE EXCEPTION 'No tienes permiso para ver inventario.' USING ERRCODE='42501';
  END IF;
  v_alcance := public.usuario_alcance_sociedades(p_empresa_id);

  SELECT jsonb_build_object(
    'permisos', jsonb_build_object(
      'despachar', public.usuario_puede(p_empresa_id,'inventario','despachar'),
      'liberar', public.usuario_puede(p_empresa_id,'inventario','liberar')),
    'ordenes', coalesce(jsonb_agg(o.obj ORDER BY o.numero), '[]'::jsonb))
  INTO v_out
  FROM (
    SELECT ot.numero,
      jsonb_build_object(
        'id', ot.id, 'numero', ot.numero, 'estado', ot.estado, 'sociedad_id', ot.sociedad_id,
        'lineas', (
          SELECT coalesce(jsonb_agg(jsonb_build_object(
            'id', l.id, 'material_id', l.material_id, 'codigo', m.codigo, 'descripcion', m.descripcion,
            'unidad', m.unidad, 'estado', l.estado, 'solpe_id', l.solpe_id,
            'cantidad_estimada', l.cantidad_estimada,
            'reservado', coalesce(rs.reservado,0), 'despachado', coalesce(rs.despachado,0),
            'liberado', coalesce(rs.liberado,0),
            'pendiente', coalesce(rs.reservado,0) - coalesce(rs.despachado,0) - coalesce(rs.liberado,0),
            'origenes', coalesce(rs.origenes,'[]'::jsonb)
          ) ORDER BY m.codigo, l.id), '[]'::jsonb)
          FROM public.ot_segmento_repuestos l
          JOIN public.materiales m ON m.id = l.material_id
          LEFT JOIN LATERAL (
            SELECT sum(r.cantidad_reservada) reservado, sum(r.cantidad_despachada) despachado,
                   sum(r.cantidad_liberada) liberado,
                   jsonb_agg(jsonb_build_object(
                     'stock_id', r.stock_id, 'almacen_id', r.almacen_id, 'almacen_codigo', a.codigo,
                     'almacen_nombre', a.nombre, 'ubicacion_id', s.ubicacion_id,
                     'ubicacion_codigo', u.codigo, 'ubicacion_nombre', u.nombre,
                     'pendiente', r.cantidad_reservada - r.cantidad_despachada - r.cantidad_liberada)
                     ORDER BY r.created_at, r.id) origenes
              FROM public.ot_segmento_repuestos_reservas r
              LEFT JOIN public.stock s ON s.id = r.stock_id
              LEFT JOIN public.almacenes a ON a.id = r.almacen_id
              LEFT JOIN public.ubicaciones u ON u.id = s.ubicacion_id
             WHERE r.ot_segmento_repuesto_id = l.id
          ) rs ON true
          WHERE l.ot_id = ot.id AND l.estado <> 'anulado'
        ),
        'acciones', (
          SELECT coalesce(jsonb_agg(jsonb_build_object(
            'id', ac.id, 'tipo', ac.tipo, 'cantidad', ac.cantidad, 'motivo', ac.motivo,
            'recibe_en_taller', ac.recibe_en_taller, 'observacion', ac.observacion,
            'kardex_ids', ac.kardex_ids, 'usuario_id', ac.usuario_id, 'linea_id', ac.ot_segmento_repuesto_id,
            'created_at', ac.created_at) ORDER BY ac.created_at DESC), '[]'::jsonb)
          FROM public.ot_segmento_repuestos_acciones ac WHERE ac.ot_id = ot.id
        )
      ) obj
    FROM public.ordenes_trabajo ot
    WHERE ot.empresa_id = p_empresa_id
      AND (p_ot_id IS NULL OR ot.id = p_ot_id)
      AND (v_alcance IS NULL OR ot.sociedad_id = ANY (v_alcance))
      AND EXISTS (SELECT 1 FROM public.ot_segmento_repuestos_reservas r WHERE r.ot_id = ot.id)
  ) o;
  RETURN v_out;
END
$fn$;

-- 6b. Despachar -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.wms_despachar_reserva_ot(
  p_empresa_id text, p_ot_id text, p_lineas jsonb,
  p_recibe_en_taller text DEFAULT NULL, p_observacion text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_alcance uuid[];
  v_ot public.ordenes_trabajo%rowtype;
  v_item jsonb; v_ids text[] := '{}'; v_linea_id text; v_cant numeric;
  v_linea public.ot_segmento_repuestos%rowtype;
  v_key record; v_res record; v_stock public.stock%rowtype;
  v_pend numeric; v_resta numeric; v_take numeric; v_costo numeric;
  v_kid text; v_kids text[]; v_acc text; v_estado text; v_out jsonb := '[]'::jsonb;
  v_recibe text := nullif(btrim(coalesce(p_recibe_en_taller,'')),'');
  v_obs text := nullif(btrim(coalesce(p_observacion,'')),'');
  v_texto text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Se requiere una sesión autenticada.' USING ERRCODE='42501'; END IF;
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'No tienes acceso a esta empresa.' USING ERRCODE='42501';
  END IF;
  IF NOT public.usuario_puede(p_empresa_id,'inventario','despachar') THEN
    RAISE EXCEPTION 'No tienes permiso para despachar repuestos a taller.' USING ERRCODE='42501';
  END IF;
  IF p_lineas IS NULL OR jsonb_typeof(p_lineas) <> 'array' OR jsonb_array_length(p_lineas) = 0 THEN
    RAISE EXCEPTION 'Indica al menos una línea a despachar.' USING ERRCODE='22023';
  END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_lineas) LOOP
    v_linea_id := nullif(btrim(coalesce(v_item->>'ot_segmento_repuesto_id','')),'');
    BEGIN v_cant := (v_item->>'cantidad')::numeric; EXCEPTION WHEN OTHERS THEN v_cant := NULL; END;
    IF v_linea_id IS NULL OR v_cant IS NULL OR v_cant <= 0 THEN
      RAISE EXCEPTION 'Cada línea requiere identificador y una cantidad mayor a cero.' USING ERRCODE='22023';
    END IF;
    IF v_linea_id = ANY (v_ids) THEN
      RAISE EXCEPTION 'La línea % está repetida.', v_linea_id USING ERRCODE='22023';
    END IF;
    v_ids := v_ids || v_linea_id;
  END LOOP;

  SELECT * INTO v_ot FROM public.ordenes_trabajo WHERE id = p_ot_id AND empresa_id = p_empresa_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La OT no existe en la empresa.' USING ERRCODE='P0002'; END IF;
  IF v_ot.estado NOT IN ('programada','ejecucion') THEN
    RAISE EXCEPTION 'La OT está en estado %; solo se despacha en programada o ejecución.', v_ot.estado USING ERRCODE='23514';
  END IF;
  v_alcance := public.usuario_alcance_sociedades(p_empresa_id);
  IF v_alcance IS NOT NULL AND NOT (v_ot.sociedad_id = ANY (v_alcance)) THEN
    RAISE EXCEPTION 'La sociedad de la OT está fuera de tu alcance.' USING ERRCODE='42501';
  END IF;

  -- Bloqueos por clave de stock en orden estable (mismo formato que los demás RPC WMS).
  FOR v_key IN
    SELECT DISTINCT 'wms-stock:'||s.empresa_id||':'||s.material_id||':'||s.almacen_id||':'||coalesce(s.ubicacion_id,'')||':'||
           coalesce(s.lote,'')||':'||coalesce(s.serie,'')||':'||coalesce(s.sociedad_id::text,'NULL') AS k
      FROM public.ot_segmento_repuestos_reservas r JOIN public.stock s ON s.id = r.stock_id
     WHERE r.ot_id = p_ot_id AND r.empresa_id = p_empresa_id AND r.ot_segmento_repuesto_id = ANY (v_ids)
     ORDER BY 1
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(v_key.k, 0));
  END LOOP;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_lineas) LOOP
    v_linea_id := v_item->>'ot_segmento_repuesto_id';
    v_cant := (v_item->>'cantidad')::numeric;
    SELECT * INTO v_linea FROM public.ot_segmento_repuestos
     WHERE id = v_linea_id AND ot_id = p_ot_id AND empresa_id = p_empresa_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'La línea % no pertenece a la OT.', v_linea_id USING ERRCODE='P0002'; END IF;
    SELECT coalesce(sum(r.cantidad_reservada - r.cantidad_despachada - r.cantidad_liberada),0) INTO v_pend
      FROM public.ot_segmento_repuestos_reservas r WHERE r.ot_segmento_repuesto_id = v_linea.id;
    IF v_cant > v_pend THEN
      RAISE EXCEPTION 'Solo hay % pendientes de despachar en la línea; solicitado %.', v_pend, v_cant USING ERRCODE='23514';
    END IF;
    SELECT coalesce(m.costo_promedio,0) INTO v_costo FROM public.materiales m WHERE m.id = v_linea.material_id;
    v_resta := v_cant; v_kids := '{}';
    FOR v_res IN
      SELECT * FROM public.ot_segmento_repuestos_reservas r
       WHERE r.ot_segmento_repuesto_id = v_linea.id
         AND r.cantidad_reservada - r.cantidad_despachada - r.cantidad_liberada > 0
       ORDER BY r.created_at, r.id FOR UPDATE
    LOOP
      EXIT WHEN v_resta <= 0;
      v_take := least(v_resta, v_res.cantidad_reservada - v_res.cantidad_despachada - v_res.cantidad_liberada);
      SELECT * INTO v_stock FROM public.stock WHERE id = v_res.stock_id FOR UPDATE;
      IF NOT FOUND OR coalesce(v_stock.reservado,0) < v_take THEN
        RAISE EXCEPTION 'La reserva cambió: el stock ya no tiene % reservados. Actualiza la pantalla.', v_take USING ERRCODE='40001';
      END IF;
      -- Convierte lo reservado en disponible y lo saca por el guardián (misma transacción).
      UPDATE public.stock SET reservado = coalesce(reservado,0) - v_take,
             disponible = coalesce(disponible,0) + v_take, updated_at = now() WHERE id = v_stock.id;
      LOOP
        v_kid := 'kdx_'||substr(replace(gen_random_uuid()::text,'-',''),1,18);
        PERFORM pg_advisory_xact_lock(hashtextextended('kardex-id:'||v_kid,0));
        EXIT WHEN NOT EXISTS (SELECT 1 FROM public.kardex k WHERE k.id = v_kid);
      END LOOP;
      v_texto := 'Despacho a taller OT ' || coalesce(v_ot.numero, p_ot_id)
                 || coalesce(' · recibe: ' || v_recibe, '') || coalesce(' · ' || v_obs, '');
      PERFORM public.registrar_movimiento_atomico(
        p_kardex_id:=v_kid, p_empresa_id:=p_empresa_id, p_material_id:=v_stock.material_id,
        p_almacen_id:=v_stock.almacen_id, p_sociedad_id:=v_stock.sociedad_id, p_tipo:='salida',
        p_motivo:='despacho_taller', p_cantidad:=v_take, p_costo_unitario:=v_costo, p_costo_unitario_usd:=0,
        p_moneda:='PEN', p_lote:=v_stock.lote, p_serie:=v_stock.serie, p_vencimiento:=v_stock.vencimiento,
        p_referencia_tipo:='ot', p_referencia_id:=p_ot_id, p_observacion:=v_texto,
        p_usuario_id:=v_uid, p_ubicacion_id:=v_stock.ubicacion_id, p_skip_costo_promedio:=true);
      UPDATE public.ot_segmento_repuestos_reservas SET cantidad_despachada = cantidad_despachada + v_take
       WHERE id = v_res.id;
      v_kids := v_kids || v_kid;
      v_resta := v_resta - v_take;
    END LOOP;
    IF v_resta > 0 THEN
      RAISE EXCEPTION 'No se pudo despachar la cantidad completa de la línea.' USING ERRCODE='40001';
    END IF;
    v_estado := public.wms_recalcular_estado_linea_repuesto(v_linea.id);
    v_acc := 'acc_'||substr(replace(gen_random_uuid()::text,'-',''),1,18);
    INSERT INTO public.ot_segmento_repuestos_acciones
      (id, empresa_id, sociedad_id, ot_id, ot_segmento_repuesto_id, tipo, cantidad, recibe_en_taller, observacion, kardex_ids, usuario_id)
    VALUES (v_acc, p_empresa_id, v_linea.sociedad_id, p_ot_id, v_linea.id, 'despacho', v_cant, v_recibe, v_obs, v_kids, v_uid);
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'accion_id', v_acc, 'linea_id', v_linea.id, 'cantidad', v_cant, 'kardex_ids', to_jsonb(v_kids),
      'estado_linea', v_estado, 'pendiente', v_pend - v_cant));
  END LOOP;
  RETURN jsonb_build_object('ot_id', p_ot_id, 'acciones', v_out);
END
$fn$;

-- 6c. Liberar ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.wms_liberar_reserva_ot(
  p_empresa_id text, p_ot_segmento_repuesto_id text, p_cantidad numeric,
  p_motivo text, p_observacion text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_alcance uuid[];
  v_motivo text := nullif(btrim(coalesce(p_motivo,'')),'');
  v_obs text := nullif(btrim(coalesce(p_observacion,'')),'');
  v_linea public.ot_segmento_repuestos%rowtype;
  v_ot public.ordenes_trabajo%rowtype;
  v_key record; v_res record; v_stock public.stock%rowtype;
  v_pend numeric; v_resta numeric; v_take numeric; v_acc text; v_estado text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Se requiere una sesión autenticada.' USING ERRCODE='42501'; END IF;
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'No tienes acceso a esta empresa.' USING ERRCODE='42501';
  END IF;
  IF NOT public.usuario_puede(p_empresa_id,'inventario','liberar') THEN
    RAISE EXCEPTION 'No tienes permiso para liberar reservas.' USING ERRCODE='42501';
  END IF;
  IF v_motivo IS NULL THEN RAISE EXCEPTION 'El motivo es obligatorio.' USING ERRCODE='22023'; END IF;
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor a cero.' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_linea FROM public.ot_segmento_repuestos WHERE id = p_ot_segmento_repuesto_id AND empresa_id = p_empresa_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'La línea no existe en la empresa.' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_ot FROM public.ordenes_trabajo WHERE id = v_linea.ot_id AND empresa_id = p_empresa_id FOR UPDATE;
  SELECT * INTO v_linea FROM public.ot_segmento_repuestos WHERE id = p_ot_segmento_repuesto_id FOR UPDATE;
  v_alcance := public.usuario_alcance_sociedades(p_empresa_id);
  IF v_alcance IS NOT NULL AND NOT (v_ot.sociedad_id = ANY (v_alcance)) THEN
    RAISE EXCEPTION 'La sociedad de la OT está fuera de tu alcance.' USING ERRCODE='42501';
  END IF;
  SELECT coalesce(sum(r.cantidad_reservada - r.cantidad_despachada - r.cantidad_liberada),0) INTO v_pend
    FROM public.ot_segmento_repuestos_reservas r WHERE r.ot_segmento_repuesto_id = v_linea.id;
  IF p_cantidad > v_pend THEN
    RAISE EXCEPTION 'Solo hay % reservados pendientes en la línea; solicitado %.', v_pend, p_cantidad USING ERRCODE='23514';
  END IF;

  FOR v_key IN
    SELECT DISTINCT 'wms-stock:'||s.empresa_id||':'||s.material_id||':'||s.almacen_id||':'||coalesce(s.ubicacion_id,'')||':'||
           coalesce(s.lote,'')||':'||coalesce(s.serie,'')||':'||coalesce(s.sociedad_id::text,'NULL') AS k
      FROM public.ot_segmento_repuestos_reservas r JOIN public.stock s ON s.id = r.stock_id
     WHERE r.ot_segmento_repuesto_id = v_linea.id ORDER BY 1
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(v_key.k, 0));
  END LOOP;

  v_resta := p_cantidad;
  FOR v_res IN
    SELECT * FROM public.ot_segmento_repuestos_reservas r
     WHERE r.ot_segmento_repuesto_id = v_linea.id
       AND r.cantidad_reservada - r.cantidad_despachada - r.cantidad_liberada > 0
     ORDER BY r.created_at, r.id FOR UPDATE
  LOOP
    EXIT WHEN v_resta <= 0;
    v_take := least(v_resta, v_res.cantidad_reservada - v_res.cantidad_despachada - v_res.cantidad_liberada);
    SELECT * INTO v_stock FROM public.stock WHERE id = v_res.stock_id FOR UPDATE;
    IF NOT FOUND OR coalesce(v_stock.reservado,0) < v_take THEN
      RAISE EXCEPTION 'La reserva cambió: el stock ya no tiene % reservados. Actualiza la pantalla.', v_take USING ERRCODE='40001';
    END IF;
    UPDATE public.stock SET reservado = coalesce(reservado,0) - v_take,
           disponible = coalesce(disponible,0) + v_take, updated_at = now() WHERE id = v_stock.id;
    UPDATE public.ot_segmento_repuestos_reservas SET cantidad_liberada = cantidad_liberada + v_take WHERE id = v_res.id;
    v_resta := v_resta - v_take;
  END LOOP;
  v_estado := public.wms_recalcular_estado_linea_repuesto(v_linea.id);
  v_acc := 'acc_'||substr(replace(gen_random_uuid()::text,'-',''),1,18);
  INSERT INTO public.ot_segmento_repuestos_acciones
    (id, empresa_id, sociedad_id, ot_id, ot_segmento_repuesto_id, tipo, cantidad, motivo, observacion, usuario_id)
  VALUES (v_acc, p_empresa_id, v_linea.sociedad_id, v_linea.ot_id, v_linea.id, 'liberacion', p_cantidad, v_motivo, v_obs, v_uid);
  RETURN jsonb_build_object('accion_id', v_acc, 'linea_id', v_linea.id, 'cantidad', p_cantidad,
                            'estado_linea', v_estado, 'pendiente', v_pend - p_cantidad);
END
$fn$;

-- 6d. Conciliación con el cierre técnico -------------------------------------
CREATE OR REPLACE FUNCTION public.wms_conciliar_cierre_ot(p_empresa_id text, p_ot_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_ot public.ordenes_trabajo%rowtype;
  v_key record; v_res record; v_stock public.stock%rowtype; v_linea record;
  v_pend numeric; v_acc text; v_despachado jsonb; v_liberado jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Se requiere una sesión autenticada.' USING ERRCODE='42501'; END IF;
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'No tienes acceso a esta empresa.' USING ERRCODE='42501';
  END IF;
  IF NOT (public.usuario_puede(p_empresa_id,'ot','editar') OR public.usuario_puede(p_empresa_id,'inventario','liberar')) THEN
    RAISE EXCEPTION 'No tienes permiso para cerrar la reserva de repuestos de la OT.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_ot FROM public.ordenes_trabajo WHERE id = p_ot_id AND empresa_id = p_empresa_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La OT no existe en la empresa.' USING ERRCODE='P0002'; END IF;

  FOR v_key IN
    SELECT DISTINCT 'wms-stock:'||s.empresa_id||':'||s.material_id||':'||s.almacen_id||':'||coalesce(s.ubicacion_id,'')||':'||
           coalesce(s.lote,'')||':'||coalesce(s.serie,'')||':'||coalesce(s.sociedad_id::text,'NULL') AS k
      FROM public.ot_segmento_repuestos_reservas r JOIN public.stock s ON s.id = r.stock_id
     WHERE r.ot_id = p_ot_id AND r.empresa_id = p_empresa_id ORDER BY 1
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(v_key.k, 0));
  END LOOP;

  FOR v_linea IN
    SELECT l.id, l.sociedad_id, l.material_id FROM public.ot_segmento_repuestos l
     WHERE l.ot_id = p_ot_id AND l.empresa_id = p_empresa_id ORDER BY l.id FOR UPDATE
  LOOP
    v_pend := 0;
    FOR v_res IN
      SELECT * FROM public.ot_segmento_repuestos_reservas r
       WHERE r.ot_segmento_repuesto_id = v_linea.id
         AND r.cantidad_reservada - r.cantidad_despachada - r.cantidad_liberada > 0
       ORDER BY r.created_at, r.id FOR UPDATE
    LOOP
      SELECT * INTO v_stock FROM public.stock WHERE id = v_res.stock_id FOR UPDATE;
      IF NOT FOUND OR coalesce(v_stock.reservado,0) < (v_res.cantidad_reservada - v_res.cantidad_despachada - v_res.cantidad_liberada) THEN
        RAISE EXCEPTION 'La reserva cambió: inconsistencia de stock en la OT %.', coalesce(v_ot.numero,p_ot_id) USING ERRCODE='40001';
      END IF;
      UPDATE public.stock SET reservado = coalesce(reservado,0) - (v_res.cantidad_reservada - v_res.cantidad_despachada - v_res.cantidad_liberada),
             disponible = coalesce(disponible,0) + (v_res.cantidad_reservada - v_res.cantidad_despachada - v_res.cantidad_liberada),
             updated_at = now() WHERE id = v_stock.id;
      v_pend := v_pend + (v_res.cantidad_reservada - v_res.cantidad_despachada - v_res.cantidad_liberada);
      UPDATE public.ot_segmento_repuestos_reservas SET cantidad_liberada = cantidad_reservada - cantidad_despachada WHERE id = v_res.id;
    END LOOP;
    IF v_pend > 0 THEN
      PERFORM public.wms_recalcular_estado_linea_repuesto(v_linea.id);
      v_acc := 'acc_'||substr(replace(gen_random_uuid()::text,'-',''),1,18);
      INSERT INTO public.ot_segmento_repuestos_acciones
        (id, empresa_id, sociedad_id, ot_id, ot_segmento_repuesto_id, tipo, cantidad, motivo, usuario_id)
      VALUES (v_acc, p_empresa_id, v_linea.sociedad_id, p_ot_id, v_linea.id, 'cierre_ot', v_pend, 'cierre_ot', v_uid);
      v_liberado := v_liberado || jsonb_build_array(jsonb_build_object('material_id', v_linea.material_id, 'cantidad', v_pend));
    END IF;
  END LOOP;

  SELECT coalesce(jsonb_agg(jsonb_build_object('material_id', t.material_id, 'cantidad', t.q)), '[]'::jsonb)
    INTO v_despachado
    FROM (SELECT r.material_id, sum(r.cantidad_despachada) q
            FROM public.ot_segmento_repuestos_reservas r
           WHERE r.ot_id = p_ot_id AND r.empresa_id = p_empresa_id
           GROUP BY r.material_id HAVING sum(r.cantidad_despachada) > 0) t;
  RETURN jsonb_build_object('ot_id', p_ot_id, 'despachado', v_despachado, 'liberado', v_liberado);
END
$fn$;

-- Permisos de ejecución -------------------------------------------------------
REVOKE ALL ON FUNCTION public.wms_recalcular_estado_linea_repuesto(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wms_recalcular_estado_linea_repuesto(text) TO service_role;
REVOKE ALL ON FUNCTION public.wms_reservas_ot(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wms_reservas_ot(text,text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.wms_despachar_reserva_ot(text,text,jsonb,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wms_despachar_reserva_ot(text,text,jsonb,text,text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.wms_liberar_reserva_ot(text,text,numeric,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wms_liberar_reserva_ot(text,text,numeric,text,text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.wms_conciliar_cierre_ot(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wms_conciliar_cierre_ot(text,text) TO authenticated, service_role;

COMMENT ON FUNCTION public.wms_despachar_reserva_ot(text,text,jsonb,text,text) IS
  'WMS 2b-C: despacha a taller (salida despacho_taller) lo reservado de una OT; consume la reserva en la misma transacción.';
COMMENT ON FUNCTION public.wms_liberar_reserva_ot(text,text,numeric,text,text) IS
  'WMS 2b-C: devuelve a disponible cantidad reservada de una línea de OT (sin kardex).';
COMMENT ON FUNCTION public.wms_conciliar_cierre_ot(text,text) IS
  'WMS 2b-C: al cierre técnico libera reservas pendientes y devuelve lo ya despachado para que el consumo heredado no lo descuente dos veces.';

-- Comprobaciones ---------------------------------------------------------------
DO $check$
DECLARE
  v_fn text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
       AND table_name='ot_segmento_repuestos_reservas' AND column_name='cantidad_despachada') THEN
    RAISE EXCEPTION 'Falta cantidad_despachada';
  END IF;
  IF pg_get_functiondef('public.usuario_puede(text,text,text)'::regprocedure) NOT LIKE '%puede_despachar%'
     OR pg_get_functiondef('public.usuario_puede(text,text,text)'::regprocedure) NOT LIKE '%puede_liberar%' THEN
    RAISE EXCEPTION 'usuario_puede no quedó parchada';
  END IF;
  IF pg_get_functiondef('public.registrar_movimiento_atomico(text,text,text,text,uuid,text,text,numeric,numeric,numeric,text,text,text,date,text,text,text,text,text,uuid,text,text,integer,numeric,numeric,text,boolean,text)'::regprocedure) NOT LIKE '%inventario'', ''despachar%' THEN
    RAISE EXCEPTION 'El guardián no quedó parchado';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.ot_segmento_repuestos_acciones'::regclass) THEN
    RAISE EXCEPTION 'RLS desactivado en acciones';
  END IF;
  FOREACH v_fn IN ARRAY ARRAY[
    'public.wms_reservas_ot(text,text)','public.wms_despachar_reserva_ot(text,text,jsonb,text,text)',
    'public.wms_liberar_reserva_ot(text,text,numeric,text,text)','public.wms_conciliar_cierre_ot(text,text)'] LOOP
    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_fn::regprocedure) THEN
      RAISE EXCEPTION '% no es SECURITY DEFINER', v_fn;
    END IF;
    IF has_function_privilege('anon', v_fn::regprocedure, 'EXECUTE')
       OR NOT has_function_privilege('authenticated', v_fn::regprocedure, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_fn::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION 'Permisos de ejecución incorrectos en %', v_fn;
    END IF;
  END LOOP;
END
$check$;
