-- TIDEO ERP - Base canonica de identidad multitenant.
--
-- auth.users mantiene la identidad global y la contrasena.
-- public.profiles guarda datos globales del usuario.
-- public.usuarios_empresas sigue siendo la fuente de verdad del acceso por tenant.
-- public.usuarios queda viva como compatibilidad legacy mientras se migran pantallas/FKs.

create extension if not exists pgcrypto;

alter table public.empresas
  add column if not exists es_plataforma boolean not null default false;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  nombre text not null,
  telefono text,
  avatar_url text,
  estado_global text not null default 'activo',
  must_change_password boolean not null default false,
  ultimo_login timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_estado_global_check check (estado_global in ('activo', 'suspendido', 'inactivo'))
);

create unique index if not exists ux_profiles_email_lower
  on public.profiles (lower(email));

create index if not exists idx_profiles_estado_global
  on public.profiles (estado_global);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

insert into public.profiles (
  user_id, email, nombre, telefono, estado_global, must_change_password, ultimo_login
)
select
  au.id,
  lower(coalesce(nullif(au.email, ''), nullif(u.email, ''))),
  coalesce(
    nullif(trim(u.nombre), ''),
    nullif(trim(au.raw_user_meta_data->>'nombre'), ''),
    nullif(trim(au.raw_user_meta_data->>'full_name'), ''),
    split_part(lower(coalesce(nullif(au.email, ''), nullif(u.email, ''), au.id::text)), '@', 1)
  ),
  nullif(trim(u.telefono), ''),
  case
    when lower(coalesce(u.estado, 'activo')) in ('suspendido', 'suspendida') then 'suspendido'
    when lower(coalesce(u.estado, 'activo')) in ('inactivo', 'inactiva') then 'inactivo'
    else 'activo'
  end,
  coalesce(u.must_change_password, false),
  u.ultimo_login
from auth.users au
left join public.usuarios u on u.id = au.id::text
where coalesce(nullif(au.email, ''), nullif(u.email, '')) is not null
on conflict (user_id) do update set
  email = excluded.email,
  nombre = excluded.nombre,
  telefono = coalesce(excluded.telefono, public.profiles.telefono),
  estado_global = excluded.estado_global,
  must_change_password = excluded.must_change_password,
  ultimo_login = coalesce(excluded.ultimo_login, public.profiles.ultimo_login),
  updated_at = now();

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nivel text not null default 'superadmin',
  estado text not null default 'activo',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_admins_nivel_check check (nivel in ('superadmin', 'support', 'auditor')),
  constraint platform_admins_estado_check check (estado in ('activo', 'suspendido', 'inactivo'))
);

drop trigger if exists trg_platform_admins_updated_at on public.platform_admins;
create trigger trg_platform_admins_updated_at
before update on public.platform_admins
for each row execute function public.set_updated_at();

insert into public.platform_admins (user_id, nivel, estado)
select id, 'superadmin', 'activo'
from auth.users
where lower(email) = 'cristhianbalvin@gmail.com'
on conflict (user_id) do update set
  nivel = 'superadmin',
  estado = 'activo',
  updated_at = now();

create table if not exists public.tenant_invitations (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null references public.empresas(id) on delete cascade,
  email text not null,
  nombre text,
  rol_id text references public.roles(id) on delete set null,
  estado text not null default 'pendiente',
  invited_by uuid references auth.users(id) on delete set null,
  accepted_by uuid references auth.users(id) on delete set null,
  token_hash text,
  expires_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_invitations_estado_check check (estado in ('pendiente', 'aceptada', 'expirada', 'cancelada'))
);

create unique index if not exists ux_tenant_invitations_pending_email
  on public.tenant_invitations (empresa_id, lower(email))
  where estado = 'pendiente';

create index if not exists idx_tenant_invitations_empresa_estado
  on public.tenant_invitations (empresa_id, estado, created_at desc);

drop trigger if exists trg_tenant_invitations_updated_at on public.tenant_invitations;
create trigger trg_tenant_invitations_updated_at
before update on public.tenant_invitations
for each row execute function public.set_updated_at();

