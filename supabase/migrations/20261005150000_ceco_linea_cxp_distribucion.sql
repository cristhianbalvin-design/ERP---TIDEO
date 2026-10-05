-- CECO por línea de SOLPE/OC y distribución de CxP.
-- Fase (a): esquema, backfill, validación server-side y sourcing backend.
-- La distribución histórica se conserva como una sola fila por CxP cuando
-- la CxP ya tenía CECO. El prorrateo por líneas aplica a CxP nuevas de OC.

do $$
declare
  v_hash text;
begin
  select md5(pg_get_functiondef('public.generar_cxp_centralizado(jsonb,text,text)'::regprocedure))
    into v_hash;
  if v_hash <> '928976eef474b70a815f8dea746598f1' then
    raise exception 'Hash remoto inesperado para generar_cxp_centralizado: esperado=928976eef474b70a815f8dea746598f1 obtenido=%', v_hash;
  end if;
end;
$$;

-- El runner de migraciones ejecuta este archivo dentro de una transaccion.
-- Si una tabla esta bloqueada, abortar la transaccion completa antes de continuar.
set local lock_timeout = '3s';
set local statement_timeout = '60s';

create table if not exists public.cxp_distribucion_ceco (
  id          text primary key,
  empresa_id  text not null references public.empresas(id),
  cxp_id      text not null references public.cxp(id) on delete cascade,
  ceco_id     text not null references public.centros_costo(id),
  monto       numeric(14,2) not null check (monto >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (cxp_id, ceco_id)
);

create table if not exists public.cxp_distribucion_ceco_excepciones (
  id              text primary key,
  empresa_id      text not null references public.empresas(id),
  cxp_id          text not null references public.cxp(id) on delete cascade,
  orden_compra_id text,
  motivo          text not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (cxp_id)
);

create index if not exists idx_cxp_distribucion_ceco_cxp
  on public.cxp_distribucion_ceco(cxp_id);

create index if not exists idx_cxp_distribucion_ceco_empresa
  on public.cxp_distribucion_ceco(empresa_id, ceco_id);

create index if not exists idx_cxp_distribucion_ceco_excepciones_empresa
  on public.cxp_distribucion_ceco_excepciones(empresa_id, cxp_id);

alter table public.cxp_distribucion_ceco enable row level security;
alter table public.cxp_distribucion_ceco_excepciones enable row level security;

revoke all on table public.cxp_distribucion_ceco from public, anon, service_role, authenticated;
revoke all on table public.cxp_distribucion_ceco_excepciones from public, anon, service_role, authenticated;

drop policy if exists cxp_distribucion_ceco_select on public.cxp_distribucion_ceco;
drop policy if exists cxp_distribucion_ceco_insert on public.cxp_distribucion_ceco;
drop policy if exists cxp_distribucion_ceco_update on public.cxp_distribucion_ceco;
drop policy if exists cxp_distribucion_ceco_delete on public.cxp_distribucion_ceco;
drop policy if exists cxp_distribucion_ceco_excepciones_select on public.cxp_distribucion_ceco_excepciones;

create policy cxp_distribucion_ceco_select
  on public.cxp_distribucion_ceco
  for select
  using (
    exists (
      select 1
      from public.cxp c
      where c.id = public.cxp_distribucion_ceco.cxp_id
        and c.empresa_id = public.cxp_distribucion_ceco.empresa_id
        and public.usuario_tiene_empresa(c.empresa_id)
        and public.usuario_puede(c.empresa_id, 'cxp', 'ver')
        and (
          public.usuario_alcance_sociedades(c.empresa_id) is null
          or c.sociedad_id = any(public.usuario_alcance_sociedades(c.empresa_id))
        )
    )
  );

create policy cxp_distribucion_ceco_excepciones_select
  on public.cxp_distribucion_ceco_excepciones
  for select
  using (
    exists (
      select 1
      from public.cxp c
      where c.id = public.cxp_distribucion_ceco_excepciones.cxp_id
        and c.empresa_id = public.cxp_distribucion_ceco_excepciones.empresa_id
        and public.usuario_tiene_empresa(c.empresa_id)
        and public.usuario_puede(c.empresa_id, 'cxp', 'ver')
        and (
          public.usuario_alcance_sociedades(c.empresa_id) is null
          or c.sociedad_id = any(public.usuario_alcance_sociedades(c.empresa_id))
        )
    )
  );

grant select on public.cxp_distribucion_ceco to authenticated;
grant select on public.cxp_distribucion_ceco_excepciones to authenticated;

create or replace function public.cxp_lineas_oc_ceco(p_oc_id text)
returns table (
  ceco_id          text,
  base_subtotal    numeric,
  ceco_empresa_id  text,
  sociedad_id      uuid
)
language sql
security definer
set search_path = public, pg_temp
as $$
  with oc_lineas as (
    select
      o.empresa_id,
      o.sociedad_id as oc_sociedad_id,
      item.item,
      nullif(btrim(item.item ->> 'solpe_id'), '') as solpe_id,
      nullif(btrim(item.item ->> 'solpe_item_id'), '') as solpe_item_id,
      nullif(btrim(item.item ->> 'ceco_id'), '') as item_ceco_id,
      case
        when nullif(btrim(item.item ->> 'subtotal'), '') ~ '^-?[0-9]+(\\.[0-9]+)?$'
          then (item.item ->> 'subtotal')::numeric
        when (item.item ->> 'cantidad') ~ '^-?[0-9]+(\\.[0-9]+)?$'
         and (item.item ->> 'precio_unitario') ~ '^-?[0-9]+(\\.[0-9]+)?$'
          then round(((item.item ->> 'cantidad')::numeric * (item.item ->> 'precio_unitario')::numeric), 2)
        else null
      end as base_subtotal
    from public.ordenes_compra o
    cross join lateral jsonb_array_elements(coalesce(o.items, '[]'::jsonb))
      with ordinality as item(item, item_index)
    where o.id = p_oc_id
  ),
  resueltos as (
    select
      l.empresa_id,
      l.oc_sociedad_id,
      l.base_subtotal,
      case
        when l.solpe_id is null then l.item_ceco_id
        else coalesce(
          l.item_ceco_id,
          (
            select nullif(btrim(source_item.item ->> 'ceco_id'), '')
            from public.solpe_interna source_solpe
            cross join lateral jsonb_array_elements(coalesce(source_solpe.items, '[]'::jsonb))
              with ordinality as source_item(item, item_index)
            where source_solpe.id = l.solpe_id
              and source_solpe.empresa_id = l.empresa_id
              and nullif(btrim(source_item.item ->> 'id'), '') = l.solpe_item_id
            limit 1
          ),
          (
            select source_solpe.centro_costo_id
            from public.solpe_interna source_solpe
            where source_solpe.id = l.solpe_id
              and source_solpe.empresa_id = l.empresa_id
          )
        )
      end as resolved_ceco_id
    from oc_lineas l
  )
  select
    r.resolved_ceco_id as ceco_id,
    r.base_subtotal,
    cc.empresa_id as ceco_empresa_id,
    cc.sociedad_id
  from resueltos r
  left join public.centros_costo cc
    on cc.id = r.resolved_ceco_id;
$$;

revoke all on function public.cxp_lineas_oc_ceco(text) from public, anon, authenticated, service_role;

-- Backfill SOLPE: la cabecera es el valor por defecto histórico de cada línea.
update public.solpe_interna s
set items = coalesce((
  select jsonb_agg(
    case
      when jsonb_typeof(x.item) <> 'object' then x.item
      when x.item ? 'ceco_id' then x.item
      else jsonb_set(
        x.item,
        '{ceco_id}',
        coalesce(to_jsonb(s.centro_costo_id), 'null'::jsonb),
        true
      )
    end
    order by x.item_index
  )
  from jsonb_array_elements(coalesce(s.items, '[]'::jsonb))
    with ordinality as x(item, item_index)
), '[]'::jsonb)
where s.items is not null;

-- Backfill OC: primero la línea de su SOLPE; si no existe solpe_id,
-- únicamente entonces se usa el CECO de cabecera de la OC.
update public.ordenes_compra o
set items = coalesce((
  select jsonb_agg(
    case
      when jsonb_typeof(x.item) <> 'object' then x.item
      when x.item ? 'ceco_id' then x.item
      else jsonb_set(
        x.item,
        '{ceco_id}',
        coalesce(
          to_jsonb(case
            when nullif(btrim(x.item ->> 'solpe_id'), '') is null
              then o.centro_costo_id
            else (
              select coalesce(
                nullif(btrim(source_item.item ->> 'ceco_id'), ''),
                source_solpe.centro_costo_id
              )
              from public.solpe_interna source_solpe
              left join lateral jsonb_array_elements(coalesce(source_solpe.items, '[]'::jsonb))
                with ordinality as source_item(item, item_index)
                on nullif(btrim(source_item.item ->> 'id'), '')
                   = nullif(btrim(x.item ->> 'solpe_item_id'), '')
              where source_solpe.id = nullif(btrim(x.item ->> 'solpe_id'), '')
                and source_solpe.empresa_id = o.empresa_id
              limit 1
            )
          end),
          'null'::jsonb
        ),
        true
      )
    end
    order by x.item_index
  )
  from jsonb_array_elements(coalesce(o.items, '[]'::jsonb))
    with ordinality as x(item, item_index)
), '[]'::jsonb)
where o.items is not null;

-- Histórico: no se inventa CECO. Si la CxP ya tenía CECO propio,
-- se conserva como una única distribución por el monto total.
insert into public.cxp_distribucion_ceco
  (id, empresa_id, cxp_id, ceco_id, monto)
select
  'cxpd_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20),
  c.empresa_id,
  c.id,
  c.centro_costo_id,
  round(coalesce(c.monto_total, 0), 2)
from public.cxp c
where c.centro_costo_id is not null
on conflict (cxp_id, ceco_id) do nothing;

insert into public.cxp_distribucion_ceco_excepciones
  (id, empresa_id, cxp_id, orden_compra_id, motivo)
select
  'cxpdx_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20),
  c.empresa_id,
  c.id,
  c.orden_compra_id,
  'CxP historica sin CECO; no se inventa distribucion'
from public.cxp c
where c.centro_costo_id is null
on conflict (cxp_id) do nothing;

create or replace function public.cxp_validar_distribucion_ceco()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cxp_empresa text;
  v_cxp_sociedad uuid;
  v_ceco_empresa text;
  v_ceco_sociedad uuid;
begin
  if tg_op = 'DELETE' then
    return old;
  end if;

  select c.empresa_id, c.sociedad_id
    into v_cxp_empresa, v_cxp_sociedad
  from public.cxp c
  where c.id = new.cxp_id;

  if not found then
    raise exception 'La CxP % no existe para la distribución CECO', new.cxp_id;
  end if;

  select cc.empresa_id, cc.sociedad_id
    into v_ceco_empresa, v_ceco_sociedad
  from public.centros_costo cc
  where cc.id = new.ceco_id;

  if not found then
    raise exception 'El CECO % no existe', new.ceco_id;
  end if;

  if new.empresa_id <> v_cxp_empresa or v_ceco_empresa <> v_cxp_empresa then
    raise exception 'La distribución CECO no pertenece al tenant de la CxP';
  end if;

  if v_cxp_sociedad is not null
     and v_ceco_sociedad is not null
     and v_cxp_sociedad <> v_ceco_sociedad then
    raise exception 'El CECO % pertenece a otra sociedad que la CxP %', new.ceco_id, new.cxp_id;
  end if;

  return new;
end;
$$;

revoke all on function public.cxp_validar_distribucion_ceco() from public, anon, authenticated, service_role;

create or replace function public.cxp_validar_distribucion_total()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cxp_id text := case
    when tg_table_name = 'cxp' then to_jsonb(new)->>'id'
    when tg_op = 'DELETE' then to_jsonb(old)->>'cxp_id'
    else to_jsonb(new)->>'cxp_id'
  end;
  v_monto numeric;
  v_suma numeric;
  v_filas integer;
  v_tiene_ceco boolean;
  v_tiene_oc boolean;
  v_tiene_excepcion boolean;
begin
  select c.monto_total,
         coalesce(sum(d.monto), 0),
          count(d.id)::integer,
          c.centro_costo_id is not null,
          c.orden_compra_id is not null,
          exists (
            select 1
            from public.cxp_distribucion_ceco_excepciones e
            where e.cxp_id = c.id
          )
    into v_monto, v_suma, v_filas, v_tiene_ceco, v_tiene_oc, v_tiene_excepcion
  from public.cxp c
  left join public.cxp_distribucion_ceco d on d.cxp_id = c.id
  where c.id = v_cxp_id
  group by c.id;

  if not found then
    return null;
  end if;

  if (v_tiene_ceco or (v_tiene_oc and not v_tiene_excepcion)) and v_filas = 0 then
    raise exception 'La CxP % requiere distribución CECO', v_cxp_id;
  end if;

  if v_filas > 0 and round(v_suma, 2) <> round(coalesce(v_monto, 0), 2) then
    raise exception 'La distribución CECO de la CxP % suma % y la CxP suma %',
      v_cxp_id, round(v_suma, 2), round(coalesce(v_monto, 0), 2);
  end if;

  return null;
end;
$$;

revoke all on function public.cxp_validar_distribucion_total() from public, anon, authenticated, service_role;

create or replace function public.cxp_reconstruir_distribucion_ceco(p_cxp_id text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cxp public.cxp%rowtype;
  v_oc public.ordenes_compra%rowtype;
  v_lineas integer;
  v_sin_ceco integer;
  v_ceco_invalido integer;
  v_base_invalida integer;
  v_sociedades integer;
  v_base_total numeric;
begin
  select * into v_cxp
  from public.cxp
  where id = p_cxp_id
  for update;

  if not found then
    raise exception 'La CxP % no existe', p_cxp_id;
  end if;

  delete from public.cxp_distribucion_ceco where cxp_id = v_cxp.id;
  delete from public.cxp_distribucion_ceco_excepciones where cxp_id = v_cxp.id;

  if v_cxp.orden_compra_id is null then
    if v_cxp.centro_costo_id is not null then
      insert into public.cxp_distribucion_ceco(id, empresa_id, cxp_id, ceco_id, monto)
      values (
        'cxpd_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20),
        v_cxp.empresa_id,
        v_cxp.id,
        v_cxp.centro_costo_id,
        round(coalesce(v_cxp.monto_total, 0), 2)
      );
    else
      insert into public.cxp_distribucion_ceco_excepciones
        (id, empresa_id, cxp_id, orden_compra_id, motivo)
      values (
        'cxpdx_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20),
        v_cxp.empresa_id,
        v_cxp.id,
        null,
        'CxP sin CECO; no se pudo construir distribucion'
      );
    end if;
    return;
  end if;

  select * into v_oc
  from public.ordenes_compra
  where id = v_cxp.orden_compra_id
    and empresa_id = v_cxp.empresa_id
  for share;

  if not found then
    raise exception 'La OC % no existe en el tenant de la CxP', v_cxp.orden_compra_id;
  end if;

  with lineas as (
    select
      coalesce(x.ceco_id, v_oc.centro_costo_id, v_cxp.centro_costo_id) as ceco_id,
      x.base_subtotal
    from public.cxp_lineas_oc_ceco(v_oc.id) x
  ), enriquecidas as (
    select l.ceco_id, l.base_subtotal, cc.empresa_id as ceco_empresa_id, cc.sociedad_id
    from lineas l
    left join public.centros_costo cc on cc.id = l.ceco_id
  )
  select count(*)::integer,
         count(*) filter (where x.ceco_id is null)::integer,
         count(*) filter (where x.ceco_id is not null and x.ceco_empresa_id is distinct from v_cxp.empresa_id)::integer,
         count(*) filter (where x.base_subtotal is null or x.base_subtotal < 0)::integer,
         count(distinct x.sociedad_id) filter (where x.sociedad_id is not null)::integer,
         coalesce(sum(x.base_subtotal), 0)
    into v_lineas, v_sin_ceco, v_ceco_invalido, v_base_invalida, v_sociedades, v_base_total
  from enriquecidas x;

  if v_lineas = 0 then
    if coalesce(v_oc.centro_costo_id, v_cxp.centro_costo_id) is not null then
      insert into public.cxp_distribucion_ceco(id, empresa_id, cxp_id, ceco_id, monto)
      values (
        'cxpd_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20),
        v_cxp.empresa_id,
        v_cxp.id,
        coalesce(v_oc.centro_costo_id, v_cxp.centro_costo_id),
        round(coalesce(v_cxp.monto_total, 0), 2)
      );
    else
      insert into public.cxp_distribucion_ceco_excepciones
        (id, empresa_id, cxp_id, orden_compra_id, motivo)
      values (
        'cxpdx_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20),
        v_cxp.empresa_id,
        v_cxp.id,
        v_oc.id,
        'OC sin lineas ni CECO de cabecera; no se pudo construir distribucion'
      );
    end if;
    -- OCs históricas sin items no tienen base para prorratear. Se conserva
    -- la CxP sin distribución; una OC que sí tenga líneas sin CECO sí bloquea.
    return;
  end if;
  if v_sin_ceco > 0 then
    insert into public.cxp_distribucion_ceco_excepciones
      (id, empresa_id, cxp_id, orden_compra_id, motivo)
    values (
      'cxpdx_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20),
      v_cxp.empresa_id,
      v_cxp.id,
      v_oc.id,
      format('OC con %s lineas sin CECO despues de aplicar la cadena de respaldo', v_sin_ceco)
    );
    return;
    raise exception 'La OC % tiene % líneas sin CECO', v_oc.id, v_sin_ceco;
  end if;
  if v_ceco_invalido > 0 then
    raise exception 'La OC % tiene líneas con CECO de otro tenant o inexistente', v_oc.id;
  end if;
  if v_base_invalida > 0 or v_base_total <= 0 then
    raise exception 'La OC % tiene subtotales de línea inválidos para prorratear', v_oc.id;
  end if;
  if v_sociedades > 1 then
    raise exception 'La OC % mezcla CECOs de sociedades distintas', v_oc.id;
  end if;
  if v_oc.sociedad_id is not null
     and exists (
       select 1
       from public.cxp_lineas_oc_ceco(v_oc.id) x
       left join public.centros_costo cc
         on cc.id = coalesce(x.ceco_id, v_oc.centro_costo_id, v_cxp.centro_costo_id)
       where cc.sociedad_id is distinct from v_oc.sociedad_id
     ) then
    raise exception 'La OC % tiene CECOs que no pertenecen a su sociedad', v_oc.id;
  end if;

  with bases as (
    select x.ceco_id,
           (array_agg(x.ceco_empresa_id order by x.ceco_empresa_id))[1] as empresa_id,
           (array_agg(x.sociedad_id order by x.sociedad_id nulls last))[1] as sociedad_id,
           sum(x.base_subtotal) as base_subtotal
    from (
      select
        coalesce(l.ceco_id, v_oc.centro_costo_id, v_cxp.centro_costo_id) as ceco_id,
        l.base_subtotal,
        cc.empresa_id as ceco_empresa_id,
        cc.sociedad_id
      from public.cxp_lineas_oc_ceco(v_oc.id) l
      left join public.centros_costo cc
        on cc.id = coalesce(l.ceco_id, v_oc.centro_costo_id, v_cxp.centro_costo_id)
    ) x
    group by x.ceco_id
  ),
  ranked as (
    select b.*,
           row_number() over (order by b.ceco_id) as rn,
           count(*) over () as total_cecos
    from bases b
  ),
  redondeados as (
    select r.*,
           round(coalesce(v_cxp.monto_total, 0) * r.base_subtotal / v_base_total, 2) as monto_redondeado
    from ranked r
  ),
  montos as (
    select r.*,
           case
             when r.rn = r.total_cecos then round(
               coalesce(v_cxp.monto_total, 0)
               - (r2.monto_redondeado - r.monto_redondeado),
               2
             )
             else r.monto_redondeado
           end as monto
    from redondeados r
    cross join lateral (
      select coalesce(sum(x.monto_redondeado), 0) as monto_redondeado
      from redondeados x
    ) r2
  )
  insert into public.cxp_distribucion_ceco(id, empresa_id, cxp_id, ceco_id, monto)
  select
    'cxpd_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20),
    v_cxp.empresa_id,
    v_cxp.id,
    m.ceco_id,
    m.monto
  from montos m;
end;
$$;

revoke all on function public.cxp_reconstruir_distribucion_ceco(text) from public, anon, authenticated, service_role;

create or replace function public.cxp_distribucion_after_cxp_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.orden_compra_id is not null or new.centro_costo_id is not null then
    perform public.cxp_reconstruir_distribucion_ceco(new.id);
  end if;
  return new;
end;
$$;

revoke all on function public.cxp_distribucion_after_cxp_change() from public, anon, authenticated, service_role;

-- Fuente vigente: pg_get_functiondef(public.generar_cxp_centralizado),
-- verificada contra producción antes de preparar esta migración.
create or replace function public.generar_cxp_centralizado(
  p_payload jsonb,
  p_origen text,
  p_operacion text default 'crear'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_origen text := lower(nullif(btrim(coalesce(p_origen, '')), ''));
  v_operacion text := lower(nullif(btrim(coalesce(p_operacion, 'crear')), ''));
  v_empresa_id text;
  v_cxp_id text;
  v_recepcion_id text;
  v_orden_compra_id text;
  v_total_oc numeric;
  v_suma_cxp numeric;
  v_monto_nuevo numeric;
  v_saldo_facturar numeric;
  v_orden_compra_pago_id text;
  v_total_oc_pago numeric;
  v_total_pagado_oc numeric;
  v_permitido boolean := false;
  v_ver_finanzas boolean := false;
  v_alcance uuid[];
  v_cxp public.cxp%rowtype;
begin
  if v_origen is null then raise exception 'El origen CxP es obligatorio'; end if;
  if v_operacion not in ('crear', 'actualizar') then raise exception 'Operacion CxP no soportada: %', v_operacion; end if;
  if v_operacion = 'actualizar' then
    v_cxp_id := nullif(btrim(v_payload ->> 'id'), '');
    if v_cxp_id is null then raise exception 'El id de CxP es obligatorio para actualizar'; end if;
    select * into v_cxp from public.cxp where id = v_cxp_id for update;
    if not found then raise exception 'La CxP % no existe', v_cxp_id; end if;
    v_empresa_id := v_cxp.empresa_id;
  else
    v_empresa_id := nullif(btrim(v_payload ->> 'empresa_id'), '');
    if v_empresa_id is null then raise exception 'empresa_id es obligatorio para crear CxP'; end if;
  end if;
  if not public.usuario_tiene_empresa(v_empresa_id) then raise exception 'No tienes acceso al tenant indicado'; end if;
  v_ver_finanzas := public.usuario_es_admin_empresa(v_empresa_id)
    or exists (select 1 from public.usuarios_empresas ue join public.permisos_roles pr on pr.rol_id = ue.rol_id where ue.user_id = auth.uid() and ue.empresa_id = v_empresa_id and ue.estado = 'activo' and pr.puede_ver_finanzas = true);
  v_permitido := case v_origen
    when 'recepcion_create' then public.usuario_puede(v_empresa_id, 'recepciones', 'crear')
    when 'recepcion_complete' then public.usuario_puede(v_empresa_id, 'recepciones', 'editar')
    when 'cxp_manual' then public.usuario_puede(v_empresa_id, 'cxp', 'crear')
    when 'nuevo_egreso' then public.usuario_puede(v_empresa_id, 'cxp', 'crear')
    when 'nc_devolucion' then public.usuario_puede(v_empresa_id, 'cxp', 'crear') or public.usuario_puede(v_empresa_id, 'facturacion', 'crear') or public.usuario_puede(v_empresa_id, 'facturacion', 'editar')
    when 'devolucion_proveedor' then public.usuario_puede(v_empresa_id, 'recepciones', 'crear')
    when 'compras_gastos' then public.usuario_puede(v_empresa_id, 'compras_gastos', 'crear')
    when 'gasto_movil' then public.usuario_es_superadmin_plataforma() or exists (select 1 from public.usuarios_empresas ue where ue.user_id = auth.uid() and ue.empresa_id = v_empresa_id and ue.estado = 'activo' and 'compras' = any(coalesce(ue.campo_modulos, array[]::text[])))
    when 'comisiones_rhe' then public.usuario_puede(v_empresa_id, 'cxp', 'crear') or public.usuario_puede(v_empresa_id, 'comisiones', 'crear')
    when 'nomina' then public.usuario_puede(v_empresa_id, 'nomina', 'crear') or v_ver_finanzas
    when 'liquidacion_create' then public.usuario_puede(v_empresa_id, 'liquidaciones_cese', 'crear') or v_ver_finanzas
    when 'liquidacion_anular' then public.usuario_puede(v_empresa_id, 'liquidaciones_cese', 'editar') or v_ver_finanzas
    when 'liquidation_anular' then public.usuario_puede(v_empresa_id, 'liquidaciones_cese', 'editar') or v_ver_finanzas
    when 'cxp_clasificacion' then public.usuario_puede(v_empresa_id, 'cxp', 'editar')
    when 'cxp_pago' then public.usuario_puede(v_empresa_id, 'cxp', 'editar') or v_ver_finanzas
    else false
  end;
  if not v_permitido then raise exception 'No tienes permiso para operar CxP desde el origen %', v_origen; end if;
  v_alcance := public.usuario_alcance_sociedades(v_empresa_id);
  if v_operacion = 'actualizar' then
    if v_origen = 'cxp_clasificacion' then
      update public.cxp set categoria_er = case when v_payload ? 'categoria_er' then nullif(btrim(v_payload ->> 'categoria_er'), '') else categoria_er end, centro_costo_id = case when v_payload ? 'centro_costo_id' then nullif(btrim(v_payload ->> 'centro_costo_id'), '') else centro_costo_id end, updated_at = now() where id = v_cxp_id;
      perform public.cxp_reconstruir_distribucion_ceco(v_cxp_id);
    elsif v_origen in ('devolucion_proveedor', 'cxp_pago') then
      update public.cxp set monto_pagado = coalesce(nullif(v_payload ->> 'monto_pagado', '')::numeric, monto_pagado), saldo = coalesce(nullif(v_payload ->> 'saldo', '')::numeric, saldo), estado = coalesce(nullif(v_payload ->> 'estado', ''), estado), updated_at = now() where id = v_cxp_id;
      if v_origen = 'cxp_pago' then
        v_orden_compra_pago_id := nullif(btrim(coalesce(v_cxp.orden_compra_id, '')), '');
        if v_orden_compra_pago_id is not null then
          perform pg_advisory_xact_lock(hashtext(v_cxp.empresa_id || '|CXP_PAGO_OC|' || v_orden_compra_pago_id));
          select oc.total into v_total_oc_pago from public.ordenes_compra oc where oc.id = v_orden_compra_pago_id and oc.empresa_id = v_cxp.empresa_id for update;
          if found then
            select coalesce(sum(coalesce(c.monto_pagado, 0)), 0) into v_total_pagado_oc from public.cxp c where c.empresa_id = v_cxp.empresa_id and c.orden_compra_id = v_orden_compra_pago_id and coalesce(c.estado, '') <> 'anulada';
            if v_total_pagado_oc >= coalesce(v_total_oc_pago, 0) then
              update public.ordenes_compra set estado = 'cerrada', updated_at = now() where id = v_orden_compra_pago_id and empresa_id = v_cxp.empresa_id;
            end if;
          end if;
        end if;
      end if;
    elsif v_origen in ('liquidacion_anular', 'liquidation_anular') then
      update public.cxp set estado = coalesce(nullif(v_payload ->> 'estado', ''), 'anulada'), saldo = coalesce(nullif(v_payload ->> 'saldo', '')::numeric, 0), motivo_anulacion = nullif(btrim(v_payload ->> 'motivo_anulacion'), ''), anulado_por = nullif(btrim(v_payload ->> 'anulado_por'), ''), anulado_en = coalesce(nullif(v_payload ->> 'anulado_en', '')::timestamptz, now()), updated_at = now() where id = v_cxp_id;
    else raise exception 'El origen % no admite actualizacion centralizada', v_origen;
    end if;
    select * into v_cxp from public.cxp where id = v_cxp_id;
    return to_jsonb(v_cxp);
  end if;
  v_recepcion_id := nullif(btrim(v_payload ->> 'recepcion_id'), '');
  if v_origen in ('recepcion_create', 'recepcion_complete') and v_recepcion_id is not null and exists (select 1 from public.cxp where empresa_id = v_empresa_id and recepcion_id = v_recepcion_id and lower(coalesce(estado, '')) <> 'anulada') then raise exception 'La recepcion % ya tiene una CxP vinculada', v_recepcion_id; end if;
  if v_origen = 'recepcion_complete' then
    if v_recepcion_id is null then raise exception 'La recepcion es obligatoria para completar la factura'; end if;
    if nullif(btrim(coalesce(v_payload ->> 'factura_proveedor_numero', '')), '') is null then raise exception 'El numero de factura del proveedor es obligatorio para completar la recepcion'; end if;
    update public.recepciones set factura_proveedor_numero = nullif(btrim(v_payload ->> 'factura_proveedor_numero'), ''), factura_proveedor_fecha = nullif(v_payload ->> 'factura_proveedor_fecha', '')::date, factura_proveedor_monto = nullif(v_payload ->> 'factura_proveedor_monto', '')::numeric, archivo_factura_url = nullif(btrim(v_payload ->> 'archivo_factura_url'), '') where id = v_recepcion_id and empresa_id = v_empresa_id;
    if not found then raise exception 'La recepcion % no existe en el tenant indicado', v_recepcion_id; end if;
  end if;
  v_orden_compra_id := nullif(btrim(v_payload ->> 'orden_compra_id'), '');
  if v_orden_compra_id is not null then
    select oc.total into v_total_oc from public.ordenes_compra oc where oc.id = v_orden_compra_id and oc.empresa_id = v_empresa_id for share;
    if not found then raise exception 'La orden de compra % no existe en el tenant indicado', v_orden_compra_id; end if;
    perform pg_advisory_xact_lock(hashtext(v_empresa_id || '|CXP_OC|' || v_orden_compra_id));
    select coalesce(sum(c.monto_total), 0) into v_suma_cxp from public.cxp c where c.empresa_id = v_empresa_id and c.orden_compra_id = v_orden_compra_id and coalesce(c.estado, '') <> 'anulada';
    v_monto_nuevo := coalesce(nullif(v_payload ->> 'monto_total', '')::numeric, 0);
    v_saldo_facturar := greatest(0, coalesce(v_total_oc, 0) - coalesce(v_suma_cxp, 0));
    if coalesce(v_suma_cxp, 0) + v_monto_nuevo > coalesce(v_total_oc, 0) then raise exception 'Esta OC tiene S/ % pendiente de facturar; el monto ingresado de S/ % excede el saldo disponible.', to_char(v_saldo_facturar, 'FM999999999990.00'), to_char(v_monto_nuevo, 'FM999999999990.00'); end if;
  end if;
  v_cxp := jsonb_populate_record(null::public.cxp, v_payload);
  v_cxp.id := coalesce(nullif(v_cxp.id, ''), 'cxp_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20));
  v_cxp.empresa_id := v_empresa_id;
  v_cxp.creado_por := auth.uid()::text;
  v_cxp.created_at := coalesce(v_cxp.created_at, now());
  v_cxp.updated_at := coalesce(v_cxp.updated_at, now());
  v_cxp.monto_pagado := coalesce(v_cxp.monto_pagado, 0);
  v_cxp.saldo := coalesce(v_cxp.saldo, coalesce(v_cxp.monto_total, 0) - v_cxp.monto_pagado);
  v_cxp.moneda := coalesce(v_cxp.moneda, 'PEN');
  v_cxp.estado := coalesce(v_cxp.estado, 'por_pagar');
  v_cxp.origen := coalesce(v_cxp.origen, 'manual');
  v_cxp.tipo_comprobante := coalesce(v_cxp.tipo_comprobante, 'Factura');
  v_cxp.no_devengar_er := coalesce(v_cxp.no_devengar_er, false);
  if v_cxp.sociedad_id is not null and v_alcance is not null and not (v_cxp.sociedad_id = any(v_alcance)) then raise exception 'La sociedad de la CxP esta fuera del alcance del usuario'; end if;
  insert into public.cxp values (v_cxp.*);
  perform public.cxp_reconstruir_distribucion_ceco(v_cxp.id);
  return to_jsonb(v_cxp);
end;
$$;

revoke execute on function public.generar_cxp_centralizado(jsonb, text, text) from public, anon;
grant execute on function public.generar_cxp_centralizado(jsonb, text, text) to authenticated;

-- La RPC devuelve el CECO efectivo de cada línea. Se recrea porque agregar
-- una columna a RETURNS TABLE requiere DROP/CREATE en PostgreSQL.
drop function if exists public.obtener_lineas_sourcing(text);

create function public.obtener_lineas_sourcing(p_empresa_id text)
returns table (
  solpe_id text,
  solpe_codigo text,
  solpe_estado text,
  solpe_descripcion text,
  solpe_item_id text,
  ceco_id text,
  proveedor_asignado_id text,
  comprador_campo_id text,
  comprador_nombre text,
  tomada_en timestamp with time zone,
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
  if nullif(btrim(coalesce(p_empresa_id, '')), '') is null then raise exception 'El empresa_id es obligatorio' using errcode = '22023'; end if;
  if not public.usuario_tiene_empresa(p_empresa_id) then raise exception 'No autorizado para consultar el tenant %', p_empresa_id using errcode = '42501'; end if;
  if not public.usuario_puede(p_empresa_id, 'ordenes_compra', 'ver') then raise exception 'No tienes permiso para consultar candidatos de sourcing' using errcode = '42501'; end if;
  return query
  with lineas as (
    select s.id solpe_id,s.codigo solpe_codigo,s.estado solpe_estado,s.descripcion solpe_descripcion,
      item.item ->> 'id' solpe_item_id,
      coalesce(nullif(btrim(item.item ->> 'ceco_id'), ''), s.centro_costo_id) ceco_id,
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
  select c.solpe_id,c.solpe_codigo,c.solpe_estado,c.solpe_descripcion,c.solpe_item_id,c.ceco_id,c.proveedor_asignado_id,c.comprador_campo_id,c.comprador_nombre,c.tomada_en,c.item_index,c.material_id,c.material_codigo,c.material_descripcion,c.familia_id,c.familia_codigo,c.familia_nombre,c.cantidad,c.unidad,c.precio_unitario,
    coalesce(jsonb_agg(jsonb_build_object('proveedor_id',c.proveedor_id,'proveedor_codigo',c.proveedor_codigo,'razon_social',c.proveedor_razon_social,'nombre_comercial',c.proveedor_nombre_comercial,'familia_id',c.familia_id,'total_ocs',c.total_ocs,'fecha_ultima_oc',c.fecha_ultima_oc,'ranking',c.ranking) order by c.ranking) filter(where c.proveedor_id is not null),'[]'::jsonb)
  from candidatos c
  group by c.solpe_id,c.solpe_codigo,c.solpe_estado,c.solpe_descripcion,c.solpe_item_id,c.ceco_id,c.proveedor_asignado_id,c.comprador_campo_id,c.comprador_nombre,c.tomada_en,c.item_index,c.material_id,c.material_codigo,c.material_descripcion,c.familia_id,c.familia_codigo,c.familia_nombre,c.cantidad,c.unidad,c.precio_unitario
  order by c.solpe_codigo,c.item_index;
end;
$$;

revoke all on function public.obtener_lineas_sourcing(text) from public, anon;
grant execute on function public.obtener_lineas_sourcing(text) to authenticated;

-- PostgreSQL no admite CREATE OR REPLACE TRIGGER. La migracion es versionada
-- y se aplica una vez; si un trigger ya existe, se aborta en vez de hacer DROP
-- y tomar nuevamente un lock fuerte sobre cxp.
do $$
begin
  if exists (select 1 from pg_trigger where tgrelid = 'public.cxp_distribucion_ceco'::regclass and tgname = 'trg_cxp_distribucion_ceco_tenant' and not tgisinternal) then
    raise exception 'El trigger trg_cxp_distribucion_ceco_tenant ya existe; no se reemplaza con DROP';
  end if;
  execute $sql$
    create trigger trg_cxp_distribucion_ceco_tenant
    before insert or update on public.cxp_distribucion_ceco
    for each row
    execute function public.cxp_validar_distribucion_ceco()
  $sql$;
end;
$$;

do $$
begin
  if exists (select 1 from pg_trigger where tgrelid = 'public.cxp_distribucion_ceco'::regclass and tgname = 'trg_cxp_distribucion_ceco_total' and not tgisinternal) then
    raise exception 'El trigger trg_cxp_distribucion_ceco_total ya existe; no se reemplaza con DROP';
  end if;
  execute $sql$
    create constraint trigger trg_cxp_distribucion_ceco_total
    after insert or update or delete on public.cxp_distribucion_ceco
    deferrable initially deferred
    for each row
    execute function public.cxp_validar_distribucion_total()
  $sql$;
end;
$$;

-- Los dos triggers sobre cxp toman un lock fuerte ShareRowExclusiveLock;
-- quedan al final para reducir la ventana de bloqueo.
do $$
begin
  if exists (select 1 from pg_trigger where tgrelid = 'public.cxp'::regclass and tgname = 'trg_cxp_distribucion_after_change' and not tgisinternal) then
    raise exception 'El trigger trg_cxp_distribucion_after_change ya existe; no se reemplaza con DROP';
  end if;
  execute $sql$
    create trigger trg_cxp_distribucion_after_change
    after insert or update of monto_total, centro_costo_id, orden_compra_id
    on public.cxp
    for each row
    execute function public.cxp_distribucion_after_cxp_change()
  $sql$;
end;
$$;

do $$
begin
  if exists (select 1 from pg_trigger where tgrelid = 'public.cxp'::regclass and tgname = 'trg_cxp_distribucion_cxp_total' and not tgisinternal) then
    raise exception 'El trigger trg_cxp_distribucion_cxp_total ya existe; no se reemplaza con DROP';
  end if;
  execute $sql$
    create constraint trigger trg_cxp_distribucion_cxp_total
    after insert or update of monto_total, centro_costo_id, orden_compra_id on public.cxp
    deferrable initially deferred
    for each row
    execute function public.cxp_validar_distribucion_total()
  $sql$;
end;
$$;

select pg_notify('pgrst', 'reload schema');
