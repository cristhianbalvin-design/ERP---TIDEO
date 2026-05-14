-- TIDEO ERP - Jerarquia transversal de roles y usuarios.
-- Aplica a todas las areas: comercial, operaciones, finanzas, RRHH, compras, logistica, CS, etc.

alter table public.roles
  add column if not exists nivel_jerarquico text not null default 'operativo';

alter table public.usuarios_empresas
  add column if not exists jefe_user_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'usuarios_empresas_jefe_user_id_fkey'
  ) then
    alter table public.usuarios_empresas
      add constraint usuarios_empresas_jefe_user_id_fkey
      foreign key (jefe_user_id) references auth.users(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'usuarios_empresas_no_self_jefe'
  ) then
    alter table public.usuarios_empresas
      add constraint usuarios_empresas_no_self_jefe
      check (jefe_user_id is null or jefe_user_id <> user_id);
  end if;
end $$;

create index if not exists idx_usuarios_empresas_jefe
  on public.usuarios_empresas (empresa_id, jefe_user_id);

update public.roles
set nivel_jerarquico = case
  when es_superadmin = true then 'direccion'
  when es_admin_empresa = true then 'direccion'
  when lower(coalesce(nombre, '') || ' ' || coalesce(id, '')) similar to '%(gerente|direccion|director)%' then 'direccion'
  when lower(coalesce(nombre, '') || ' ' || coalesce(id, '')) similar to '%(jefe|head|lead)%' then 'jefatura'
  when lower(coalesce(nombre, '') || ' ' || coalesce(id, '')) similar to '%(supervisor|coordinador)%' then 'supervisor'
  when lower(coalesce(nombre, '') || ' ' || coalesce(id, '')) similar to '%(asesor|vendedor|ejecutivo|analista)%' then 'asesor'
  else coalesce(nullif(nivel_jerarquico, ''), 'operativo')
end;

create or replace function public.normalizar_nivel_jerarquico_rol()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  role_text text := lower(coalesce(new.nombre, '') || ' ' || coalesce(new.id, ''));
begin
  if coalesce(new.nivel_jerarquico, '') = ''
    or (new.nivel_jerarquico = 'operativo' and (new.es_superadmin = true or new.es_admin_empresa = true))
  then
    new.nivel_jerarquico := case
      when new.es_superadmin = true or new.es_admin_empresa = true then 'direccion'
      when role_text similar to '%(gerente|direccion|director)%' then 'direccion'
      when role_text similar to '%(jefe|head|lead)%' then 'jefatura'
      when role_text similar to '%(supervisor|coordinador)%' then 'supervisor'
      when role_text similar to '%(asesor|vendedor|ejecutivo|analista)%' then 'asesor'
      else 'operativo'
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_roles_normalizar_nivel_jerarquico on public.roles;
create trigger trg_roles_normalizar_nivel_jerarquico
before insert or update of nombre, es_superadmin, es_admin_empresa, nivel_jerarquico on public.roles
for each row execute function public.normalizar_nivel_jerarquico_rol();

comment on column public.roles.nivel_jerarquico is
  'Nivel transversal para alcance de datos: direccion, jefatura, supervisor, asesor, operativo, soporte.';

comment on column public.usuarios_empresas.jefe_user_id is
  'Jefe directo del usuario dentro del tenant. Permite alcance de equipo por jerarquia, no solo por area.';

create or replace function public.usuario_alcance_jerarquico(target_empresa_id text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case
      when r.es_superadmin = true or r.es_admin_empresa = true then 'tenant'
      when r.nivel_jerarquico in ('direccion') then 'tenant'
      when r.nivel_jerarquico in ('jefatura', 'supervisor') then 'equipo'
      else 'propio'
    end
    from public.usuarios_empresas ue
    join public.roles r on r.id = ue.rol_id
    where ue.user_id = auth.uid()
      and ue.empresa_id = target_empresa_id
      and ue.estado = 'activo'
      and r.activo = true
    limit 1
  ), 'propio');
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
    select ue.user_id
    from public.usuarios_empresas ue
    join equipo e on ue.jefe_user_id = e.user_id
    where ue.empresa_id = target_empresa_id
      and ue.estado = 'activo'
  )
  select exists (
    select 1
    from public.usuarios_empresas caller
    join public.roles r on r.id = caller.rol_id
    where caller.user_id = auth.uid()
      and caller.empresa_id = target_empresa_id
      and caller.estado = 'activo'
      and r.activo = true
      and (
        r.es_superadmin = true
        or r.es_admin_empresa = true
        or r.nivel_jerarquico = 'direccion'
        or target_user_id = auth.uid()
        or (
          r.nivel_jerarquico in ('jefatura', 'supervisor')
          and target_user_id in (select user_id from equipo)
        )
      )
  );
$$;

select pg_notify('pgrst', 'reload schema');
