-- TIDEO ERP - Multisociedad, bloque 4B: ER consolidado e intercompania.
-- Tipos auditados en produccion: empresa/documentos text; sociedades uuid.

create table if not exists public.operaciones_intercompania (
  id uuid default gen_random_uuid() primary key,
  empresa_id text not null references public.empresas(id) on delete cascade,
  sociedad_origen uuid not null references public.sociedades(id),
  sociedad_destino uuid not null references public.sociedades(id),
  factura_id text references public.facturas(id),
  cxp_id text references public.cxp(id),
  guia_remision_id text references public.guias_remision(id),
  tipo_operacion text not null default 'facturacion'
    check (tipo_operacion in ('facturacion','transferencia_stock','reparto_costo_personal')),
  monto numeric(14,2),
  moneda text,
  periodo text,
  concepto text,
  creado_en timestamptz default now(),
  constraint operaciones_intercompania_empresa_sociedad_origen_fkey
    foreign key (empresa_id, sociedad_origen)
    references public.sociedades(empresa_id, id),
  constraint operaciones_intercompania_empresa_sociedad_destino_fkey
    foreign key (empresa_id, sociedad_destino)
    references public.sociedades(empresa_id, id)
);

create index if not exists idx_operaciones_intercompania_empresa_periodo
  on public.operaciones_intercompania(empresa_id, periodo);
create index if not exists idx_operaciones_intercompania_sociedades
  on public.operaciones_intercompania(empresa_id, sociedad_origen, sociedad_destino);

alter table public.operaciones_intercompania enable row level security;
drop policy if exists operaciones_intercompania_tenant_access on public.operaciones_intercompania;
create policy operaciones_intercompania_tenant_access
on public.operaciones_intercompania
for all
using (public.usuario_tiene_empresa(empresa_id))
with check (public.usuario_tiene_empresa(empresa_id));

grant select, insert, update, delete on public.operaciones_intercompania to authenticated;

create table if not exists public.tipos_cambio_grupo (
  id uuid default gen_random_uuid() primary key,
  empresa_id text not null references public.empresas(id) on delete cascade,
  sociedad_id uuid not null references public.sociedades(id),
  periodo text not null,
  moneda_origen text not null,
  moneda_grupo text not null,
  tasa numeric(10,6) not null,
  creado_en timestamptz default now(),
  constraint tipos_cambio_grupo_sociedad_periodo_moneda_key
    unique(sociedad_id, periodo, moneda_origen),
  constraint tipos_cambio_grupo_empresa_sociedad_fkey
    foreign key (empresa_id, sociedad_id)
    references public.sociedades(empresa_id, id)
);

create index if not exists idx_tipos_cambio_grupo_empresa_periodo
  on public.tipos_cambio_grupo(empresa_id, periodo);

alter table public.tipos_cambio_grupo enable row level security;
drop policy if exists tipos_cambio_grupo_tenant_access on public.tipos_cambio_grupo;
create policy tipos_cambio_grupo_tenant_access
on public.tipos_cambio_grupo
for all
using (public.usuario_tiene_empresa(empresa_id))
with check (public.usuario_tiene_empresa(empresa_id));

grant select, insert, update, delete on public.tipos_cambio_grupo to authenticated;

select pg_notify('pgrst', 'reload schema');
