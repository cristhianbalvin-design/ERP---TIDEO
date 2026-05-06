-- RPC SECURITY DEFINER para obtener las membresías del usuario actual.
-- Bypasa RLS directamente usando auth.uid() en contexto de superusuario.
create or replace function public.get_mis_membresias()
returns table(empresa_id text, rol_id text, acceso_campo boolean, perfil_campo text)
language sql
security definer
stable
set search_path = public
as $$
  with superadmin_role as (
    select ue.rol_id
    from public.usuarios_empresas ue
    join public.roles r on r.id = ue.rol_id
    where ue.user_id = auth.uid()
      and ue.estado = 'activo'
      and r.es_superadmin = true
    limit 1
  )
  select e.id as empresa_id, s.rol_id, true as acceso_campo, 'plataforma'::text as perfil_campo
  from public.empresas e
  cross join superadmin_role s
  where e.estado in ('activa', 'activo', 'demo')
  
  union
  
  select ue.empresa_id, ue.rol_id, ue.acceso_campo, ue.perfil_campo
  from public.usuarios_empresas ue
  where ue.user_id = auth.uid()
    and ue.estado = 'activo'
    and not exists (select 1 from superadmin_role);
$$;

-- Compatibilidad con clientes que aun envian p_user_id. Por seguridad se ignora
-- el parametro y siempre se usa auth.uid().
create or replace function public.get_mis_membresias(p_user_id uuid)
returns table(empresa_id text, rol_id text, acceso_campo boolean, perfil_campo text)
language sql
security definer
stable
set search_path = public
as $$
  with superadmin_role as (
    select ue.rol_id
    from public.usuarios_empresas ue
    join public.roles r on r.id = ue.rol_id
    where ue.user_id = auth.uid()
      and ue.estado = 'activo'
      and r.es_superadmin = true
    limit 1
  )
  select e.id as empresa_id, s.rol_id, true as acceso_campo, 'plataforma'::text as perfil_campo
  from public.empresas e
  cross join superadmin_role s
  where e.estado in ('activa', 'activo', 'demo')
  
  union
  
  select ue.empresa_id, ue.rol_id, ue.acceso_campo, ue.perfil_campo
  from public.usuarios_empresas ue
  where ue.user_id = auth.uid()
    and ue.estado = 'activo'
    and not exists (select 1 from superadmin_role);
$$;

select pg_notify('pgrst', 'reload schema');
