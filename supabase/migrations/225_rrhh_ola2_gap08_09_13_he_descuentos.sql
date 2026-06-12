-- TIDEO ERP - RRHH Ola 2 / GAP-08, GAP-09, GAP-13
-- Autorizaciones HE, bolsa de compensacion y descuentos extraordinarios.

alter table if exists public.empresa_config
  add column if not exists requiere_autorizacion_he boolean default false;

create table if not exists public.autorizaciones_horas_extra (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null,
  personal_id text not null,
  personal_nombre text,
  personal_tipo text check (personal_tipo in ('operativo','administrativo','admin')),
  fecha date not null,
  horas_estimadas numeric(4,2) not null default 0,
  minutos_autorizados integer not null default 0,
  motivo text,
  estado text not null default 'pendiente' check (estado in ('pendiente','aprobada','rechazada','anulada')),
  solicitado_por text not null default 'sistema',
  solicitado_en timestamptz default now(),
  resuelto_por text,
  resuelto_en timestamptz,
  comentario_resolucion text,
  creado_en timestamptz default now()
);

alter table public.autorizaciones_horas_extra enable row level security;

drop policy if exists autorizaciones_he_select on public.autorizaciones_horas_extra;
create policy autorizaciones_he_select on public.autorizaciones_horas_extra
  for select using (public.usuario_tiene_empresa(empresa_id));

drop policy if exists autorizaciones_he_insert on public.autorizaciones_horas_extra;
create policy autorizaciones_he_insert on public.autorizaciones_horas_extra
  for insert with check (public.usuario_tiene_empresa(empresa_id));

drop policy if exists autorizaciones_he_update on public.autorizaciones_horas_extra;
create policy autorizaciones_he_update on public.autorizaciones_horas_extra
  for update using (public.usuario_tiene_empresa(empresa_id));

create index if not exists idx_aut_he_personal_fecha
  on public.autorizaciones_horas_extra(empresa_id, personal_id, fecha);

alter table if exists public.registros_asistencia
  add column if not exists he_autorizada boolean default false,
  add column if not exists autorizacion_he_id uuid,
  add column if not exists es_dia_compensado boolean default false,
  add column if not exists compensacion_he_id uuid;

create table if not exists public.horas_extra_compensacion (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null,
  personal_id text not null,
  personal_nombre text,
  personal_tipo text check (personal_tipo in ('operativo','administrativo','admin')),
  registro_asistencia_id text,
  autorizacion_he_id uuid,
  fecha_he date not null,
  minutos numeric not null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente','pagar','compensar','pagada','compensada','anulada')),
  periodo_pago_id text,
  fecha_dia_libre date,
  decidido_por text,
  decidido_en timestamptz,
  creado_en timestamptz default now()
);

alter table public.horas_extra_compensacion enable row level security;

drop policy if exists he_comp_select on public.horas_extra_compensacion;
create policy he_comp_select on public.horas_extra_compensacion
  for select using (public.usuario_tiene_empresa(empresa_id));

drop policy if exists he_comp_insert on public.horas_extra_compensacion;
create policy he_comp_insert on public.horas_extra_compensacion
  for insert with check (public.usuario_tiene_empresa(empresa_id));

drop policy if exists he_comp_update on public.horas_extra_compensacion;
create policy he_comp_update on public.horas_extra_compensacion
  for update using (public.usuario_tiene_empresa(empresa_id));

create index if not exists idx_he_comp_personal_estado
  on public.horas_extra_compensacion(empresa_id, personal_id, estado);

create table if not exists public.descuentos_extraordinarios (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null,
  personal_id text not null,
  personal_nombre text,
  personal_tipo text check (personal_tipo in ('operativo','administrativo','admin')),
  tipo text not null check (tipo in ('inasistencia_no_justificada','tardanzas_acumuladas','dano_operativo','danio','perdida_equipo','prestamo','judicial','otro')),
  descripcion text not null,
  monto numeric(10,2) not null check (monto > 0),
  evidencia_url text,
  estado text not null default 'pendiente'
    check (estado in ('pendiente','aprobado','rechazado','aplicado','anulado')),
  periodo_id text,
  registrado_por text not null default 'sistema',
  registrado_en timestamptz default now(),
  resuelto_por text,
  resuelto_en timestamptz,
  comentario_resolucion text,
  creado_en timestamptz default now()
);

alter table public.descuentos_extraordinarios enable row level security;

drop policy if exists desc_ext_select on public.descuentos_extraordinarios;
create policy desc_ext_select on public.descuentos_extraordinarios
  for select using (public.usuario_tiene_empresa(empresa_id));

drop policy if exists desc_ext_insert on public.descuentos_extraordinarios;
create policy desc_ext_insert on public.descuentos_extraordinarios
  for insert with check (public.usuario_tiene_empresa(empresa_id));

drop policy if exists desc_ext_update on public.descuentos_extraordinarios;
create policy desc_ext_update on public.descuentos_extraordinarios
  for update using (public.usuario_tiene_empresa(empresa_id));

alter table if exists public.nomina_detalle
  add column if not exists desc_extraordinario numeric(10,2) default 0;

select pg_notify('pgrst', 'reload schema');
