CREATE OR REPLACE FUNCTION public.obtener_lineas_sourcing(p_empresa_id text)
 RETURNS TABLE(solpe_id text, solpe_codigo text, solpe_estado text, solpe_descripcion text, solpe_item_id text, proveedor_asignado_id text, comprador_campo_id text, comprador_nombre text, tomada_en timestamp with time zone, item_index bigint, material_id text, material_codigo text, material_descripcion text, familia_id text, familia_codigo text, familia_nombre text, cantidad numeric, unidad text, precio_unitario numeric, proveedores_candidatos jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if nullif(btrim(coalesce(p_empresa_id, '')), '') is null then raise exception 'El empresa_id es obligatorio' using errcode = '22023'; end if;
  if not public.usuario_tiene_empresa(p_empresa_id) then raise exception 'No autorizado para consultar el tenant %', p_empresa_id using errcode = '42501'; end if;
  if not public.usuario_puede(p_empresa_id, 'ordenes_compra', 'ver') then raise exception 'No tienes permiso para consultar candidatos de sourcing' using errcode = '42501'; end if;
  return query
  with lineas as (
    select s.id solpe_id,s.codigo solpe_codigo,s.estado solpe_estado,s.descripcion solpe_descripcion,
      item.item ->> 'id' solpe_item_id,
      nullif(btrim(item.item ->> 'proveedor_asignado_id'),'') proveedor_asignado_id,
      nullif(btrim(item.item ->> 'comprador_campo_id'),'') comprador_campo_id,
      coalesce(u.nombre,u.email,item.item ->> 'comprador_campo_id') comprador_nombre,
      nullif(item.item ->> 'tomada_en','')::timestamptz tomada_en,
      item.ordinality item_index,nullif(btrim(item.item ->> 'material_id'),'') material_id,
      nullif(btrim(item.item ->> 'cantidad'),'')::numeric cantidad,
      nullif(btrim(item.item ->> 'unidad'),'') unidad,
      nullif(btrim(item.item ->> 'precio_unitario'),'')::numeric precio_unitario,
      coalesce(nullif(btrim(item.item ->> 'descripcion'),''),'Item de compra') item_descripcion
    from public.solpe_interna s
    cross join lateral jsonb_array_elements(coalesce(s.items,'[]'::jsonb)) with ordinality item(item,ordinality)
    left join public.usuarios u on u.id = nullif(btrim(item.item ->> 'comprador_campo_id'),'')
    where s.empresa_id=p_empresa_id and lower(trim(coalesce(s.estado,''))) in ('aprobada','oc_parcial')
      and nullif(btrim(item.item ->> 'oc_id'),'') is null
  ), candidatos as (
    select l.*,m.codigo material_codigo,coalesce(m.descripcion,l.item_descripcion) material_descripcion,
      m.familia_id,f.codigo familia_codigo,f.nombre familia_nombre,
      p.id proveedor_id,p.codigo proveedor_codigo,p.razon_social proveedor_razon_social,p.nombre_comercial proveedor_nombre_comercial,
      coalesce(p.total_ocs,0) total_ocs,p.fecha_ultima_oc,
      row_number() over(partition by l.solpe_id,l.item_index order by coalesce(p.total_ocs,0) desc,p.fecha_ultima_oc desc nulls last,p.codigo,p.id) ranking
    from lineas l
    left join public.materiales m on m.id=l.material_id and m.empresa_id=p_empresa_id
    left join public.material_familias f on f.id=m.familia_id and f.empresa_id=p_empresa_id
    left join public.proveedor_familia pf on pf.empresa_id=p_empresa_id and pf.familia_id=m.familia_id
    left join public.proveedores p on p.id=pf.proveedor_id and p.empresa_id=p_empresa_id and p.estado is distinct from 'bloqueado'
  )
  select c.solpe_id,c.solpe_codigo,c.solpe_estado,c.solpe_descripcion,c.solpe_item_id,c.proveedor_asignado_id,c.comprador_campo_id,c.comprador_nombre,c.tomada_en,c.item_index,c.material_id,c.material_codigo,c.material_descripcion,c.familia_id,c.familia_codigo,c.familia_nombre,c.cantidad,c.unidad,c.precio_unitario,
    coalesce(jsonb_agg(jsonb_build_object('proveedor_id',c.proveedor_id,'proveedor_codigo',c.proveedor_codigo,'razon_social',c.proveedor_razon_social,'nombre_comercial',c.proveedor_nombre_comercial,'familia_id',c.familia_id,'total_ocs',c.total_ocs,'fecha_ultima_oc',c.fecha_ultima_oc,'ranking',c.ranking) order by c.ranking) filter(where c.proveedor_id is not null),'[]'::jsonb)
  from candidatos c
  group by c.solpe_id,c.solpe_codigo,c.solpe_estado,c.solpe_descripcion,c.solpe_item_id,c.proveedor_asignado_id,c.comprador_campo_id,c.comprador_nombre,c.tomada_en,c.item_index,c.material_id,c.material_codigo,c.material_descripcion,c.familia_id,c.familia_codigo,c.familia_nombre,c.cantidad,c.unidad,c.precio_unitario
  order by c.solpe_codigo,c.item_index;
end;
$function$

