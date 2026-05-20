-- Fix comisiones: el vendedor debe poder leer su propia ficha administrativa
-- para resolver la comision base, sin abrir RRHH a todo el tenant.
-- Tambien endurece la funcion jerarquica para que solo propietario/equipo/admin
-- vean registros con responsable.

alter table public.personal_administrativo
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

create index if not exists idx_personal_admin_auth_user
  on public.personal_administrativo(empresa_id, auth_user_id)
  where auth_user_id is not null;

-- Backfill seguro: si la ficha tiene email y existe el auth user, vincularlo.
update public.personal_administrativo pa
set auth_user_id = au.id
from auth.users au
where pa.auth_user_id is null
  and pa.email is not null
  and lower(pa.email) = lower(au.email);

-- Backfill CRM: registros antiguos pueden tener responsable textual pero no UUID.
-- Si la ficha administrativa ya esta vinculada a auth.users, usarla como fuente.
with raw_lookup as (
  select empresa_id, lower(trim(nombre)) as responsable_key, auth_user_id::text as user_id
  from public.personal_administrativo
  where auth_user_id is not null
    and nullif(trim(nombre), '') is not null
  union all
  select empresa_id, lower(trim(email)) as responsable_key, auth_user_id::text as user_id
  from public.personal_administrativo
  where auth_user_id is not null
    and nullif(trim(email), '') is not null
),
personal_lookup as (
  select empresa_id, responsable_key, min(user_id)::uuid as user_id
  from raw_lookup
  group by empresa_id, responsable_key
  having count(distinct user_id) = 1
)
update public.oportunidades o
set responsable_id = p.user_id
from personal_lookup p
where o.responsable_id is null
  and o.empresa_id = p.empresa_id
  and lower(trim(o.responsable)) = p.responsable_key;

with raw_lookup as (
  select empresa_id, lower(trim(nombre)) as responsable_key, auth_user_id::text as user_id
  from public.personal_administrativo
  where auth_user_id is not null
    and nullif(trim(nombre), '') is not null
  union all
  select empresa_id, lower(trim(email)) as responsable_key, auth_user_id::text as user_id
  from public.personal_administrativo
  where auth_user_id is not null
    and nullif(trim(email), '') is not null
),
personal_lookup as (
  select empresa_id, responsable_key, min(user_id)::uuid as user_id
  from raw_lookup
  group by empresa_id, responsable_key
  having count(distinct user_id) = 1
)
update public.leads l
set responsable_id = p.user_id
from personal_lookup p
where l.responsable_id is null
  and l.empresa_id = p.empresa_id
  and lower(trim(l.responsable)) = p.responsable_key;

with raw_lookup as (
  select empresa_id, lower(trim(nombre)) as responsable_key, auth_user_id::text as user_id
  from public.personal_administrativo
  where auth_user_id is not null
    and nullif(trim(nombre), '') is not null
  union all
  select empresa_id, lower(trim(email)) as responsable_key, auth_user_id::text as user_id
  from public.personal_administrativo
  where auth_user_id is not null
    and nullif(trim(email), '') is not null
),
personal_lookup as (
  select empresa_id, responsable_key, min(user_id)::uuid as user_id
  from raw_lookup
  group by empresa_id, responsable_key
  having count(distinct user_id) = 1
)
update public.cuentas c
set responsable_id = p.user_id
from personal_lookup p
where c.responsable_id is null
  and c.empresa_id = p.empresa_id
  and lower(trim(c.responsable_comercial)) = p.responsable_key;

update public.cotizaciones c
set responsable_id = o.responsable_id
from public.oportunidades o
where c.responsable_id is null
  and c.oportunidad_id = o.id
  and c.empresa_id = o.empresa_id
  and o.responsable_id is not null;

