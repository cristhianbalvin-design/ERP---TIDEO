-- 632: Partidas de la cotización generada desde una Hoja de Costeo.
-- Antes (414/544) cada partida usaba precio = costo / (1 - margen), ignorando el gasto administrativo,
-- redondeaba el precio unitario a entero y describía la mano de obra con el nombre del cargo.
-- Resultado: la suma de partidas no coincidía con el precio sugerido de la hoja.
-- Ahora: precio = costo / (1 - (gasto + margen)), igual que el wizard; redondeo a 2 decimales;
-- descripción = tarea (o cargo si no hay tarea). El IGV de la cabecera se deriva del total de la hoja.
-- Las funciones *_impl_* no se tocan: los wrappers recalculan las partidas solo para la cotización
-- creada en la misma transacción (created_at = now()).

CREATE OR REPLACE FUNCTION public.hc_items_cotizacion(p_hoja_costeo_id text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $fn$
DECLARE
  v_hc public.hojas_costeo%rowtype;
  v_gasto numeric;
  v_margen numeric;
  v_divisor numeric;
  v_items jsonb;
BEGIN
  SELECT * INTO v_hc FROM public.hojas_costeo WHERE id = p_hoja_costeo_id;
  IF NOT FOUND THEN
    RETURN '[]'::jsonb;
  END IF;

  v_gasto := coalesce(
    v_hc.gasto_administrativo_manual_pct,
    (SELECT g.porcentaje_calculado FROM public.vw_gasto_administrativo_pct_grupo g WHERE g.empresa_id = v_hc.empresa_id LIMIT 1),
    0);
  v_margen := least(greatest(coalesce(v_hc.margen_objetivo_pct, 35), 0), 95) / 100;
  v_divisor := greatest(0.05, 1 - (greatest(v_gasto, 0) + v_margen));

  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', coalesce(item->>'id', origen || '_' || md5(item::text)),
      'descripcion', coalesce(nullif(item->>'descripcion', ''), 'Partida de costeo'),
      'tipo', CASE WHEN origen = 'materiales' THEN 'material' ELSE 'servicio' END,
      'cantidad', cantidad,
      'unidad', coalesce(nullif(item->>'unidad', ''), 'und'),
      'precio_unitario', precio,
      'subtotal', round(cantidad * precio, 2)
    ) ORDER BY orden_origen, orden), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT origen, item, orden_origen, orden,
      coalesce(nullif(item->>'cantidad', '')::numeric, 0) AS cantidad,
      round(coalesce(nullif(item->>'costo_unitario', '')::numeric, nullif(item->>'precio_unitario', '')::numeric, 0) / v_divisor, 2) AS precio
    FROM (
      SELECT 'mano_obra' AS origen, e.item, 1 AS orden_origen, e.ord::numeric AS orden
      FROM jsonb_array_elements(coalesce(v_hc.mano_obra, '[]'::jsonb)) WITH ORDINALITY e(item, ord)
      UNION ALL
      SELECT 'mano_obra', jsonb_build_object(
        'id', 'mo_' || l.id,
        'descripcion', coalesce(nullif(t.nombre, ''), nullif(ce.nombre, ''), 'Mano de obra'),
        'cantidad', l.horas,
        'unidad', 'hora',
        'costo_unitario', l.costo_hora_snapshot), 1, l.orden::numeric
      FROM public.hoja_costeo_lineas_mano_obra l
      LEFT JOIN public.tipos_servicio_interno t ON t.id = l.tarea_id
      LEFT JOIN public.cargos_empresa ce ON ce.id = l.cargo_id
      WHERE l.hoja_costeo_id = v_hc.id
        AND jsonb_array_length(coalesce(v_hc.mano_obra, '[]'::jsonb)) = 0
      UNION ALL
      SELECT 'activos', jsonb_build_object(
        'id', 'act_' || l.id,
        'descripcion', coalesce(nullif(a.nombre, ''), 'Activo de costeo'),
        'cantidad', CASE WHEN l.horas_uso_estimadas IS NULL THEN 1 ELSE l.horas_uso_estimadas END,
        'unidad', CASE WHEN l.horas_uso_estimadas IS NULL THEN 'servicio' ELSE 'hora' END,
        'costo_unitario', CASE
          WHEN l.horas_uso_estimadas IS NULL THEN l.depreciacion_asignada
          ELSE l.depreciacion_asignada / nullif(l.horas_uso_estimadas, 0)
        END), 2, l.orden::numeric
      FROM public.hoja_costeo_lineas_activos l
      LEFT JOIN public.activos a ON a.id = l.activo_id
      WHERE l.hoja_costeo_id = v_hc.id
      UNION ALL
      SELECT 'materiales', e.item, 3, e.ord::numeric
      FROM jsonb_array_elements(coalesce(v_hc.materiales, '[]'::jsonb)) WITH ORDINALITY e(item, ord)
      UNION ALL
      SELECT 'materiales', jsonb_build_object(
        'id', 'mat_' || l.id,
        'descripcion', coalesce(nullif(m.descripcion, ''), nullif(l.descripcion, ''), 'Material de costeo'),
        'cantidad', l.cantidad,
        'unidad', coalesce(nullif(m.unidad, ''), nullif(l.unidad, ''), 'und'),
        'costo_unitario', l.costo_unitario_snapshot), 3, l.orden::numeric
      FROM public.hoja_costeo_lineas_materiales l
      LEFT JOIN public.materiales m ON m.id = l.material_id
      WHERE l.hoja_costeo_id = v_hc.id
        AND jsonb_array_length(coalesce(v_hc.materiales, '[]'::jsonb)) = 0
      UNION ALL
      SELECT 'servicios_terceros', e.item, 4, e.ord::numeric
      FROM jsonb_array_elements(coalesce(v_hc.servicios_terceros, '[]'::jsonb)) WITH ORDINALITY e(item, ord)
      UNION ALL
      SELECT 'logistica', e.item, 5, e.ord::numeric
      FROM jsonb_array_elements(coalesce(v_hc.logistica, '[]'::jsonb)) WITH ORDINALITY e(item, ord)
    ) src
  ) calc;

  RETURN v_items;
