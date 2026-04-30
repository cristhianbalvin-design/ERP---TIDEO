-- TIDEO ERP - Versionado editable de Hojas de Costeo
-- Ejecutar en proyectos existentes despues de 019_platform_tenant_admin.sql.

alter table public.hojas_costeo
  add column if not exists version integer default 1,
  add column if not exists historial_versiones jsonb default '[]'::jsonb;

update public.hojas_costeo
set version = 1
where version is null;

update public.hojas_costeo
set historial_versiones = '[]'::jsonb
where historial_versiones is null;

select pg_notify('pgrst', 'reload schema');
