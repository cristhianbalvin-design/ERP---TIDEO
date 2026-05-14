-- TIDEO ERP - Hardening funciones RLS del superadmin.
-- Ambas funciones verificaban es_superadmin = true sin validar que la membresía
-- del usuario sea en el tenant de plataforma. Un rol con es_superadmin=true creado
-- en un tenant cliente podía bypassear RLS y leer/escribir datos de todos los tenants.
-- Fix: exigir que la empresa de la membresía tenga es_plataforma = true.

-- Fix 1: usuario_es_superadmin_plataforma()
create or replace function public.usuario_es_superadmin_plataforma()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios_empresas ue
    join public.roles   r on r.id = ue.rol_id
    join public.empresas e on e.id = ue.empresa_id
    where ue.user_id  = auth.uid()
      and ue.estado   = 'activo'
      and r.es_superadmin  = true
      and e.es_plataforma  = true
  );
$$;

-- Fix 2: usuario_tiene_empresa()
-- El bloque OR de bypass solo aplica cuando la membresía superadmin es en el tenant de plataforma.
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
    where ue.user_id    = auth.uid()
      and ue.empresa_id = target_empresa_id
      and ue.estado     = 'activo'
  )
  or exists (
    select 1
    from public.usuarios_empresas ue
    join public.roles   r on r.id = ue.rol_id
    join public.empresas e on e.id = ue.empresa_id
    where ue.user_id = auth.uid()
      and ue.estado  = 'activo'
      and r.es_superadmin = true
      and e.es_plataforma = true
  );
$$;

select pg_notify('pgrst', 'reload schema');
