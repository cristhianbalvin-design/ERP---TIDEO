-- TIDEO ERP — Migración 160: Préstamos al Personal — schema completo + historial de pagos
-- Agrega columnas faltantes a prestamos_personal y crea tabla prestamo_pagos para trazabilidad.

-- ─── 1. Columnas faltantes en prestamos_personal ─────────────────
alter table public.prestamos_personal
  add column if not exists trabajador_id       text,
  add column if not exists trabajador_tipo     text not null default 'operativo',
  add column if not exists empleado            text,
  add column if not exists monto               numeric(12,2),
  add column if not exists cuotas              integer not null default 1,
  add column if not exists cuota_mensual       numeric(12,2),
  add column if not exists cuotas_pagadas      integer not null default 0,
  add column if not exists saldo               numeric(12,2),
  add column if not exists descontar_nomina    boolean not null default false,
  add column if not exists estado              text not null default 'vigente',
  add column if not exists fecha_otorgamiento  date default current_date,
  add column if not exists notas               text,
  add column if not exists updated_at          timestamptz default now();

-- ─── 2. Tabla de historial de pagos ──────────────────────────────
create table if not exists public.prestamo_pagos (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   text not null references public.empresas(id),
  prestamo_id  text not null references public.prestamos_personal(id) on delete cascade,
  fecha        date not null default current_date,
  monto        numeric(12,2) not null,
  concepto     text not null default 'manual',  -- 'manual' | 'nomina'
  periodo_id   text,                             -- FK blanda a periodos_nomina
  created_by   text,
  created_at   timestamptz default now()
);

-- ─── 3. RLS en prestamo_pagos ─────────────────────────────────────
alter table public.prestamo_pagos enable row level security;
drop policy if exists tenant_prestamo_pagos on public.prestamo_pagos;
create policy tenant_prestamo_pagos on public.prestamo_pagos
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

select pg_notify('pgrst', 'reload schema');
