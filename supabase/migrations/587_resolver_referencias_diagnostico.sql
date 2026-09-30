-- 585_resolver_referencias_diagnostico.sql
-- Propuesta: resolver referencias ya guardadas sin exponer padres al frontend.
-- No aplicar sin aprobación explícita.

create or replace function public.resolver_referencias_diagnostico(
  p_empresa_id text,
  p_tipo text,
  p_ids text[]
)
returns table (
  id text,
  numero text,
  cliente text,
  activo text,
  sociedad_id uuid
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_sociedades uuid[];
  v_ids text[];
  v_id_count integer;
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    return;
  end if;

  if not public.usuario_puede(
    p_empresa_id,
    'diagnostico_tecnico',
    'ver'
  ) then
    return;
  end if;

  select coalesce(array_agg(x.id order by x.primera_posicion), '{}'::text[])
    into v_ids
  from (
    select btrim(u.id) as id, min(u.ord) as primera_posicion
    from unnest(coalesce(p_ids, '{}'::text[])) with ordinality as u(id, ord)
    where nullif(btrim(u.id), '') is not null
    group by btrim(u.id)
  ) x;

  v_id_count := coalesce(cardinality(v_ids), 0);
  if v_id_count > 200 then
    raise exception 'La función admite como máximo 200 ids; se recibieron %.', v_id_count
      using errcode = '22023';
  end if;

  if p_tipo = 'mantenimiento' then
    v_sociedades := public.usuario_alcance_sociedades(p_empresa_id);

    return query
    select
      r.id,
      r.numero,
      coalesce(
        nullif(btrim(c.razon_social), ''),
        nullif(btrim(c.nombre_comercial), ''),
        c.id
      ) as cliente,
      concat_ws(
        ' · ',
        a.codigo,
        a.nombre,
        a.marca,
        a.modelo,
        a.placa_serie
      ) as activo,
      r.sociedad_id
    from public.recepciones_activos_cliente r
    join public.activos a
      on a.id = r.activo_id
     and a.empresa_id = r.empresa_id
    left join public.cuentas c
      on c.id = a.cliente_propietario_id
     and c.empresa_id = r.empresa_id
    where r.empresa_id = p_empresa_id
      and r.id = any(v_ids)
      and (
        v_sociedades is null
        or (
          r.sociedad_id is not null
          and r.sociedad_id = any(v_sociedades)
        )
      )
    order by r.numero, r.id;

    return;
  end if;

  if p_tipo = 'fabricacion' then
    return query
    select
      o.id,
      o.nombre,
      coalesce(
        nullif(btrim(c.razon_social), ''),
        nullif(btrim(c.nombre_comercial), ''),
        c.id
      ) as cliente,
      null::text as activo,
      null::uuid as sociedad_id
    from public.oportunidades o
    left join public.cuentas c
      on c.id = o.cuenta_id
     and c.empresa_id = o.empresa_id
    where o.empresa_id = p_empresa_id
      and o.id = any(v_ids)
    order by o.nombre, o.id;

    return;
  end if;

  raise exception 'Tipo de referencia no válido: %', p_tipo
    using errcode = '22023';
end;
$function$;

revoke all on function public.resolver_referencias_diagnostico(text, text, text[])
  from public, anon, service_role;

grant execute on function public.resolver_referencias_diagnostico(text, text, text[])
  to authenticated;
