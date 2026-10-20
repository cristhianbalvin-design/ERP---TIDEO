-- WMS: cierre de reservas al cerrar/anular la OT, traslado de reserva central -> periferico
-- y anulacion de movimientos con ubicacion nula.
-- Aditiva: funciones nuevas, un disparador nuevo y un CREATE OR REPLACE de wms_anular_movimiento
-- (unico cambio: s.ubicacion_id IS NOT DISTINCT FROM v_k.ubicacion_id).

-- 1) Liberacion interna de reservas pendientes de una OT (sin chequeo de permisos: solo la invoca el disparador).
CREATE OR REPLACE FUNCTION public.wms_liberar_reservas_ot_interno(p_ot_id text, p_motivo text)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ot public.ordenes_trabajo%rowtype;
  v_key record; v_res record; v_stock public.stock%rowtype; v_linea record;
  v_pend_res numeric; v_pend numeric; v_total numeric := 0; v_acc text; v_libera numeric;
BEGIN
  SELECT * INTO v_ot FROM public.ordenes_trabajo WHERE id = p_ot_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  FOR v_key IN
    SELECT DISTINCT 'wms-stock:'||s.empresa_id||':'||s.material_id||':'||s.almacen_id||':'||coalesce(s.ubicacion_id,'')||':'||
           coalesce(s.lote,'')||':'||coalesce(s.serie,'')||':'||coalesce(s.sociedad_id::text,'NULL') AS k
      FROM public.ot_segmento_repuestos_reservas r JOIN public.stock s ON s.id = r.stock_id
     WHERE r.ot_id = p_ot_id AND r.empresa_id = v_ot.empresa_id ORDER BY 1
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(v_key.k, 0));
  END LOOP;

  FOR v_linea IN
    SELECT l.id, l.sociedad_id FROM public.ot_segmento_repuestos l
     WHERE l.ot_id = p_ot_id AND l.empresa_id = v_ot.empresa_id ORDER BY l.id FOR UPDATE
  LOOP
    v_pend := 0;
    FOR v_res IN
      SELECT * FROM public.ot_segmento_repuestos_reservas r
       WHERE r.ot_segmento_repuesto_id = v_linea.id
         AND r.cantidad_reservada - r.cantidad_despachada - r.cantidad_liberada > 0
       ORDER BY r.created_at, r.id FOR UPDATE
    LOOP
      v_pend_res := v_res.cantidad_reservada - v_res.cantidad_despachada - v_res.cantidad_liberada;
      SELECT * INTO v_stock FROM public.stock WHERE id = v_res.stock_id FOR UPDATE;
      IF FOUND THEN
        v_libera := least(v_pend_res, greatest(coalesce(v_stock.reservado,0), 0));
        IF v_libera < v_pend_res THEN
          RAISE WARNING 'Reserva inconsistente al cerrar la OT %: stock % reservado % < pendiente %.', p_ot_id, v_stock.id, coalesce(v_stock.reservado,0), v_pend_res;
        END IF;
        UPDATE public.stock SET reservado = coalesce(reservado,0) - v_libera,
               disponible = coalesce(disponible,0) + v_libera, updated_at = now() WHERE id = v_stock.id;
      END IF;
      UPDATE public.ot_segmento_repuestos_reservas SET cantidad_liberada = cantidad_reservada - cantidad_despachada WHERE id = v_res.id;
      v_pend := v_pend + v_pend_res;
    END LOOP;
    IF v_pend > 0 THEN
      PERFORM public.wms_recalcular_estado_linea_repuesto(v_linea.id);
      v_acc := 'acc_'||substr(replace(gen_random_uuid()::text,'-',''),1,18);
      INSERT INTO public.ot_segmento_repuestos_acciones
        (id, empresa_id, sociedad_id, ot_id, ot_segmento_repuesto_id, tipo, cantidad, motivo, usuario_id)
      VALUES (v_acc, v_ot.empresa_id, v_linea.sociedad_id, p_ot_id, v_linea.id, 'cierre_ot', v_pend, coalesce(nullif(btrim(p_motivo),''),'cierre_ot'), v_uid);
      v_total := v_total + v_pend;
    END IF;
  END LOOP;
  RETURN v_total;
END
$function$;

