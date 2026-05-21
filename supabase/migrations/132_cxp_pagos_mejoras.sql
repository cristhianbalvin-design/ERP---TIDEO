-- TIDEO ERP — Mejoras módulo CxP (migración 132)
-- 1. Nuevos campos en tabla cxp: soporte honorarios + concepto
-- 2. Nueva tabla cxp_pagos: historial detallado de pagos parciales

-- ─── Extender cxp ───────────────────────────────────────────────────────────

alter table public.cxp
  add column if not exists personal_id          text,
  add column if not exists tipo_beneficiario    text default 'proveedor',
  add column if not exists concepto             text,
  add column if not exists recibo_honorarios_id text;

-- Backfill registros históricos antes de poner NOT NULL
update public.cxp
  set tipo_beneficiario = 'proveedor'
  where tipo_beneficiario is null;

alter table public.cxp alter column tipo_beneficiario set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cxp_tipo_beneficiario_check'
  ) then
    alter table public.cxp
      add constraint cxp_tipo_beneficiario_check
      check (tipo_beneficiario in ('proveedor','personal'));
  end if;
end;
$$;

-- ─── Tabla cxp_pagos ────────────────────────────────────────────────────────

create table if not exists public.cxp_pagos (
  id              text primary key,
  empresa_id      text not null references public.empresas(id),
  cxp_id          text not null references public.cxp(id) on delete cascade,
  fecha_pago      date not null,
  monto           numeric(14,2) not null,
  cuenta_bancaria text,
  referencia      text,
  registrado_por  text,
  creado_en       timestamptz default now()
);

create index if not exists idx_cxp_pagos_cxp    on public.cxp_pagos(cxp_id);
create index if not exists idx_cxp_pagos_empresa on public.cxp_pagos(empresa_id);

-- ─── RLS cxp_pagos ──────────────────────────────────────────────────────────

alter table public.cxp_pagos enable row level security;

drop policy if exists cxp_pagos_select on public.cxp_pagos;
drop policy if exists cxp_pagos_insert on public.cxp_pagos;
drop policy if exists cxp_pagos_delete on public.cxp_pagos;

create policy cxp_pagos_select on public.cxp_pagos
  for select using (public.usuario_tiene_empresa(empresa_id));

create policy cxp_pagos_insert on public.cxp_pagos
  for insert with check (public.usuario_tiene_empresa(empresa_id));

create policy cxp_pagos_delete on public.cxp_pagos
  for delete using (public.usuario_es_admin_empresa(empresa_id));

select pg_notify('pgrst', 'reload schema');
