-- Permite que superadmins de plataforma eliminen empresas.
create policy platform_empresas_delete on public.empresas
  for delete using (public.usuario_es_superadmin_plataforma());
