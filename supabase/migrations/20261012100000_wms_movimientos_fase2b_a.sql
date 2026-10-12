-- =====================================================================
-- WMS Fase 2b-A: guardián de movimientos y RPC de operación manual
-- Encapsula el motor existente, aplica permisos/sociedades y habilita
-- registro y anulación manual de movimientos de inventario.
-- =====================================================================
SET search_path = public, pg_temp;

-- La migración solo renombra el motor existente: su cuerpo permanece intacto.
DO $rename$
DECLARE
  v_old regprocedure := to_regprocedure(
    'public.registrar_movimiento_atomico(text,text,text,text,uuid,text,text,numeric,numeric,numeric,text,text,text,date,text,text,text,text,text,uuid,text,text,integer,numeric,numeric,text,boolean,text)');
  v_core regprocedure := to_regprocedure(
    'public.registrar_movimiento_atomico_core(text,text,text,text,uuid,text,text,numeric,numeric,numeric,text,text,text,date,text,text,text,text,text,uuid,text,text,integer,numeric,numeric,text,boolean,text)');
BEGIN
  IF v_old IS NOT NULL AND v_core IS NOT NULL THEN
    RAISE EXCEPTION 'Existen simultáneamente registrar_movimiento_atomico y su core; revise el esquema antes de continuar.';
  ELSIF v_old IS NOT NULL THEN
    EXECUTE 'ALTER FUNCTION public.registrar_movimiento_atomico(text,text,text,text,uuid,text,text,numeric,numeric,numeric,text,text,text,date,text,text,text,text,text,uuid,text,text,integer,numeric,numeric,text,boolean,text) RENAME TO registrar_movimiento_atomico_core';
  ELSIF v_core IS NULL THEN
    RAISE EXCEPTION 'No existe la firma esperada de 28 parámetros de registrar_movimiento_atomico.';
  END IF;
END
$rename$;

