-- TIDEO ERP - Actividades Comerciales persistentes
-- Ejecutar en proyectos existentes para guardar llamadas, reuniones, emails, visitas y tareas CRM.

create table if not exists public.actividades_comerciales (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  tipo text not null default 'tarea' check (tipo in ('llamada','reunion','email','visita','tarea','nota','seguimiento')),
  vinculo_tipo text,
  vinculo_id text,
  cuenta_id text references public.cuentas(id),
  contacto_id text references public.contactos(id),
  oportunidad_id text references public.oportunidades(id),
  lead_id text references public.leads(id),
  responsable text not null,
  fecha date not null,
  hora time,
  descripcion text not null,
  resultado text,
  proxima_accion text,
  proxima_accion_fecha date,
  estado text default 'pendiente' check (estado in ('pendiente','completada','vencida','cancelada')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_actividades_comerciales_empresa_fecha on public.actividades_comerciales(empresa_id, fecha);
create index if not exists idx_actividades_comerciales_responsable on public.actividades_comerciales(empresa_id, responsable, fecha);
create index if not exists idx_actividades_comerciales_vinculo on public.actividades_comerciales(vinculo_tipo, vinculo_id);

insert into public.permisos_roles (
  rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular,
  puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas
)
select
  r.id, 'actividades', true, true, true, false,
  false, true, false, false
from public.roles r
where r.es_admin_empresa = true or r.es_superadmin = true
on conflict (rol_id, pantalla) do update set
  puede_ver = true,
  puede_crear = true,
  puede_editar = true,
  puede_exportar = true;

alter table public.actividades_comerciales enable row level security;

drop policy if exists actividades_comerciales_select on public.actividades_comerciales;
create policy actividades_comerciales_select on public.actividades_comerciales
  for select using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'actividades', 'ver')
  );

drop policy if exists actividades_comerciales_insert on public.actividades_comerciales;
create policy actividades_comerciales_insert on public.actividades_comerciales
  for insert with check (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'actividades', 'crear')
  );

drop policy if exists actividades_comerciales_update on public.actividades_comerciales;
create policy actividades_comerciales_update on public.actividades_comerciales
  for update using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'actividades', 'editar')
  )
  with check (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'actividades', 'editar')
  );
