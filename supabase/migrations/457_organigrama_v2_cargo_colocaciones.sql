-- TIDEO ERP - Organigrama v2: cargo-colocaciones
-- Esquema aditivo. No elimina ni deja de escribir cargo_id/unidad_organizacional_id
-- de posiciones, para conservar compatibilidad con el organigrama y consumidores actuales.

-- La migracion 385 creo este indice. Se lo adjunta explicitamente como constraint
-- para que las FK compuestas empresa_id + sociedad_id tengan una clave referenciada
-- declarada y verificable en pg_constraint.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.sociedades'::regclass
      and conname = 'sociedades_empresa_id_id_key'
      and contype in ('p', 'u')
  ) then
    if not exists (
      select 1
      from pg_class i
      join pg_namespace n on n.oid = i.relnamespace
      where n.nspname = 'public'
        and i.relname = 'sociedades_empresa_id_id_key'
    ) then
      execute 'create unique index sociedades_empresa_id_id_key on public.sociedades(empresa_id, id)';
    end if;

    execute 'alter table public.sociedades add constraint sociedades_empresa_id_id_key unique using index sociedades_empresa_id_id_key';
  end if;
end;
$$;

alter table public.empresas
  add column if not exists organigrama_v2_habilitado boolean not null default false;

alter table public.cargos_empresa
  add column if not exists categoria_nivel text null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.cargos_empresa'::regclass
      and conname = 'cargos_empresa_categoria_nivel_check'
  ) then
    alter table public.cargos_empresa
      add constraint cargos_empresa_categoria_nivel_check
      check (
        categoria_nivel is null
        or categoria_nivel in (
          'direccion', 'jefatura', 'supervisor',
          'asesor', 'operativo', 'soporte'
        )
      );
  end if;
end;
$$;

create table if not exists public.cargo_colocaciones (
  id text primary key,
  empresa_id text not null references public.empresas(id) on delete cascade,
  sociedad_id uuid null,
  unidad_organizacional_id text not null
    references public.unidades_organizacionales(id) on delete restrict,
  cargo_id text not null
    references public.cargos_empresa(id) on delete restrict,
  nivel_jerarquico_id text not null
    references public.niveles_jerarquicos(id) on delete restrict,
  rol_id text not null
    references public.roles(id) on delete restrict,
  cantidad_posiciones integer not null default 1
    check (cantidad_posiciones >= 1),
  estado text not null default 'activo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cargo_colocaciones_estado_check
    check (estado in ('activo', 'inactivo')),
  constraint cargo_colocaciones_sociedad_empresa_fkey
    foreign key (empresa_id, sociedad_id)
    references public.sociedades(empresa_id, id)
);

create unique index if not exists ux_cargo_colocaciones_activa_grupo_global
  on public.cargo_colocaciones (
    empresa_id, unidad_organizacional_id, cargo_id, nivel_jerarquico_id
  )
  where sociedad_id is null and estado = 'activo';

create unique index if not exists ux_cargo_colocaciones_activa_grupo_sociedad
  on public.cargo_colocaciones (
    empresa_id, sociedad_id, unidad_organizacional_id, cargo_id, nivel_jerarquico_id
  )
  where sociedad_id is not null and estado = 'activo';

create index if not exists idx_cargo_colocaciones_empresa_estado
  on public.cargo_colocaciones(empresa_id, estado);

create index if not exists idx_cargo_colocaciones_unidad
  on public.cargo_colocaciones(empresa_id, unidad_organizacional_id);

-- Las colocaciones totalmente vacantes sin rol inferible no se crean: rol_id es
-- obligatorio. Esta cola preserva la agrupacion hasta que un administrador resuelva
-- el rol manualmente, sin inventar un rol por defecto.
create table if not exists public.cargo_colocaciones_pendientes_rol (
  id text primary key default (
    'ccpr_' || left(replace(gen_random_uuid()::text, '-', ''), 18)
  ),
  empresa_id text not null references public.empresas(id) on delete cascade,
  sociedad_id uuid null,
  unidad_organizacional_id text not null
    references public.unidades_organizacionales(id) on delete restrict,
  cargo_id text not null
    references public.cargos_empresa(id) on delete restrict,
  nivel_jerarquico_id text not null
    references public.niveles_jerarquicos(id) on delete restrict,
  posiciones_ids uuid[] not null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'resuelto', 'descartado')),
  cargo_colocacion_id text null
    references public.cargo_colocaciones(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cargo_colocaciones_pendientes_sociedad_empresa_fkey
    foreign key (empresa_id, sociedad_id)
    references public.sociedades(empresa_id, id)
);

create index if not exists idx_cc_pendientes_rol_empresa_estado
  on public.cargo_colocaciones_pendientes_rol(empresa_id, estado);

alter table public.posiciones
  add column if not exists cargo_colocacion_id text null
    references public.cargo_colocaciones(id) on delete set null;

create index if not exists idx_posiciones_cargo_colocacion
  on public.posiciones(empresa_id, cargo_colocacion_id)
  where cargo_colocacion_id is not null;

