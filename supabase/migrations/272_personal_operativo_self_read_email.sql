drop policy if exists rrhh_operativo_select on public.personal_operativo;
create policy rrhh_operativo_select on public.personal_operativo
  for select using (
    public.usuario_tiene_empresa(empresa_id)
    and (
      public.usuario_puede(empresa_id, 'rrhh_operativo', 'ver')
      or public.usuario_puede(empresa_id, 'personal_operativo', 'ver')
      or public.usuario_puede(empresa_id, 'planner', 'ver')
      or (
        auth.uid() is not null
        and (
          auth_user_id = auth.uid()
          or (
            nullif(trim(email), '') is not null
            and lower(trim(email)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
          )
          or (
            nullif(trim(email_personal), '') is not null
            and lower(trim(email_personal)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
          )
        )
      )
    )
  );

select pg_notify('pgrst', 'reload schema');
