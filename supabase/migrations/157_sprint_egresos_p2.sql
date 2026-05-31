-- TIDEO ERP — Migración 157: Cierre de flujo de egresos Parte 2
-- Anticipos OC, activos fijos en compras_gastos, motivo/vínculos en CxP

-- ─── 1. oc_anticipos: anticipos a proveedores vinculados a una OC ─────────────
create table if not exists public.oc_anticipos (
  id              text primary key default ('ocanp_' || substr(gen_random_uuid()::text, 1, 12)),
  empresa_id      text not null references public.empresas(id),
  orden_compra_id text not null,
  fecha           date not null,
  monto           numeric(14,2) not null check (monto > 0),
  moneda          text not null default 'PEN',
  referencia      text,
  notas           text,
  movimiento_id   text,
  creado_por      text references public.usuarios(id) on delete set null,
  creado_en       timestamptz default now()
);

create index if not exists idx_oc_anticipos_oc
  on public.oc_anticipos(empresa_id, orden_compra_id);

alter table public.oc_anticipos enable row level security;

drop policy if exists oc_anticipos_sel on public.oc_anticipos;
drop policy if exists oc_anticipos_ins on public.oc_anticipos;

create policy oc_anticipos_sel on public.oc_anticipos
  for select using (public.usuario_tiene_empresa(empresa_id));

create policy oc_anticipos_ins on public.oc_anticipos
  for insert with check (public.usuario_tiene_empresa(empresa_id));

-- ─── 2. compras_gastos: campos para activos fijos ────────────────────────────
alter table public.compras_gastos
  add column if not exists es_activo_fijo   boolean not null default false,
  add column if not exists activo_tipo      text,
  add column if not exists vida_util_anos   integer;

create index if not exists idx_cg_activo_fijo
  on public.compras_gastos(empresa_id, es_activo_fijo)
  where es_activo_fijo = true;

-- ─── 3. cxp: vínculos para viáticos, devoluciones NC y nómina ────────────────
alter table public.cxp
  add column if not exists motivo_cxp   text,
  add column if not exists personal_id  text,
  add column if not exists ot_vinc_id   text,
  add column if not exists nc_id        text;

-- ─── 4. Índices de búsqueda rápida en cxp ────────────────────────────────────
create index if not exists idx_cxp_personal
  on public.cxp(empresa_id, personal_id)
  where personal_id is not null;

create index if not exists idx_cxp_nc
  on public.cxp(empresa_id, nc_id)
  where nc_id is not null;

select pg_notify('pgrst', 'reload schema');
