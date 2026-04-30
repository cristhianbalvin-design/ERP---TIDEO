-- TIDEO ERP - Migración de Maestros Base

-- 1. Tablas
create table if not exists public.cargos_empresa (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  codigo text not null,
  nombre text not null,
  tipo text default 'Administrativo',
  detalle text,
  estado text default 'activo',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.especialidades_tecnicas (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  codigo text not null,
  nombre text not null,
  area text default 'General',
  requiere_cert boolean default false,
  estado text default 'activo',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.tipos_servicio_interno (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  codigo text not null,
  nombre text not null,
  clasificacion text default 'General',
  facturable boolean default false,
  estado text default 'activo',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.sedes (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  codigo text not null,
  nombre text not null,
  direccion text,
  gps text,
  estado text default 'activo',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_cargos_empresa_emp on public.cargos_empresa(empresa_id, estado);
create index if not exists idx_especialidades_emp on public.especialidades_tecnicas(empresa_id, estado);
create index if not exists idx_tipos_servicio_emp on public.tipos_servicio_interno(empresa_id, estado);
create index if not exists idx_sedes_emp on public.sedes(empresa_id, estado);

-- 2. Políticas RLS
alter table public.cargos_empresa enable row level security;
drop policy if exists tenant_cargos_empresa_isolation on public.cargos_empresa;
create policy tenant_cargos_empresa_isolation on public.cargos_empresa for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));

alter table public.especialidades_tecnicas enable row level security;
drop policy if exists tenant_especialidades_tecnicas_isolation on public.especialidades_tecnicas;
create policy tenant_especialidades_tecnicas_isolation on public.especialidades_tecnicas for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));

alter table public.tipos_servicio_interno enable row level security;
drop policy if exists tenant_tipos_servicio_interno_isolation on public.tipos_servicio_interno;
create policy tenant_tipos_servicio_interno_isolation on public.tipos_servicio_interno for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));

alter table public.sedes enable row level security;
drop policy if exists tenant_sedes_isolation on public.sedes;
create policy tenant_sedes_isolation on public.sedes for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
