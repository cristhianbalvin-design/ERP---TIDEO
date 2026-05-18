-- TIDEO ERP - Centros de Costo y Beneficio

create table if not exists public.centros_beneficio (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  codigo text not null,
  nombre text not null,
  tipo text not null check (tipo in ('linea_servicio', 'cliente', 'proyecto', 'producto', 'temporal')),
  responsable_id text,
  responsable_nombre text,
  cuenta_id text,
  meta_ingresos numeric(14,2) default 0,
  fecha_inicio date,
  fecha_fin date,
  descripcion text,
  estado text not null default 'activo' check (estado in ('activo', 'inactivo')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(empresa_id, codigo)
);

create table if not exists public.centros_costo (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  codigo text not null,
  nombre text not null,
  tipo text not null check (tipo in ('area_funcional', 'proyecto', 'sede', 'temporal')),
  responsable_id text,
  responsable_nombre text,
  cebe_id text references public.centros_beneficio(id),
  presupuesto_mensual numeric(14,2) default 0,
  fecha_inicio date,
  fecha_fin date,
  descripcion text,
  estado text not null default 'activo' check (estado in ('activo', 'inactivo')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(empresa_id, codigo)
);

create index if not exists idx_centros_beneficio_empresa_estado on public.centros_beneficio(empresa_id, estado);
create index if not exists idx_centros_beneficio_tipo on public.centros_beneficio(empresa_id, tipo);
create index if not exists idx_centros_costo_empresa_estado on public.centros_costo(empresa_id, estado);
create index if not exists idx_centros_costo_cebe on public.centros_costo(empresa_id, cebe_id);
create index if not exists idx_centros_costo_tipo on public.centros_costo(empresa_id, tipo);

alter table public.centros_beneficio drop constraint if exists centros_beneficio_tipo_check;
alter table public.centros_beneficio
  add constraint centros_beneficio_tipo_check
  check (tipo in ('linea_servicio', 'cliente', 'proyecto', 'producto', 'temporal'));

alter table public.centros_costo drop constraint if exists centros_costo_tipo_check;
alter table public.centros_costo
  add constraint centros_costo_tipo_check
  check (tipo in ('area_funcional', 'proyecto', 'sede', 'temporal'));

alter table public.centros_beneficio enable row level security;
alter table public.centros_costo enable row level security;

drop policy if exists tenant_centros_beneficio_isolation on public.centros_beneficio;
create policy tenant_centros_beneficio_isolation
on public.centros_beneficio
for all
using (public.usuario_tiene_empresa(empresa_id))
with check (public.usuario_tiene_empresa(empresa_id));

drop policy if exists tenant_centros_costo_isolation on public.centros_costo;
create policy tenant_centros_costo_isolation
on public.centros_costo
for all
using (public.usuario_tiene_empresa(empresa_id))
with check (public.usuario_tiene_empresa(empresa_id));
