-- Módulo Presupuesto vs Real — tablas base + RLS

-- ─── presupuestos ─────────────────────────────────────────────────────────────
create table if not exists public.presupuestos (
  id              text primary key default 'pre_' || replace(gen_random_uuid()::text, '-', ''),
  empresa_id      text not null references public.empresas(id) on delete cascade,
  nombre          text not null,
  periodo         text not null,          -- 'YYYY-MM' o 'YYYY'
  centro_costo_id text references public.centros_costo(id) on delete set null,
  cebe_id         text references public.centros_beneficio(id) on delete set null,
  estado          text not null default 'borrador'
                    check (estado in ('borrador','en_aprobacion','aprobado','rechazado','cerrado')),
  creado_por      text,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

-- ─── presupuesto_partidas ─────────────────────────────────────────────────────
create table if not exists public.presupuesto_partidas (
  id                   text primary key default 'ppa_' || replace(gen_random_uuid()::text, '-', ''),
  empresa_id           text not null references public.empresas(id) on delete cascade,
  presupuesto_id       text not null references public.presupuestos(id) on delete cascade,
  categoria            text not null,
  descripcion          text,
  monto_presupuestado  numeric not null default 0,
  moneda               text not null default 'PEN',
  orden                int  not null default 0
);

-- ─── presupuesto_aprobaciones ─────────────────────────────────────────────────
create table if not exists public.presupuesto_aprobaciones (
  id                text primary key default 'pap_' || replace(gen_random_uuid()::text, '-', ''),
  empresa_id        text not null references public.empresas(id) on delete cascade,
  presupuesto_id    text not null references public.presupuestos(id) on delete cascade,
  orden             int  not null,             -- 1 al 4, secuencial
  aprobador_id      text not null,
  nombre_aprobador  text not null,
  estado            text not null default 'pendiente'
                      check (estado in ('pendiente','aprobado','rechazado')),
  fecha_accion      timestamptz,
  comentario        text
);

-- ─── Índices ──────────────────────────────────────────────────────────────────
create index if not exists idx_presupuestos_empresa_periodo
  on public.presupuestos(empresa_id, periodo);

create index if not exists idx_presupuesto_partidas_presupuesto
  on public.presupuesto_partidas(presupuesto_id);

create index if not exists idx_presupuesto_aprobaciones_presupuesto
  on public.presupuesto_aprobaciones(presupuesto_id, orden);

create index if not exists idx_presupuesto_aprobaciones_aprobador
  on public.presupuesto_aprobaciones(aprobador_id, estado);

-- ─── Trigger actualizado_en ───────────────────────────────────────────────────
create or replace function public.set_presupuesto_actualizado_en()
returns trigger language plpgsql as $$
begin
  new.actualizado_en = now();
  return new;
end;
$$;

drop trigger if exists trg_presupuesto_actualizado_en on public.presupuestos;
create trigger trg_presupuesto_actualizado_en
  before update on public.presupuestos
  for each row execute function public.set_presupuesto_actualizado_en();

-- ─── RLS ──────────────────────────────────────────────────────────────────────
alter table public.presupuestos            enable row level security;
alter table public.presupuesto_partidas    enable row level security;
alter table public.presupuesto_aprobaciones enable row level security;

-- presupuestos
create policy "presupuestos_select" on public.presupuestos
  for select using (usuario_tiene_empresa(empresa_id));
create policy "presupuestos_insert" on public.presupuestos
  for insert with check (usuario_tiene_empresa(empresa_id));
create policy "presupuestos_update" on public.presupuestos
  for update using (usuario_tiene_empresa(empresa_id));

-- partidas
create policy "ppartidas_select" on public.presupuesto_partidas
  for select using (usuario_tiene_empresa(empresa_id));
create policy "ppartidas_insert" on public.presupuesto_partidas
  for insert with check (usuario_tiene_empresa(empresa_id));
create policy "ppartidas_update" on public.presupuesto_partidas
  for update using (usuario_tiene_empresa(empresa_id));
create policy "ppartidas_delete" on public.presupuesto_partidas
  for delete using (usuario_tiene_empresa(empresa_id));

-- aprobaciones: ver todas de la empresa; update solo el propio aprobador
create policy "paprobaciones_select" on public.presupuesto_aprobaciones
  for select using (usuario_tiene_empresa(empresa_id));
create policy "paprobaciones_insert" on public.presupuesto_aprobaciones
  for insert with check (usuario_tiene_empresa(empresa_id));
create policy "paprobaciones_update" on public.presupuesto_aprobaciones
  for update using (
    aprobador_id = auth.uid()::text
    or usuario_tiene_empresa(empresa_id)
  );

select pg_notify('pgrst', 'reload schema');