create or replace function public.validar_cargo_colocacion_integridad()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.unidades_organizacionales u
    where u.id = new.unidad_organizacional_id
      and u.empresa_id = new.empresa_id
  ) then
    raise exception 'La unidad organizacional no pertenece al tenant de la colocacion';
  end if;

  if not exists (
    select 1
    from public.cargos_empresa c
    where c.id = new.cargo_id
      and c.empresa_id = new.empresa_id
  ) then
    raise exception 'El cargo no pertenece al tenant de la colocacion';
  end if;

  if not exists (
    select 1
    from public.niveles_jerarquicos n
    where n.id = new.nivel_jerarquico_id
      and n.empresa_id = new.empresa_id
  ) then
    raise exception 'El nivel jerarquico no pertenece al tenant de la colocacion';
  end if;

  if not exists (
    select 1
    from public.roles r
    where r.id = new.rol_id
      and r.empresa_id = new.empresa_id
  ) then
    raise exception 'El rol no pertenece al tenant de la colocacion';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_cargo_colocaciones_validar_integridad
  on public.cargo_colocaciones;
create trigger trg_cargo_colocaciones_validar_integridad
before insert or update of empresa_id, sociedad_id, unidad_organizacional_id,
  cargo_id, nivel_jerarquico_id, rol_id, cantidad_posiciones, estado
on public.cargo_colocaciones
for each row execute function public.validar_cargo_colocacion_integridad();

create or replace function public.sincronizar_posicion_desde_cargo_colocacion()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_colocacion public.cargo_colocaciones%rowtype;
begin
  if new.cargo_colocacion_id is null then
    return new;
  end if;

  select * into v_colocacion
  from public.cargo_colocaciones
  where id = new.cargo_colocacion_id;

  if not found or v_colocacion.empresa_id <> new.empresa_id then
    raise exception 'La colocacion no existe o no pertenece al tenant de la posicion';
  end if;

  new.cargo_id := v_colocacion.cargo_id;
  new.unidad_organizacional_id := v_colocacion.unidad_organizacional_id;
  return new;
end;
$$;

drop trigger if exists trg_posiciones_sync_desde_cargo_colocacion
  on public.posiciones;
create trigger trg_posiciones_sync_desde_cargo_colocacion
before insert or update of cargo_colocacion_id, cargo_id, unidad_organizacional_id
on public.posiciones
for each row execute function public.sincronizar_posicion_desde_cargo_colocacion();

create or replace function public.propagar_cargo_colocacion_a_posiciones()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.posiciones
  set cargo_id = new.cargo_id,
      unidad_organizacional_id = new.unidad_organizacional_id,
      updated_at = now()
  where cargo_colocacion_id = new.id
    and (
      cargo_id is distinct from new.cargo_id
      or unidad_organizacional_id is distinct from new.unidad_organizacional_id
    );
  return new;
end;
$$;

drop trigger if exists trg_cargo_colocaciones_propagar_posiciones
  on public.cargo_colocaciones;
create trigger trg_cargo_colocaciones_propagar_posiciones
after update of cargo_id, unidad_organizacional_id
on public.cargo_colocaciones
for each row execute function public.propagar_cargo_colocacion_a_posiciones();

