-- TIDEO ERP - Hardening función usuario_es_admin_empresa().
-- La versión anterior aceptaba es_superadmin = true como condición equivalente
-- a es_admin_empresa, sin validar que el superadmin sea del tenant de plataforma.
-- Fix: la función solo evalúa si el usuario es admin de la empresa específica.
-- El acceso del superadmin de plataforma ya está cubierto por usuario_tiene_empresa()
-- (que tiene su propio bypass con validación es_plataforma = true desde migración 064).

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
    where ue.user_id    = auth.uid()
      and ue.empresa_id = target_empresa_id
      and ue.estado     = 'activo'
      and r.es_admin_empresa = true
  )
  or public.usuario_es_superadmin_plataforma();
$$;

select pg_notify('pgrst', 'reload schema');
