-- TIDEO ERP - Agenda Comercial persistente
-- Ejecutar en proyectos existentes para guardar eventos comerciales en Supabase.

create table if not exists public.agenda_comercial (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  titulo text not null,
  tipo text not null default 'reunion' check (tipo in ('visita','reunion','llamada','demo','tarea')),
  cuenta_id text references public.cuentas(id),
  lead_id text references public.leads(id),
  oportunidad_id text references public.oportunidades(id),
  vendedor text not null,
  registrado_por text,
  fecha date not null,
  hora time not null,
  duracion_minutos integer default 60,
  estado text default 'programado' check (estado in ('programado','realizado','cancelado','reprogramado')),
  notas text,
  resultado text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_agenda_comercial_empresa_fecha on public.agenda_comercial(empresa_id, fecha, hora);
create index if not exists idx_agenda_comercial_vendedor on public.agenda_comercial(empresa_id, vendedor, fecha);

insert into public.permisos_roles (
  rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular,
  puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas
)
select
  r.id, 'agenda_comercial', true, true, true, false,
  false, true, false, false
from public.roles r
where r.es_admin_empresa = true or r.es_superadmin = true
on conflict (rol_id, pantalla) do update set
  puede_ver = true,
  puede_crear = true,
  puede_editar = true,
  puede_exportar = true;

alter table public.agenda_comercial enable row level security;

drop policy if exists agenda_comercial_select on public.agenda_comercial;
create policy agenda_comercial_select on public.agenda_comercial
  for select using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'agenda_comercial', 'ver')
  );

drop policy if exists agenda_comercial_insert on public.agenda_comercial;
create policy agenda_comercial_insert on public.agenda_comercial
  for insert with check (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'agenda_comercial', 'crear')
  );

drop policy if exists agenda_comercial_update on public.agenda_comercial;
create policy agenda_comercial_update on public.agenda_comercial
  for update using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'agenda_comercial', 'editar')
  )
  with check (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'agenda_comercial', 'editar')
  );