create or replace function public.crear_o_actualizar_cargo_colocacion(
  p_id text,
  p_empresa_id text,
  p_sociedad_id uuid,
  p_unidad_organizacional_id text,
  p_cargo_id text,
  p_nivel_jerarquico_id text,
  p_rol_id text,
  p_cantidad_posiciones integer,
  p_estado text default 'activo'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text := coalesce(
    nullif(trim(p_id), ''),
    'ccol_' || left(replace(gen_random_uuid()::text, '-', ''), 18)
  );
  v_ocupadas integer;
  v_ocupantes text;
begin
  if p_rol_id is null or trim(p_rol_id) = '' then
    raise exception 'El rol de sistema es obligatorio para una cargo-colocacion';
  end if;

  if p_cantidad_posiciones is null or p_cantidad_posiciones < 1 then
    raise exception 'cantidad_posiciones debe ser al menos 1';
  end if;

  if not public.usuario_tiene_empresa(p_empresa_id)
     or not public.usuario_puede(p_empresa_id, 'organigrama', 'editar') then
    raise exception 'No tiene permiso para editar cargo-colocaciones';
  end if;

  if exists (
    select 1
    from public.cargo_colocaciones cc
    where cc.id = v_id and cc.empresa_id <> p_empresa_id
  ) then
    raise exception 'La cargo-colocacion no pertenece al tenant indicado';
  end if;

  select count(distinct p.id),
         string_agg(
           distinct coalesce(po.nombre, pa.nombre, pu.user_id::text), ', '
         )
  into v_ocupadas, v_ocupantes
  from public.posiciones p
  join public.posiciones_usuarios pu
    on pu.posicion_id = p.id
   and pu.fecha_fin is null
  left join public.personal_operativo po on po.auth_user_id = pu.user_id
  left join public.personal_administrativo pa on pa.auth_user_id = pu.user_id
  where p.cargo_colocacion_id = v_id;

  if coalesce(v_ocupadas, 0) > p_cantidad_posiciones then
    raise exception
      'La cantidad solicitada (%) es menor que las % posiciones ocupadas: %',
      p_cantidad_posiciones,
      v_ocupadas,
      coalesce(v_ocupantes, 'ocupantes sin ficha');
  end if;

  insert into public.cargo_colocaciones (
    id, empresa_id, sociedad_id, unidad_organizacional_id, cargo_id,
    nivel_jerarquico_id, rol_id, cantidad_posiciones, estado
  ) values (
    v_id, p_empresa_id, p_sociedad_id, p_unidad_organizacional_id, p_cargo_id,
    p_nivel_jerarquico_id, p_rol_id, p_cantidad_posiciones,
    coalesce(nullif(trim(p_estado), ''), 'activo')
  )
  on conflict (id) do update set
    sociedad_id = excluded.sociedad_id,
    unidad_organizacional_id = excluded.unidad_organizacional_id,
    cargo_id = excluded.cargo_id,
    nivel_jerarquico_id = excluded.nivel_jerarquico_id,
    rol_id = excluded.rol_id,
    cantidad_posiciones = excluded.cantidad_posiciones,
    estado = excluded.estado,
    updated_at = now();

  return jsonb_build_object(
    'id', v_id,
    'ocupadas', coalesce(v_ocupadas, 0)
  );
end;
$$;

create or replace function public.generar_posiciones_desde_colocacion(
  p_cargo_colocacion_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_colocacion public.cargo_colocaciones%rowtype;
  v_actual integer;
  v_ocupadas integer;
  v_creadas integer := 0;
  v_eliminadas integer := 0;
begin
  select * into v_colocacion
  from public.cargo_colocaciones
  where id = p_cargo_colocacion_id
  for update;

  if not found then
    raise exception 'Cargo-colocacion no encontrada';
  end if;

  if not public.usuario_tiene_empresa(v_colocacion.empresa_id)
     or not public.usuario_puede(v_colocacion.empresa_id, 'organigrama', 'editar') then
    raise exception 'No tiene permiso para generar posiciones';
  end if;

  select count(*) into v_actual
  from public.posiciones
  where cargo_colocacion_id = v_colocacion.id
    and activa = true;

  select count(distinct p.id) into v_ocupadas
  from public.posiciones p
  join public.posiciones_usuarios pu
    on pu.posicion_id = p.id
   and pu.fecha_fin is null
  where p.cargo_colocacion_id = v_colocacion.id
    and p.activa = true;

  if v_ocupadas > v_colocacion.cantidad_posiciones then
    raise exception
      'No se puede reducir: hay % posiciones ocupadas y la cantidad es %',
      v_ocupadas,
      v_colocacion.cantidad_posiciones;
  end if;

  if v_actual < v_colocacion.cantidad_posiciones then
    insert into public.posiciones (
      empresa_id, cargo_colocacion_id, cargo_id,
      unidad_organizacional_id, estado, activa
    )
    select
      v_colocacion.empresa_id,
      v_colocacion.id,
      v_colocacion.cargo_id,
      v_colocacion.unidad_organizacional_id,
      'vacante',
      true
    from generate_series(1, v_colocacion.cantidad_posiciones - v_actual);
    get diagnostics v_creadas = row_count;
  elsif v_actual > v_colocacion.cantidad_posiciones then
    with vacantes as (
      select p.id
      from public.posiciones p
      where p.cargo_colocacion_id = v_colocacion.id
        and p.activa = true
        and not exists (
          select 1
          from public.posiciones_usuarios pu
          where pu.posicion_id = p.id
            and pu.fecha_fin is null
        )
      order by p.created_at desc, p.id desc
      limit (v_actual - v_colocacion.cantidad_posiciones)
    )
    delete from public.posiciones p
    using vacantes v
    where p.id = v.id;
    get diagnostics v_eliminadas = row_count;
  end if;

  return jsonb_build_object(
    'cargo_colocacion_id', v_colocacion.id,
    'creadas', v_creadas,
    'eliminadas', v_eliminadas
  );
end;
$$;

alter table public.cargo_colocaciones enable row level security;
alter table public.cargo_colocaciones_pendientes_rol enable row level security;

drop policy if exists cargo_colocaciones_tenant_isolation
  on public.cargo_colocaciones;
create policy cargo_colocaciones_tenant_isolation
  on public.cargo_colocaciones
  for all
  using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

drop policy if exists cargo_colocaciones_pendientes_tenant_isolation
  on public.cargo_colocaciones_pendientes_rol;
create policy cargo_colocaciones_pendientes_tenant_isolation
  on public.cargo_colocaciones_pendientes_rol
  for all
  using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

grant execute on function public.crear_o_actualizar_cargo_colocacion(
  text, text, uuid, text, text, text, text, integer, text
) to authenticated, service_role;

grant execute on function public.generar_posiciones_desde_colocacion(text)
  to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');