create or replace function public.usuario_es_superadmin_plataforma()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_admins pa
    join auth.users au on au.id = pa.user_id
    where pa.user_id = auth.uid()
      and pa.estado = 'activo'
      and pa.nivel = 'superadmin'
      and lower(au.email) = 'cristhianbalvin@gmail.com'
  )
  or exists (
    select 1
    from public.usuarios_empresas ue
    join public.roles r on r.id = ue.rol_id
    join public.empresas e on e.id = ue.empresa_id
    join auth.users au on au.id = ue.user_id
    where ue.user_id = auth.uid()
      and ue.estado = 'activo'
      and r.es_superadmin = true
      and e.es_plataforma = true
      and lower(au.email) = 'cristhianbalvin@gmail.com'
  );
$$;

create or replace function public.usuario_puede_ver_profile(target_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select target_user_id = auth.uid()
  or public.usuario_es_superadmin_plataforma()
  or exists (
    select 1
    from public.usuarios_empresas viewer
    join public.roles vr on vr.id = viewer.rol_id
    join public.usuarios_empresas target
      on target.empresa_id = viewer.empresa_id
     and target.user_id = target_user_id
     and target.estado = 'activo'
    where viewer.user_id = auth.uid()
      and viewer.estado = 'activo'
      and (vr.es_admin_empresa = true or vr.es_superadmin = true)
  );
$$;

alter table public.profiles enable row level security;
alter table public.platform_admins enable row level security;
alter table public.tenant_invitations enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
for select using (public.usuario_puede_ver_profile(user_id));

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
for insert with check (user_id = auth.uid() or public.usuario_es_superadmin_plataforma());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
for update using (user_id = auth.uid() or public.usuario_es_superadmin_plataforma())
with check (user_id = auth.uid() or public.usuario_es_superadmin_plataforma());

drop policy if exists platform_admins_self_select on public.platform_admins;
create policy platform_admins_self_select on public.platform_admins
for select using (user_id = auth.uid());

drop policy if exists tenant_invitations_select on public.tenant_invitations;
create policy tenant_invitations_select on public.tenant_invitations
for select using (public.usuario_es_admin_empresa(empresa_id));

drop policy if exists tenant_invitations_insert on public.tenant_invitations;
create policy tenant_invitations_insert on public.tenant_invitations
for insert with check (public.usuario_es_admin_empresa(empresa_id));

drop policy if exists tenant_invitations_update on public.tenant_invitations;
create policy tenant_invitations_update on public.tenant_invitations
for update using (public.usuario_es_admin_empresa(empresa_id))
with check (public.usuario_es_admin_empresa(empresa_id));

drop policy if exists tenant_invitations_delete on public.tenant_invitations;
create policy tenant_invitations_delete on public.tenant_invitations
for delete using (public.usuario_es_admin_empresa(empresa_id));

drop function if exists public.get_mis_membresias();
create function public.get_mis_membresias()
returns table(
  empresa_id text,
  rol_id text,
  acceso_campo boolean,
  perfil_campo text,
  campo_modulos text[]
)
language sql
security definer
stable
set search_path = public
as $$
  with superadmin_role as (
    select ue.rol_id
    from public.usuarios_empresas ue
    join public.roles r on r.id = ue.rol_id
    join public.empresas e on e.id = ue.empresa_id
    join auth.users au on au.id = ue.user_id
    where ue.user_id = auth.uid()
      and ue.estado = 'activo'
      and r.es_superadmin = true
      and e.es_plataforma = true
      and lower(au.email) = 'cristhianbalvin@gmail.com'
    limit 1
  )
  select e.id, s.rol_id, true, 'plataforma'::text, array['gerencia']::text[]
  from public.empresas e
  cross join superadmin_role s
  where e.estado in ('activa', 'activo', 'demo')

  union

  select
    ue.empresa_id,
    ue.rol_id,
    ue.acceso_campo,
    ue.perfil_campo,
    coalesce(ue.campo_modulos, '{}'::text[])
  from public.usuarios_empresas ue
  where ue.user_id = auth.uid()
    and ue.estado = 'activo'
    and not exists (select 1 from superadmin_role);
$$;

drop function if exists public.get_mis_membresias(uuid);
create function public.get_mis_membresias(p_user_id uuid)
returns table(
  empresa_id text,
  rol_id text,
  acceso_campo boolean,
  perfil_campo text,
  campo_modulos text[]
)
language sql
security definer
stable
set search_path = public
as $$
  select *
  from public.get_mis_membresias();
$$;

select pg_notify('pgrst', 'reload schema');
