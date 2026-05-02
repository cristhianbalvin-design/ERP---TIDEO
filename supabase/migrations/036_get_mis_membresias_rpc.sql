-- RPC SECURITY DEFINER para obtener las membresías del usuario actual.
-- Bypasa RLS directamente usando auth.uid() en contexto de superusuario.
create or replace function public.get_mis_membresias()
returns table(empresa_id text, rol_id text, acceso_campo boolean, perfil_campo text)
language sql
security definer
stable
set search_path = public
as $$
  select ue.empresa_id, ue.rol_id, ue.acceso_campo, ue.perfil_campo
  from public.usuarios_empresas ue
  where ue.user_id = auth.uid()
    and ue.estado = 'activo';
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
  select ue.empresa_id, ue.rol_id, ue.acceso_campo, ue.perfil_campo
  from public.usuarios_empresas ue
  where ue.user_id = auth.uid()
    and ue.estado = 'activo';
$$;

select pg_notify('pgrst', 'reload schema');
