-- TIDEO ERP - Catálogo de Servicios

create table if not exists public.servicios (
  id text primary key, -- Use text for codes like SRV-001 or generated UUIDs
  empresa_id text not null references public.empresas(id),
  codigo text not null,
  familia text not null default 'General',
  descripcion text not null,
  unidad text default 'Servicio',
  moneda text default 'PEN',
  costo numeric default 0,
  precio numeric default 0,
  margen numeric default 0,
  estado text default 'activo',
  facturable boolean default true,
  precio_incluido boolean default false,
  detalle text,
  entregables jsonb default '[]'::jsonb,
  notas_internas text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(empresa_id, codigo)
);

-- Índices de búsqueda y filtro
create index if not exists idx_servicios_empresa on public.servicios(empresa_id, estado);
create index if not exists idx_servicios_familia on public.servicios(empresa_id, familia);

-- Políticas RLS
alter table public.servicios enable row level security;
drop policy if exists tenant_servicios_isolation on public.servicios;

create policy tenant_servicios_isolation 
on public.servicios 
for all 
using (public.usuario_tiene_empresa(empresa_id)) 
with check (public.usuario_tiene_empresa(empresa_id));
