-- WMS Fase 2b-B: transferencia / reubicación atómica de stock.
-- Dos asientos de kardex enlazados (transferencia_salida + transferencia_entrada) con el mismo
-- referencia_id, dentro de una sola transacción. Cada asiento pasa por el guardián
-- registrar_movimiento_atomico, de modo que permisos, alcance de sociedad y bloqueo de salidas
-- desde cuarentena/merma se aplican igual que en el resto de flujos.
-- Reglas: cantidad <= disponible (lo reservado no se mueve); lote/serie/vencimiento/sociedad viajan
-- con el stock; el destino debe ser otra ubicación activa de la empresa; no se transfiere desde
-- cuarentena/merma (hasta la acción Liberar de 2b-C); costo = promedio vigente, sin recalcularlo.

CREATE OR REPLACE FUNCTION public.wms_transferir_stock(
  p_empresa_id text,
  p_stock_origen_id uuid,
  p_almacen_destino_id text,
  p_ubicacion_destino_id text,
  p_cantidad numeric,
  p_observacion text DEFAULT NULL
)
RETURNS TABLE(
  transferencia_id text,
  kardex_salida_id text,
  kardex_entrada_id text,
  saldo_origen numeric,
  disponible_origen numeric,
  saldo_destino numeric,
  disponible_destino numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_o public.stock%ROWTYPE;
  v_tipo_control text;
  v_costo numeric;
  v_uso_o text;
  v_trf text;
  v_id_s text;
  v_id_e text;
  v_obs text := nullif(btrim(coalesce(p_observacion,'')),'');
  v_key_o text;
  v_key_d text;
  v_rs record;
  v_re record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Se requiere una sesión autenticada.' USING ERRCODE='42501';
  END IF;
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'No tienes acceso a esta empresa.' USING ERRCODE='42501';
  END IF;
  IF NOT public.usuario_puede(p_empresa_id,'inventario','crear') THEN
    RAISE EXCEPTION 'No tienes permiso para transferir stock.' USING ERRCODE='42501';
  END IF;
  IF p_stock_origen_id IS NULL OR nullif(btrim(coalesce(p_almacen_destino_id,'')),'') IS NULL
     OR nullif(btrim(coalesce(p_ubicacion_destino_id,'')),'') IS NULL THEN
    RAISE EXCEPTION 'Indica el stock de origen y la ubicación de destino.' USING ERRCODE='22023';
  END IF;
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor a cero.' USING ERRCODE='22023';
  END IF;

  -- Lectura previa (sin bloqueo) para conocer la clave de serialización.
  SELECT s.* INTO v_o FROM public.stock s
   WHERE s.id=p_stock_origen_id AND s.empresa_id=p_empresa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El stock de origen no existe en la empresa.' USING ERRCODE='P0002';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.almacenes a
                  WHERE a.id=p_almacen_destino_id AND a.empresa_id=p_empresa_id
                    AND lower(coalesce(a.estado,'activo'))='activo') THEN
    RAISE EXCEPTION 'El almacén de destino no pertenece a la empresa o no está activo.' USING ERRCODE='P0002';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ubicaciones u
                  WHERE u.id=p_ubicacion_destino_id AND u.empresa_id=p_empresa_id
                    AND u.almacen_id=p_almacen_destino_id AND u.activo) THEN
    RAISE EXCEPTION 'La ubicación de destino no pertenece al almacén/empresa o está inactiva.' USING ERRCODE='P0002';
  END IF;
  IF v_o.almacen_id = p_almacen_destino_id AND v_o.ubicacion_id = p_ubicacion_destino_id THEN
    RAISE EXCEPTION 'El destino debe ser distinto del origen.' USING ERRCODE='22023';
  END IF;

  -- Serializa origen y destino en orden estable de claves: evita interbloqueos entre transferencias opuestas.
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

  -- Relee con bloqueo de fila: los datos válidos son los posteriores al bloqueo.
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
  IF v_uso_o IN ('cuarentena','merma') THEN
    RAISE EXCEPTION 'El stock en una ubicación de % no se puede transferir hasta liberarlo; solo puede darse de baja como merma o devolución.', v_uso_o
      USING ERRCODE='23514';
  END IF;
  IF v_tipo_control='serie' AND p_cantidad <> 1 THEN
    RAISE EXCEPTION 'Artículos controlados por serie se transfieren de uno en uno.' USING ERRCODE='22023';
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

  SELECT r.* INTO v_rs FROM public.registrar_movimiento_atomico(
    p_kardex_id:=v_id_s, p_empresa_id:=p_empresa_id, p_material_id:=v_o.material_id,
    p_almacen_id:=v_o.almacen_id, p_sociedad_id:=v_o.sociedad_id,
    p_tipo:='transferencia_salida', p_motivo:='transferencia', p_cantidad:=p_cantidad,
    p_costo_unitario:=v_costo, p_costo_unitario_usd:=0, p_moneda:='PEN',
    p_lote:=v_o.lote, p_serie:=v_o.serie, p_vencimiento:=v_o.vencimiento,
    p_referencia_tipo:='transferencia', p_referencia_id:=v_trf,
    p_observacion:=v_obs, p_usuario_id:=v_uid,
    p_ubicacion_id:=v_o.ubicacion_id, p_skip_costo_promedio:=true
  ) r;

  SELECT r.* INTO v_re FROM public.registrar_movimiento_atomico(
    p_kardex_id:=v_id_e, p_empresa_id:=p_empresa_id, p_material_id:=v_o.material_id,
    p_almacen_id:=p_almacen_destino_id, p_sociedad_id:=v_o.sociedad_id,
    p_tipo:='transferencia_entrada', p_motivo:='transferencia', p_cantidad:=p_cantidad,
    p_costo_unitario:=v_costo, p_costo_unitario_usd:=0, p_moneda:='PEN',
    p_lote:=v_o.lote, p_serie:=v_o.serie, p_vencimiento:=v_o.vencimiento,
    p_referencia_tipo:='transferencia', p_referencia_id:=v_trf,
    p_observacion:=v_obs, p_usuario_id:=v_uid,
    p_ubicacion_id:=p_ubicacion_destino_id, p_skip_costo_promedio:=true
  ) r;

  RETURN QUERY SELECT v_trf, v_rs.kardex_id, v_re.kardex_id,
                      v_rs.saldo, v_rs.disponible, v_re.saldo, v_re.disponible;
