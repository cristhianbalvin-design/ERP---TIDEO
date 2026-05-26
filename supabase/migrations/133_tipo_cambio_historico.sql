-- TIDEO ERP — Tipo de cambio histórico (migración 133)
-- 1. Tabla tipo_cambio_historico: caché diario de tasas de cambio
-- 2. Nuevas columnas en comisiones: tc_pen_usd, retencion_ir

-- ─── Tabla tipo_cambio_historico ────────────────────────────────────────────

create table if not exists public.tipo_cambio_historico (
  id          uuid default gen_random_uuid() primary key,
  fecha       date not null,
  moneda_base text not null default 'PEN',
  usd         numeric(10,6),
  eur         numeric(10,6),
  fuente      text default 'open.er-api.com',
  creado_en   timestamptz default now(),
  unique (fecha, moneda_base)
);

alter table public.tipo_cambio_historico enable row level security;

drop policy if exists tc_select on public.tipo_cambio_historico;
create policy tc_select on public.tipo_cambio_historico
  for select using (auth.role() = 'authenticated');

-- INSERT/UPDATE solo vía service_role (llamada desde el frontend con anon key pasa
-- por la policy de SELECT y el upsert se rechaza si no es service_role).
-- Para permitir upsert desde el cliente usamos security definer function o
-- simplemente permitimos insert a usuarios autenticados (TC es dato público).
drop policy if exists tc_insert on public.tipo_cambio_historico;
create policy tc_insert on public.tipo_cambio_historico
  for insert with check (auth.role() = 'authenticated');

drop policy if exists tc_update on public.tipo_cambio_historico;
create policy tc_update on public.tipo_cambio_historico
  for update using (auth.role() = 'authenticated');

-- ─── Columnas en comisiones ──────────────────────────────────────────────────

alter table public.comisiones
  add column if not exists tc_pen_usd   numeric(10,4),
  add column if not exists retencion_ir boolean default false;

select pg_notify('pgrst', 'reload schema');