REVOKE ALL ON FUNCTION public.wms_liberar_reservas_ot_interno(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wms_liberar_reservas_ot_interno(text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.trg_liberar_reservas_cierre_ot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.estado IN ('cerrada','cerrado_conforme','cerrado','anulada','cancelada')
     AND OLD.estado IS DISTINCT FROM NEW.estado THEN
    PERFORM public.wms_liberar_reservas_ot_interno(
      NEW.id,
      CASE WHEN NEW.estado IN ('anulada','cancelada') THEN 'anulacion_ot' ELSE 'cierre_ot' END);
  END IF;
  RETURN NEW;
END
$function$;

DO $mig$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_ordenes_trabajo_liberar_reservas_cierre'
                   AND tgrelid = 'public.ordenes_trabajo'::regclass) THEN
    CREATE TRIGGER trg_ordenes_trabajo_liberar_reservas_cierre
      AFTER UPDATE OF estado ON public.ordenes_trabajo
      FOR EACH ROW EXECUTE FUNCTION public.trg_liberar_reservas_cierre_ot();
  END IF;
END
$mig$;

-- 2) Traslado de la reserva pendiente que esta en un almacen central al periferico de la mina de la OT.
CREATE OR REPLACE FUNCTION public.wms_trasladar_reserva_ot(p_empresa_id text, p_ot_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_alcance uuid[];
  v_ot public.ordenes_trabajo%rowtype;
  v_mina text;
  v_res record; v_stock public.stock%rowtype; v_dest public.stock%rowtype; v_key record;
  v_alm text; v_ubi text; v_pend numeric; v_exist public.ot_segmento_repuestos_reservas%rowtype;
  v_movidos jsonb := '[]'::jsonb; v_total numeric := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Se requiere una sesión autenticada.' USING ERRCODE='42501'; END IF;
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'No tienes acceso a esta empresa.' USING ERRCODE='42501';
  END IF;
  IF NOT public.usuario_puede(p_empresa_id,'inventario','crear') THEN
    RAISE EXCEPTION 'No tienes permiso para trasladar stock.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_ot FROM public.ordenes_trabajo WHERE id = p_ot_id AND empresa_id = p_empresa_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La OT no existe en la empresa.' USING ERRCODE='P0002'; END IF;
  v_alcance := public.usuario_alcance_sociedades(p_empresa_id);
  IF v_alcance IS NOT NULL AND NOT (v_ot.sociedad_id = ANY (v_alcance)) THEN
    RAISE EXCEPTION 'La sociedad de la OT está fuera de tu alcance.' USING ERRCODE='42501';
  END IF;
  SELECT p.mina_id INTO v_mina FROM public.proyectos p WHERE p.id = v_ot.proyecto_id AND p.empresa_id = p_empresa_id;
  IF v_mina IS NULL THEN
    RAISE EXCEPTION 'La OT no tiene un proyecto con mina; no hay almacén periférico al que trasladar.' USING ERRCODE='22023';
  END IF;

  FOR v_key IN
    SELECT DISTINCT 'wms-stock:'||s.empresa_id||':'||s.material_id||':'||s.almacen_id||':'||coalesce(s.ubicacion_id,'')||':'||
           coalesce(s.lote,'')||':'||coalesce(s.serie,'')||':'||coalesce(s.sociedad_id::text,'NULL') AS k
      FROM public.ot_segmento_repuestos_reservas r JOIN public.stock s ON s.id = r.stock_id
     WHERE r.ot_id = p_ot_id AND r.empresa_id = p_empresa_id ORDER BY 1
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended(v_key.k, 0));
  END LOOP;

  FOR v_res IN
    SELECT r.* FROM public.ot_segmento_repuestos_reservas r
      JOIN public.almacenes a ON a.id = r.almacen_id
     WHERE r.ot_id = p_ot_id AND r.empresa_id = p_empresa_id AND a.clase = 'central'
       AND r.cantidad_reservada - r.cantidad_despachada - r.cantidad_liberada > 0
     ORDER BY r.created_at, r.id FOR UPDATE OF r
  LOOP
    v_pend := v_res.cantidad_reservada - v_res.cantidad_despachada - v_res.cantidad_liberada;

    SELECT a.id INTO v_alm FROM public.almacenes a
     WHERE a.empresa_id = p_empresa_id AND a.clase = 'periferico' AND a.mina_id = v_mina
       AND lower(coalesce(a.estado,'activo')) = 'activo'
     ORDER BY a.codigo, a.id LIMIT 1;
    IF v_alm IS NULL THEN
      RAISE EXCEPTION 'La mina de la OT no tiene un almacén periférico activo.' USING ERRCODE='22023';
    END IF;
    SELECT u.id INTO v_ubi FROM public.ubicaciones u
     WHERE u.empresa_id = p_empresa_id AND u.almacen_id = v_alm AND u.activo AND u.es_general
     ORDER BY u.id LIMIT 1;
    IF v_ubi IS NULL THEN
      RAISE EXCEPTION 'El almacén periférico no tiene ubicación general activa.' USING ERRCODE='22023';
    END IF;

    SELECT * INTO v_stock FROM public.stock WHERE id = v_res.stock_id FOR UPDATE;
    IF NOT FOUND OR coalesce(v_stock.reservado,0) < v_pend THEN
      RAISE EXCEPTION 'La reserva cambió: inconsistencia de stock en la OT %. Actualiza la pantalla.', coalesce(v_ot.numero,p_ot_id) USING ERRCODE='40001';
    END IF;

    -- Libera temporalmente la reserva para que la transferencia pueda mover esas unidades.
    UPDATE public.stock SET reservado = coalesce(reservado,0) - v_pend,
           disponible = coalesce(disponible,0) + v_pend, updated_at = now() WHERE id = v_stock.id;

    PERFORM 1 FROM public.wms_transferir_stock(p_empresa_id, v_stock.id, v_alm, v_ubi, v_pend,
              'Traslado de reserva de la OT '||coalesce(v_ot.numero,p_ot_id));

    SELECT * INTO v_dest FROM public.stock s
     WHERE s.empresa_id = p_empresa_id AND s.material_id = v_stock.material_id AND s.almacen_id = v_alm
       AND s.ubicacion_id = v_ubi AND s.lote IS NOT DISTINCT FROM v_stock.lote
       AND s.serie IS NOT DISTINCT FROM v_stock.serie AND s.sociedad_id IS NOT DISTINCT FROM v_stock.sociedad_id
     FOR UPDATE;
    IF NOT FOUND OR coalesce(v_dest.disponible,0) < v_pend THEN
      RAISE EXCEPTION 'No se pudo reservar en el periférico tras el traslado.' USING ERRCODE='40001';
    END IF;
    UPDATE public.stock SET reservado = coalesce(reservado,0) + v_pend,
           disponible = coalesce(disponible,0) - v_pend, updated_at = now() WHERE id = v_dest.id;

    SELECT * INTO v_exist FROM public.ot_segmento_repuestos_reservas
     WHERE ot_segmento_repuesto_id = v_res.ot_segmento_repuesto_id AND stock_id = v_dest.id FOR UPDATE;
    IF FOUND THEN
      UPDATE public.ot_segmento_repuestos_reservas SET cantidad_reservada = cantidad_reservada + v_pend WHERE id = v_exist.id;
      IF v_res.cantidad_reservada - v_pend > 0 THEN
        UPDATE public.ot_segmento_repuestos_reservas SET cantidad_reservada = cantidad_reservada - v_pend WHERE id = v_res.id;
      ELSE
        DELETE FROM public.ot_segmento_repuestos_reservas WHERE id = v_res.id;
      END IF;
    ELSIF v_res.cantidad_despachada = 0 AND v_res.cantidad_liberada = 0 THEN
      UPDATE public.ot_segmento_repuestos_reservas SET stock_id = v_dest.id, almacen_id = v_alm WHERE id = v_res.id;
    ELSE
      UPDATE public.ot_segmento_repuestos_reservas SET cantidad_reservada = cantidad_reservada - v_pend WHERE id = v_res.id;
      INSERT INTO public.ot_segmento_repuestos_reservas
        (empresa_id, sociedad_id, ot_id, ot_segmento_repuesto_id, material_id, stock_id, almacen_id, cantidad_reservada)
      VALUES (v_res.empresa_id, v_res.sociedad_id, v_res.ot_id, v_res.ot_segmento_repuesto_id,
              v_res.material_id, v_dest.id, v_alm, v_pend);
    END IF;

    v_total := v_total + v_pend;
    v_movidos := v_movidos || jsonb_build_array(jsonb_build_object(
      'material_id', v_res.material_id, 'cantidad', v_pend, 'almacen_origen_id', v_stock.almacen_id, 'almacen_destino_id', v_alm));
  END LOOP;

  RETURN jsonb_build_object('ot_id', p_ot_id, 'mina_id', v_mina, 'total_trasladado', v_total, 'movimientos', v_movidos);
