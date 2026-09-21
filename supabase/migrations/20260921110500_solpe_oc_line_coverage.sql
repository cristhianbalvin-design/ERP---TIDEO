-- Preserva la trazabilidad SOLPE -> OC por línea y permite cobertura parcial.
-- El backfill es deliberadamente puntual: solo actúa sobre la línea real
-- detectada sin id en el tenant PRUEBA; en otros entornos no-opera.

do $$
declare
  v_solpe_id text := 'slp_ot_b9e96fbc36e44a13b704a6c4b1132496';
  v_empresa_id text := 'emp_2000000000';
  v_material_id text := 'mat_c338a901dfee41ccaa';
  v_new_item_id text := format(
    'itm_%s_%s',
    (extract(epoch from clock_timestamp()) * 1000)::bigint,
    substr(md5(random()::text || clock_timestamp()::text), 1, 4)
  );
  v_items jsonb;
  v_matches integer;
begin
  select count(*)
    into v_matches
    from public.solpe_interna s
    cross join lateral jsonb_array_elements(coalesce(s.items, '[]'::jsonb)) with ordinality as x(item, ordinality)
   where s.id = v_solpe_id
     and s.empresa_id = v_empresa_id
     and x.item->>'material_id' = v_material_id
     and nullif(btrim(x.item->>'id'), '') is null;

  if v_matches = 1 then
    select coalesce(jsonb_agg(
      case
        when x.item->>'material_id' = v_material_id
         and nullif(btrim(x.item->>'id'), '') is null
        then jsonb_set(x.item, '{id}', to_jsonb(v_new_item_id), true)
        else x.item
      end
      order by x.ordinality
    ), '[]'::jsonb)
      into v_items
      from public.solpe_interna s
      cross join lateral jsonb_array_elements(coalesce(s.items, '[]'::jsonb)) with ordinality as x(item, ordinality)
     where s.id = v_solpe_id
       and s.empresa_id = v_empresa_id;

    update public.solpe_interna
       set items = v_items
     where id = v_solpe_id
       and empresa_id = v_empresa_id;

    raise notice 'Backfill aplicado a %. Nuevo id: %', v_solpe_id, v_new_item_id;
  elsif v_matches = 0 then
    raise notice 'Backfill no-op: no se encontró la línea objetivo de %', v_solpe_id;
  else
    raise exception 'Backfill abortado: se encontraron % líneas objetivo en %', v_matches, v_solpe_id;
  end if;
end;
$$;

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
  v_solpe public.solpe_interna%rowtype;
  v_oc public.ordenes_compra%rowtype;
  v_items jsonb;
  v_line record;
  v_match_ordinal bigint;
  v_used_oc_ordinals bigint[] := array[]::bigint[];
  v_total integer := 0;
  v_covered integer := 0;
  v_matched integer := 0;
  v_pending integer := 0;
  v_next_state text;
begin
  if nullif(btrim(coalesce(p_solpe_id, '')), '') is null then
    raise exception 'El id de la SOLPE es obligatorio';
  end if;

  if nullif(btrim(coalesce(p_oc_id, '')), '') is null then
    raise exception 'El id de la OC es obligatorio';
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

  select *
    into v_oc
    from public.ordenes_compra
   where id = p_oc_id
     and empresa_id = v_solpe.empresa_id
     and solpe_id = p_solpe_id
   for update;

  if not found then
    raise exception 'La OC % no pertenece a la SOLPE %', p_oc_id, p_solpe_id;
  end if;

  v_items := coalesce(v_solpe.items, '[]'::jsonb);

  for v_line in
    select x.item, x.ordinality
      from jsonb_array_elements(v_items) with ordinality as x(item, ordinality)
     where nullif(btrim(x.item->>'oc_id'), '') is null
     order by x.ordinality
  loop
    v_match_ordinal := null;

    -- La trazabilidad explícita tiene prioridad sobre el fallback por material.
    if nullif(btrim(v_line.item->>'id'), '') is not null then
      select x.ordinality
        into v_match_ordinal
       from jsonb_array_elements(coalesce(v_oc.items, '[]'::jsonb)) with ordinality as x(item, ordinality)
       where nullif(btrim(x.item->>'solpe_item_id'), '') = nullif(btrim(v_line.item->>'id'), '')
         and nullif(btrim(x.item->>'material_id'), '') = nullif(btrim(v_line.item->>'material_id'), '')
         and not (x.ordinality = any(v_used_oc_ordinals))
       order by x.ordinality
       limit 1;
    end if;

    -- Compatibilidad con líneas antiguas que todavía no tienen solpe_item_id.
    if v_match_ordinal is null
       and nullif(btrim(v_line.item->>'material_id'), '') is not null then
      select x.ordinality
        into v_match_ordinal
        from jsonb_array_elements(coalesce(v_oc.items, '[]'::jsonb)) with ordinality as x(item, ordinality)
       where nullif(btrim(x.item->>'material_id'), '') = nullif(btrim(v_line.item->>'material_id'), '')
         and nullif(btrim(x.item->>'solpe_item_id'), '') is null
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
     where id = p_solpe_id;
  end if;

  return jsonb_build_object(
    'solpe_id', p_solpe_id,
    'oc_id', p_oc_id,
    'lineas_oc', jsonb_array_length(coalesce(v_oc.items, '[]'::jsonb)),
    'lineas_cubiertas_en_oc', v_matched,
    'lineas_cubiertas_total', v_covered,
    'lineas_pendientes', v_pending,
    'estado_anterior', v_solpe.estado,
    'estado', v_next_state,
    'items', v_items
  );
end;
$$;

revoke all on function public.registrar_cobertura_solpe_oc(text, text) from public, anon;
grant execute on function public.registrar_cobertura_solpe_oc(text, text) to authenticated, service_role;
