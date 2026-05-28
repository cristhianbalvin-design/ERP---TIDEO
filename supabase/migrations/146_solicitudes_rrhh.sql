-- Módulo Solicitudes de RRHH
-- Tablas: solicitudes_rrhh, solicitudes_rrhh_historial, rrhh_config_ausencias

-- ──────────────────────────────────────────────────
-- Función: días hábiles entre dos fechas (excluye sáb y dom)
-- ──────────────────────────────────────────────────
create or replace function public.calcular_dias_habiles(p_inicio date, p_fin date)
returns integer
language sql
stable
set search_path = public
as $$
  select count(*)::integer
  from generate_series(p_inicio, p_fin, '1 day'::interval) as d
  where extract(dow from d) not in (0, 6);
$$;

-- ──────────────────────────────────────────────────
-- Config de ausencias por empresa (singleton por tenant)
-- ──────────────────────────────────────────────────
create table if not exists public.rrhh_config_ausencias (
  empresa_id              text primary key references public.empresas(id) on delete cascade,
  dias_vacaciones_anio    integer not null default 30,
  max_dias_permiso_goce   integer not null default 3,
  dias_licencia_empresa   integer not null default 20,
  pct_max_equipo_ausente  integer not null default 30,
  actualizado_en          timestamptz not null default now()
);

alter table public.rrhh_config_ausencias enable row level security;

drop policy if exists rrhh_config_ausencias_select on public.rrhh_config_ausencias;
drop policy if exists rrhh_config_ausencias_insert on public.rrhh_config_ausencias;
drop policy if exists rrhh_config_ausencias_update on public.rrhh_config_ausencias;
drop policy if exists rrhh_config_ausencias_delete on public.rrhh_config_ausencias;

create policy rrhh_config_ausencias_select on public.rrhh_config_ausencias
  for select using (public.usuario_tiene_empresa(empresa_id));
create policy rrhh_config_ausencias_insert on public.rrhh_config_ausencias
  for insert with check (public.usuario_tiene_empresa(empresa_id));
create policy rrhh_config_ausencias_update on public.rrhh_config_ausencias
  for update using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));
create policy rrhh_config_ausencias_delete on public.rrhh_config_ausencias
  for delete using (public.usuario_tiene_empresa(empresa_id));

-- ──────────────────────────────────────────────────
-- Tabla principal de solicitudes
-- ──────────────────────────────────────────────────
create table if not exists public.solicitudes_rrhh (
  id                    uuid primary key default gen_random_uuid(),
  empresa_id            text not null references public.empresas(id) on delete cascade,

  personal_id           text not null,
  personal_nombre       text not null,
  personal_tipo         text not null default 'operativo'
                          check (personal_tipo in ('operativo', 'administrativo')),

  aprobador_id          text,
  aprobador_nombre      text,

  tipo                  text not null
                          check (tipo in ('vacaciones', 'permiso_con_goce', 'permiso_sin_goce',
                                          'licencia_medica', 'licencia_maternidad',
                                          'licencia_paternidad', 'compensacion_horas')),

  fecha_inicio          date not null,
  fecha_fin             date not null,
  dias_habiles          integer not null default 0,

  motivo                text not null,
  documento_url         text,
  requiere_documento    boolean not null default false,

  estado                text not null default 'enviada'
                          check (estado in ('borrador', 'enviada', 'aprobada_jefe',
                                            'rechazada_jefe', 'confirmada_rrhh',
                                            'rechazada_rrhh', 'activa', 'anulada')),

  comentario_jefe       text,
  comentario_rrhh       text,
  motivo_anulacion      text,

  fecha_aprobacion_jefe timestamptz,
  fecha_confirmacion    timestamptz,
  confirmado_por        text,

  impacto_nomina        text default 'sin_impacto'
                          check (impacto_nomina in ('sin_descuento', 'descuento_parcial',
                                                    'descuento_total', 'sin_impacto')),
  dias_a_descontar      integer not null default 0,

  registrado_desde      text not null default 'backoffice'
                          check (registrado_desde in ('backoffice', 'mobile')),

  creado_por            uuid references auth.users(id) on delete set null,
  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now()
);

create index if not exists idx_solicitudes_rrhh_empresa_estado
  on public.solicitudes_rrhh(empresa_id, estado, creado_en desc);
create index if not exists idx_solicitudes_rrhh_personal
  on public.solicitudes_rrhh(personal_id, empresa_id);
create index if not exists idx_solicitudes_rrhh_aprobador
  on public.solicitudes_rrhh(aprobador_id, empresa_id);
create index if not exists idx_solicitudes_rrhh_fechas
  on public.solicitudes_rrhh(empresa_id, fecha_inicio, fecha_fin);

-- Trigger: actualizar actualizado_en
create or replace function public.trg_solicitudes_rrhh_updated_at()
returns trigger language plpgsql
set search_path = public
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

drop trigger if exists trg_solicitudes_rrhh_upd on public.solicitudes_rrhh;
create trigger trg_solicitudes_rrhh_upd
before update on public.solicitudes_rrhh
for each row execute function public.trg_solicitudes_rrhh_updated_at();