END
$function$;

REVOKE ALL ON FUNCTION public.wms_trasladar_reserva_ot(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wms_trasladar_reserva_ot(text,text) TO authenticated, service_role;

COMMENT ON FUNCTION public.wms_trasladar_reserva_ot(text,text) IS
  'Traslada la reserva pendiente de la OT que esta en almacenes centrales al periferico de la mina del proyecto de la OT (kardex transferencia + reserva reasignada).';

-- 3) wms_anular_movimiento: la busqueda de disponible tolera kardex con ubicacion nula (IS NOT DISTINCT FROM).
CREATE OR REPLACE FUNCTION public.wms_anular_movimiento(p_empresa_id text, p_kardex_id text, p_motivo text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_k public.kardex%ROWTYPE;
  v_disponible numeric := 0;
  v_id text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Se requiere una sesión autenticada.' USING ERRCODE='42501'; END IF;
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN RAISE EXCEPTION 'No tienes acceso a esta empresa.' USING ERRCODE='42501'; END IF;
  IF NOT public.usuario_puede(p_empresa_id,'inventario','editar') THEN
    RAISE EXCEPTION 'No tienes permiso para anular movimientos de inventario.' USING ERRCODE='42501';
  END IF;
  IF nullif(btrim(coalesce(p_motivo,'')),'') IS NULL THEN RAISE EXCEPTION 'Indica el motivo de anulación.' USING ERRCODE='22023'; END IF;
  SELECT k.* INTO v_k FROM public.kardex k WHERE k.id=p_kardex_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El movimiento no existe.' USING ERRCODE='P0002'; END IF;
  IF v_k.empresa_id IS DISTINCT FROM p_empresa_id THEN RAISE EXCEPTION 'El movimiento no pertenece a esta empresa.' USING ERRCODE='42501'; END IF;
  IF coalesce(v_k.anulado,false) THEN RAISE EXCEPTION 'El movimiento ya está anulado.' USING ERRCODE='23514'; END IF;
  IF v_k.referencia_tipo='anulacion' OR coalesce(v_k.motivo,'') LIKE 'anulacion\_%' ESCAPE '\' THEN
    RAISE EXCEPTION 'Una anulación no puede anularse; corrija el movimiento original.' USING ERRCODE='23514';
  END IF;
  IF v_k.motivo='recepcion_oc' OR v_k.referencia_tipo='recepcion' THEN
    RAISE EXCEPTION 'Corrija este movimiento desde Recepciones.' USING ERRCODE='23514';
  ELSIF v_k.motivo IN ('consumo_ot') OR v_k.referencia_tipo='ot' THEN
    RAISE EXCEPTION 'Corrija este movimiento desde la OT asociada.' USING ERRCODE='23514';
  ELSIF v_k.motivo IN ('despacho_guia','transferencia_guia') OR v_k.referencia_tipo='guia' THEN
    RAISE EXCEPTION 'Corrija este movimiento desde la guía asociada.' USING ERRCODE='23514';
  ELSIF v_k.motivo IN ('oc_pendiente_factura') THEN
    RAISE EXCEPTION 'Corrija este ingreso pendiente desde Recepciones/Administración.' USING ERRCODE='23514';
  ELSIF v_k.motivo='transferencia' OR v_k.referencia_tipo='transferencia'
        OR v_k.tipo IN ('transferencia_salida','transferencia_entrada') THEN
    RAISE EXCEPTION 'No se puede anular una transferencia directamente; registre una transferencia inversa.' USING ERRCODE='23514';
  END IF;
  IF coalesce(v_k.motivo,'') NOT IN (
       'saldo_inicial','ajuste_positivo','devolucion_ot','compra_directa_sin_oc',
       'ajuste_conteo','ajuste_manual','merma','robo','error_ingreso'
     ) AND NOT (v_k.motivo='devolucion_proveedor' AND v_k.referencia_tipo='manual') THEN
    RAISE EXCEPTION 'Este movimiento debe corregirse desde su operación de origen.' USING ERRCODE='23514';
  END IF;
  IF v_k.tipo NOT IN ('entrada','salida') THEN
    RAISE EXCEPTION 'Este tipo de movimiento requiere corrección desde su operación de origen.' USING ERRCODE='23514';
  END IF;

  IF v_k.tipo='entrada' THEN
    SELECT coalesce(s.disponible,0) INTO v_disponible FROM public.stock s
     WHERE s.empresa_id=v_k.empresa_id AND s.material_id=v_k.material_id AND s.almacen_id=v_k.almacen_id
       AND s.ubicacion_id IS NOT DISTINCT FROM v_k.ubicacion_id AND s.lote IS NOT DISTINCT FROM v_k.lote
       AND s.serie IS NOT DISTINCT FROM v_k.serie AND s.sociedad_id IS NOT DISTINCT FROM v_k.sociedad_id
     FOR UPDATE;
    IF NOT FOUND THEN v_disponible:=0; END IF;
    IF v_disponible < v_k.cantidad THEN
      RAISE EXCEPTION 'No se puede revertir la entrada: disponible actual % y cantidad requerida %. Reponga o corrija el stock antes de anular.',v_disponible,v_k.cantidad USING ERRCODE='23514';
    END IF;
  END IF;

  UPDATE public.kardex k SET anulado=true,anulado_por=v_uid,anulado_motivo=btrim(p_motivo),anulado_at=now()
   WHERE k.id=p_kardex_id AND k.empresa_id=p_empresa_id AND coalesce(k.anulado,false)=false;
  IF NOT FOUND THEN RAISE EXCEPTION 'El movimiento ya fue anulado por otra operación.' USING ERRCODE='23514'; END IF;

  LOOP
    v_id:='kdx_'||substr(replace(gen_random_uuid()::text,'-',''),1,18);
    PERFORM pg_advisory_xact_lock(hashtextextended('kardex-id:'||v_id,0));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.kardex k WHERE k.id=v_id);
  END LOOP;
  PERFORM * FROM public.registrar_movimiento_atomico(
    p_kardex_id:=v_id,p_empresa_id:=v_k.empresa_id,p_material_id:=v_k.material_id,p_almacen_id:=v_k.almacen_id,
    p_sociedad_id:=v_k.sociedad_id,p_tipo:=CASE WHEN v_k.tipo='entrada' THEN 'salida' ELSE 'entrada' END,
    p_motivo:='anulacion_'||v_k.tipo,p_cantidad:=v_k.cantidad,p_costo_unitario:=coalesce(v_k.costo_unitario,0),
    p_costo_unitario_usd:=coalesce(v_k.costo_unitario_usd,0),p_moneda:='PEN',p_lote:=v_k.lote,p_serie:=v_k.serie,
    p_vencimiento:=v_k.vencimiento,p_referencia_tipo:='anulacion',p_referencia_id:=v_k.id,
    p_nro_documento:=v_k.nro_documento,p_observacion:='Anulación de '||v_k.id||': '||btrim(p_motivo),
    p_usuario_id:=v_uid,p_ubicacion_id:=v_k.ubicacion_id,p_skip_costo_promedio:=false
  );
  RETURN v_id;
END
$function$;

-- Comprobacion: objetos creados y el cambio de wms_anular_movimiento aplicado.
DO $check$
BEGIN
  IF to_regprocedure('public.wms_trasladar_reserva_ot(text,text)') IS NULL
     OR to_regprocedure('public.wms_liberar_reservas_ot_interno(text,text)') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_ordenes_trabajo_liberar_reservas_cierre')
     OR position('s.ubicacion_id IS NOT DISTINCT FROM v_k.ubicacion_id' IN pg_get_functiondef('public.wms_anular_movimiento(text,text,text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'Verificación de la migración 20261014200000 falló.';
  END IF;
END
$check$;