REVOKE ALL ON FUNCTION public.registrar_movimiento_atomico_core(
  text,text,text,text,uuid,text,text,numeric,numeric,numeric,text,text,text,date,
  text,text,text,text,text,uuid,text,text,integer,numeric,numeric,text,boolean,text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_movimiento_atomico_core(
  text,text,text,text,uuid,text,text,numeric,numeric,numeric,text,text,text,date,
  text,text,text,text,text,uuid,text,text,integer,numeric,numeric,text,boolean,text
) TO service_role;

CREATE OR REPLACE FUNCTION public.registrar_movimiento_atomico(
  p_kardex_id text,
  p_empresa_id text,
  p_material_id text,
  p_almacen_id text,
  p_sociedad_id uuid DEFAULT NULL,
  p_tipo text DEFAULT 'entrada',
  p_motivo text DEFAULT NULL,
  p_cantidad numeric DEFAULT 0,
  p_costo_unitario numeric DEFAULT 0,
  p_costo_unitario_usd numeric DEFAULT 0,
  p_moneda text DEFAULT 'PEN',
  p_lote text DEFAULT NULL,
  p_serie text DEFAULT NULL,
  p_vencimiento date DEFAULT NULL,
  p_referencia_tipo text DEFAULT NULL,
  p_referencia_id text DEFAULT NULL,
  p_nro_documento text DEFAULT NULL,
  p_proveedor_id text DEFAULT NULL,
  p_observacion text DEFAULT NULL,
  p_usuario_id uuid DEFAULT NULL,
  p_valorizacion_estado text DEFAULT NULL,
  p_orden_compra_id text DEFAULT NULL,
  p_orden_compra_item_idx integer DEFAULT NULL,
  p_precio_unitario_provisional numeric DEFAULT NULL,
  p_precio_unitario_real numeric DEFAULT NULL,
  p_recepcion_id text DEFAULT NULL,
  p_skip_costo_promedio boolean DEFAULT false,
  p_ubicacion_id text DEFAULT NULL
)
RETURNS TABLE (kardex_id text, saldo numeric, disponible numeric, costo_promedio numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $guardian$
DECLARE
  v_uid uuid := auth.uid();
  v_crear_inventario boolean;
  v_crear_recepcion boolean;
  v_editar_ot boolean;
  v_crear_remision boolean;
  v_alcance uuid[];
  v_uso text;
BEGIN
  -- service_role y otros procesos sin JWT conservan el comportamiento histórico del core.
  IF v_uid IS NOT NULL THEN
    IF p_tipo IS NULL OR p_tipo NOT IN ('entrada','salida','transferencia_salida','transferencia_entrada') THEN
      RAISE EXCEPTION 'Tipo de movimiento no válido.' USING ERRCODE='22023';
    END IF;
    IF p_motivo IN ('recepcion_oc','oc_pendiente_factura') AND p_tipo <> 'entrada' THEN
      RAISE EXCEPTION 'El motivo % solo admite movimientos de entrada.',p_motivo USING ERRCODE='42501';
    ELSIF p_motivo IN ('devolucion_proveedor','consumo_ot','despacho_guia') AND p_tipo <> 'salida' THEN
      RAISE EXCEPTION 'El motivo % solo admite movimientos de salida.',p_motivo USING ERRCODE='42501';
    END IF;
    IF p_motivo IN ('ajuste_conteo','ajuste_manual') OR coalesce(p_motivo, '') LIKE 'anulacion\_%' ESCAPE '\' THEN
      IF NOT public.usuario_puede(p_empresa_id, 'inventario', 'editar') THEN
        RAISE EXCEPTION 'No tienes permiso para editar movimientos de inventario.' USING ERRCODE='42501';
      END IF;
    ELSIF p_motivo IN ('recepcion_oc','oc_pendiente_factura','devolucion_proveedor') THEN
      v_crear_inventario := public.usuario_puede(p_empresa_id, 'inventario', 'crear');
      v_crear_recepcion := public.usuario_puede(p_empresa_id, 'recepciones', 'crear');
      IF NOT (v_crear_inventario OR v_crear_recepcion) THEN
        RAISE EXCEPTION 'No tienes permiso para registrar este movimiento de recepción.' USING ERRCODE='42501';
      END IF;
    ELSIF p_motivo = 'consumo_ot' THEN
      v_crear_inventario := public.usuario_puede(p_empresa_id, 'inventario', 'crear');
      v_editar_ot := public.usuario_puede(p_empresa_id, 'ot', 'editar');
      IF NOT (v_crear_inventario OR v_editar_ot) THEN
        RAISE EXCEPTION 'No tienes permiso para registrar el consumo de una OT.' USING ERRCODE='42501';
      END IF;
    ELSIF p_motivo IN ('despacho_guia','transferencia_guia','transferencia')
       OR p_tipo IN ('transferencia_salida','transferencia_entrada') THEN
      v_crear_inventario := public.usuario_puede(p_empresa_id, 'inventario', 'crear');
      v_crear_remision := public.usuario_puede(p_empresa_id, 'remision', 'crear');
      IF NOT (v_crear_inventario OR v_crear_remision) THEN
        RAISE EXCEPTION 'No tienes permiso para registrar despacho o transferencia.' USING ERRCODE='42501';
      END IF;
    ELSE
      IF NOT public.usuario_puede(p_empresa_id, 'inventario', 'crear') THEN
        RAISE EXCEPTION 'No tienes permiso para crear movimientos de inventario.' USING ERRCODE='42501';
      END IF;
    END IF;

    IF p_sociedad_id IS NOT NULL THEN
      v_alcance := public.usuario_alcance_sociedades(p_empresa_id);
      IF v_alcance IS NOT NULL AND NOT (p_sociedad_id = ANY(v_alcance)) THEN
        RAISE EXCEPTION 'La sociedad del movimiento está fuera de tu alcance.' USING ERRCODE='42501';
      END IF;
    END IF;

    IF p_tipo IN ('salida','transferencia_salida') AND p_ubicacion_id IS NOT NULL THEN
      SELECT u.uso INTO v_uso FROM public.ubicaciones u
       WHERE u.id = p_ubicacion_id AND u.empresa_id = p_empresa_id;
      IF FOUND AND v_uso IN ('cuarentena','merma')
         AND NOT (p_motivo IN ('merma','devolucion_proveedor','ajuste_conteo')
                  OR coalesce(p_motivo, '') LIKE 'anulacion\_%' ESCAPE '\') THEN
        RAISE EXCEPTION 'No se permite una salida con motivo % desde una ubicación de %.',
          coalesce(p_motivo,'(sin motivo)'), v_uso USING ERRCODE='23514';
      END IF;
    END IF;
  END IF;

  RETURN QUERY SELECT c.kardex_id, c.saldo, c.disponible, c.costo_promedio
    FROM public.registrar_movimiento_atomico_core(
      p_kardex_id,p_empresa_id,p_material_id,p_almacen_id,p_sociedad_id,p_tipo,p_motivo,
      p_cantidad,p_costo_unitario,p_costo_unitario_usd,p_moneda,p_lote,p_serie,p_vencimiento,
      p_referencia_tipo,p_referencia_id,p_nro_documento,p_proveedor_id,p_observacion,p_usuario_id,
      p_valorizacion_estado,p_orden_compra_id,p_orden_compra_item_idx,p_precio_unitario_provisional,
      p_precio_unitario_real,p_recepcion_id,p_skip_costo_promedio,p_ubicacion_id
    ) AS c;
END
$guardian$;

REVOKE ALL ON FUNCTION public.registrar_movimiento_atomico(
  text,text,text,text,uuid,text,text,numeric,numeric,numeric,text,text,text,date,
  text,text,text,text,text,uuid,text,text,integer,numeric,numeric,text,boolean,text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_movimiento_atomico(
  text,text,text,text,uuid,text,text,numeric,numeric,numeric,text,text,text,date,
  text,text,text,text,text,uuid,text,text,integer,numeric,numeric,text,boolean,text
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.wms_registrar_movimiento_manual(
  p_empresa_id text,
  p_accion text,
  p_motivo text,
  p_material_id text,
  p_almacen_id text,
  p_ubicacion_id text,
  p_sociedad_id uuid,
  p_cantidad numeric,
  p_costo_unitario numeric DEFAULT NULL,
  p_moneda text DEFAULT 'PEN',
  p_lote text DEFAULT NULL,
  p_serie text DEFAULT NULL,
  p_vencimiento date DEFAULT NULL,
  p_nro_documento text DEFAULT NULL,
  p_observacion text DEFAULT NULL
)
RETURNS TABLE (kardex_id text, saldo numeric, disponible numeric, costo_promedio numeric, diferencia numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $manual$
DECLARE
  v_uid uuid := auth.uid();
  v_tipo_control text;
  v_costo_promedio numeric;
  v_costo numeric;
  v_costo_usd numeric := 0;
  v_moneda text := upper(coalesce(nullif(btrim(p_moneda),''),'PEN'));
  v_tipo text;
  v_cantidad numeric;
  v_diferencia numeric := NULL;
  v_fisico numeric := 0;
  v_disponible numeric := 0;
  v_reservado numeric := 0;
  v_stock_id text;
  v_id text;
  v_result record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Se requiere una sesión autenticada.' USING ERRCODE='42501'; END IF;
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'No tienes acceso a esta empresa.' USING ERRCODE='42501';
  END IF;
  IF p_accion IS NULL OR p_accion NOT IN ('entrada','salida','ajuste') THEN
    RAISE EXCEPTION 'La acción debe ser entrada, salida o ajuste.' USING ERRCODE='22023';
  END IF;
  IF p_accion = 'ajuste' THEN
    IF NOT public.usuario_puede(p_empresa_id,'inventario','editar') THEN
      RAISE EXCEPTION 'No tienes permiso para ajustar inventario.' USING ERRCODE='42501';
    END IF;
  ELSIF NOT public.usuario_puede(p_empresa_id,'inventario','crear') THEN
    RAISE EXCEPTION 'No tienes permiso para registrar movimientos de inventario.' USING ERRCODE='42501';
  END IF;

  IF (p_accion='entrada' AND p_motivo NOT IN ('saldo_inicial','ajuste_positivo','devolucion_ot','compra_directa_sin_oc'))
     OR (p_accion='salida' AND p_motivo NOT IN ('devolucion_proveedor','merma','robo','error_ingreso'))
     OR (p_accion='ajuste' AND p_motivo NOT IN ('ajuste_conteo','ajuste_manual')) THEN
    RAISE EXCEPTION 'El motivo no corresponde a la acción seleccionada.' USING ERRCODE='22023';
  END IF;
  IF nullif(btrim(coalesce(p_motivo,'')),'') IS NULL THEN
    RAISE EXCEPTION 'El motivo es obligatorio.' USING ERRCODE='22023';
  END IF;
  IF p_accion IN ('salida','ajuste') AND nullif(btrim(coalesce(p_observacion,'')),'') IS NULL THEN
    RAISE EXCEPTION 'La observación es obligatoria para salidas y ajustes.' USING ERRCODE='22023';
  END IF;
  IF p_cantidad IS NULL OR p_cantidad < 0 OR (p_accion<>'ajuste' AND p_cantidad=0) THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor a cero; el conteo de ajuste puede ser cero.' USING ERRCODE='22023';
  END IF;
  IF p_accion='entrada' AND p_motivo IN ('saldo_inicial','compra_directa_sin_oc')
     AND (p_costo_unitario IS NULL OR p_costo_unitario <= 0) THEN
    RAISE EXCEPTION 'Este motivo de entrada requiere un costo unitario mayor a cero.' USING ERRCODE='22023';
  END IF;
  IF p_accion='entrada' AND p_motivo='compra_directa_sin_oc'
     AND nullif(btrim(coalesce(p_nro_documento,'')),'') IS NULL THEN
    RAISE EXCEPTION 'La compra directa sin OC requiere número de documento.' USING ERRCODE='22023';
  END IF;
  IF v_moneda NOT IN ('PEN','USD') THEN RAISE EXCEPTION 'Usa PEN o USD como moneda.' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.almacenes a
                  WHERE a.id=p_almacen_id AND a.empresa_id=p_empresa_id
                    AND coalesce(a.estado,'activo')='activo') THEN
    RAISE EXCEPTION 'El almacén no pertenece a la empresa o no está activo.' USING ERRCODE='P0002';
  END IF;
  SELECT m.tipo_control, coalesce(m.costo_promedio,0) INTO v_tipo_control, v_costo_promedio
    FROM public.materiales m WHERE m.id=p_material_id AND m.empresa_id=p_empresa_id
      AND coalesce(m.estado,'activo')='activo';
  IF NOT FOUND THEN RAISE EXCEPTION 'El material no existe en la empresa o está inactivo.' USING ERRCODE='P0002'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ubicaciones u
                  WHERE u.id=p_ubicacion_id AND u.empresa_id=p_empresa_id
                    AND u.almacen_id=p_almacen_id AND u.activo) THEN
    RAISE EXCEPTION 'La ubicación no pertenece al almacén/empresa o está inactiva.' USING ERRCODE='P0002';
  END IF;
  IF v_tipo_control='lote' AND nullif(btrim(coalesce(p_lote,'')),'') IS NULL THEN
    RAISE EXCEPTION 'Este artículo requiere número de lote.' USING ERRCODE='22023';
  END IF;
  IF v_tipo_control='serie' AND nullif(btrim(coalesce(p_serie,'')),'') IS NULL THEN
    RAISE EXCEPTION 'Este artículo requiere número de serie.' USING ERRCODE='22023';
  END IF;
  IF p_accion='entrada' AND v_tipo_control='serie' AND p_cantidad <> 1 THEN
    RAISE EXCEPTION 'Artículos controlados por serie deben ingresarse de uno en uno.' USING ERRCODE='22023';
  END IF;

  IF p_accion='entrada' THEN
    v_tipo := 'entrada';
    v_cantidad := p_cantidad;
    IF p_motivo IN ('saldo_inicial','compra_directa_sin_oc') THEN
      v_costo := p_costo_unitario;
      IF v_moneda='USD' THEN v_costo_usd := p_costo_unitario; END IF;
    ELSE
      -- Conserva el promedio PEN actual en entradas sin costo de compra.
      v_costo := v_costo_promedio;
      v_moneda := 'PEN';
    END IF;
  ELSIF p_accion='salida' THEN
    v_tipo := 'salida';
    v_cantidad := p_cantidad;
    SELECT coalesce(s.disponible,0) INTO v_disponible FROM public.stock s
     WHERE s.empresa_id=p_empresa_id AND s.material_id=p_material_id AND s.almacen_id=p_almacen_id
       AND s.ubicacion_id=p_ubicacion_id AND s.lote IS NOT DISTINCT FROM p_lote
       AND s.serie IS NOT DISTINCT FROM p_serie AND s.sociedad_id IS NOT DISTINCT FROM p_sociedad_id
     FOR UPDATE;
    IF NOT FOUND THEN v_disponible := 0; END IF;
    IF p_cantidad > v_disponible THEN
      RAISE EXCEPTION 'Stock insuficiente en la ubicación seleccionada: disponible %, solicitado %.', v_disponible, p_cantidad USING ERRCODE='23514';
    END IF;
    v_costo := v_costo_promedio;
    v_moneda := 'PEN';
  ELSE
    -- El bloqueo por clave serializa también los conteos cuando aún no hay fila de stock.
    PERFORM pg_advisory_xact_lock(hashtextextended(
      'wms-stock:'||p_empresa_id||':'||p_material_id||':'||p_almacen_id||':'||p_ubicacion_id||':'||
      coalesce(p_lote,'')||':'||coalesce(p_serie,'')||':'||coalesce(p_sociedad_id::text,'NULL'),0));
    SELECT s.id,s.fisico,s.disponible,s.reservado INTO v_stock_id,v_fisico,v_disponible,v_reservado
      FROM public.stock s WHERE s.empresa_id=p_empresa_id AND s.material_id=p_material_id
       AND s.almacen_id=p_almacen_id AND s.ubicacion_id=p_ubicacion_id
       AND s.lote IS NOT DISTINCT FROM p_lote AND s.serie IS NOT DISTINCT FROM p_serie
       AND s.sociedad_id IS NOT DISTINCT FROM p_sociedad_id FOR UPDATE;
    IF NOT FOUND THEN v_fisico:=0; v_disponible:=0; v_reservado:=0; END IF;
    v_diferencia := p_cantidad - coalesce(v_fisico,0);
    IF v_diferencia=0 THEN RAISE EXCEPTION 'El conteo coincide con el stock físico; no hay ajuste que registrar.' USING ERRCODE='22023'; END IF;
    IF p_cantidad < coalesce(v_reservado,0) THEN
      RAISE EXCEPTION 'La cantidad contada (%) es menor que lo reservado (%).',p_cantidad,v_reservado USING ERRCODE='23514';
    END IF;
    v_tipo := CASE WHEN v_diferencia>0 THEN 'entrada' ELSE 'salida' END;
    v_cantidad := abs(v_diferencia);
    v_costo := v_costo_promedio;
    v_moneda := 'PEN';
  END IF;

  LOOP
    v_id := 'kdx_'||substr(replace(gen_random_uuid()::text,'-',''),1,18);
    PERFORM pg_advisory_xact_lock(hashtextextended('kardex-id:'||v_id,0));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.kardex k WHERE k.id=v_id);
  END LOOP;
  SELECT r.* INTO v_result FROM public.registrar_movimiento_atomico(
    p_kardex_id:=v_id,p_empresa_id:=p_empresa_id,p_material_id:=p_material_id,p_almacen_id:=p_almacen_id,
    p_sociedad_id:=p_sociedad_id,p_tipo:=v_tipo,p_motivo:=p_motivo,p_cantidad:=v_cantidad,
    p_costo_unitario:=coalesce(v_costo,0),p_costo_unitario_usd:=v_costo_usd,p_moneda:=v_moneda,
    p_lote:=p_lote,p_serie:=p_serie,p_vencimiento:=p_vencimiento,p_referencia_tipo:='manual',
    p_referencia_id:=NULL,p_nro_documento:=p_nro_documento,p_observacion:=nullif(btrim(coalesce(p_observacion,'')),''),
    p_usuario_id:=v_uid,p_ubicacion_id:=p_ubicacion_id,
    p_skip_costo_promedio:=p_accion<>'entrada' OR p_motivo NOT IN ('saldo_inicial','compra_directa_sin_oc')
  ) r;
  RETURN QUERY SELECT v_result.kardex_id,v_result.saldo,v_result.disponible,v_result.costo_promedio,v_diferencia;
END
$manual$;

REVOKE ALL ON FUNCTION public.wms_registrar_movimiento_manual(text,text,text,text,text,text,uuid,numeric,numeric,text,text,text,date,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wms_registrar_movimiento_manual(text,text,text,text,text,text,uuid,numeric,numeric,text,text,text,date,text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.wms_anular_movimiento(
  p_empresa_id text,
  p_kardex_id text,
  p_motivo text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $void$
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
       AND s.ubicacion_id=v_k.ubicacion_id AND s.lote IS NOT DISTINCT FROM v_k.lote
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
$void$;

REVOKE ALL ON FUNCTION public.wms_anular_movimiento(text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wms_anular_movimiento(text,text,text) TO authenticated, service_role;

COMMENT ON FUNCTION public.registrar_movimiento_atomico(text,text,text,text,uuid,text,text,numeric,numeric,numeric,text,text,text,date,text,text,text,text,text,uuid,text,text,integer,numeric,numeric,text,boolean,text)
  IS 'Valida permisos, sociedad y uso de ubicación antes de delegar al motor atómico.';
COMMENT ON FUNCTION public.wms_registrar_movimiento_manual(text,text,text,text,text,text,uuid,numeric,numeric,text,text,text,date,text,text)
  IS 'Registra una entrada, salida o ajuste manual de inventario.';
COMMENT ON FUNCTION public.wms_anular_movimiento(text,text,text)
  IS 'Anula un movimiento elegible y registra su movimiento inverso.';
