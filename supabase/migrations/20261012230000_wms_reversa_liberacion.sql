-- WMS Fase 2b-D: reversa de despacho, liberación desde cuarentena/merma,
-- estado de línea "Despachado y liberado" y número de OT legible en el Kardex.
--
-- Cambios:
--  1. ot_segmento_repuestos: estado despachado_liberado.
--  2. ot_segmento_repuestos_acciones: nuevo tipo reversa_despacho (la liberación de cuarentena
--     queda registrada solo en el Kardex, como transferencia enlazada).
--  3. wms_recalcular_estado_linea_repuesto: sin pendiente y con despacho + liberación =>
--     despachado_liberado.
--  4. registrar_movimiento_atomico (guardián): motivos reversa_despacho (solo entrada, exige
--     inventario/despachar) y liberacion_cuarentena (solo transferencia, exige inventario/liberar,
--     único motivo que puede sacar stock de cuarentena/merma hacia una ubicación normal).
--  5. wms_despachar_reserva_ot: el asiento guarda el número de OT en nro_documento (Kardex legible).
--     Se parchea sobre la definición vigente con anclas verificadas.
--  6. RPC nuevos: wms_revertir_despacho_ot, wms_liberar_cuarentena.
--  7. Datos: despachos existentes reciben el número de OT; se recalcula el estado de líneas resueltas.
--
-- Las funciones 4 y 5 se parchean con anclas verificadas: si el cuerpo remoto cambió, aborta.

-- 1. Estado de línea ---------------------------------------------------------
ALTER TABLE public.ot_segmento_repuestos
  DROP CONSTRAINT IF EXISTS ot_segmento_repuestos_estado_check;
ALTER TABLE public.ot_segmento_repuestos
  ADD CONSTRAINT ot_segmento_repuestos_estado_check
  CHECK (estado = ANY (ARRAY['estimado','reservado','reservado_parcial_solpe',
    'despachado_parcial','despachado_liberado','despachado','liberado','consumido','anulado']::text[]));

-- 2. Bitácora: tipo reversa_despacho -----------------------------------------
ALTER TABLE public.ot_segmento_repuestos_acciones
  DROP CONSTRAINT IF EXISTS ot_segmento_repuestos_acciones_tipo_check;
ALTER TABLE public.ot_segmento_repuestos_acciones
  ADD CONSTRAINT ot_segmento_repuestos_acciones_tipo_check
  CHECK (tipo = ANY (ARRAY['despacho','liberacion','cierre_ot','reversa_despacho']::text[]));

-- 3. Helper: estado de la línea ----------------------------------------------
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
    ELSIF v_estado IN ('despachado_parcial','despachado_liberado','despachado','liberado') THEN
      v_nuevo := CASE WHEN v_res < v_est THEN 'reservado_parcial_solpe' ELSE 'reservado' END;
    ELSE v_nuevo := v_estado; END IF;
  ELSE
    IF v_desp >= v_est THEN v_nuevo := 'despachado';
    ELSIF v_desp > 0 AND v_lib > 0 THEN v_nuevo := 'despachado_liberado';
    ELSIF v_desp > 0 THEN v_nuevo := 'despachado_parcial';
    ELSE v_nuevo := 'liberado'; END IF;
  END IF;
  IF v_nuevo IS DISTINCT FROM v_estado THEN
    UPDATE public.ot_segmento_repuestos SET estado = v_nuevo, updated_at = now() WHERE id = p_linea_id;
  END IF;
  RETURN v_nuevo;
END
$fn$;

-- 4. Guardián: reversa_despacho y liberacion_cuarentena -----------------------
DO $patch_guardian$
DECLARE
  v_oid oid := 'public.registrar_movimiento_atomico(text,text,text,text,uuid,text,text,numeric,numeric,numeric,text,text,text,date,text,text,text,text,text,uuid,text,text,integer,numeric,numeric,text,boolean,text)'::regprocedure;
  v_def text := pg_get_functiondef(v_oid);
  v_a1 text := '    IF p_motivo IN (''ajuste_conteo'',''ajuste_manual'') OR';
  v_a2 text := '    ELSIF p_motivo = ''despacho_taller'' THEN';
  v_a3 text := 'AND NOT (p_motivo IN (''merma'',''devolucion_proveedor'',''ajuste_conteo'')';
  v_new text;
