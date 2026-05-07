-- TIDEO ERP - Maestro de areas de la empresa
-- Catalogo usado por RRHH Administrativo y asignacion de usuarios.

create table if not exists public.areas_empresa (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  codigo text not null,
  nombre text not null,
  tipo text default 'Ambos',
  responsable text,
  detalle text,
  estado text default 'activo',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (empresa_id, codigo),
  unique (empresa_id, nombre)
);

alter table public.areas_empresa
  add column if not exists tipo text default 'Ambos';

create index if not exists idx_areas_empresa_estado on public.areas_empresa(empresa_id, estado, nombre);

alter table public.areas_empresa enable row level security;

drop policy if exists mst_areas_select on public.areas_empresa;
create policy mst_areas_select on public.areas_empresa
  for select using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'maestros', 'ver')
  );

drop policy if exists mst_areas_insert on public.areas_empresa;
create policy mst_areas_insert on public.areas_empresa
  for insert with check (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'maestros', 'crear')
  );

drop policy if exists mst_areas_update on public.areas_empresa;
create policy mst_areas_update on public.areas_empresa
  for update using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'maestros', 'editar')
  )
  with check (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'maestros', 'editar')
  );

drop policy if exists mst_areas_delete on public.areas_empresa;
create policy mst_areas_delete on public.areas_empresa
  for delete using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'maestros', 'editar')
  );

select pg_notify('pgrst', 'reload schema');

-- Si PostgREST mantiene cache anterior, este notify fuerza la recarga del schema.
notify pgrst, 'reload schema';