END
$fn$;
REVOKE ALL ON FUNCTION public.hc_items_cotizacion(text) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.hc_ajustar_cotizacion_desde_hoja(p_empresa_id text, p_hoja_costeo_id text, p_cotizacion_id text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $fn$
BEGIN
  -- Solo la cotización insertada en esta misma transacción; nunca una existente ya editada.
  UPDATE public.cotizaciones c
     SET items = public.hc_items_cotizacion(p_hoja_costeo_id),
         igv = round(coalesce(h.precio_sugerido_total, 0) - coalesce(h.precio_sugerido_sin_igv, 0), 2)
    FROM public.hojas_costeo h
   WHERE c.id = p_cotizacion_id
     AND c.empresa_id = p_empresa_id
     AND c.hoja_costeo_id = p_hoja_costeo_id
     AND h.id = p_hoja_costeo_id
     AND c.created_at = now();
END
$fn$;
REVOKE ALL ON FUNCTION public.hc_ajustar_cotizacion_desde_hoja(text, text, text) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.aprobar_hoja_costeo_y_crear_cotizacion(p_empresa_id text, p_hoja_costeo_id text, p_cotizacion_id text, p_numero text, p_moneda text DEFAULT 'PEN'::text, p_validez text DEFAULT '30 dias'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_hc public.hojas_costeo%rowtype;
  v_cot public.cotizaciones%rowtype;
begin
  perform public._aprobar_hoja_costeo_y_crear_cotizacion_impl_544(
    p_empresa_id, p_hoja_costeo_id, p_cotizacion_id,
    p_numero, p_moneda, p_validez
  );

  update public.cotizaciones c
     set linea_negocio = (
       select o.linea_negocio
       from public.oportunidades o
       where o.id = c.oportunidad_id
         and o.empresa_id = c.empresa_id
     )
   where c.id = p_cotizacion_id
     and c.empresa_id = p_empresa_id;

  perform public.hc_ajustar_cotizacion_desde_hoja(p_empresa_id, p_hoja_costeo_id, p_cotizacion_id);

  select * into v_hc from public.hojas_costeo where id = p_hoja_costeo_id;
  select * into v_cot from public.cotizaciones where id = p_cotizacion_id;
  return jsonb_build_object('hoja_costeo', to_jsonb(v_hc), 'cotizacion', to_jsonb(v_cot));
end;
$function$;

CREATE OR REPLACE FUNCTION public.aprobar_hoja_costeo_y_crear_cotizacion_sociedad(p_empresa_id text, p_sociedad_id uuid, p_hoja_costeo_id text, p_cotizacion_id text, p_numero text, p_moneda text DEFAULT 'PEN'::text, p_validez text DEFAULT '30 dias'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_hc public.hojas_costeo%rowtype;
  v_cot public.cotizaciones%rowtype;
begin
  perform public._aprobar_hoja_costeo_y_crear_cotizacion_sociedad_impl_544(
    p_empresa_id, p_sociedad_id, p_hoja_costeo_id, p_cotizacion_id,
    p_numero, p_moneda, p_validez
  );

  update public.cotizaciones c
     set linea_negocio = (
       select o.linea_negocio
       from public.oportunidades o
       where o.id = c.oportunidad_id
         and o.empresa_id = c.empresa_id
     )
   where c.id = p_cotizacion_id
     and c.empresa_id = p_empresa_id;

  perform public.hc_ajustar_cotizacion_desde_hoja(p_empresa_id, p_hoja_costeo_id, p_cotizacion_id);

  select * into v_hc from public.hojas_costeo where id = p_hoja_costeo_id;
  select * into v_cot from public.cotizaciones where id = p_cotizacion_id;
  return jsonb_build_object('hoja_costeo', to_jsonb(v_hc), 'cotizacion', to_jsonb(v_cot));
end;
$function$;
