-- TIDEO ERP - RRHH Operativo + Planner listo para pruebas en Supabase
-- Ejecutar despues de 028_fix_ot_os_cliente_fkey.sql.
-- Agrega campos necesarios para app de campo y corrige RLS de alta de personal.

alter table public.personal_operativo
  add column if not exists sede text,
  add column if not exists supervisor text,
  add column if not exists especialidad2 text,
  add column if not exists fecha_ingreso date,
  add column if not exists acceso_campo boolean default true,
  add column if not exists perfil_campo text default 'Tecnico',
  add column if not exists docs jsonb default '{"sctr":"pendiente","medico":"pendiente","epp":"pendiente","licencia":"pendiente"}'::jsonb;

update public.personal_operativo
set acceso_campo = true,
    perfil_campo = coalesce(perfil_campo, 'Tecnico'),
    docs = coalesce(docs, '{"sctr":"pendiente","medico":"pendiente","epp":"pendiente","licencia":"pendiente"}'::jsonb);

update public.usuarios_empresas
set acceso_campo = true,
    perfil_campo = coalesce(perfil_campo, 'Tecnico'),
    updated_at = now()
where estado = 'activo';

insert into public.permisos_roles (
  rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular,
  puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas
)
select r.id, x.pantalla, true, true, true, false, true, true, true, true
from public.roles r
cross join (values ('rrhh_operativo'), ('personal_operativo'), ('planner'), ('campo')) as x(pantalla)
where r.es_admin_empresa = true or r.es_superadmin = true
on conflict (rol_id, pantalla) do update set
  puede_ver = true,
  puede_crear = true,
  puede_editar = true,
  puede_aprobar = true,
  puede_exportar = true,
  puede_ver_costos = true,
  puede_ver_finanzas = true;

alter table public.personal_operativo enable row level security;

drop policy if exists tenant_personal_operativo on public.personal_operativo;
drop policy if exists tenant_personal_operativo_isolation on public.personal_operativo;
drop policy if exists hr_operativo_all on public.personal_operativo;
drop policy if exists rrhh_operativo_select on public.personal_operativo;
drop policy if exists rrhh_operativo_insert on public.personal_operativo;
drop policy if exists rrhh_operativo_update on public.personal_operativo;

create policy rrhh_operativo_select on public.personal_operativo
  for select using (
    public.usuario_tiene_empresa(empresa_id)
    and (
      public.usuario_puede(empresa_id, 'rrhh_operativo', 'ver')
      or public.usuario_puede(empresa_id, 'personal_operativo', 'ver')
      or public.usuario_puede(empresa_id, 'planner', 'ver')
    )
  );

create policy rrhh_operativo_insert on public.personal_operativo
  for insert with check (
    public.usuario_tiene_empresa(empresa_id)
    and (
      public.usuario_puede(empresa_id, 'rrhh_operativo', 'crear')
      or public.usuario_puede(empresa_id, 'personal_operativo', 'crear')
    )
  );

create policy rrhh_operativo_update on public.personal_operativo
  for update using (
    public.usuario_tiene_empresa(empresa_id)
    and (
      public.usuario_puede(empresa_id, 'rrhh_operativo', 'editar')
      or public.usuario_puede(empresa_id, 'personal_operativo', 'editar')
    )
  )
  with check (
    public.usuario_tiene_empresa(empresa_id)
    and (
      public.usuario_puede(empresa_id, 'rrhh_operativo', 'editar')
      or public.usuario_puede(empresa_id, 'personal_operativo', 'editar')
    )
  );

select pg_notify('pgrst', 'reload schema');
