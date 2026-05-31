-- TIDEO ERP — Migración 156: Cierre de flujo de egresos
-- Conecta Recepciones→CxP, Gastos→estado_pago, CxP→RHE externo, Caja Chica real, Nómina→ER

-- ─── 1. CxP: campos para trazabilidad y RHE externo ─────────────────────────

alter table public.cxp
  add column if not exists gasto_id           text,
  add column if not exists recepcion_id       text references public.recepciones(id) on delete set null,
  add column if not exists origen             text not null default 'manual',
  add column if not exists tipo_comprobante   text not null default 'Factura',
  add column if not exists archivo_factura_url text,
  add column if not exists ruc_emisor         text,
  add column if not exists nombre_emisor      text,
  add column if not exists monto_bruto        numeric(14,2),
  add column if not exists retencion_ir       numeric(14,2);

-- ─── 2. compras_gastos: estado_pago + referencia_pago + cxp_id + nomina ─────

alter table public.compras_gastos
  add column if not exists estado_pago       text not null default 'pagado',
  add column if not exists referencia_pago   text,
  add column if not exists cxp_id            text references public.cxp(id) on delete set null,
  add column if not exists periodo_nomina_id text references public.periodos_nomina(id) on delete set null;

create index if not exists idx_cg_cxp_id   on public.compras_gastos(cxp_id);
create index if not exists idx_cg_nomina   on public.compras_gastos(periodo_nomina_id);
create index if not exists idx_cxp_recepcion on public.cxp(recepcion_id);

-- ─── 3. caja_chica: tabla real persistente ───────────────────────────────────

create table if not exists public.caja_chica (
  id                text primary key default ('cc_' || substr(gen_random_uuid()::text, 1, 12)),
  empresa_id        text not null references public.empresas(id),
  fecha             date not null,
  concepto          text not null,
  monto             numeric(14,2) not null check (monto > 0),
  moneda            text not null default 'PEN',
  responsable_id    text references public.usuarios(id) on delete set null,
  responsable_nombre text,
  ceco_id           text references public.centros_costo(id) on delete set null,
  categoria         text not null default 'Administrativos',
  num_comprobante   text,
  comprobante_url   text,
  estado            text not null default 'registrado',
  origen_registro   text default 'backoffice',
  gasto_id          text references public.compras_gastos(id) on delete set null,
  creado_por        text references public.usuarios(id) on delete set null,
  creado_en         timestamptz default now()
);

create index if not exists idx_caja_chica_empresa on public.caja_chica(empresa_id, fecha);

alter table public.caja_chica enable row level security;

drop policy if exists caja_chica_select on public.caja_chica;
drop policy if exists caja_chica_insert on public.caja_chica;
drop policy if exists caja_chica_update on public.caja_chica;

create policy caja_chica_select on public.caja_chica
  for select using (public.usuario_tiene_empresa(empresa_id));
create policy caja_chica_insert on public.caja_chica
  for insert with check (public.usuario_tiene_empresa(empresa_id));
create policy caja_chica_update on public.caja_chica
  for update using (public.usuario_tiene_empresa(empresa_id));

select pg_notify('pgrst', 'reload schema');