BEGIN
  IF v_def LIKE '%liberacion_cuarentena%' THEN RETURN; END IF;
  IF (length(v_def) - length(replace(v_def, v_a1, ''))) / length(v_a1) <> 1
     OR (length(v_def) - length(replace(v_def, v_a2, ''))) / length(v_a2) <> 1
     OR (length(v_def) - length(replace(v_def, v_a3, ''))) / length(v_a3) <> 1 THEN
    RAISE EXCEPTION 'El guardián cambió: anclas no únicas.';
  END IF;
  v_new := replace(v_def, v_a1,
    E'    IF p_motivo = ''reversa_despacho'' AND p_tipo <> ''entrada'' THEN\n' ||
    E'      RAISE EXCEPTION ''El motivo reversa_despacho solo admite movimientos de entrada.'' USING ERRCODE=''42501'';\n' ||
    E'    ELSIF p_motivo = ''liberacion_cuarentena'' AND p_tipo NOT IN (''transferencia_salida'',''transferencia_entrada'') THEN\n' ||
    E'      RAISE EXCEPTION ''El motivo liberacion_cuarentena solo admite transferencias.'' USING ERRCODE=''42501'';\n' ||
    E'    END IF;\n' || v_a1);
  v_new := replace(v_new, v_a2,
    E'    ELSIF p_motivo = ''reversa_despacho'' THEN\n' ||
    E'      IF NOT public.usuario_puede(p_empresa_id, ''inventario'', ''despachar'') THEN\n' ||
    E'        RAISE EXCEPTION ''No tienes permiso para revertir despachos a taller.'' USING ERRCODE=''42501'';\n' ||
    E'      END IF;\n' ||
    E'    ELSIF p_motivo = ''liberacion_cuarentena'' THEN\n' ||
    E'      IF NOT public.usuario_puede(p_empresa_id, ''inventario'', ''liberar'') THEN\n' ||
    E'        RAISE EXCEPTION ''No tienes permiso para liberar stock de cuarentena o merma.'' USING ERRCODE=''42501'';\n' ||
    E'      END IF;\n' || v_a2);
  v_new := replace(v_new, v_a3,
    'AND NOT (p_motivo IN (''merma'',''devolucion_proveedor'',''ajuste_conteo'',''liberacion_cuarentena'')');
  EXECUTE v_new;
END
$patch_guardian$;

-- 5. Despacho: número de OT en nro_documento -----------------------------------
DO $patch_despacho$
DECLARE
  v_oid oid := 'public.wms_despachar_reserva_ot(text,text,jsonb,text,text)'::regprocedure;
  v_def text := pg_get_functiondef(v_oid);
  v_a1 text := 'p_referencia_tipo:=''ot'', p_referencia_id:=p_ot_id, p_observacion:=v_texto,';
  v_new text;
BEGIN
  IF v_def LIKE '%p_nro_documento:=v_ot.numero%' THEN RETURN; END IF;
  IF (length(v_def) - length(replace(v_def, v_a1, ''))) / length(v_a1) <> 1 THEN
    RAISE EXCEPTION 'wms_despachar_reserva_ot cambió: ancla no única.';
  END IF;
  v_new := replace(v_def, v_a1,
    'p_referencia_tipo:=''ot'', p_referencia_id:=p_ot_id, p_nro_documento:=v_ot.numero, p_observacion:=v_texto,');
  EXECUTE v_new;
END
$patch_despacho$;

