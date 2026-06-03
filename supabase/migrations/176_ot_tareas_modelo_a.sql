-- Modelo A: tareas estructuradas por OT y avance global declarado por supervisor.
-- La base actual usa ids text en ordenes_trabajo, partes_diarios y empresas;
-- por eso empresa_id es text para ser compatible con el esquema desplegado.

create table if not exists public.ot_tareas (
  id              text primary key default gen_random_uuid()::text,
  empresa_id      text not null references public.empresas(id) on delete cascade,
  ot_id           text not null references public.ordenes_trabajo(id) on delete cascade,
  titulo          text not null,
  descripcion     text,
  tecnico_id      text,
  tecnico_nombre  text,
  tecnico_tipo    text,
  estado          text not null default 'pendiente',
  horas_estimadas numeric,
  horas_reales    numeric,
  avance_pct      numeric default 0,
  completada      boolean default false,
  completada_en   timestamptz,
  completada_por  text,
  orden           integer default 0,
  creado_por      text,
  creado_en       timestamptz default now(),
  actualizado_en  timestamptz default now()
);

alter table public.ot_tareas
  add column if not exists empresa_id text references public.empresas(id) on delete cascade,
  add column if not exists ot_id text references public.ordenes_trabajo(id) on delete cascade,
  add column if not exists titulo text,
  add column if not exists descripcion text,
  add column if not exists tecnico_id text,
  add column if not exists tecnico_nombre text,
  add column if not exists tecnico_tipo text,
  add column if not exists estado text not null default 'pendiente',
  add column if not exists horas_estimadas numeric,
  add column if not exists horas_reales numeric,
  add column if not exists avance_pct numeric default 0,
  add column if not exists completada boolean default false,
  add column if not exists completada_en timestamptz,
  add column if not exists completada_por text,
  add column if not exists orden integer default 0,
  add column if not exists creado_por text,
  add column if not exists creado_en timestamptz default now(),
  add column if not exists actualizado_en timestamptz default now();

alter table public.partes_diarios
  add column if not exists tarea_id text references public.ot_tareas(id) on delete set null,
  add column if not exists avance_tarea_reportado numeric,
  add column if not exists avance_tarea_validado numeric;

alter table public.ordenes_trabajo
  add column if not exists avance_supervisor_pct numeric,
  add column if not exists avance_supervisor_nota text,
  add column if not exists avance_supervisor_en timestamptz,
  add column if not exists avance_supervisor_por text;

create table if not exists public.ot_avance_historial (
  id              text primary key default gen_random_uuid()::text,
  empresa_id      text not null references public.empresas(id) on delete cascade,
  ot_id           text not null references public.ordenes_trabajo(id) on delete cascade,
  avance_anterior numeric,
  avance_nuevo    numeric,
  nota            text not null,
  registrado_por  text,
  registrado_en   timestamptz default now()
);

create index if not exists idx_ot_tareas_empresa_ot on public.ot_tareas(empresa_id, ot_id);
create index if not exists idx_ot_tareas_tecnico on public.ot_tareas(empresa_id, tecnico_id, completada);
create index if not exists idx_partes_tarea on public.partes_diarios(empresa_id, tarea_id);
create index if not exists idx_ot_avance_historial_ot on public.ot_avance_historial(empresa_id, ot_id, registrado_en desc);

alter table public.ot_tareas enable row level security;
alter table public.ot_avance_historial enable row level security;

drop policy if exists ot_tareas_select on public.ot_tareas;
drop policy if exists ot_tareas_insert on public.ot_tareas;
drop policy if exists ot_tareas_update on public.ot_tareas;
drop policy if exists ot_tareas_delete on public.ot_tareas;

create policy ot_tareas_select on public.ot_tareas
  for select using (public.usuario_tiene_empresa(empresa_id));
create policy ot_tareas_insert on public.ot_tareas
  for insert with check (public.usuario_tiene_empresa(empresa_id));
create policy ot_tareas_update on public.ot_tareas
  for update using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));
create policy ot_tareas_delete on public.ot_tareas
  for delete using (public.usuario_es_admin_empresa(empresa_id));

drop policy if exists ot_avance_historial_select on public.ot_avance_historial;
drop policy if exists ot_avance_historial_insert on public.ot_avance_historial;

create policy ot_avance_historial_select on public.ot_avance_historial
  for select using (public.usuario_tiene_empresa(empresa_id));
create policy ot_avance_historial_insert on public.ot_avance_historial
  for insert with check (public.usuario_tiene_empresa(empresa_id));

create or replace function public.set_actualizado_en()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en = now();
  return new;
end;
$$;

drop trigger if exists trg_ot_tareas_actualizado_en on public.ot_tareas;
create trigger trg_ot_tareas_actualizado_en
  before update on public.ot_tareas
  for each row execute function public.set_actualizado_en();

select pg_notify('pgrst', 'reload schema');
