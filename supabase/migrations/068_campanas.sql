-- TIDEO ERP - Módulo de Campañas de Marketing
-- Tabla campanas + campana_id en leads y oportunidades

create table if not exists public.campanas (
  id text primary key,
  empresa_id text not null references public.empresas(id) on delete cascade,
  nombre text not null,
  tipo text not null default 'ads',
  canal text not null default 'Otro',
  fecha_inicio date,
  fecha_fin date,
  presupuesto numeric(14,2) default 0,
  moneda text default 'PEN',
  estado text default 'borrador',
  descripcion text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- campana_id en leads (nullable — leads sin campaña son orgánicos/referidos)
alter table public.leads add column if not exists campana_id text references public.campanas(id) on delete set null;

-- campana_id viaja al convertir lead a oportunidad
alter table public.oportunidades add column if not exists campana_id text references public.campanas(id) on delete set null;

-- RLS
alter table public.campanas enable row level security;

create policy campanas_select on public.campanas
  for select using (public.usuario_tiene_empresa(empresa_id));

create policy campanas_insert on public.campanas
  for insert with check (public.usuario_tiene_empresa(empresa_id));

create policy campanas_update on public.campanas
  for update using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

create policy campanas_delete on public.campanas
  for delete using (public.usuario_es_admin_empresa(empresa_id));