-- ──────────────────────────────────────────────────
-- Historial append-only de cambios de estado
-- ──────────────────────────────────────────────────
create table if not exists public.solicitudes_rrhh_historial (
  id             uuid primary key default gen_random_uuid(),
  solicitud_id   uuid not null references public.solicitudes_rrhh(id) on delete cascade,
  empresa_id     text not null,
  estado_desde   text,
  estado_hasta   text not null,
  comentario     text,
  usuario        text,
  creado_en      timestamptz not null default now()
);

create index if not exists idx_solicitudes_historial_solicitud
  on public.solicitudes_rrhh_historial(solicitud_id, creado_en desc);
create index if not exists idx_solicitudes_historial_empresa
  on public.solicitudes_rrhh_historial(empresa_id, creado_en desc);

-- Trigger: registrar cambio de estado en historial
create or replace function public.trg_solicitudes_rrhh_historial()
returns trigger language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and old.estado is distinct from new.estado) then
    insert into public.solicitudes_rrhh_historial
      (solicitud_id, empresa_id, estado_desde, estado_hasta, creado_en)
    values
      (new.id, new.empresa_id,
       case when tg_op = 'UPDATE' then old.estado else null end,
       new.estado,
       now());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_solicitudes_rrhh_hist on public.solicitudes_rrhh;
create trigger trg_solicitudes_rrhh_hist
after insert or update on public.solicitudes_rrhh
for each row execute function public.trg_solicitudes_rrhh_historial();

-- RLS en historial (solo lectura para el tenant)
alter table public.solicitudes_rrhh_historial enable row level security;

drop policy if exists sol_hist_select on public.solicitudes_rrhh_historial;
drop policy if exists sol_hist_insert on public.solicitudes_rrhh_historial;

create policy sol_hist_select on public.solicitudes_rrhh_historial
  for select using (public.usuario_tiene_empresa(empresa_id));
create policy sol_hist_insert on public.solicitudes_rrhh_historial
  for insert with check (public.usuario_tiene_empresa(empresa_id));

-- ──────────────────────────────────────────────────
-- RLS en solicitudes_rrhh
-- ──────────────────────────────────────────────────
alter table public.solicitudes_rrhh enable row level security;

drop policy if exists sol_rrhh_select on public.solicitudes_rrhh;
drop policy if exists sol_rrhh_insert on public.solicitudes_rrhh;
drop policy if exists sol_rrhh_update on public.solicitudes_rrhh;
drop policy if exists sol_rrhh_delete on public.solicitudes_rrhh;

create policy sol_rrhh_select on public.solicitudes_rrhh
  for select using (public.usuario_tiene_empresa(empresa_id));
create policy sol_rrhh_insert on public.solicitudes_rrhh
  for insert with check (public.usuario_tiene_empresa(empresa_id));
create policy sol_rrhh_update on public.solicitudes_rrhh
  for update using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));
create policy sol_rrhh_delete on public.solicitudes_rrhh
  for delete using (false);

-- ──────────────────────────────────────────────────
-- RPC: crear_solicitud_rrhh (security definer)
-- ──────────────────────────────────────────────────
create or replace function public.crear_solicitud_rrhh(
  p_empresa_id        text,
  p_personal_id       text,
  p_personal_nombre   text,
  p_personal_tipo     text,
  p_aprobador_id      text default null,
  p_aprobador_nombre  text default null,
  p_tipo              text default 'vacaciones',
  p_fecha_inicio      date default current_date,
  p_fecha_fin         date default current_date,
  p_motivo            text default '',
  p_documento_url     text default null,
  p_registrado_desde  text default 'backoffice'
)
returns public.solicitudes_rrhh
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dias          integer;
  v_req_doc       boolean;
  v_row           public.solicitudes_rrhh;
begin
  -- Verificar acceso al tenant
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'Acceso denegado al tenant';
  end if;

  -- Calcular días hábiles
  v_dias := public.calcular_dias_habiles(p_fecha_inicio, p_fecha_fin);

  -- Determinar si requiere documento
  v_req_doc := p_tipo in ('licencia_medica', 'licencia_maternidad', 'licencia_paternidad');

  insert into public.solicitudes_rrhh (
    empresa_id, personal_id, personal_nombre, personal_tipo,
    aprobador_id, aprobador_nombre, tipo, fecha_inicio, fecha_fin,
    dias_habiles, motivo, documento_url, requiere_documento,
    estado, registrado_desde, creado_por
  ) values (
    p_empresa_id, p_personal_id, p_personal_nombre, p_personal_tipo,
    p_aprobador_id, p_aprobador_nombre, p_tipo, p_fecha_inicio, p_fecha_fin,
    v_dias, p_motivo, p_documento_url, v_req_doc,
    'enviada', p_registrado_desde, auth.uid()
  )
  returning * into v_row;

  return v_row;
end;
$$;

-- ──────────────────────────────────────────────────
-- Columna solicitud_rrhh_id en registros_asistencia
-- ──────────────────────────────────────────────────
alter table public.registros_asistencia
  add column if not exists solicitud_rrhh_id uuid
    references public.solicitudes_rrhh(id) on delete set null;

select pg_notify('pgrst', 'reload schema');
