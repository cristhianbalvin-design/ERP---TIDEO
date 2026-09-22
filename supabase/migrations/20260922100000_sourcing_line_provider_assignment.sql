-- Persistencia de proveedor asignado por línea de SOLPE antes de generar OC.

create or replace function public.asignar_proveedor_linea_sourcing(
  p_solpe_id text,
  p_solpe_item_id text,
  p_proveedor_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_solpe public.solpe_interna%rowtype;
  v_item jsonb;
  v_new_item jsonb;
  v_items jsonb;
  v_matches integer;
begin
  if nullif(btrim(coalesce(p_solpe_id, '')), '') is null then
    raise exception 'El id de la SOLPE es obligatorio';
  end if;
  if nullif(btrim(coalesce(p_solpe_item_id, '')), '') is null then
    raise exception 'El id de la línea de SOLPE es obligatorio';
  end if;

  select *
    into v_solpe
    from public.solpe_interna
   where id = p_solpe_id
   for update;

  if not found then
    raise exception 'La SOLPE % no existe', p_solpe_id;
  end if;

  if not public.usuario_tiene_empresa(v_solpe.empresa_id) then
    raise exception 'No autorizado para actualizar la SOLPE %', p_solpe_id
      using errcode = '42501';
  end if;

  if not public.usuario_puede(v_solpe.empresa_id, 'ordenes_compra', 'crear') then
    raise exception 'No tienes permiso para asignar proveedores en sourcing'
      using errcode = '42501';
  end if;

  if p_proveedor_id is not null then
    if not exists (
      select 1
        from public.proveedores p
       where p.id = p_proveedor_id
         and p.empresa_id = v_solpe.empresa_id
         and p.estado is distinct from 'bloqueado'
    ) then
      raise exception 'El proveedor % no existe o no está habilitado en el tenant', p_proveedor_id;
    end if;
  end if;

  v_items := coalesce(v_solpe.items, '[]'::jsonb);

  select count(*)
    into v_matches
    from jsonb_array_elements(v_items) as x(item)
   where nullif(btrim(x.item->>'id'), '') = p_solpe_item_id;

  if v_matches = 0 then
    raise exception 'La línea % no existe en la SOLPE %', p_solpe_item_id, p_solpe_id;
  end if;
  if v_matches > 1 then
    raise exception 'La línea % está duplicada en la SOLPE %', p_solpe_item_id, p_solpe_id;
  end if;

  select x.item
    into v_item
    from jsonb_array_elements(v_items) as x(item)
   where nullif(btrim(x.item->>'id'), '') = p_solpe_item_id;

  if nullif(btrim(v_item->>'oc_id'), '') is not null then
    raise exception 'La línea % ya está cubierta por la OC %', p_solpe_item_id, v_item->>'oc_id';
  end if;

  v_new_item := jsonb_set(
    v_item,
    '{proveedor_asignado_id}',
    coalesce(to_jsonb(p_proveedor_id), 'null'::jsonb),
    true
  );

  select coalesce(jsonb_agg(
    case
      when nullif(btrim(x.item->>'id'), '') = p_solpe_item_id then v_new_item
      else x.item
    end
    order by x.ordinality
  ), '[]'::jsonb)
    into v_items
    from jsonb_array_elements(v_items) with ordinality as x(item, ordinality);

  update public.solpe_interna
     set items = v_items,
         updated_at = now()
   where id = p_solpe_id;

  return jsonb_build_object(
    'solpe_id', p_solpe_id,
    'solpe_item_id', p_solpe_item_id,
    'proveedor_asignado_id', p_proveedor_id,
    'oc_id', v_item->>'oc_id',
    'estado', v_solpe.estado,
    'items', v_items
  );
end;
$$;

revoke all on function public.asignar_proveedor_linea_sourcing(text, text, text) from public, anon;
grant execute on function public.asignar_proveedor_linea_sourcing(text, text, text) to authenticated, service_role;

drop function if exists public.obtener_lineas_sourcing(text);

create function public.obtener_lineas_sourcing(p_empresa_id text)
returns table (
  solpe_id text,
  solpe_codigo text,
  solpe_estado text,
  solpe_descripcion text,
  solpe_item_id text,
  proveedor_asignado_id text,
  item_index bigint,
  material_id text,
  material_codigo text,
  material_descripcion text,
  familia_id text,
  familia_codigo text,
  familia_nombre text,
  cantidad numeric,
  unidad text,
  precio_unitario numeric,
  proveedores_candidatos jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if nullif(btrim(coalesce(p_empresa_id, '')), '') is null then
    raise exception 'El empresa_id es obligatorio' using errcode = '22023';
  end if;

  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No autorizado para consultar el tenant %', p_empresa_id
      using errcode = '42501';
  end if;

  if not public.usuario_puede(p_empresa_id, 'ordenes_compra', 'ver') then
    raise exception 'No tienes permiso para consultar candidatos de sourcing'
      using errcode = '42501';
  end if;

  return query
  with lineas as (
    select
      s.id as solpe_id,
      s.codigo as solpe_codigo,
      s.estado as solpe_estado,
      s.descripcion as solpe_descripcion,
      item.item ->> 'id' as solpe_item_id,
      nullif(btrim(item.item ->> 'proveedor_asignado_id'), '') as proveedor_asignado_id,
      item.ordinality as item_index,
      nullif(btrim(item.item ->> 'material_id'), '') as material_id,
      case
        when (item.item ->> 'cantidad') ~ '^-?[0-9]+(\.[0-9]+)?$'
          then (item.item ->> 'cantidad')::numeric
        else null
      end as cantidad,
      nullif(btrim(item.item ->> 'unidad'), '') as unidad,
      case
        when (item.item ->> 'precio_unitario') ~ '^-?[0-9]+(\.[0-9]+)?$'
          then (item.item ->> 'precio_unitario')::numeric
        else null
      end as precio_unitario,
      coalesce(nullif(btrim(item.item ->> 'descripcion'), ''), 'Item de compra') as item_descripcion
    from public.solpe_interna s
    cross join lateral jsonb_array_elements(coalesce(s.items, '[]'::jsonb)) with ordinality as item(item, ordinality)
    where s.empresa_id = p_empresa_id
      and lower(trim(coalesce(s.estado, ''))) in ('aprobada', 'oc_parcial')
      and nullif(btrim(item.item ->> 'oc_id'), '') is null
  ),
  candidatos as (
    select
      l.solpe_id,
      l.solpe_codigo,
      l.solpe_estado,
      l.solpe_descripcion,
      l.solpe_item_id,
      l.proveedor_asignado_id,
      l.item_index,
      l.material_id,
      m.codigo as material_codigo,
      coalesce(m.descripcion, l.item_descripcion) as material_descripcion,
      m.familia_id,
      f.codigo as familia_codigo,
      f.nombre as familia_nombre,
      l.cantidad,
      l.unidad,
      l.precio_unitario,
      p.id as proveedor_id,
      p.codigo as proveedor_codigo,
      p.razon_social as proveedor_razon_social,
      p.nombre_comercial as proveedor_nombre_comercial,
      coalesce(p.total_ocs, 0) as total_ocs,
      p.fecha_ultima_oc,
      row_number() over (
        partition by l.solpe_id, l.item_index
        order by coalesce(p.total_ocs, 0) desc,
                 p.fecha_ultima_oc desc nulls last,
                 p.codigo,
                 p.id
      ) as ranking
    from lineas l
    left join public.materiales m
      on m.id = l.material_id
     and m.empresa_id = p_empresa_id
    left join public.material_familias f
      on f.id = m.familia_id
     and f.empresa_id = p_empresa_id
    left join public.proveedor_familia pf
      on pf.empresa_id = p_empresa_id
     and pf.familia_id = m.familia_id
    left join public.proveedores p
      on p.id = pf.proveedor_id
     and p.empresa_id = p_empresa_id
     and p.estado is distinct from 'bloqueado'
  )
  select
    c.solpe_id,
    c.solpe_codigo,
    c.solpe_estado,
    c.solpe_descripcion,
    c.solpe_item_id,
    c.proveedor_asignado_id,
    c.item_index,
    c.material_id,
    c.material_codigo,
    c.material_descripcion,
    c.familia_id,
    c.familia_codigo,
    c.familia_nombre,
    c.cantidad,
    c.unidad,
    c.precio_unitario,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'proveedor_id', c.proveedor_id,
          'proveedor_codigo', c.proveedor_codigo,
          'razon_social', c.proveedor_razon_social,
          'nombre_comercial', c.proveedor_nombre_comercial,
          'familia_id', c.familia_id,
          'total_ocs', c.total_ocs,
          'fecha_ultima_oc', c.fecha_ultima_oc,
          'ranking', c.ranking
        )
        order by c.ranking
      ) filter (where c.proveedor_id is not null),
      '[]'::jsonb
    ) as proveedores_candidatos
  from candidatos c
  group by
    c.solpe_id,
    c.solpe_codigo,
    c.solpe_estado,
    c.solpe_descripcion,
    c.solpe_item_id,
    c.proveedor_asignado_id,
    c.item_index,
    c.material_id,
    c.material_codigo,
    c.material_descripcion,
    c.familia_id,
    c.familia_codigo,
    c.familia_nombre,
    c.cantidad,
    c.unidad,
    c.precio_unitario
  order by c.solpe_codigo, c.item_index;
