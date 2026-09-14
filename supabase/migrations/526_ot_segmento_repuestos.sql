-- Estimaciones de repuestos por segmento de OT.
-- No reserva ni consume stock: esos ciclos se implementan por separado.

create table if not exists public.ot_segmento_repuestos (
  id text primary key default gen_random_uuid()::text,
  ot_id text not null references public.ordenes_trabajo(id) on delete cascade,
  segmento_id text not null,
  material_id text not null references public.materiales(id),
  cantidad_estimada numeric not null check (cantidad_estimada > 0),
  precio_unitario_estimado numeric not null default 0 check (precio_unitario_estimado >= 0),
  estado text not null default 'estimado'
    check (estado in ('estimado', 'reservado', 'consumido', 'anulado')),
  almacen_id text references public.almacenes(id),
  solpe_id text references public.solpe_interna(id),
  empresa_id text not null references public.empresas(id),
  sociedad_id uuid references public.sociedades(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ot_segmento_repuestos_empresa_sociedad_fkey
    foreign key (empresa_id, sociedad_id)
    references public.sociedades(empresa_id, id)
);

create index if not exists idx_ot_segmento_repuestos_ot
  on public.ot_segmento_repuestos (ot_id);

create index if not exists idx_ot_segmento_repuestos_empresa_sociedad
  on public.ot_segmento_repuestos (empresa_id, sociedad_id);

alter table public.ot_segmento_repuestos enable row level security;

create policy ops_ot_segmento_repuestos_select
  on public.ot_segmento_repuestos
  for select
  to authenticated
  using (
    usuario_tiene_empresa(empresa_id)
    and usuario_puede(empresa_id, 'ot', 'ver')
    and exists (
      select 1
      from (
        select usuario_alcance_sociedades(ot_segmento_repuestos.empresa_id) as alcance
      ) alcance_usuario
      where alcance_usuario.alcance is null
        or ot_segmento_repuestos.sociedad_id = any(alcance_usuario.alcance)
    )
  );

create policy ops_ot_segmento_repuestos_insert
  on public.ot_segmento_repuestos
  for insert
  to authenticated
  with check (
    usuario_tiene_empresa(empresa_id)
    and usuario_puede(empresa_id, 'ot', 'crear')
    and exists (
      select 1
      from (
        select usuario_alcance_sociedades(ot_segmento_repuestos.empresa_id) as alcance
      ) alcance_usuario
      where alcance_usuario.alcance is null
        or ot_segmento_repuestos.sociedad_id = any(alcance_usuario.alcance)
    )
  );

create policy ops_ot_segmento_repuestos_update
  on public.ot_segmento_repuestos
  for update
  to authenticated
  using (
    usuario_tiene_empresa(empresa_id)
    and usuario_puede(empresa_id, 'ot', 'editar')
    and exists (
      select 1
      from (
        select usuario_alcance_sociedades(ot_segmento_repuestos.empresa_id) as alcance
      ) alcance_usuario
      where alcance_usuario.alcance is null
        or ot_segmento_repuestos.sociedad_id = any(alcance_usuario.alcance)
    )
  )
  with check (
    usuario_tiene_empresa(empresa_id)
    and usuario_puede(empresa_id, 'ot', 'editar')
    and exists (
      select 1
      from (
        select usuario_alcance_sociedades(ot_segmento_repuestos.empresa_id) as alcance
      ) alcance_usuario
      where alcance_usuario.alcance is null
        or ot_segmento_repuestos.sociedad_id = any(alcance_usuario.alcance)
    )
  );

create policy ops_ot_segmento_repuestos_delete
  on public.ot_segmento_repuestos
  for delete
  to authenticated
  using (
    usuario_tiene_empresa(empresa_id)
    and usuario_puede(empresa_id, 'ot', 'editar')
    and exists (
      select 1
      from (
        select usuario_alcance_sociedades(ot_segmento_repuestos.empresa_id) as alcance
      ) alcance_usuario
      where alcance_usuario.alcance is null
        or ot_segmento_repuestos.sociedad_id = any(alcance_usuario.alcance)
    )
  );

-- Catálogo acotado para el wizard de OT. Se mantiene inventario RLS sin cambios:
-- la función autoriza explícitamente por empresa, permiso ot.crear y sociedad.
create or replace function public.buscar_materiales_ot(
  p_empresa_id text,
  p_sociedad_id uuid,
  p_busqueda text,
  p_limite integer default 30
)
returns table (
  material_id text,
  codigo text,
  descripcion text,
  unidad text,
  precio_unitario numeric,
  disponible numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_alcance uuid[];
  v_limite integer := least(greatest(coalesce(p_limite, 30), 1), 30);
  v_busqueda text := btrim(coalesce(p_busqueda, ''));
begin
  if auth.uid() is null
    or not usuario_tiene_empresa(p_empresa_id)
    or not usuario_puede(p_empresa_id, 'ot', 'crear') then
    raise exception 'No tienes permiso para buscar materiales al crear una OT.';
  end if;

  select usuario_alcance_sociedades(p_empresa_id) into v_alcance;

  if p_sociedad_id is null and v_alcance is not null then
    raise exception 'Selecciona una sociedad antes de buscar materiales.';
  end if;

  if p_sociedad_id is not null
    and v_alcance is not null
    and not (p_sociedad_id = any(v_alcance)) then
    raise exception 'No tienes alcance sobre la sociedad solicitada.';
  end if;

  if char_length(v_busqueda) < 2 then
    return;
  end if;

  return query
  select
    m.id as material_id,
    m.codigo,
    m.descripcion,
    m.unidad,
    coalesce(m.precio_unitario, m.costo_promedio, 0) as precio_unitario,
    coalesce(sum(s.disponible), 0) as disponible
  from materiales m
  left join stock s
    on s.empresa_id = m.empresa_id
    and s.material_id = m.id
    and (p_sociedad_id is null or s.sociedad_id = p_sociedad_id)
  where m.empresa_id = p_empresa_id
    and lower(coalesce(m.estado, 'activo')) = 'activo'
    and (
      m.codigo ilike '%' || v_busqueda || '%'
      or m.descripcion ilike '%' || v_busqueda || '%'
      or coalesce(m.nro_parte, '') ilike '%' || v_busqueda || '%'
    )
  group by m.id, m.codigo, m.descripcion, m.unidad, m.precio_unitario, m.costo_promedio
  order by m.codigo
  limit v_limite;
end;
$$;

revoke all on function public.buscar_materiales_ot(text, uuid, text, integer) from public;
grant execute on function public.buscar_materiales_ot(text, uuid, text, integer) to authenticated;