-- 6a. Reversa de despacho --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.wms_revertir_despacho_ot(
  p_empresa_id text, p_ot_id text, p_lineas jsonb, p_motivo text, p_observacion text DEFAULT NULL)
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
  v_desp numeric; v_resta numeric; v_take numeric; v_costo numeric;
  v_kid text; v_kids text[]; v_acc text; v_estado text; v_out jsonb := '[]'::jsonb;
  v_motivo text := nullif(btrim(coalesce(p_motivo,'')),'');
  v_obs text := nullif(btrim(coalesce(p_observacion,'')),'');
  v_texto text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Se requiere una sesión autenticada.' USING ERRCODE='42501'; END IF;
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'No tienes acceso a esta empresa.' USING ERRCODE='42501';
  END IF;
  IF NOT public.usuario_puede(p_empresa_id,'inventario','despachar') THEN
    RAISE EXCEPTION 'No tienes permiso para revertir despachos a taller.' USING ERRCODE='42501';
  END IF;
  IF v_motivo IS NULL THEN
    RAISE EXCEPTION 'Indica el motivo de la reversa.' USING ERRCODE='22023';
  END IF;
  IF p_lineas IS NULL OR jsonb_typeof(p_lineas) <> 'array' OR jsonb_array_length(p_lineas) = 0 THEN
    RAISE EXCEPTION 'Indica al menos una línea a revertir.' USING ERRCODE='22023';
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
    RAISE EXCEPTION 'La OT está en estado %; solo se revierte en programada o ejecución.', v_ot.estado USING ERRCODE='23514';
  END IF;
  v_alcance := public.usuario_alcance_sociedades(p_empresa_id);
  IF v_alcance IS NOT NULL AND NOT (v_ot.sociedad_id = ANY (v_alcance)) THEN
    RAISE EXCEPTION 'La sociedad de la OT está fuera de tu alcance.' USING ERRCODE='42501';
  END IF;

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
    SELECT coalesce(sum(r.cantidad_despachada),0) INTO v_desp
      FROM public.ot_segmento_repuestos_reservas r WHERE r.ot_segmento_repuesto_id = v_linea.id;
    IF v_cant > v_desp THEN
      RAISE EXCEPTION 'Solo hay % despachados en la línea; no se puede revertir %.', v_desp, v_cant USING ERRCODE='23514';
    END IF;
    SELECT coalesce(m.costo_promedio,0) INTO v_costo FROM public.materiales m WHERE m.id = v_linea.material_id;
    v_resta := v_cant; v_kids := '{}';
    FOR v_res IN
      SELECT * FROM public.ot_segmento_repuestos_reservas r
       WHERE r.ot_segmento_repuesto_id = v_linea.id AND r.cantidad_despachada > 0
       ORDER BY r.created_at DESC, r.id DESC FOR UPDATE
    LOOP
      EXIT WHEN v_resta <= 0;
      v_take := least(v_resta, v_res.cantidad_despachada);
      SELECT * INTO v_stock FROM public.stock WHERE id = v_res.stock_id FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'El stock de origen del despacho ya no existe. Actualiza la pantalla.' USING ERRCODE='40001';
      END IF;
      LOOP
        v_kid := 'kdx_'||substr(replace(gen_random_uuid()::text,'-',''),1,18);
        PERFORM pg_advisory_xact_lock(hashtextextended('kardex-id:'||v_kid,0));
        EXIT WHEN NOT EXISTS (SELECT 1 FROM public.kardex k WHERE k.id = v_kid);
      END LOOP;
      v_texto := 'Reversa de despacho OT ' || coalesce(v_ot.numero, p_ot_id) || ' · ' || v_motivo
                 || coalesce(' · ' || v_obs, '');
      -- Entra de nuevo al stock de origen y vuelve a quedar reservado para la OT.
      PERFORM public.registrar_movimiento_atomico(
        p_kardex_id:=v_kid, p_empresa_id:=p_empresa_id, p_material_id:=v_stock.material_id,
        p_almacen_id:=v_stock.almacen_id, p_sociedad_id:=v_stock.sociedad_id, p_tipo:='entrada',
        p_motivo:='reversa_despacho', p_cantidad:=v_take, p_costo_unitario:=v_costo, p_costo_unitario_usd:=0,
        p_moneda:='PEN', p_lote:=v_stock.lote, p_serie:=v_stock.serie, p_vencimiento:=v_stock.vencimiento,
        p_referencia_tipo:='ot', p_referencia_id:=p_ot_id, p_nro_documento:=v_ot.numero,
        p_observacion:=v_texto, p_usuario_id:=v_uid, p_ubicacion_id:=v_stock.ubicacion_id,
        p_skip_costo_promedio:=true);
      UPDATE public.stock SET reservado = coalesce(reservado,0) + v_take,
             disponible = coalesce(disponible,0) - v_take, updated_at = now()
       WHERE id = v_stock.id AND coalesce(disponible,0) >= v_take;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'No se pudo volver a reservar % en el stock de origen.', v_take USING ERRCODE='40001';
      END IF;
      UPDATE public.ot_segmento_repuestos_reservas SET cantidad_despachada = cantidad_despachada - v_take
       WHERE id = v_res.id;
      v_kids := v_kids || v_kid;
      v_resta := v_resta - v_take;
    END LOOP;
    IF v_resta > 0 THEN
      RAISE EXCEPTION 'No se pudo revertir la cantidad completa de la línea.' USING ERRCODE='40001';
    END IF;
    v_estado := public.wms_recalcular_estado_linea_repuesto(v_linea.id);
    v_acc := 'acc_'||substr(replace(gen_random_uuid()::text,'-',''),1,18);
    INSERT INTO public.ot_segmento_repuestos_acciones
      (id, empresa_id, sociedad_id, ot_id, ot_segmento_repuesto_id, tipo, cantidad, motivo, observacion, kardex_ids, usuario_id)
    VALUES (v_acc, p_empresa_id, v_linea.sociedad_id, p_ot_id, v_linea.id, 'reversa_despacho', v_cant, v_motivo, v_obs, v_kids, v_uid);
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'accion_id', v_acc, 'linea_id', v_linea.id, 'cantidad', v_cant, 'kardex_ids', to_jsonb(v_kids),
      'estado_linea', v_estado));
  END LOOP;
  RETURN jsonb_build_object('ot_id', p_ot_id, 'acciones', v_out);
