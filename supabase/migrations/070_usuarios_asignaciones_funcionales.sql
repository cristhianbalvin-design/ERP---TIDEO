-- TIDEO ERP - Asignaciones funcionales multirol.
-- Evoluciona la jerarquia 069 sin romper usuarios_empresas: el rol principal sigue vigente,
-- y cada usuario puede tener asignaciones adicionales por area, proyecto, sede o centro de costo.

create table if not exists public.usuarios_asignaciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null references public.empresas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rol_id text not null references public.roles(id) on delete restrict,
  categoria text not null default 'otro',
  nivel_jerarquico text not null default 'operativo',
  jefe_user_id uuid references auth.users(id) on delete set null,
  alcance_tipo text not null default 'tenant',
  alcance_id text,
  principal boolean not null default false,
  activo boolean not null default true,
  fecha_inicio date not null default current_date,
  fecha_fin date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint usuarios_asignaciones_no_self_jefe check (jefe_user_id is null or jefe_user_id <> user_id),
  constraint usuarios_asignaciones_alcance_tipo_check check (
    alcance_tipo in ('tenant', 'area', 'equipo', 'sede', 'proyecto', 'centro_costo', 'custom')
  ),
  constraint usuarios_asignaciones_fechas_check check (fecha_fin is null or fecha_fin >= fecha_inicio)
);

create unique index if not exists ux_usuarios_asignaciones_principal_activa
  on public.usuarios_asignaciones (empresa_id, user_id)
  where principal = true and activo = true;

create index if not exists idx_usuarios_asignaciones_user
  on public.usuarios_asignaciones (empresa_id, user_id, activo);

create index if not exists idx_usuarios_asignaciones_jefe
  on public.usuarios_asignaciones (empresa_id, jefe_user_id, activo);

create index if not exists idx_usuarios_asignaciones_categoria
  on public.usuarios_asignaciones (empresa_id, categoria, nivel_jerarquico, activo);

create index if not exists idx_usuarios_asignaciones_alcance
  on public.usuarios_asignaciones (empresa_id, alcance_tipo, alcance_id, activo);

comment on table public.usuarios_asignaciones is
  'Asignaciones funcionales multirol por usuario: rol, categoria, nivel jerarquico, jefe funcional y alcance.';

comment on column public.usuarios_asignaciones.principal is
  'Asignacion principal compatible con usuarios_empresas. Las adicionales permiten estructuras matriciales.';

comment on column public.usuarios_asignaciones.alcance_tipo is
  'Ambito donde aplica el rol: tenant, area, equipo, sede, proyecto, centro_costo o custom.';

create or replace function public.normalizar_usuario_asignacion()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_rol public.roles%rowtype;
begin
  select * into v_rol
  from public.roles
  where id = new.rol_id
  limit 1;

  if not found then
    raise exception 'Rol % no existe', new.rol_id;
  end if;

  if v_rol.empresa_id <> new.empresa_id and v_rol.es_superadmin is distinct from true then
    raise exception 'El rol % no pertenece al tenant %', new.rol_id, new.empresa_id;
  end if;

  if coalesce(new.categoria, '') = '' or new.categoria = 'otro' then
    new.categoria := coalesce(nullif(v_rol.categoria, ''), 'otro');
  end if;

  if coalesce(new.nivel_jerarquico, '') = '' or new.nivel_jerarquico = 'operativo' then
    new.nivel_jerarquico := coalesce(nullif(v_rol.nivel_jerarquico, ''), 'operativo');
  end if;

  if new.alcance_tipo = 'tenant' then
    new.alcance_id := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_usuarios_asignaciones_normalizar on public.usuarios_asignaciones;
create trigger trg_usuarios_asignaciones_normalizar
before insert or update of rol_id, categoria, nivel_jerarquico, alcance_tipo, alcance_id
on public.usuarios_asignaciones
for each row execute function public.normalizar_usuario_asignacion();

insert into public.usuarios_asignaciones (
  empresa_id, user_id, rol_id, categoria, nivel_jerarquico, jefe_user_id,
  alcance_tipo, alcance_id, principal, activo, fecha_inicio
)
select
  ue.empresa_id,
  ue.user_id,
  ue.rol_id,
  coalesce(nullif(r.categoria, ''), 'otro'),
  coalesce(nullif(r.nivel_jerarquico, ''), 'operativo'),
  ue.jefe_user_id,
  'tenant',
  null,
  true,
  ue.estado = 'activo',
  current_date
