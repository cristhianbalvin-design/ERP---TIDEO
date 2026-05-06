-- TIDEO ERP - Hardening RLS tabla usuarios.
-- Reemplaza la política "relajada para pruebas" que permitia a cualquier usuario
-- autenticado leer, modificar y eliminar perfiles de usuarios de todos los tenants.

drop policy if exists tenant_usuarios_isolation on public.usuarios;

-- SELECT: usuario ve su propio perfil; admin/superadmin ve perfiles de su empresa.
create policy usuarios_select on public.usuarios
  for select using (
    id = auth.uid()::text
    or public.usuario_es_superadmin_plataforma()
    or public.usuario_es_admin_empresa(empresa_id)
  );

-- INSERT: usuario crea su propio perfil; admin crea perfiles para su empresa.
create policy usuarios_insert on public.usuarios
  for insert with check (
    id = auth.uid()::text
    or public.usuario_es_superadmin_plataforma()
    or public.usuario_es_admin_empresa(empresa_id)
  );

-- UPDATE: usuario actualiza su propio perfil; admin actualiza perfiles de su empresa.
create policy usuarios_update on public.usuarios
  for update
  using (
    id = auth.uid()::text
    or public.usuario_es_superadmin_plataforma()
    or public.usuario_es_admin_empresa(empresa_id)
  )
  with check (
    id = auth.uid()::text
    or public.usuario_es_superadmin_plataforma()
    or public.usuario_es_admin_empresa(empresa_id)
  );

-- DELETE: solo admin del tenant y superadmin pueden eliminar perfiles.
create policy usuarios_delete on public.usuarios
  for delete using (
    public.usuario_es_superadmin_plataforma()
    or public.usuario_es_admin_empresa(empresa_id)
  );

select pg_notify('pgrst', 'reload schema');