end;
$$;

revoke all on function public.obtener_lineas_sourcing(text) from public;
grant execute on function public.obtener_lineas_sourcing(text) to authenticated;

create or replace function public.registrar_cobertura_solpe_oc(
  p_solpe_id text,
  p_oc_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anchor_solpe public.solpe_interna%rowtype;
  v_solpe public.solpe_interna%rowtype;
  v_oc public.ordenes_compra%rowtype;
  v_source_ids text[] := array[]::text[];
  v_source_id text;
  v_has_line_origins boolean := false;
  v_items jsonb;
  v_line record;
  v_match_ordinal bigint;
  v_used_oc_ordinals bigint[] := array[]::bigint[];
  v_total_oc_lines integer := 0;
  v_total_matched integer := 0;
  v_total_covered integer := 0;
  v_total_pending integer := 0;
  v_total integer := 0;
  v_covered integer := 0;
  v_matched integer := 0;
  v_pending integer := 0;
  v_next_state text;
  v_document_solpe_id text;
  v_source_results jsonb := '[]'::jsonb;
begin
  if nullif(btrim(coalesce(p_solpe_id, '')), '') is null then
    raise exception 'El id de la SOLPE es obligatorio';
  end if;
  if nullif(btrim(coalesce(p_oc_id, '')), '') is null then
    raise exception 'El id de la OC es obligatorio';
  end if;

  select * into v_anchor_solpe from public.solpe_interna where id = p_solpe_id for update;
  if not found then raise exception 'La SOLPE % no existe', p_solpe_id; end if;
  if not public.usuario_tiene_empresa(v_anchor_solpe.empresa_id) then
    raise exception 'No autorizado para actualizar la SOLPE %', p_solpe_id using errcode = '42501';
  end if;

  select * into v_oc
  from public.ordenes_compra
  where id = p_oc_id and empresa_id = v_anchor_solpe.empresa_id
    and (solpe_id = p_solpe_id or exists (
      select 1 from jsonb_array_elements(coalesce(items, '[]'::jsonb)) as item
      where nullif(btrim(item->>'solpe_id'), '') = p_solpe_id
    ))
  for update;
  if not found then raise exception 'La OC % no pertenece a la SOLPE %', p_oc_id, p_solpe_id; end if;

  select coalesce(array_agg(source_id order by source_id), array[]::text[]), count(*) > 0
  into v_source_ids, v_has_line_origins
  from (
    select distinct nullif(btrim(item->>'solpe_id'), '') as source_id
    from jsonb_array_elements(coalesce(v_oc.items, '[]'::jsonb)) as item
    where nullif(btrim(item->>'solpe_id'), '') is not null
  ) origins;
  if not v_has_line_origins and nullif(btrim(coalesce(v_oc.solpe_id, '')), '') is not null then
    v_source_ids := array[v_oc.solpe_id];
  end if;
  if cardinality(v_source_ids) = 0 then
    raise exception 'La OC % no tiene SOLPE de origen en el documento ni en sus líneas', p_oc_id;
  end if;

  v_total_oc_lines := jsonb_array_length(coalesce(v_oc.items, '[]'::jsonb));
  foreach v_source_id in array v_source_ids loop
    select * into v_solpe from public.solpe_interna
    where id = v_source_id and empresa_id = v_anchor_solpe.empresa_id for update;
    if not found then raise exception 'La SOLPE % no existe en el tenant de la OC %', v_source_id, p_oc_id; end if;

    v_items := coalesce(v_solpe.items, '[]'::jsonb);
    v_total := 0; v_covered := 0; v_matched := 0; v_pending := 0; v_next_state := v_solpe.estado;
    for v_line in
      select x.item, x.ordinality from jsonb_array_elements(v_items) with ordinality as x(item, ordinality)
      where nullif(btrim(x.item->>'oc_id'), '') is null order by x.ordinality
    loop
      v_match_ordinal := null;
      if nullif(btrim(v_line.item->>'id'), '') is not null then
        select x.ordinality into v_match_ordinal
        from jsonb_array_elements(coalesce(v_oc.items, '[]'::jsonb)) with ordinality as x(item, ordinality)
        where nullif(btrim(x.item->>'solpe_item_id'), '') = nullif(btrim(v_line.item->>'id'), '')
          and nullif(btrim(x.item->>'material_id'), '') = nullif(btrim(v_line.item->>'material_id'), '')
          and (nullif(btrim(x.item->>'solpe_id'), '') = v_source_id or (nullif(btrim(x.item->>'solpe_id'), '') is null and v_oc.solpe_id = v_source_id))
          and not (x.ordinality = any(v_used_oc_ordinals))
        order by x.ordinality limit 1;
      end if;
      if v_match_ordinal is null and nullif(btrim(v_line.item->>'material_id'), '') is not null then
        select x.ordinality into v_match_ordinal
        from jsonb_array_elements(coalesce(v_oc.items, '[]'::jsonb)) with ordinality as x(item, ordinality)
        where nullif(btrim(x.item->>'material_id'), '') = nullif(btrim(v_line.item->>'material_id'), '')
          and nullif(btrim(x.item->>'solpe_item_id'), '') is null
          and (nullif(btrim(x.item->>'solpe_id'), '') = v_source_id or (nullif(btrim(x.item->>'solpe_id'), '') is null and v_oc.solpe_id = v_source_id))
          and not (x.ordinality = any(v_used_oc_ordinals))
        order by x.ordinality limit 1;
      end if;
      if v_match_ordinal is not null then
        v_items := jsonb_set(
          v_items,
          array[(v_line.ordinality - 1)::text],
          jsonb_set(
            jsonb_set(v_line.item, '{oc_id}', to_jsonb(p_oc_id), true),
            '{proveedor_asignado_id}', 'null'::jsonb, true
          ),
          true
        );
        v_used_oc_ordinals := array_append(v_used_oc_ordinals, v_match_ordinal);
        v_matched := v_matched + 1;
      end if;
    end loop;

    select count(*) into v_total from jsonb_array_elements(v_items) as x(item);
    select count(*) into v_covered from jsonb_array_elements(v_items) as x(item) where nullif(btrim(x.item->>'oc_id'), '') is not null;
    v_pending := greatest(v_total - v_covered, 0);
    v_next_state := case when v_matched = 0 then v_solpe.estado when v_pending = 0 then 'oc_generada' else 'oc_parcial' end;
    if v_matched > 0 then
      update public.solpe_interna set items = v_items, estado = v_next_state, updated_at = now() where id = v_source_id;
    end if;
    v_total_matched := v_total_matched + v_matched;
    v_total_covered := v_total_covered + v_covered;
    v_total_pending := v_total_pending + v_pending;
    v_source_results := v_source_results || jsonb_build_array(jsonb_build_object(
      'solpe_id', v_source_id, 'oc_id', p_oc_id, 'lineas_oc', v_total_oc_lines,
      'lineas_cubiertas_en_oc', v_matched, 'lineas_cubiertas_total', v_covered,
      'lineas_pendientes', v_pending, 'estado_anterior', v_solpe.estado,
      'estado', v_next_state, 'items', v_items
    ));
  end loop;

  v_document_solpe_id := case when cardinality(v_source_ids) = 1 then v_source_ids[1] else null end;
  update public.ordenes_compra set solpe_id = v_document_solpe_id, updated_at = now()
  where id = p_oc_id and empresa_id = v_anchor_solpe.empresa_id;

  return jsonb_build_object(
    'solpe_id', v_document_solpe_id, 'oc_id', p_oc_id, 'lineas_oc', v_total_oc_lines,
    'lineas_cubiertas_en_oc', v_total_matched, 'lineas_cubiertas_total', v_total_covered,
    'lineas_pendientes', v_total_pending,
    'estado_anterior', case when cardinality(v_source_ids) = 1 then v_source_results->0->>'estado_anterior' else null end,
    'estado', case when cardinality(v_source_ids) = 1 then v_source_results->0->>'estado' else null end,
    'items', case when cardinality(v_source_ids) = 1 then v_source_results->0->'items' else null end,
    'solpes', v_source_results
  );
end;
$$;

revoke all on function public.registrar_cobertura_solpe_oc(text, text) from public, anon;
grant execute on function public.registrar_cobertura_solpe_oc(text, text) to authenticated, service_role;

notify pgrst, 'reload schema';