END
$function$;

COMMENT ON FUNCTION public.wms_transferir_stock(text, uuid, text, text, numeric, text) IS
  'WMS 2b-B: transfiere/reubica stock disponible entre ubicaciones con dos asientos de kardex enlazados (referencia_tipo transferencia). Requiere inventario/crear. No admite cuarentena/merma como origen.';

REVOKE ALL ON FUNCTION public.wms_transferir_stock(text, uuid, text, text, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.wms_transferir_stock(text, uuid, text, text, numeric, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.wms_transferir_stock(text, uuid, text, text, numeric, text) TO authenticated, service_role;

-- Comprobación: si algo no quedó como se espera, la migración completa se revierte.
DO $check$
DECLARE
  v_oid oid := 'public.wms_transferir_stock(text, uuid, text, text, numeric, text)'::regprocedure;
  v_def text := pg_get_functiondef(v_oid);
BEGIN
  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid=v_oid) THEN
    RAISE EXCEPTION 'wms_transferir_stock debe ser SECURITY DEFINER';
  END IF;
  IF v_def NOT LIKE '%search_path%public%pg_temp%' THEN
    RAISE EXCEPTION 'wms_transferir_stock sin search_path fijo';
  END IF;
  IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE')
     OR NOT has_function_privilege('service_role', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated y service_role deben poder ejecutar wms_transferir_stock';
  END IF;
  IF has_function_privilege('anon', v_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'anon no debe poder ejecutar wms_transferir_stock';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a WHERE p.oid=v_oid AND a.grantee=0) THEN
    RAISE EXCEPTION 'PUBLIC no debe tener EXECUTE sobre wms_transferir_stock';
  END IF;
  IF v_def NOT LIKE '%transferencia_salida%' OR v_def NOT LIKE '%transferencia_entrada%' THEN
    RAISE EXCEPTION 'wms_transferir_stock debe registrar ambos asientos';
  END IF;
END
$check$;
