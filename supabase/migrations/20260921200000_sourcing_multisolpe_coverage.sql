-- Cobertura de OC con líneas provenientes de múltiples SOLPEs.
-- Mantiene la firma existente y deriva los orígenes desde OC.items.

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

  select *
    into v_anchor_solpe
    from public.solpe_interna
   where id = p_solpe_id
   for update;

  if not found then
    raise exception 'La SOLPE % no existe', p_solpe_id;
  end if;

  if not public.usuario_tiene_empresa(v_anchor_solpe.empresa_id) then
    raise exception 'No autorizado para actualizar la SOLPE %', p_solpe_id
      using errcode = '42501';
  end if;

  select *
    into v_oc
    from public.ordenes_compra
   where id = p_oc_id
     and empresa_id = v_anchor_solpe.empresa_id
     and (
       solpe_id = p_solpe_id
       or exists (
         select 1
           from jsonb_array_elements(coalesce(items, '[]'::jsonb)) as item
          where nullif(btrim(item->>'solpe_id'), '') = p_solpe_id
       )
     )
   for update;

  if not found then
    raise exception 'La OC % no pertenece a la SOLPE %', p_oc_id, p_solpe_id;
  end if;

  select
    coalesce(array_agg(source_id order by source_id), array[]::text[]),
    count(*) > 0
    into v_source_ids, v_has_line_origins
    from (
      select distinct nullif(btrim(item->>'solpe_id'), '') as source_id
        from jsonb_array_elements(coalesce(v_oc.items, '[]'::jsonb)) as item
       where nullif(btrim(item->>'solpe_id'), '') is not null
    ) origins;

  if not v_has_line_origins
     and nullif(btrim(coalesce(v_oc.solpe_id, '')), '') is not null then
    v_source_ids := array[v_oc.solpe_id];
  end if;

  if cardinality(v_source_ids) = 0 then
    raise exception 'La OC % no tiene SOLPE de origen en el documento ni en sus líneas', p_oc_id;
  end if;

  v_total_oc_lines := jsonb_array_length(coalesce(v_oc.items, '[]'::jsonb));

  foreach v_source_id in array v_source_ids loop
    select *
      into v_solpe
      from public.solpe_interna
     where id = v_source_id
       and empresa_id = v_anchor_solpe.empresa_id
     for update;

    if not found then
      raise exception 'La SOLPE % no existe en el tenant de la OC %', v_source_id, p_oc_id;
    end if;

    v_items := coalesce(v_solpe.items, '[]'::jsonb);
    v_total := 0;
    v_covered := 0;
    v_matched := 0;
    v_pending := 0;
    v_next_state := v_solpe.estado;

    for v_line in
      select x.item, x.ordinality
        from jsonb_array_elements(v_items) with ordinality as x(item, ordinality)
       where nullif(btrim(x.item->>'oc_id'), '') is null
       order by x.ordinality
    loop
      v_match_ordinal := null;

      -- La línea de origen evita cruzar materiales iguales de SOLPEs distintas.
      if nullif(btrim(v_line.item->>'id'), '') is not null then
        select x.ordinality
          into v_match_ordinal
          from jsonb_array_elements(coalesce(v_oc.items, '[]'::jsonb)) with ordinality as x(item, ordinality)
         where nullif(btrim(x.item->>'solpe_item_id'), '') = nullif(btrim(v_line.item->>'id'), '')
           and nullif(btrim(x.item->>'material_id'), '') = nullif(btrim(v_line.item->>'material_id'), '')
           and (
             nullif(btrim(x.item->>'solpe_id'), '') = v_source_id
             or (
               nullif(btrim(x.item->>'solpe_id'), '') is null
               and v_oc.solpe_id = v_source_id
             )
           )
           and not (x.ordinality = any(v_used_oc_ordinals))
         order by x.ordinality
         limit 1;
      end if;

      -- Compatibilidad con líneas históricas sin solpe_item_id ni solpe_id.
      if v_match_ordinal is null
         and nullif(btrim(v_line.item->>'material_id'), '') is not null then
        select x.ordinality
          into v_match_ordinal
          from jsonb_array_elements(coalesce(v_oc.items, '[]'::jsonb)) with ordinality as x(item, ordinality)
         where nullif(btrim(x.item->>'material_id'), '') = nullif(btrim(v_line.item->>'material_id'), '')
           and nullif(btrim(x.item->>'solpe_item_id'), '') is null
           and (
             nullif(btrim(x.item->>'solpe_id'), '') = v_source_id
             or (
               nullif(btrim(x.item->>'solpe_id'), '') is null
               and v_oc.solpe_id = v_source_id
             )
           )
           and not (x.ordinality = any(v_used_oc_ordinals))
         order by x.ordinality
         limit 1;
      end if;

      if v_match_ordinal is not null then
        v_items := jsonb_set(
          v_items,
          array[(v_line.ordinality - 1)::text],
          jsonb_set(v_line.item, '{oc_id}', to_jsonb(p_oc_id), true),
          true
        );
        v_used_oc_ordinals := array_append(v_used_oc_ordinals, v_match_ordinal);
        v_matched := v_matched + 1;
      end if;
    end loop;

    select count(*)
      into v_total
      from jsonb_array_elements(v_items) as x(item);

    select count(*)
      into v_covered
      from jsonb_array_elements(v_items) as x(item)
     where nullif(btrim(x.item->>'oc_id'), '') is not null;

    v_pending := greatest(v_total - v_covered, 0);
    v_next_state := case
      when v_matched = 0 then v_solpe.estado
      when v_pending = 0 then 'oc_generada'
      else 'oc_parcial'
    end;

    if v_matched > 0 then
      update public.solpe_interna
         set items = v_items,
             estado = v_next_state,
             updated_at = now()
       where id = v_source_id;
    end if;

    v_total_matched := v_total_matched + v_matched;
    v_total_covered := v_total_covered + v_covered;
    v_total_pending := v_total_pending + v_pending;
    v_source_results := v_source_results || jsonb_build_array(jsonb_build_object(
      'solpe_id', v_source_id,
      'oc_id', p_oc_id,
      'lineas_oc', v_total_oc_lines,
      'lineas_cubiertas_en_oc', v_matched,
      'lineas_cubiertas_total', v_covered,
      'lineas_pendientes', v_pending,
      'estado_anterior', v_solpe.estado,
      'estado', v_next_state,
      'items', v_items
    ));
  end loop;

  v_document_solpe_id := case
    when cardinality(v_source_ids) = 1 then v_source_ids[1]
    else null
  end;

  update public.ordenes_compra
     set solpe_id = v_document_solpe_id,
         updated_at = now()
   where id = p_oc_id
     and empresa_id = v_anchor_solpe.empresa_id;

  return jsonb_build_object(
    'solpe_id', v_document_solpe_id,
    'oc_id', p_oc_id,
    'lineas_oc', v_total_oc_lines,
    'lineas_cubiertas_en_oc', v_total_matched,
    'lineas_cubiertas_total', v_total_covered,
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
