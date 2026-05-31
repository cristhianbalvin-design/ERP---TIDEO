-- Extensión Control de Asistencia: Régimen Minero

-- 1. Nueva tabla para ciclos mineros
create table if not exists public.asistencia_ciclos_mineros (
  id text primary key,
  empresa_id text not null references public.empresas(id) on delete cascade,
  personal_id text not null,
  personal_nombre text not null,
  personal_tipo text not null,
  regimen_jornada text not null,
  fecha_inicio_ciclo date not null,
  fecha_fin_ciclo date not null,
  dias_ciclo_trabajo integer not null,
  dias_ciclo_descanso integer not null,
  estado_ciclo text not null default 'completo',
  incidencias jsonb not null default '[]'::jsonb,
  horas_extra_ciclo numeric(10,2) not null default 0,
  creado_por uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Habilitar RLS en la nueva tabla
alter table public.asistencia_ciclos_mineros enable row level security;
drop policy if exists tenant_asistencia_ciclos_mineros_isolation on public.asistencia_ciclos_mineros;
create policy tenant_asistencia_ciclos_mineros_isolation on public.asistencia_ciclos_mineros
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

-- 2. Modificar registros_asistencia existente
alter table public.registros_asistencia
  add column if not exists regimen_jornada text not null default 'general',
  add column if not exists ciclo_minero_id text references public.asistencia_ciclos_mineros(id) on delete cascade;

-- Notificar a PostgREST
select pg_notify('pgrst', 'reload schema');