END
$fn$;

-- 6b. Liberación de cuarentena / merma --------------------------------------------
CREATE OR REPLACE FUNCTION public.wms_liberar_cuarentena(
  p_empresa_id text, p_stock_origen_id uuid, p_almacen_destino_id text, p_ubicacion_destino_id text,
  p_cantidad numeric, p_motivo text, p_observacion text DEFAULT NULL)
RETURNS TABLE(transferencia_id text, kardex_salida_id text, kardex_entrada_id text,
              saldo_origen numeric, disponible_origen numeric, saldo_destino numeric, disponible_destino numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_o public.stock%ROWTYPE;
  v_tipo_control text;
  v_costo numeric;
  v_uso_o text; v_uso_d text;
  v_trf text; v_id_s text; v_id_e text;
  v_motivo text := nullif(btrim(coalesce(p_motivo,'')),'');
  v_obs text := nullif(btrim(coalesce(p_observacion,'')),'');
  v_texto text;
  v_key_o text; v_key_d text;
  v_rs record; v_re record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Se requiere una sesión autenticada.' USING ERRCODE='42501'; END IF;
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'No tienes acceso a esta empresa.' USING ERRCODE='42501';
  END IF;
  IF NOT public.usuario_puede(p_empresa_id,'inventario','liberar') THEN
    RAISE EXCEPTION 'No tienes permiso para liberar stock de cuarentena o merma.' USING ERRCODE='42501';
  END IF;
  IF v_motivo IS NULL THEN
    RAISE EXCEPTION 'Indica el motivo de la liberación.' USING ERRCODE='22023';
  END IF;
  IF p_stock_origen_id IS NULL OR nullif(btrim(coalesce(p_almacen_destino_id,'')),'') IS NULL
     OR nullif(btrim(coalesce(p_ubicacion_destino_id,'')),'') IS NULL THEN
    RAISE EXCEPTION 'Indica el stock de origen y la ubicación de destino.' USING ERRCODE='22023';
  END IF;
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor a cero.' USING ERRCODE='22023';
  END IF;

  SELECT s.* INTO v_o FROM public.stock s WHERE s.id=p_stock_origen_id AND s.empresa_id=p_empresa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El stock de origen no existe en la empresa.' USING ERRCODE='P0002';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.almacenes a
                  WHERE a.id=p_almacen_destino_id AND a.empresa_id=p_empresa_id
                    AND lower(coalesce(a.estado,'activo'))='activo') THEN
    RAISE EXCEPTION 'El almacén de destino no pertenece a la empresa o no está activo.' USING ERRCODE='P0002';
  END IF;
  SELECT u.uso INTO v_uso_d FROM public.ubicaciones u
   WHERE u.id=p_ubicacion_destino_id AND u.empresa_id=p_empresa_id
     AND u.almacen_id=p_almacen_destino_id AND u.activo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La ubicación de destino no pertenece al almacén/empresa o está inactiva.' USING ERRCODE='P0002';
  END IF;
  IF v_uso_d IN ('cuarentena','merma') THEN
    RAISE EXCEPTION 'El destino de una liberación debe ser una ubicación normal, no de %.', v_uso_d USING ERRCODE='23514';
  END IF;
  IF v_o.almacen_id = p_almacen_destino_id AND v_o.ubicacion_id = p_ubicacion_destino_id THEN
    RAISE EXCEPTION 'El destino debe ser distinto del origen.' USING ERRCODE='22023';
  END IF;

  v_key_o := 'wms-stock:'||p_empresa_id||':'||v_o.material_id||':'||v_o.almacen_id||':'||v_o.ubicacion_id||':'||
             coalesce(v_o.lote,'')||':'||coalesce(v_o.serie,'')||':'||coalesce(v_o.sociedad_id::text,'NULL');
  v_key_d := 'wms-stock:'||p_empresa_id||':'||v_o.material_id||':'||p_almacen_destino_id||':'||p_ubicacion_destino_id||':'||
             coalesce(v_o.lote,'')||':'||coalesce(v_o.serie,'')||':'||coalesce(v_o.sociedad_id::text,'NULL');
  IF v_key_o < v_key_d THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(v_key_o,0));
    PERFORM pg_advisory_xact_lock(hashtextextended(v_key_d,0));
  ELSE
    PERFORM pg_advisory_xact_lock(hashtextextended(v_key_d,0));
    PERFORM pg_advisory_xact_lock(hashtextextended(v_key_o,0));
  END IF;

  SELECT s.* INTO v_o FROM public.stock s
   WHERE s.id=p_stock_origen_id AND s.empresa_id=p_empresa_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El stock de origen ya no existe.' USING ERRCODE='P0002';
  END IF;

  SELECT m.tipo_control, coalesce(m.costo_promedio,0) INTO v_tipo_control, v_costo
    FROM public.materiales m
   WHERE m.id=v_o.material_id AND m.empresa_id=p_empresa_id
     AND lower(coalesce(m.estado,'activo'))='activo';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El material no existe en la empresa o está inactivo.' USING ERRCODE='P0002';
  END IF;

  SELECT u.uso INTO v_uso_o FROM public.ubicaciones u
   WHERE u.id=v_o.ubicacion_id AND u.empresa_id=p_empresa_id;
  IF v_uso_o IS NULL OR v_uso_o NOT IN ('cuarentena','merma') THEN
    RAISE EXCEPTION 'Solo se libera stock que está en una ubicación de cuarentena o merma.' USING ERRCODE='23514';
  END IF;
  IF v_tipo_control='serie' AND p_cantidad <> 1 THEN
    RAISE EXCEPTION 'Artículos controlados por serie se liberan de uno en uno.' USING ERRCODE='22023';
  END IF;
  IF p_cantidad > coalesce(v_o.disponible,0) THEN
    RAISE EXCEPTION 'Solo hay % libres en el origen (% reservados); solicitado %.',
      coalesce(v_o.disponible,0), coalesce(v_o.reservado,0), p_cantidad USING ERRCODE='23514';
  END IF;

  LOOP
    v_id_s := 'kdx_'||substr(replace(gen_random_uuid()::text,'-',''),1,18);
    PERFORM pg_advisory_xact_lock(hashtextextended('kardex-id:'||v_id_s,0));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.kardex k WHERE k.id=v_id_s);
  END LOOP;
  LOOP
    v_id_e := 'kdx_'||substr(replace(gen_random_uuid()::text,'-',''),1,18);
    PERFORM pg_advisory_xact_lock(hashtextextended('kardex-id:'||v_id_e,0));
    EXIT WHEN v_id_e <> v_id_s AND NOT EXISTS (SELECT 1 FROM public.kardex k WHERE k.id=v_id_e);
  END LOOP;
  v_trf := 'trf_'||substr(replace(gen_random_uuid()::text,'-',''),1,18);
  v_texto := 'Liberación de ' || v_uso_o || ' · ' || v_motivo || coalesce(' · ' || v_obs, '');

  SELECT r.* INTO v_rs FROM public.registrar_movimiento_atomico(
    p_kardex_id:=v_id_s, p_empresa_id:=p_empresa_id, p_material_id:=v_o.material_id,
    p_almacen_id:=v_o.almacen_id, p_sociedad_id:=v_o.sociedad_id,
    p_tipo:='transferencia_salida', p_motivo:='liberacion_cuarentena', p_cantidad:=p_cantidad,
    p_costo_unitario:=v_costo, p_costo_unitario_usd:=0, p_moneda:='PEN',
    p_lote:=v_o.lote, p_serie:=v_o.serie, p_vencimiento:=v_o.vencimiento,
    p_referencia_tipo:='transferencia', p_referencia_id:=v_trf,
    p_observacion:=v_texto, p_usuario_id:=v_uid,
    p_ubicacion_id:=v_o.ubicacion_id, p_skip_costo_promedio:=true
  ) r;

  SELECT r.* INTO v_re FROM public.registrar_movimiento_atomico(
    p_kardex_id:=v_id_e, p_empresa_id:=p_empresa_id, p_material_id:=v_o.material_id,
    p_almacen_id:=p_almacen_destino_id, p_sociedad_id:=v_o.sociedad_id,
    p_tipo:='transferencia_entrada', p_motivo:='liberacion_cuarentena', p_cantidad:=p_cantidad,
    p_costo_unitario:=v_costo, p_costo_unitario_usd:=0, p_moneda:='PEN',
    p_lote:=v_o.lote, p_serie:=v_o.serie, p_vencimiento:=v_o.vencimiento,
    p_referencia_tipo:='transferencia', p_referencia_id:=v_trf,
    p_observacion:=v_texto, p_usuario_id:=v_uid,
    p_ubicacion_id:=p_ubicacion_destino_id, p_skip_costo_promedio:=true
  ) r;

  RETURN QUERY SELECT v_trf, v_rs.kardex_id, v_re.kardex_id,
                      v_rs.saldo, v_rs.disponible, v_re.saldo, v_re.disponible;
