-- TIDEO ERP - RRHH Ola 3 / GAP-16
-- Roster minero: snapshots de balance de dias por trabajador y periodo.
-- Persiste el calculo de dias ganados/gozados y balance acumulado.
-- El snapshot se congela cuando la nomina del periodo se cierra.

create table if not exists public.roster_minero_snapshots (
  id                      text primary key,
  empresa_id              text not null references public.empresas(id) on delete cascade,
  personal_id             text not null,
  personal_nombre         text not null,
  personal_tipo           text not null check (personal_tipo in ('operativo', 'administrativo')),
  periodo_anio            integer not null,
  periodo_mes             integer not null,
  regimen_jornada         text not null,
  dias_ciclo_trabajo      integer not null,
  dias_ciclo_descanso     integer not null,

  -- Columnas de calculo del balance
  dias_en_mina            integer not null default 0,
  dias_induccion          integer not null default 0,
  dias_efectivos_descanso integer not null default 0,
  dias_descanso_ganados   numeric(8,2) not null default 0,
  dias_descanso_gozados   integer not null default 0,
  balance_periodo         numeric(8,2) not null default 0,
  balance_acumulado       numeric(8,2) not null default 0,

  -- Trazabilidad
  calculado_en            timestamptz not null default now(),
  calculado_por           text,
  periodo_cerrado         boolean not null default false,
  nomina_periodo_id       text,

  constraint roster_minero_snapshots_unique
    unique (empresa_id, personal_id, periodo_anio, periodo_mes)
);

alter table public.roster_minero_snapshots enable row level security;

drop policy if exists roster_minero_snapshots_isolation on public.roster_minero_snapshots;
create policy roster_minero_snapshots_isolation on public.roster_minero_snapshots
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

create index if not exists idx_roster_minero_empresa_periodo
  on public.roster_minero_snapshots (empresa_id, periodo_anio desc, periodo_mes desc);

create index if not exists idx_roster_minero_personal
  on public.roster_minero_snapshots (empresa_id, personal_id, periodo_anio desc, periodo_mes desc);

select pg_notify('pgrst', 'reload schema');
