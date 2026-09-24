-- Libera una cantidad pendiente de una línea de OC y la devuelve al sourcing
-- como una línea nueva de la SOLPE de origen.

create or replace function public.liberar_cantidad_pendiente_oc(
  p_orden_compra_id text,
  p_solpe_item_id text,
  p_cantidad_a_liberar numeric,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_oc public.ordenes_compra%rowtype;
  v_solpe public.solpe_interna%rowtype;
  v_oc_item jsonb;
  v_solpe_item jsonb;
  v_items jsonb;
  v_solpe_items jsonb;
  v_oc_item_ordinal bigint;
  v_solpe_item_ordinal bigint;
  v_solpe_id text;
  v_material_id text;
  v_cantidad_actual numeric;
  v_cantidad_nueva numeric;
  v_cantidad_recibida numeric := 0;
  v_precio_unitario numeric := 0;
  v_item_subtotal numeric := 0;
  v_subtotal numeric := 0;
  v_igv numeric := 0;
  v_total numeric := 0;
  v_cxp_activa numeric := 0;
  v_pedido_total numeric := 0;
  v_recibido_total numeric := 0;
  v_porcentaje numeric := 0;
  v_estado_oc text;
  v_pendientes_previos integer := 0;
  v_nuevo_item_id text := format(
    'itm_%s_%s',
    (extract(epoch from clock_timestamp()) * 1000)::bigint,
    substr(md5(random()::text || clock_timestamp()::text), 1, 4)
  );
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if nullif(btrim(coalesce(p_orden_compra_id, '')), '') is null then
    raise exception 'El id de la orden de compra es obligatorio' using errcode = '22023';
  end if;

  if nullif(btrim(coalesce(p_solpe_item_id, '')), '') is null then
    raise exception 'La línea SOLPE es obligatoria' using errcode = '22023';
  end if;

  if p_cantidad_a_liberar is null
     or p_cantidad_a_liberar <= 0
     or p_cantidad_a_liberar = 'NaN'::numeric then
    raise exception 'La cantidad a liberar debe ser mayor que cero' using errcode = '22023';
  end if;

  if v_motivo is null then
    raise exception 'El motivo de liberación es obligatorio' using errcode = '22023';
  end if;

  select *
    into v_oc
    from public.ordenes_compra
   where id = p_orden_compra_id
   for update;

  if not found then
    raise exception 'La orden de compra % no existe', p_orden_compra_id using errcode = 'P0002';
  end if;

  if not public.usuario_tiene_empresa(v_oc.empresa_id) then
    raise exception 'No autorizado para operar la orden de compra %', p_orden_compra_id
      using errcode = '42501';
  end if;

  if not public.usuario_puede(v_oc.empresa_id, 'ordenes_compra', 'editar') then
    raise exception 'No tienes permiso para editar órdenes de compra y liberar cantidades pendientes'
      using errcode = '42501';
  end if;

  if not public.usuario_puede(v_oc.empresa_id, 'solpe', 'editar') then
    raise exception 'No tienes permiso para editar SOLPEs y devolver cantidades al sourcing'
      using errcode = '42501';
  end if;

  if lower(coalesce(v_oc.estado, '')) not in ('emitida', 'confirmada', 'en_transito', 'recibida_parcial') then
    raise exception 'No se puede liberar cantidad de una OC en estado "%". Solo se permite en emitida, confirmada, en_transito o recibida_parcial.',
      coalesce(v_oc.estado, 'sin estado') using errcode = '22023';
  end if;

  select x.item, x.ordinality
    into v_oc_item, v_oc_item_ordinal
    from jsonb_array_elements(coalesce(v_oc.items, '[]'::jsonb)) with ordinality as x(item, ordinality)
   where nullif(btrim(x.item->>'solpe_item_id'), '') = p_solpe_item_id
   limit 1;

  if not found then
    raise exception 'La línea SOLPE % no existe en la OC %', p_solpe_item_id, p_orden_compra_id
      using errcode = 'P0002';
  end if;

  v_solpe_id := nullif(btrim(v_oc_item->>'solpe_id'), '');
  if v_solpe_id is null then
    raise exception 'La línea % no tiene solpe_id; no se puede ubicar su SOLPE de origen', p_solpe_item_id
      using errcode = '22023';
  end if;

  v_material_id := nullif(btrim(v_oc_item->>'material_id'), '');
  if v_material_id is null then
    raise exception 'La línea % no tiene material_id; no se puede crear la línea liberada', p_solpe_item_id
      using errcode = '22023';
  end if;

  v_cantidad_actual := coalesce(nullif(v_oc_item->>'cantidad', '')::numeric, 0);
  if p_cantidad_a_liberar > v_cantidad_actual then
    raise exception 'No se pueden liberar % unidades: la línea solo tiene % unidades en la OC',
      p_cantidad_a_liberar, v_cantidad_actual using errcode = '22023';
  end if;

  select *
    into v_solpe
    from public.solpe_interna
   where id = v_solpe_id
     and empresa_id = v_oc.empresa_id
   for update;

  if not found then
    raise exception 'La SOLPE % no existe en el tenant de la OC %', v_solpe_id, p_orden_compra_id
      using errcode = 'P0002';
  end if;

  select x.item, x.ordinality
    into v_solpe_item, v_solpe_item_ordinal
    from jsonb_array_elements(coalesce(v_solpe.items, '[]'::jsonb)) with ordinality as x(item, ordinality)
   where nullif(btrim(x.item->>'id'), '') = p_solpe_item_id
   limit 1;

  if not found then
    raise exception 'La línea % no existe en la SOLPE %', p_solpe_item_id, v_solpe_id
      using errcode = 'P0002';
  end if;

  if nullif(btrim(v_solpe_item->>'oc_id'), '') is distinct from p_orden_compra_id then
    raise exception 'La línea SOLPE % no está cubierta por la OC %; no se puede liberar desde esta orden',
      p_solpe_item_id, p_orden_compra_id using errcode = '22023';
  end if;

  if nullif(btrim(v_solpe_item->>'material_id'), '') is distinct from v_material_id then
    raise exception 'La línea SOLPE % no coincide con el material de la línea de OC', p_solpe_item_id
      using errcode = '22023';
  end if;

  -- items_recibidos todavía no conserva solpe_item_id. Se usa material_id como
  -- vínculo físico más específico disponible; si el mismo material aparece
  -- repetido en la OC, el acumulado conservador evita liberar de más.
  select coalesce(sum(
    case
      when (item.item->>'recibido') ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (item.item->>'recibido')::numeric
      else 0
    end
  ), 0)
    into v_cantidad_recibida
    from public.recepciones r
    cross join lateral jsonb_array_elements(coalesce(r.items_recibidos, '[]'::jsonb)) as item(item)
   where r.empresa_id = v_oc.empresa_id
     and r.orden_compra_id = p_orden_compra_id
     and lower(coalesce(r.estado, '')) <> 'anulada'
     and nullif(btrim(item.item->>'material_id'), '') = v_material_id;

  v_cantidad_nueva := v_cantidad_actual - p_cantidad_a_liberar;
  if v_cantidad_nueva < v_cantidad_recibida then
    raise exception 'No se puede liberar % unidades: ya hay % unidades recibidas físicamente y la cantidad remanente sería %',
      p_cantidad_a_liberar, v_cantidad_recibida, v_cantidad_nueva using errcode = '22023';
  end if;

  v_precio_unitario := coalesce(nullif(v_oc_item->>'precio_unitario', '')::numeric, 0);
  v_item_subtotal := round(v_cantidad_nueva * v_precio_unitario, 2);

  select coalesce(jsonb_agg(
    case
      when x.ordinality = v_oc_item_ordinal then
        jsonb_set(
          jsonb_set(x.item, '{cantidad}', to_jsonb(v_cantidad_nueva), true),
          '{subtotal}', to_jsonb(v_item_subtotal), true
        )
      else x.item
    end
    order by x.ordinality
  ), '[]'::jsonb)
    into v_items
    from jsonb_array_elements(coalesce(v_oc.items, '[]'::jsonb)) with ordinality as x(item, ordinality);

  select round(coalesce(sum(coalesce(nullif(x.item->>'subtotal', '')::numeric, 0)), 0), 2)
    into v_subtotal
    from jsonb_array_elements(v_items) as x(item);

  v_igv := round(v_subtotal * 0.18, 2);
  v_total := round(v_subtotal * 1.18, 2);

  select coalesce(sum(c.monto_total), 0)
    into v_cxp_activa
    from public.cxp c
   where c.empresa_id = v_oc.empresa_id
     and c.orden_compra_id = p_orden_compra_id
     and lower(coalesce(c.estado, '')) <> 'anulada';

  if v_total < v_cxp_activa then
    raise exception 'No se puede liberar la cantidad: ya hay % facturados en CxP activas y el nuevo total de la OC sería %',
      to_char(v_cxp_activa, 'FM999999990.00'), to_char(v_total, 'FM999999990.00') using errcode = '22023';
  end if;

  select count(*)
    into v_pendientes_previos
    from jsonb_array_elements(coalesce(v_solpe.items, '[]'::jsonb)) as x(item)
   where nullif(btrim(x.item->>'oc_id'), '') is null;

  v_solpe_items := coalesce(v_solpe.items, '[]'::jsonb)
    || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'id', v_nuevo_item_id,
      'material_id', v_material_id,
      'material_codigo', coalesce(v_solpe_item->>'material_codigo', v_oc_item->>'codigo'),
      'descripcion', coalesce(v_solpe_item->>'descripcion', v_oc_item->>'descripcion', 'Item liberado'),
      'cantidad', p_cantidad_a_liberar,
      'unidad', coalesce(v_solpe_item->>'unidad', v_oc_item->>'unidad', 'Und'),
      'precio_unitario', v_precio_unitario,
      'observacion', coalesce(v_solpe_item->>'observacion', ''),
      'liberado_de_oc_id', p_orden_compra_id,
      'liberado_de_solpe_item_id', p_solpe_item_id,
      'cantidad_liberada', p_cantidad_a_liberar,
      'motivo_liberacion', v_motivo,
      'liberado_por', auth.uid()::text,
      'liberado_at', now()
    )));

  -- La línea recién agregada siempre queda pendiente. El conteo previo se
  -- conserva en la respuesta para dejar explícito si ya había otros pendientes.
  update public.solpe_interna
     set items = v_solpe_items,
         estado = 'oc_parcial',
         updated_at = now()
   where id = v_solpe_id
     and empresa_id = v_oc.empresa_id;

  select coalesce(sum(coalesce(nullif(x.item->>'cantidad', '')::numeric, 0)), 0)
    into v_pedido_total
    from jsonb_array_elements(v_items) as x(item);

  select coalesce(sum(
    case
      when (item.item->>'recibido') ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (item.item->>'recibido')::numeric
      else 0
    end
  ), 0)
    into v_recibido_total
    from public.recepciones r
    cross join lateral jsonb_array_elements(coalesce(r.items_recibidos, '[]'::jsonb)) as item(item)
   where r.empresa_id = v_oc.empresa_id
     and r.orden_compra_id = p_orden_compra_id
     and lower(coalesce(r.estado, '')) <> 'anulada';

  v_porcentaje := case
    when v_pedido_total <= 0 then 0
    else round(least(100, greatest(0, v_recibido_total / v_pedido_total * 100)), 2)
  end;

  v_estado_oc := case
    when v_recibido_total <= 0 then v_oc.estado
    when v_porcentaje >= 100 then 'recibida_total'
    else 'recibida_parcial'
  end;

  update public.ordenes_compra
     set items = v_items,
         subtotal = v_subtotal,
         igv = v_igv,
         total = v_total,
         porcentaje_recibido = v_porcentaje,
         estado = v_estado_oc,
         updated_at = now()
   where id = p_orden_compra_id
     and empresa_id = v_oc.empresa_id;

  select * into v_oc
    from public.ordenes_compra
   where id = p_orden_compra_id;

  select * into v_solpe
    from public.solpe_interna
   where id = v_solpe_id;

  return jsonb_build_object(
    'orden_compra', to_jsonb(v_oc),
    'solpe', to_jsonb(v_solpe),
    'linea_oc', jsonb_build_object(
      'solpe_item_id', p_solpe_item_id,
      'cantidad_anterior', v_cantidad_actual,
      'cantidad_nueva', v_cantidad_nueva,
      'cantidad_recibida', v_cantidad_recibida,
      'cantidad_liberada', p_cantidad_a_liberar
    ),
    'linea_solpe_liberada', v_nuevo_item_id,
    'pendientes_solpe_antes', v_pendientes_previos,
    'cxp_activas', v_cxp_activa,
    'nuevo_total_oc', v_total,
    'porcentaje_recibido', v_porcentaje
  );
end;
$$;

revoke all on function public.liberar_cantidad_pendiente_oc(text, text, numeric, text) from public, anon;
grant execute on function public.liberar_cantidad_pendiente_oc(text, text, numeric, text) to authenticated, service_role;
