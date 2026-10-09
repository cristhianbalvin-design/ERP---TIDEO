-- =====================================================================
-- WMS Etapa B1 — RPC atómica de recepción física de OC desde Operaciones
-- registrar_recepcion_oc_fisica(empresa, oc, almacén, items, observaciones)
--
-- Una sola transacción: valida -> crea la recepción -> una entrada de stock por
-- línea (con ubicación) -> recalcula estado/porcentaje de la OC.
-- Decisiones del usuario: valorización 'definitivo' al precio de la OC (D1a);
-- rechaza OC con ingresos 'pendiente_factura' abiertos (D2); con observaciones
-- la recepción queda 'observada' y el stock ENTRA igual (D3).
-- No genera CxP ni factura. SECURITY DEFINER con chequeos explícitos de empresa,
-- permisos (recepciones/crear e inventario/crear) y alcance de sociedades,
-- porque el rol de almacén puede no tener edición sobre ordenes_compra.
-- p_items: [{"idx": <posición 0-based en ordenes_compra.items>,
--            "recibido": <numeric>, "ubicacion_id": <text|null>}]
-- =====================================================================
CREATE OR REPLACE FUNCTION public.registrar_recepcion_oc_fisica(
  p_empresa_id text,
  p_orden_compra_id text,
  p_almacen_id text,
  p_items jsonb,
  p_observaciones text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_oc public.ordenes_compra%rowtype;
  v_alcance uuid[];
  v_obs text := nullif(btrim(coalesce(p_observaciones, '')), '');
  v_fecha date := (now() AT TIME ZONE 'America/Lima')::date;
  v_rec_id text := 'rec_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 18);
  v_moneda text;
  v_general text;
  v_item jsonb;
  v_in jsonb;
  v_idx integer;
  v_pedido numeric;
  v_previo numeric;
  v_pend numeric;
  v_cant numeric;
  v_precio numeric;
  v_ubic text;
  v_total numeric := 0;
  v_items_rec jsonb := '[]'::jsonb;
  v_movs jsonb := '[]'::jsonb;
  v_mov jsonb;
  v_recalculo jsonb;
  v_n_movs integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sesión no válida.';
  END IF;
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'No tienes acceso a esta empresa.';
  END IF;
  IF NOT public.usuario_puede(p_empresa_id, 'recepciones', 'crear')
     OR NOT public.usuario_puede(p_empresa_id, 'inventario', 'crear') THEN
    RAISE EXCEPTION 'No tienes permiso para registrar recepciones de almacén.';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Indica al menos una línea a recibir.';
  END IF;

  SELECT * INTO v_oc FROM public.ordenes_compra
   WHERE id = p_orden_compra_id AND empresa_id = p_empresa_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La orden de compra no existe en esta empresa.';
  END IF;
  IF lower(coalesce(v_oc.estado, '')) NOT IN ('emitida', 'confirmada', 'en_transito', 'recibida_parcial') THEN
    RAISE EXCEPTION 'No se puede recepcionar una OC en estado "%".', coalesce(v_oc.estado, '');
  END IF;

  v_alcance := public.usuario_alcance_sociedades(p_empresa_id);
  IF v_alcance IS NOT NULL AND (v_oc.sociedad_id IS NULL OR NOT (v_oc.sociedad_id = ANY (v_alcance))) THEN
    RAISE EXCEPTION 'La sociedad de la OC está fuera de tu alcance.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.almacenes a
                  WHERE a.id = p_almacen_id AND a.empresa_id = p_empresa_id
                    AND coalesce(a.estado, 'activo') = 'activo') THEN
    RAISE EXCEPTION 'El almacén no pertenece a la empresa o no está activo.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.kardex k
              WHERE k.empresa_id = p_empresa_id AND k.orden_compra_id = p_orden_compra_id
                AND k.valorizacion_estado = 'pendiente_factura' AND coalesce(k.anulado, false) = false) THEN
    RAISE EXCEPTION 'Esta OC tiene ingresos físicos pendientes de factura; ciérrala desde Administración.';
  END IF;

  IF jsonb_array_length(coalesce(v_oc.items, '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'La OC no tiene líneas.';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_items) e
              WHERE nullif(e ->> 'idx', '') IS NULL
                 OR (e ->> 'idx')::integer < 0
                 OR (e ->> 'idx')::integer >= jsonb_array_length(v_oc.items)) THEN
    RAISE EXCEPTION 'Alguna línea no corresponde a la OC.';
  END IF;
  IF (SELECT count(*) - count(DISTINCT e ->> 'idx') FROM jsonb_array_elements(p_items) e) > 0 THEN
    RAISE EXCEPTION 'Hay líneas repetidas en la recepción.';
  END IF;

  SELECT u.id INTO v_general FROM public.ubicaciones u
   WHERE u.almacen_id = p_almacen_id AND u.empresa_id = p_empresa_id AND u.es_general AND u.activo
   LIMIT 1;
  v_moneda := upper(coalesce(nullif(btrim(v_oc.moneda), ''), 'PEN'));

  -- Primera pasada: validar todo y armar items_recibidos (todas las líneas de la OC,
  -- como hace Administración) y la lista de movimientos.
  FOR v_idx IN 0 .. jsonb_array_length(v_oc.items) - 1 LOOP
    v_item := v_oc.items -> v_idx;
    SELECT e INTO v_in FROM jsonb_array_elements(p_items) e WHERE (e ->> 'idx')::integer = v_idx LIMIT 1;
    v_cant := coalesce(nullif(v_in ->> 'recibido', '')::numeric, 0);
    IF v_cant < 0 THEN
      RAISE EXCEPTION 'La cantidad recibida no puede ser negativa.';
    END IF;
    v_pedido := coalesce(nullif(v_item ->> 'cantidad', '')::numeric, 0);
    v_precio := coalesce(nullif(v_item ->> 'precio_unitario', '')::numeric, 0);
    v_ubic := NULL;

    IF v_cant > 0 THEN
      SELECT coalesce(sum(coalesce(nullif(ri ->> 'recibido', '')::numeric, 0)), 0) INTO v_previo
        FROM public.recepciones r
        CROSS JOIN LATERAL jsonb_array_elements(coalesce(r.items_recibidos, '[]'::jsonb)) AS ri
       WHERE r.orden_compra_id = p_orden_compra_id
         AND (
           (nullif(btrim(ri ->> 'item_id'), '') IS NOT NULL
             AND nullif(btrim(ri ->> 'item_id'), '') = nullif(btrim(v_item ->> 'item_id'), ''))
           OR (
             (nullif(btrim(ri ->> 'item_id'), '') IS NULL
               OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_oc.items) x
                               WHERE nullif(btrim(x ->> 'item_id'), '') = nullif(btrim(ri ->> 'item_id'), '')))
             AND (
               (nullif(btrim(ri ->> 'material_id'), '') IS NOT NULL
                 AND nullif(btrim(v_item ->> 'material_id'), '') = nullif(btrim(ri ->> 'material_id'), ''))
               OR lower(coalesce(ri ->> 'descripcion', '')) = lower(coalesce(v_item ->> 'descripcion', ''))
             )
           )
         );
      v_pend := greatest(0, v_pedido - v_previo);
      IF v_cant > v_pend + 0.0001 THEN
        RAISE EXCEPTION 'No puedes recibir más de lo pendiente en "%": pendiente %, intentas recibir %.',
          coalesce(v_item ->> 'descripcion', 'línea ' || (v_idx + 1)), v_pend, v_cant;
      END IF;
      IF nullif(btrim(v_item ->> 'material_id'), '') IS NULL THEN
        RAISE EXCEPTION 'La línea "%" no tiene material del catálogo; regístrala desde Administración.',
          coalesce(v_item ->> 'descripcion', 'línea ' || (v_idx + 1));
      END IF;
      v_ubic := coalesce(nullif(btrim(v_in ->> 'ubicacion_id'), ''), v_general);
      IF v_ubic IS NULL OR NOT EXISTS (SELECT 1 FROM public.ubicaciones u
                                        WHERE u.id = v_ubic AND u.empresa_id = p_empresa_id
                                          AND u.almacen_id = p_almacen_id AND u.activo) THEN
        RAISE EXCEPTION 'La ubicación no pertenece al almacén/empresa o está inactiva.';
      END IF;
      v_total := v_total + v_cant;
      v_movs := v_movs || jsonb_build_object(
        'idx', v_idx, 'material_id', v_item ->> 'material_id', 'cantidad', v_cant,
        'precio', v_precio, 'ubicacion_id', v_ubic);
    END IF;

    v_items_rec := v_items_rec || jsonb_build_object(
      'item_id', nullif(btrim(v_item ->> 'item_id'), ''),
      'codigo', v_item -> 'codigo',
      'material_id', v_item -> 'material_id',
      'descripcion', v_item -> 'descripcion',
      'pedido', v_pedido,
      'recibido', v_cant,
      'unidad', v_item -> 'unidad',
      'conforme', (v_obs IS NULL),
      'precio_unitario', v_precio,
      'precio_unitario_oc', v_precio,
      'almacen_id', p_almacen_id,
      'ubicacion_id', v_ubic);
  END LOOP;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Ingresa al menos una cantidad recibida mayor a cero.';
  END IF;

  INSERT INTO public.recepciones (id, empresa_id, orden_compra_id, sociedad_id, tipo, fecha,
                                  items_recibidos, observaciones, estado, recibido_por)
  VALUES (v_rec_id, p_empresa_id, p_orden_compra_id, v_oc.sociedad_id, 'total', v_fecha,
          v_items_rec, v_obs, CASE WHEN v_obs IS NULL THEN 'confirmada' ELSE 'observada' END, v_uid);

  FOR v_mov IN SELECT value FROM jsonb_array_elements(v_movs) LOOP
    PERFORM * FROM public.registrar_movimiento_atomico(
      p_kardex_id := 'kdx_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 18),
      p_empresa_id := p_empresa_id,
      p_material_id := v_mov ->> 'material_id',
      p_almacen_id := p_almacen_id,
      p_sociedad_id := v_oc.sociedad_id,
      p_tipo := 'entrada',
      p_motivo := 'recepcion_oc',
      p_cantidad := (v_mov ->> 'cantidad')::numeric,
      p_costo_unitario := (v_mov ->> 'precio')::numeric,
      p_costo_unitario_usd := CASE WHEN v_moneda = 'USD' THEN (v_mov ->> 'precio')::numeric ELSE 0 END,
      p_moneda := v_moneda,
      p_referencia_tipo := 'recepcion',
      p_referencia_id := v_rec_id,
      p_proveedor_id := v_oc.proveedor_id,
      p_observacion := 'Recepción OC ' || coalesce(v_oc.codigo, v_oc.id),
      p_usuario_id := v_uid,
      p_orden_compra_id := p_orden_compra_id,
      p_orden_compra_item_idx := (v_mov ->> 'idx')::integer,
      p_recepcion_id := v_rec_id,
      p_ubicacion_id := v_mov ->> 'ubicacion_id');
    v_n_movs := v_n_movs + 1;
  END LOOP;

  v_recalculo := public.recalcular_estado_oc_por_recepcion(p_orden_compra_id, v_rec_id, v_fecha, v_oc.fecha_emision);

  RETURN jsonb_build_object(
    'recepcion_id', v_rec_id,
    'movimientos', v_n_movs,
    'estado_oc', v_recalculo ->> 'estado',
    'porcentaje_recibido', (v_recalculo ->> 'porcentaje_recibido')::numeric,
    'tipo', v_recalculo ->> 'tipo');
END;
$function$;

REVOKE ALL ON FUNCTION public.registrar_recepcion_oc_fisica(text, text, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_recepcion_oc_fisica(text, text, text, jsonb, text) TO authenticated, service_role;
