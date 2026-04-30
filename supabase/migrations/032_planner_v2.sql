-- TIDEO ERP — Planner de Recursos v2
-- Modelo: OT × Día × Técnico (asignaciones independientes)
-- Ejecutar después de 031_ot_hora_fin_estimada.sql

-- ─── 1. CUADRILLAS ────────────────────────────────────────────────────────────
create table if not exists public.cuadrillas (
  id                    text primary key default gen_random_uuid()::text,
  empresa_id            text not null references public.empresas(id) on delete cascade,
  nombre                text not null,
  especialidad_principal text,
  activa                boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table if not exists public.cuadrilla_miembros (
  id            text primary key default gen_random_uuid()::text,
  cuadrilla_id  text not null references public.cuadrillas(id) on delete cascade,
  tecnico_id    text not null references public.personal_operativo(id) on delete cascade,
  unique (cuadrilla_id, tecnico_id)
);

-- ─── 2. ASIGNACIONES PLANNER ──────────────────────────────────────────────────
create table if not exists public.planner_asignaciones (
  id          text primary key default gen_random_uuid()::text,
  empresa_id  text not null references public.empresas(id) on delete cascade,
  ot_id       text not null references public.ordenes_trabajo(id) on delete cascade,
  tecnico_id  text not null references public.personal_operativo(id) on delete restrict,
  fecha       date not null,
  estado      text not null default 'programado'
              check (estado in ('programado','ejecutado','reprogramado','cancelado')),
  motivo_reprogramacion text,
  cuadrilla_origen_id   text references public.cuadrillas(id) on delete set null,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Un técnico no puede estar asignado dos veces a la misma OT+día
  unique (empresa_id, ot_id, tecnico_id, fecha)
);

-- Índices para queries frecuentes del Planner
create index if not exists idx_planner_asig_empresa_fecha
  on public.planner_asignaciones (empresa_id, fecha);

create index if not exists idx_planner_asig_tecnico_fecha
  on public.planner_asignaciones (tecnico_id, fecha);

create index if not exists idx_planner_asig_ot
  on public.planner_asignaciones (ot_id);

-- ─── 3. RLS ───────────────────────────────────────────────────────────────────
alter table public.cuadrillas enable row level security;
alter table public.cuadrilla_miembros enable row level security;
alter table public.planner_asignaciones enable row level security;

-- cuadrillas
drop policy if exists cuadrillas_select on public.cuadrillas;
drop policy if exists cuadrillas_insert on public.cuadrillas;
drop policy if exists cuadrillas_update on public.cuadrillas;

create policy cuadrillas_select on public.cuadrillas
  for select using (public.usuario_tiene_empresa(empresa_id));

create policy cuadrillas_insert on public.cuadrillas
  for insert with check (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'planner', 'crear')
  );

create policy cuadrillas_update on public.cuadrillas
  for update using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'planner', 'editar')
  ) with check (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'planner', 'editar')
  );

-- cuadrilla_miembros (hereda acceso via cuadrilla)
drop policy if exists cuadrilla_miembros_select on public.cuadrilla_miembros;
drop policy if exists cuadrilla_miembros_write on public.cuadrilla_miembros;

create policy cuadrilla_miembros_select on public.cuadrilla_miembros
  for select using (
    exists (
      select 1 from public.cuadrillas c
      where c.id = cuadrilla_id
        and public.usuario_tiene_empresa(c.empresa_id)
    )
  );

create policy cuadrilla_miembros_write on public.cuadrilla_miembros
  for all using (
    exists (
      select 1 from public.cuadrillas c
      where c.id = cuadrilla_id
        and public.usuario_tiene_empresa(c.empresa_id)
        and public.usuario_puede(c.empresa_id, 'planner', 'editar')
    )
  );

-- planner_asignaciones: SELECT
drop policy if exists planner_asig_select on public.planner_asignaciones;
drop policy if exists planner_asig_insert on public.planner_asignaciones;
drop policy if exists planner_asig_update on public.planner_asignaciones;

-- Supervisores/admins ven todo. Técnicos solo sus propias asignaciones.
create policy planner_asig_select on public.planner_asignaciones
  for select using (
    public.usuario_tiene_empresa(empresa_id)
    and (
      -- Admin/supervisor: puede ver planner completo
      public.usuario_puede(empresa_id, 'planner', 'ver')
      -- Técnico de campo: solo ve sus propias asignaciones
      or exists (
        select 1 from public.personal_operativo po
        where po.id = tecnico_id
          and po.empresa_id = planner_asignaciones.empresa_id
          and po.acceso_campo = true
      )
    )
  );

create policy planner_asig_insert on public.planner_asignaciones
  for insert with check (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'planner', 'crear')
  );

create policy planner_asig_update on public.planner_asignaciones
  for update using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'planner', 'editar')
  ) with check (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'planner', 'editar')
  );

-- ─── 4. PERMISOS DE ROL ────────────────────────────────────────────────────────
-- Asegura que admins y supervisores tengan permiso de planner
insert into public.permisos_roles (
  rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular,
  puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas
)
select r.id, x.pantalla, true, true, true, false, true, true, true, false
from public.roles r
cross join (values ('planner'), ('cuadrillas')) as x(pantalla)
where r.es_admin_empresa = true or r.es_superadmin = true
on conflict (rol_id, pantalla) do update set
  puede_ver    = true,
  puede_crear  = true,
  puede_editar = true,
  puede_aprobar = true;

select pg_notify('pgrst', 'reload schema');
