-- Permite que un vendedor lea su propia ficha administrativa para resolver
-- comision base aunque RRHH no haya vinculado auth_user_id.

drop policy if exists hr_admin_read_hierarchy on public.personal_administrativo;
create policy hr_admin_read_hierarchy on public.personal_administrativo
  for select
  using (
    public.usuario_tiene_empresa(empresa_id)
    and (
      public.usuario_puede(empresa_id, 'personal_administrativo', 'ver')
      or public.usuario_puede(empresa_id, 'rrhh_admin', 'ver')
      or (
        auth_user_id is not null
        and public.usuario_puede_ver_usuario(empresa_id, auth_user_id)
      )
      or (
        auth.uid() is not null
        and (
          auth_user_id = auth.uid()
          or (
            nullif(trim(email), '') is not null
            and lower(trim(email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
          )
        )
      )
    )
  );

select pg_notify('pgrst', 'reload schema');
