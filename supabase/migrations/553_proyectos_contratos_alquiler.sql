-- 553 · Proyectos que agrupan contratos de alquiler.
-- El proyecto es una entidad comercial/operativa nueva. No promueve campos
-- existentes de contratos_alquiler y no tiene relación matemática con activos.

begin;
create table public.proyectos (
  id text primary key,
  empresa_id text not null references public.empresas(id) on delete restrict,
  cuenta_id text not null references public.cuentas(id) on delete restrict,
  codigo text not null,
  nombre text not null,
  horas_disponibles_mes_pactadas numeric(14,2)
    check (
      horas_disponibles_mes_pactadas is null
      or horas_disponibles_mes_pactadas >= 0
    ),
  estado text not null default 'activo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proyectos_empresa_codigo_key unique (empresa_id, codigo)
);
-- El vínculo es opcional: los contratos actuales y los nuevos pueden existir
-- sin proyecto. Al eliminar un proyecto, el contrato conserva su integridad y
-- queda simplemente sin asignación.
alter table public.contratos_alquiler
  add column proyecto_id text references public.proyectos(id) on delete set null;
create or replace function public.validar_proyecto_contrato_alquiler()
returns trigger
language plpgsql
as $$
begin
  if new.proyecto_id is not null and not exists (
    select 1
    from public.proyectos p
    where p.id = new.proyecto_id
      and p.empresa_id = new.empresa_id
      and p.cuenta_id = new.cuenta_id
  ) then
    raise exception
      'El proyecto del contrato debe pertenecer a la misma empresa y cuenta.';
  end if;

  return new;
end;
$$;
create trigger trg_contratos_alquiler_validar_proyecto
before insert or update on public.contratos_alquiler
for each row execute function public.validar_proyecto_contrato_alquiler();
create index proyectos_empresa_cuenta_idx
  on public.proyectos (empresa_id, cuenta_id);
create index contratos_alquiler_proyecto_idx
  on public.contratos_alquiler (empresa_id, proyecto_id);
create or replace function public.trg_proyectos_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger trg_proyectos_updated_at
before update on public.proyectos
for each row execute function public.trg_proyectos_updated_at();
alter table public.proyectos enable row level security;
create policy proyectos_select
on public.proyectos
for select
using (public.usuario_tiene_empresa(empresa_id));
create policy proyectos_insert
on public.proyectos
for insert
with check (public.usuario_tiene_empresa(empresa_id));
create policy proyectos_update
on public.proyectos
for update
using (public.usuario_tiene_empresa(empresa_id))
with check (public.usuario_tiene_empresa(empresa_id));
create policy proyectos_delete
on public.proyectos
for delete
using (public.usuario_es_admin_empresa(empresa_id));
grant select, insert, update, delete
on public.proyectos
to authenticated;
commit;