END
$fn$;

REVOKE ALL ON FUNCTION public.wms_revertir_despacho_ot(text,text,jsonb,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wms_revertir_despacho_ot(text,text,jsonb,text,text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.wms_liberar_cuarentena(text,uuid,text,text,numeric,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wms_liberar_cuarentena(text,uuid,text,text,numeric,text,text) TO authenticated, service_role;

-- 7. Datos existentes ---------------------------------------------------------------
UPDATE public.kardex k SET nro_documento = ot.numero
  FROM public.ordenes_trabajo ot
 WHERE k.motivo = 'despacho_taller' AND k.referencia_tipo = 'ot'
   AND k.referencia_id = ot.id AND k.empresa_id = ot.empresa_id
   AND k.nro_documento IS NULL AND ot.numero IS NOT NULL;

DO $recalc$
DECLARE v_l record;
BEGIN
  FOR v_l IN
    SELECT r.ot_segmento_repuesto_id AS id
      FROM public.ot_segmento_repuestos_reservas r
     GROUP BY r.ot_segmento_repuesto_id
    HAVING sum(r.cantidad_despachada) > 0 AND sum(r.cantidad_liberada) > 0
  LOOP
    PERFORM public.wms_recalcular_estado_linea_repuesto(v_l.id);
  END LOOP;
END
$recalc$;

-- 8. Comprobación -------------------------------------------------------------------------
DO $check$
BEGIN
  IF pg_get_functiondef('public.registrar_movimiento_atomico(text,text,text,text,uuid,text,text,numeric,numeric,numeric,text,text,text,date,text,text,text,text,text,uuid,text,text,integer,numeric,numeric,text,boolean,text)'::regprocedure)
       NOT LIKE '%liberacion_cuarentena%'
     OR pg_get_functiondef('public.registrar_movimiento_atomico(text,text,text,text,uuid,text,text,numeric,numeric,numeric,text,text,text,date,text,text,text,text,text,uuid,text,text,integer,numeric,numeric,text,boolean,text)'::regprocedure)
       NOT LIKE '%reversa_despacho%' THEN
    RAISE EXCEPTION '2b-D: el guardián no quedó parchado.';
  END IF;
  IF pg_get_functiondef('public.wms_despachar_reserva_ot(text,text,jsonb,text,text)'::regprocedure)
       NOT LIKE '%p_nro_documento:=v_ot.numero%' THEN
    RAISE EXCEPTION '2b-D: wms_despachar_reserva_ot no quedó parchada.';
  END IF;
  IF to_regprocedure('public.wms_revertir_despacho_ot(text,text,jsonb,text,text)') IS NULL
     OR to_regprocedure('public.wms_liberar_cuarentena(text,uuid,text,text,numeric,text,text)') IS NULL THEN
    RAISE EXCEPTION '2b-D: faltan RPC.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.kardex k WHERE k.motivo='despacho_taller' AND k.nro_documento IS NULL
               AND k.referencia_tipo='ot'
               AND EXISTS (SELECT 1 FROM public.ordenes_trabajo o WHERE o.id=k.referencia_id AND o.numero IS NOT NULL)) THEN
    RAISE EXCEPTION '2b-D: despachos sin número de OT.';
  END IF;
END
$check$;
