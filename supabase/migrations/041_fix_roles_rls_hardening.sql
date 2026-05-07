-- TIDEO ERP - Hardening RLS tabla roles.
-- Reemplaza access_roles_tenant (cualquier miembro podia insertar/modificar roles,
-- incluyendo crear roles con es_superadmin=true o empresa_id=null global).
-- Reemplaza access_roles_authenticated (cualquier usuario veia roles de todos los tenants).
-- El superadmin sigue cubierto por access_roles_platform_all (migration 019), que no se toca.

drop policy if exists access_roles_tenant on public.roles;
drop policy if exists access_roles_authenticated on public.roles;

-- SELECT: miembros del tenant ven sus propios roles; roles globales (null) visibles a todos.
-- access_roles_platform_all (migration 019) cubre SELECT del superadmin por separado.
drop policy if exists roles_select on public.roles;
create policy roles_select on public.roles
  for select using (
    empresa_id is null
    or public.usuario_tiene_empresa(empresa_id)
  );

-- INSERT: solo admin del tenant, empresa_id obligatorio, no puede crear es_superadmin.
drop policy if exists roles_insert on public.roles;
create policy roles_insert on public.roles
  for insert with check (
    empresa_id is not null
    and public.usuario_es_admin_empresa(empresa_id)
    and es_superadmin = false
  );

-- UPDATE: solo admin del tenant, no puede cambiar empresa_id a null ni activar es_superadmin.
drop policy if exists roles_update on public.roles;
create policy roles_update on public.roles
  for update
  using (
    empresa_id is not null
    and public.usuario_es_admin_empresa(empresa_id)
    and es_superadmin = false
  )
  with check (
    empresa_id is not null
    and public.usuario_es_admin_empresa(empresa_id)
    and es_superadmin = false
  );

-- DELETE: solo admin del tenant, no puede borrar roles superadmin.
drop policy if exists roles_delete on public.roles;
create policy roles_delete on public.roles
  for delete using (
    empresa_id is not null
    and public.usuario_es_admin_empresa(empresa_id)
    and es_superadmin = false
  );

-- Defense-in-depth: impide que un admin asigne un rol superadmin a un usuario via
-- usuarios_empresas UPDATE (incluso si el rol superadmin ya existia antes del fix).
drop policy if exists access_usuarios_empresas_update on public.usuarios_empresas;
create policy access_usuarios_empresas_update on public.usuarios_empresas
  for update
  using (
    public.usuario_es_admin_empresa(empresa_id)
  )
  with check (
    public.usuario_es_admin_empresa(empresa_id)
    and not exists (
      select 1 from public.roles r
      where r.id = rol_id
        and r.es_superadmin = true
    )
  );

select pg_notify('pgrst', 'reload schema');
