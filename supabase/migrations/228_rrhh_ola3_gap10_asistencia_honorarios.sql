-- TIDEO ERP - RRHH Ola 3 / GAP-10
-- Validacion de periodos de asistencia para personal de honorarios.
-- Permite a RRHH/Admin marcar un periodo como "revisado y apto para emision de recibo".

create table if not exists public.validaciones_honorarios_periodo (
  id                text primary key,
  empresa_id        text not null references public.empresas(id) on delete cascade,
  personal_id       text not null,
  periodo_anio      integer not null,
  periodo_mes       integer not null,
  validado_en       timestamptz not null default now(),
  validado_por      text not null,
  validado_por_id   text,
  notas             text,
  constraint validaciones_honorarios_periodo_unique
    unique (empresa_id, personal_id, periodo_anio, periodo_mes)
);

alter table public.validaciones_honorarios_periodo enable row level security;

drop policy if exists validaciones_honorarios_isolation on public.validaciones_honorarios_periodo;
create policy validaciones_honorarios_isolation on public.validaciones_honorarios_periodo
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

create index if not exists idx_validaciones_honorarios_empresa
  on public.validaciones_honorarios_periodo (empresa_id, personal_id, periodo_anio, periodo_mes);

select pg_notify('pgrst', 'reload schema');
