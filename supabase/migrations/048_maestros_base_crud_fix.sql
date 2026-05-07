-- TIDEO ERP - Ajustes CRUD para Maestros Base desde UI
-- 1. Garantiza la tabla de almacenes usada por el maestro.
-- 2. Asegura politicas RLS de lectura/creacion/edicion para almacenes desde Maestros/Inventario.

create table if not exists public.almacenes (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  codigo text not null,
  nombre text not null,
  tipo text default 'Central',
  responsable text,
  direccion text,
  estado text default 'activo',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.almacenes
  add column if not exists empresa_id text references public.empresas(id),
  add column if not exists codigo text,
  add column if not exists nombre text,
  add column if not exists tipo text default 'Central',
  add column if not exists responsable text,
  add column if not exists direccion text,
  add column if not exists estado text default 'activo',
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

create index if not exists idx_almacenes_empresa_estado on public.almacenes(empresa_id, estado);

alter table public.almacenes enable row level security;

drop policy if exists mst_almacenes_select on public.almacenes;
create policy mst_almacenes_select on public.almacenes
  for select using (
    public.usuario_tiene_empresa(empresa_id)
    and (
      public.usuario_puede(empresa_id, 'maestros', 'ver')
      or public.usuario_puede(empresa_id, 'inventario', 'ver')
    )
  );

drop policy if exists mst_almacenes_insert on public.almacenes;
create policy mst_almacenes_insert on public.almacenes
  for insert with check (
    public.usuario_tiene_empresa(empresa_id)
    and (
      public.usuario_puede(empresa_id, 'maestros', 'crear')
      or public.usuario_puede(empresa_id, 'inventario', 'crear')
    )
  );

drop policy if exists mst_almacenes_update on public.almacenes;
create policy mst_almacenes_update on public.almacenes
  for update using (
    public.usuario_tiene_empresa(empresa_id)
    and (
      public.usuario_puede(empresa_id, 'maestros', 'editar')
      or public.usuario_puede(empresa_id, 'inventario', 'editar')
    )
  )
  with check (
    public.usuario_tiene_empresa(empresa_id)
    and (
      public.usuario_puede(empresa_id, 'maestros', 'editar')
      or public.usuario_puede(empresa_id, 'inventario', 'editar')
    )
  );

select pg_notify('pgrst', 'reload schema');
