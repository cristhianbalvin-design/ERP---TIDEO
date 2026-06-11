create or replace view public.vista_precio_historico_proveedor
with (security_invoker = true)
as
select
  oc.empresa_id,
  oc.proveedor_id,
  item.item->>'material_id' as material_id,
  case
    when item.item->>'precio_unitario' ~ '^-?[0-9]+(\.[0-9]+)?$'
      then (item.item->>'precio_unitario')::numeric
    else null
  end as precio_unitario,
  oc.fecha_emision::date as fecha_emision,
  coalesce(oc.codigo, oc.id) as numero_oc,
  oc.estado,
  oc.id as orden_compra_id,
  item.ordinality::integer as linea
from public.ordenes_compra oc
cross join lateral jsonb_array_elements(coalesce(oc.items, '[]'::jsonb)) with ordinality as item(item, ordinality)
where public.usuario_tiene_empresa(oc.empresa_id)
  and lower(coalesce(oc.estado, '')) in ('cerrada', 'recibida')
  and nullif(item.item->>'material_id', '') is not null
  and nullif(item.item->>'precio_unitario', '') is not null;
