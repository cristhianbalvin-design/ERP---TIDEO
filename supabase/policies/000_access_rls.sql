-- TIDEO ERP - Politicas RLS para acceso y auditoria.
-- Este archivo corre antes de las policies de negocio porque usuarios_empresas
-- participa en la funcion usuario_tiene_empresa().

alter table public.roles enable row level security;
alter table public.usuarios_empresas enable row level security;
alter table public.auditoria enable row level security;

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

create or replace function public.usuario_es_admin_empresa(target_empresa_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios_empresas ue
    join public.roles r on r.id = ue.rol_id
    where ue.user_id = auth.uid()
      and ue.empresa_id = target_empresa_id
      and ue.estado = 'activo'
      and (r.es_admin_empresa = true or r.es_superadmin = true)
  );
$$;

create policy access_roles_tenant on public.roles
  for all using (
    empresa_id is null or public.usuario_tiene_empresa(empresa_id)
  )
  with check (
    empresa_id is null or public.usuario_tiene_empresa(empresa_id)
  );

create policy access_usuarios_empresas_self on public.usuarios_empresas
  for select using (
    user_id = auth.uid() or public.usuario_tiene_empresa(empresa_id)
  );

create policy access_usuarios_empresas_manage on public.usuarios_empresas
  for insert with check (
    public.usuario_es_admin_empresa(empresa_id)
  );

create policy access_usuarios_empresas_update on public.usuarios_empresas
  for update using (
    public.usuario_es_admin_empresa(empresa_id)
  )
  with check (
    public.usuario_es_admin_empresa(empresa_id)
  );

create policy access_auditoria_tenant on public.auditoria
  for select using (
    empresa_id is null or public.usuario_tiene_empresa(empresa_id)
  );

create policy access_auditoria_insert on public.auditoria
  for insert with check (
    empresa_id is null or public.usuario_tiene_empresa(empresa_id)
  );