create or replace function public.usuario_puede_ver_usuario(
  target_empresa_id text,
  target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with recursive equipo(user_id) as (
    select auth.uid()
    union
    select ua.user_id
    from public.usuarios_asignaciones ua
    join equipo e on ua.jefe_user_id = e.user_id
    where ua.empresa_id = target_empresa_id
      and ua.activo = true
  )
  select public.usuario_es_superadmin_plataforma()
    or exists (
      select 1
      from public.usuarios_asignaciones caller
      join public.roles r on r.id = caller.rol_id
      where caller.user_id = auth.uid()
        and caller.empresa_id = target_empresa_id
        and caller.activo = true
        and (
          r.es_superadmin = true
          or r.es_admin_empresa = true
          or caller.nivel_jerarquico = 'direccion'
          or target_user_id = auth.uid()
          or (
            caller.nivel_jerarquico in ('jefatura', 'supervisor')
            and target_user_id in (select user_id from equipo)
          )
        )
    );
$$;

create or replace function public.usuario_puede_ver_registro(
  target_empresa_id text,
  owner_user_id uuid default null,
  target_categoria text default null,
  target_alcance_tipo text default null,
  target_alcance_id text default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.usuario_es_superadmin_plataforma()
    or exists (
      select 1
      from public.usuarios_asignaciones ua
      join public.roles r on r.id = ua.rol_id
      where ua.user_id = auth.uid()
        and ua.empresa_id = target_empresa_id
        and ua.activo = true
        and (
          r.es_superadmin = true
          or r.es_admin_empresa = true
          or ua.nivel_jerarquico = 'direccion'
        )
    )
    or coalesce(owner_user_id = auth.uid(), false)
    or (
      owner_user_id is not null
      and public.usuario_puede_ver_usuario(target_empresa_id, owner_user_id)
    )
    or (
      (target_categoria is not null or target_alcance_tipo is not null or target_alcance_id is not null)
      and exists (
        select 1
        from public.usuarios_asignaciones ua
        where ua.user_id = auth.uid()
          and ua.empresa_id = target_empresa_id
          and ua.activo = true
          and (target_categoria is null or ua.categoria = target_categoria)
          and (
            target_alcance_tipo is null
            or ua.alcance_tipo = 'tenant'
            or (
              ua.alcance_tipo = target_alcance_tipo
              and coalesce(ua.alcance_id, '') = coalesce(target_alcance_id, '')
            )
          )
      )
    );
$$;

drop policy if exists hr_admin_read_hierarchy on public.personal_administrativo;
create policy hr_admin_read_hierarchy on public.personal_administrativo
  for select
  using (
    public.usuario_tiene_empresa(empresa_id)
    and (
      public.usuario_puede(empresa_id, 'personal_administrativo', 'ver')
      or public.usuario_puede(empresa_id, 'rrhh_admin', 'ver')
      or (
        auth_user_id is not null
        and public.usuario_puede_ver_usuario(empresa_id, auth_user_id)
      )
    )
  );

create table if not exists public.acuerdo_comision_historial (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null references public.empresas(id) on delete cascade,
  oportunidad_id text not null,
  accion text not null,
  actor_nombre text,
  actor_id uuid,
  acuerdo_pct numeric(5,2),
  acuerdo_bonificacion numeric(14,2),
  justificacion text,
  motivo text,
  created_at timestamptz not null default now()
);

alter table public.acuerdo_comision_historial enable row level security;

grant select, insert on public.acuerdo_comision_historial to authenticated;

drop policy if exists acuerdo_hist_select on public.acuerdo_comision_historial;
create policy acuerdo_hist_select on public.acuerdo_comision_historial
  for select
  using (
    public.usuario_tiene_empresa(empresa_id)
    and exists (
      select 1
      from public.oportunidades o
      where o.id = acuerdo_comision_historial.oportunidad_id
        and o.empresa_id = acuerdo_comision_historial.empresa_id
        and public.usuario_puede(o.empresa_id, 'pipeline', 'ver')
        and (
          o.responsable_id is null
          or public.usuario_puede_ver_registro(o.empresa_id, o.responsable_id)
        )
    )
  );

drop policy if exists acuerdo_hist_insert on public.acuerdo_comision_historial;
create policy acuerdo_hist_insert on public.acuerdo_comision_historial
  for insert
  to authenticated
  with check (
    public.usuario_tiene_empresa(empresa_id)
    and exists (
      select 1
      from public.oportunidades o
      where o.id = acuerdo_comision_historial.oportunidad_id
        and o.empresa_id = acuerdo_comision_historial.empresa_id
        and public.usuario_puede(o.empresa_id, 'pipeline', 'ver')
        and (
          o.responsable_id is null
          or public.usuario_puede_ver_registro(o.empresa_id, o.responsable_id)
        )
    )
  );

create index if not exists idx_acuerdo_hist_opp
  on public.acuerdo_comision_historial (oportunidad_id, created_at desc);

select pg_notify('pgrst', 'reload schema');
