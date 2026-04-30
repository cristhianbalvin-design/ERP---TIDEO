-- TIDEO ERP - Maestros Base

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