from public.usuarios_empresas ue
join public.roles r on r.id = ue.rol_id
where not exists (
  select 1
  from public.usuarios_asignaciones ua
  where ua.empresa_id = ue.empresa_id
    and ua.user_id = ue.user_id
    and ua.principal = true
    and ua.activo = true
);

create or replace function public.sync_usuario_asignacion_principal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol record;
begin
  select id, categoria, nivel_jerarquico
  into v_rol
  from public.roles
  where id = new.rol_id
  limit 1;

  if new.estado = 'activo' then
    update public.usuarios_asignaciones
    set
      rol_id = new.rol_id,
      categoria = coalesce(nullif(v_rol.categoria, ''), 'otro'),
      nivel_jerarquico = coalesce(nullif(v_rol.nivel_jerarquico, ''), 'operativo'),
      jefe_user_id = new.jefe_user_id,
      alcance_tipo = 'tenant',
      alcance_id = null,
      principal = true,
      activo = true,
      fecha_fin = null,
      updated_at = now()
    where empresa_id = new.empresa_id
      and user_id = new.user_id
      and principal = true;

    if not found then
      insert into public.usuarios_asignaciones (
        empresa_id, user_id, rol_id, categoria, nivel_jerarquico, jefe_user_id,
        alcance_tipo, principal, activo
      )
      values (
        new.empresa_id, new.user_id, new.rol_id,
        coalesce(nullif(v_rol.categoria, ''), 'otro'),
        coalesce(nullif(v_rol.nivel_jerarquico, ''), 'operativo'),
        new.jefe_user_id,
        'tenant',
        true,
        true
      );
    end if;
  else
    update public.usuarios_asignaciones
    set activo = false, fecha_fin = coalesce(fecha_fin, current_date), updated_at = now()
    where empresa_id = new.empresa_id
      and user_id = new.user_id
      and principal = true;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_usuarios_empresas_sync_asignacion_principal on public.usuarios_empresas;
create trigger trg_usuarios_empresas_sync_asignacion_principal
after insert or update of rol_id, jefe_user_id, estado
on public.usuarios_empresas
for each row execute function public.sync_usuario_asignacion_principal();

create or replace function public.usuario_alcance_jerarquico(target_empresa_id text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1
      from public.usuarios_asignaciones ua
      join public.roles r on r.id = ua.rol_id
      where ua.user_id = auth.uid()
        and ua.empresa_id = target_empresa_id
        and ua.activo = true
        and (r.es_superadmin = true or r.es_admin_empresa = true or ua.nivel_jerarquico = 'direccion')
    ) then 'tenant'
    when exists (
      select 1
      from public.usuarios_asignaciones ua
      where ua.user_id = auth.uid()
        and ua.empresa_id = target_empresa_id
        and ua.activo = true
        and ua.nivel_jerarquico in ('jefatura', 'supervisor')
    ) then 'equipo'
    else 'propio'
  end;
$$;

create or replace function public.usuario_puede_ver_usuario(target_empresa_id text, target_user_id uuid)
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
  select exists (
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
  select
    exists (
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
    or exists (
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
    );
$$;

alter table public.usuarios_asignaciones enable row level security;

drop policy if exists usuarios_asignaciones_select on public.usuarios_asignaciones;
drop policy if exists usuarios_asignaciones_insert on public.usuarios_asignaciones;
drop policy if exists usuarios_asignaciones_update on public.usuarios_asignaciones;
drop policy if exists usuarios_asignaciones_delete on public.usuarios_asignaciones;

create policy usuarios_asignaciones_select on public.usuarios_asignaciones
for select using (public.usuario_tiene_empresa(empresa_id));

create policy usuarios_asignaciones_insert on public.usuarios_asignaciones
for insert with check (public.usuario_es_admin_empresa(empresa_id));

create policy usuarios_asignaciones_update on public.usuarios_asignaciones
for update using (public.usuario_es_admin_empresa(empresa_id))
with check (public.usuario_es_admin_empresa(empresa_id));

create policy usuarios_asignaciones_delete on public.usuarios_asignaciones
for delete using (public.usuario_es_admin_empresa(empresa_id));

select pg_notify('pgrst', 'reload schema');
