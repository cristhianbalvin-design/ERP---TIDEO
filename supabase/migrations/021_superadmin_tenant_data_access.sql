-- TIDEO ERP - Acceso operativo Superadmin TIDEO a datos tenant
-- Ejecutar en proyectos existentes despues de 020_hojas_costeo_versionado.sql.
-- Permite que Superadmin TIDEO opere cualquier tenant sin crear membresias artificiales por empresa.

create or replace function public.usuario_tiene_empresa(target_empresa_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = target_empresa_id
      and ue.estado = 'activo'
  )
  or exists (
    select 1
    from public.usuarios_empresas ue
    join public.roles r on r.id = ue.rol_id
    where ue.user_id = auth.uid()
      and ue.estado = 'activo'
      and r.es_superadmin = true
  );
$$;

select pg_notify('pgrst', 'reload schema');
