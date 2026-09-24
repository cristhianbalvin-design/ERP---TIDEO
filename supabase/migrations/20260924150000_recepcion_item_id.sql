-- Usa item_id para correlacionar recepción y línea de OC cuando ambos
-- documentos son nuevos; conserva fallback por material/descripción para
-- OCs o recepciones históricas que todavía no tienen item_id.

create or replace function public.recalcular_estado_oc_por_recepcion(
  p_orden_compra_id text,
  p_recepcion_id text,
  p_fecha_recepcion date default current_date,
  p_fecha_emision date default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_oc public.ordenes_compra%rowtype;
  v_recepcion public.recepciones%rowtype;
  v_pedido numeric := 0;
  v_recibido numeric := 0;
  v_porcentaje numeric := 0;
  v_tipo text;
  v_estado text;
  v_fecha_recepcion date := coalesce(p_fecha_recepcion, current_date);
  v_lead_time integer;
begin
  if nullif(btrim(coalesce(p_orden_compra_id, '')), '') is null then
    raise exception 'El id de la orden de compra es obligatorio';
  end if;

  if nullif(btrim(coalesce(p_recepcion_id, '')), '') is null then
    raise exception 'El id de la recepción es obligatorio';
  end if;

  select *
    into v_oc
    from public.ordenes_compra
   where id = p_orden_compra_id
   for update;

  if not found then
    raise exception 'La orden de compra % no existe', p_orden_compra_id;
  end if;

  select *
    into v_recepcion
    from public.recepciones
   where id = p_recepcion_id
     and orden_compra_id = p_orden_compra_id
   for update;

  if not found then
    raise exception 'La recepción % no pertenece a la orden de compra %', p_recepcion_id, p_orden_compra_id;
  end if;

  select coalesce(sum(coalesce(nullif(item ->> 'cantidad', '')::numeric, 0)), 0)
    into v_pedido
    from jsonb_array_elements(coalesce(v_oc.items, '[]'::jsonb)) as item;

  select case
           when exists (
             select 1
               from jsonb_array_elements(coalesce(v_recepcion.items_recibidos, '[]'::jsonb)) as item
              where coalesce(nullif(item ->> 'recibido', '')::numeric, 0)
                    < coalesce(nullif(item ->> 'pedido', '')::numeric, 0)
           ) then 'parcial'
           else 'total'
         end
    into v_tipo;

  update public.recepciones
     set tipo = v_tipo
   where id = p_recepcion_id;

  -- Cada línea de recepción se cuenta una sola vez. item_id es la clave
  -- preferida; si falta en cualquiera de los documentos, se conserva el
  -- fallback histórico por material_id/descripción.
  select coalesce(sum(coalesce(nullif(recepcion_item.item ->> 'recibido', '')::numeric, 0)), 0)
    into v_recibido
    from public.recepciones r
    cross join lateral jsonb_array_elements(coalesce(r.items_recibidos, '[]'::jsonb)) as recepcion_item(item)
   where r.orden_compra_id = p_orden_compra_id
     and exists (
       select 1
         from jsonb_array_elements(coalesce(v_oc.items, '[]'::jsonb)) as oc_item(item)
        where (
          nullif(btrim(recepcion_item.item ->> 'item_id'), '') is not null
          and nullif(btrim(oc_item.item ->> 'item_id'), '') = nullif(btrim(recepcion_item.item ->> 'item_id'), '')
        )
        or (
          (
            nullif(btrim(recepcion_item.item ->> 'item_id'), '') is null
            or not exists (
              select 1
                from jsonb_array_elements(coalesce(v_oc.items, '[]'::jsonb)) as exact_item(item)
               where nullif(btrim(exact_item.item ->> 'item_id'), '') = nullif(btrim(recepcion_item.item ->> 'item_id'), '')
            )
          )
          and (
            (
              nullif(btrim(recepcion_item.item ->> 'material_id'), '') is not null
              and nullif(btrim(oc_item.item ->> 'material_id'), '') = nullif(btrim(recepcion_item.item ->> 'material_id'), '')
            )
            or lower(coalesce(recepcion_item.item ->> 'descripcion', '')) = lower(coalesce(oc_item.item ->> 'descripcion', ''))
          )
        )
     );

  v_porcentaje := case
    when v_pedido <= 0 then 0
    else round(least(100, greatest(0, v_recibido / v_pedido * 100)), 2)
  end;

  v_estado := case when v_porcentaje >= 100 then 'recibida_total' else 'recibida_parcial' end;
  v_lead_time := case
    when p_fecha_emision is null then v_oc.lead_time_dias
    else greatest(0, v_fecha_recepcion - p_fecha_emision)
  end;

  update public.ordenes_compra
     set estado = v_estado,
         porcentaje_recibido = v_porcentaje,
         fecha_recepcion_real = v_fecha_recepcion,
         lead_time_dias = v_lead_time,
         updated_at = now()
   where id = p_orden_compra_id
   returning * into v_oc;

  select *
    into v_recepcion
    from public.recepciones
   where id = p_recepcion_id;

  return jsonb_build_object(
    'orden_compra', to_jsonb(v_oc),
    'recepcion', to_jsonb(v_recepcion),
    'pedido', v_pedido,
    'recibido', v_recibido,
    'porcentaje_recibido', v_porcentaje,
    'estado', v_estado,
    'tipo', v_tipo
  );
end;
$$;

revoke all on function public.recalcular_estado_oc_por_recepcion(text, text, date, date) from public, anon;
grant execute on function public.recalcular_estado_oc_por_recepcion(text, text, date, date) to authenticated, service_role;

notify pgrst, 'reload schema';
