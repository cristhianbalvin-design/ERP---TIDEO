-- 437 · Fase A: calendario de feriados y política de pago por empresa.
--
-- Alcance deliberadamente limitado a datos y esquema. La UI, esFeriado() y
-- el motor de nómina se implementarán en fases posteriores.

-- ── 1. Calendario y políticas por tenant ────────────────────────────────────

create table if not exists public.feriados (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null references public.empresas(id) on delete cascade,
  fecha date not null,
  nombre text not null check (length(btrim(nombre)) > 0),
  origen text not null default 'manual' check (origen in ('automatico', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feriados_empresa_fecha_uk unique (empresa_id, fecha),
  -- Permite la FK compuesta de overrides y evita cruzar feriados de tenants.
  constraint feriados_id_empresa_uk unique (id, empresa_id)
);

create table if not exists public.feriados_politica_regimen_default (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null references public.empresas(id) on delete cascade,
  regimen_jornada text not null,
  politica_pago text not null check (politica_pago in ('sin_pago_adicional', 'doble', 'triple')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feriados_politica_regimen_default_empresa_regimen_uk unique (empresa_id, regimen_jornada)
);

create table if not exists public.feriados_politica_override (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null references public.empresas(id) on delete cascade,
  feriado_id uuid not null,
  regimen_jornada text not null,
  politica_pago text not null check (politica_pago in ('sin_pago_adicional', 'doble', 'triple')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feriados_politica_override_feriado_empresa_fk
    foreign key (feriado_id, empresa_id)
    references public.feriados(id, empresa_id)
    on delete cascade,
  constraint feriados_politica_override_feriado_regimen_uk unique (feriado_id, regimen_jornada)
);

alter table public.registros_asistencia
  add column if not exists descanso_sustitutorio_otorgado boolean not null default false,
  add column if not exists descanso_sustitutorio_fecha date,
  add constraint registros_asistencia_descanso_sustitutorio_ck
    check (
      (not descanso_sustitutorio_otorgado and descanso_sustitutorio_fecha is null)
      or (descanso_sustitutorio_otorgado and descanso_sustitutorio_fecha is not null)
    );

comment on table public.feriados is
  'Calendario de feriados aislado por empresa. Los nacionales sembrados usan origen automatico y pueden editarse o eliminarse por tenant.';
comment on table public.feriados_politica_regimen_default is
  'Política de pago por feriado por defecto para cada régimen de jornada de una empresa.';
comment on table public.feriados_politica_override is
  'Override de la política de pago para un feriado puntual y régimen de jornada.';
comment on column public.registros_asistencia.descanso_sustitutorio_otorgado is
  'Si es true, el trabajo en feriado no genera sobretasa; se concedió descanso sustitutorio en la fecha indicada.';

-- ── 2. RLS ─────────────────────────────────────────────────────────────────

alter table public.feriados enable row level security;
alter table public.feriados_politica_regimen_default enable row level security;
alter table public.feriados_politica_override enable row level security;

drop policy if exists feriados_tenant_all on public.feriados;
create policy feriados_tenant_all on public.feriados
  for all
  using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

drop policy if exists feriados_politica_regimen_default_tenant_all on public.feriados_politica_regimen_default;
create policy feriados_politica_regimen_default_tenant_all on public.feriados_politica_regimen_default
  for all
  using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

drop policy if exists feriados_politica_override_tenant_all on public.feriados_politica_override;
create policy feriados_politica_override_tenant_all on public.feriados_politica_override
  for all
  using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

-- ── 3. Catálogo nacional calculable y siembra idempotente ───────────────────

-- Se calcula Pascua con el algoritmo gregoriano de Meeus/Jones/Butcher para
-- obtener Jueves y Viernes Santo de cualquier año futuro, sin hardcodear años.
create or replace function public.catalogo_feriados_nacionales_peru(p_anio integer)
returns table(fecha date, nombre text)
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  a integer;
  b integer;
  c integer;
  d integer;
  e integer;
  f integer;
  g integer;
  h integer;
  i integer;
  k integer;
  l integer;
  m integer;
  mes_pascua integer;
  dia_pascua integer;
  pascua date;
begin
  if p_anio < 1900 or p_anio > 9999 then
    raise exception 'Año fuera de rango para calendario de feriados: %', p_anio;
  end if;

  a := p_anio % 19;
  b := p_anio / 100;
  c := p_anio % 100;
  d := b / 4;
  e := b % 4;
  f := (b + 8) / 25;
  g := (b - f + 1) / 3;
  h := (19 * a + b - d - g + 15) % 30;
  i := c / 4;
  k := c % 4;
  l := (32 + 2 * e + 2 * i - h - k) % 7;
  m := (a + 11 * h + 22 * l) / 451;
  mes_pascua := (h + l - 7 * m + 114) / 31;
  dia_pascua := ((h + l - 7 * m + 114) % 31) + 1;
  pascua := make_date(p_anio, mes_pascua, dia_pascua);

  return query
  select v.fecha, v.nombre
  from (
    values
      (make_date(p_anio, 1, 1), 'Año Nuevo'),
      (pascua - 3, 'Jueves Santo'),
      (pascua - 2, 'Viernes Santo'),
      (make_date(p_anio, 5, 1), 'Día del Trabajo'),
      (make_date(p_anio, 6, 29), 'San Pedro y San Pablo'),
      (make_date(p_anio, 7, 28), 'Fiestas Patrias'),
      (make_date(p_anio, 7, 29), 'Fiestas Patrias'),
      (make_date(p_anio, 8, 6), 'Batalla de Junín'),
      (make_date(p_anio, 8, 30), 'Santa Rosa de Lima'),
      (make_date(p_anio, 10, 8), 'Combate de Angamos'),
      (make_date(p_anio, 11, 1), 'Todos los Santos'),
      (make_date(p_anio, 12, 8), 'Inmaculada Concepción'),
      (make_date(p_anio, 12, 9), 'Batalla de Ayacucho'),
      (make_date(p_anio, 12, 25), 'Navidad')
  ) as v(fecha, nombre)
  order by v.fecha;
end;
$$;

create or replace function public.sembrar_feriados_nacionales_peru(
  p_anio integer,
  p_empresa_id text default null
)
returns table(empresa_id text, feriados_insertados integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_empresa_id text;
  v_insertados integer;
begin
  for v_empresa_id in
    select e.id
    from public.empresas e
    where (p_empresa_id is null or e.id = p_empresa_id)
      and lower(coalesce(e.estado, 'activo')) in ('activo', 'activa')
      and e.id not in ('emp_2000000000', 'emp_tideo')
  loop
    insert into public.feriados (empresa_id, fecha, nombre, origen)
    select v_empresa_id, f.fecha, f.nombre, 'automatico'
    from public.catalogo_feriados_nacionales_peru(p_anio) f
    on conflict (empresa_id, fecha) do nothing;

    get diagnostics v_insertados = row_count;
    empresa_id := v_empresa_id;
    feriados_insertados := v_insertados;
    return next;
  end loop;
end;
$$;

revoke all on function public.sembrar_feriados_nacionales_peru(integer, text) from public, anon, authenticated;
grant execute on function public.sembrar_feriados_nacionales_peru(integer, text) to service_role;

-- Seed inicial para las empresas activas existentes. ON CONFLICT preserva una
-- edición o eliminación posterior del tenant: el cron solo sembrará años nuevos.
select * from public.sembrar_feriados_nacionales_peru(2026);
select * from public.sembrar_feriados_nacionales_peru(2027);
select * from public.sembrar_feriados_nacionales_peru(2028);

-- ── 4. Auto-siembra anual ───────────────────────────────────────────────────
-- 01 de diciembre, 05:00 UTC (medianoche America/Lima), para asegurar que el
-- calendario del año siguiente exista antes del cierre del año actual.
create extension if not exists pg_cron;

do $body$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    begin
      execute $cron$
        select cron.schedule(
          'feriados-peru-siembra-anual',
          '0 5 1 12 *',
          $cmd$select public.sembrar_feriados_nacionales_peru((extract(year from timezone('America/Lima', now()))::integer + 1));$cmd$
        )
        where not exists (
          select 1 from cron.job where jobname = 'feriados-peru-siembra-anual'
        )
      $cron$;
    exception when others then
      raise notice 'No se pudo registrar pg_cron feriados-peru-siembra-anual: %', sqlerrm;
    end;
  else
    raise notice 'pg_cron no disponible: registrar feriados-peru-siembra-anual manualmente';
  end if;
end $body$;

select pg_notify('pgrst', 'reload schema');
