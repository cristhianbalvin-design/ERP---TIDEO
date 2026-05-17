-- Historial append-only de cambios de etapa en oportunidades.

create table public.opp_historial_etapas (
  id          text        primary key,
  empresa_id  text        not null references public.empresas(id) on delete cascade,
  opp_id      text        not null references public.oportunidades(id) on delete cascade,
  cuenta_id   text        references public.cuentas(id) on delete set null,
  etapa_desde text        not null,
  etapa_hasta text        not null,
  usuario     text,
  creado_en   timestamptz not null default now()
);

create index on public.opp_historial_etapas (opp_id, creado_en desc);
create index on public.opp_historial_etapas (empresa_id, creado_en desc);

alter table public.opp_historial_etapas enable row level security;

create policy ohe_select on public.opp_historial_etapas
  for select using (public.usuario_tiene_empresa(empresa_id));

create policy ohe_insert on public.opp_historial_etapas
  for insert with check (public.usuario_tiene_empresa(empresa_id));

create policy ohe_no_update on public.opp_historial_etapas
  for update using (false);

create policy ohe_no_delete on public.opp_historial_etapas
  for delete using (false);
