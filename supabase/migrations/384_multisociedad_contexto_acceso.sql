-- TIDEO ERP - Infraestructura opcional de multisociedades.
-- No agrega sociedad_id a tablas transaccionales ni activa la funcionalidad
-- para tenants existentes.

alter table public.empresas
  add column if not exists multisociedad_habilitado boolean not null default false;

comment on column public.empresas.multisociedad_habilitado is
  'Habilita la capa opcional de sociedades dentro del tenant. Por defecto permanece desactivada.';

create table if not exists public.sociedades (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null references public.empresas(id) on delete cascade,
  codigo text not null,
  nombre text not null,
  razon_social text,
  ruc text,
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sociedades_empresa_codigo_key unique (empresa_id, codigo)
);

create index if not exists idx_sociedades_empresa_activa
  on public.sociedades (empresa_id, activa, nombre);

alter table public.sociedades enable row level security;

drop policy if exists sociedades_tenant_access on public.sociedades;
create policy sociedades_tenant_access on public.sociedades
  for all
  using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

grant select, insert, update, delete on public.sociedades to authenticated;

alter table public.usuarios_asignaciones
  add column if not exists sociedades_ids uuid[] default null;

comment on column public.usuarios_asignaciones.sociedades_ids is
  'Sociedades permitidas cuando alcance_tipo=sociedad. NULL conserva el comportamiento previo.';

-- Nombre confirmado previamente contra produccion:
-- usuarios_asignaciones_alcance_tipo_check.
alter table public.usuarios_asignaciones
  drop constraint if exists usuarios_asignaciones_alcance_tipo_check;

alter table public.usuarios_asignaciones
  add constraint usuarios_asignaciones_alcance_tipo_check check (
    alcance_tipo in (
      'tenant', 'area', 'equipo', 'sede', 'proyecto', 'centro_costo', 'custom',
      'grupo', 'sociedad'
    )
  );
