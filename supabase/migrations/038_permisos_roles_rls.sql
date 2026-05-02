  -- RLS para permisos de roles.
  -- Permite que cada usuario lea los permisos de roles de sus tenants y que los
  -- administradores del tenant gestionen roles/permisos desde la app.

  alter table public.permisos_roles enable row level security;

  drop policy if exists access_permisos_roles_select on public.permisos_roles;
  create policy access_permisos_roles_select on public.permisos_roles
    for select using (
      exists (
        select 1
        from public.roles r
        where r.id = permisos_roles.rol_id
          and (
            r.empresa_id is null
            or public.usuario_tiene_empresa(r.empresa_id)
          )
      )
    );

  drop policy if exists access_permisos_roles_insert on public.permisos_roles;
  create policy access_permisos_roles_insert on public.permisos_roles
    for insert with check (
      exists (
        select 1
        from public.roles r
        where r.id = permisos_roles.rol_id
          and (
            public.usuario_es_admin_empresa(r.empresa_id)
            or public.usuario_es_superadmin_plataforma()
          )
      )
    );

  drop policy if exists access_permisos_roles_update on public.permisos_roles;
  create policy access_permisos_roles_update on public.permisos_roles
    for update using (
      exists (
        select 1
        from public.roles r
        where r.id = permisos_roles.rol_id
          and (
            public.usuario_es_admin_empresa(r.empresa_id)
            or public.usuario_es_superadmin_plataforma()
          )
      )
    )
    with check (
      exists (
        select 1
        from public.roles r
        where r.id = permisos_roles.rol_id
          and (
            public.usuario_es_admin_empresa(r.empresa_id)
            or public.usuario_es_superadmin_plataforma()
          )
      )
    );

  drop policy if exists access_permisos_roles_delete on public.permisos_roles;
  create policy access_permisos_roles_delete on public.permisos_roles
    for delete using (
      exists (
        select 1
        from public.roles r
        where r.id = permisos_roles.rol_id
          and (
            public.usuario_es_admin_empresa(r.empresa_id)
            or public.usuario_es_superadmin_plataforma()
          )
      )
    );

  select pg_notify('pgrst', 'reload schema');
