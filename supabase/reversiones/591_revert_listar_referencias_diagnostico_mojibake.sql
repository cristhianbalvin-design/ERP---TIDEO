-- TIDEO ERP - Reversion de 591_corregir_mojibake_listar_referencias_diagnostico.sql
-- Ejecutar unicamente de forma explicita y controlada.
-- Esta reversion restaura exactamente public.listar_referencias_diagnostico.
-- No es una migracion y no debe copiarse al directorio supabase/migrations.

create or replace function public.listar_referencias_diagnostico(
  p_empresa_id text,
  p_tipo text,
  p_busqueda text default null
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
  v_busqueda text := nullif(btrim(p_busqueda), '');
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

  v_sociedades := public.usuario_alcance_sociedades(p_empresa_id);

  if p_tipo = 'mantenimiento' then
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
        ' Â· ',
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
      and (
        v_sociedades is null
        or (
          r.sociedad_id is not null
          and r.sociedad_id = any(v_sociedades)
        )
      )
      and (
        v_busqueda is null
        or r.numero ilike '%' || v_busqueda || '%'
        or coalesce(c.razon_social, '') ilike '%' || v_busqueda || '%'
        or coalesce(c.nombre_comercial, '') ilike '%' || v_busqueda || '%'
        or concat_ws(
          ' ',
          a.codigo,
          a.nombre,
          a.marca,
          a.modelo,
          a.placa_serie
        ) ilike '%' || v_busqueda || '%'
      )
    order by r.numero;

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
      and o.estado = 'abierta'
      and (
        v_busqueda is null
        or o.nombre ilike '%' || v_busqueda || '%'
        or coalesce(c.razon_social, '') ilike '%' || v_busqueda || '%'
        or coalesce(c.nombre_comercial, '') ilike '%' || v_busqueda || '%'
      )
    order by o.nombre, o.id;

    return;
  end if;

  raise exception 'Tipo de referencia no vÃ¡lido: %', p_tipo
    using errcode = '22023';
end;
$function$;
