-- Entrega al frontend una fotografia completa y autorizada de los permisos
-- del rol efectivo de la membresia activa. Evita depender de SELECT directo
-- sobre permisos_roles, que puede verse recortado por RLS.
create or replace function public.get_mis_permisos_efectivos(p_empresa_id text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_rol_id text;
  v_permisos jsonb;
begin
  if auth.uid() is null then
    raise exception 'Sesion no autenticada';
  end if;

  select membresia.rol_id
    into v_rol_id
  from public.get_mis_membresias() as membresia
  where membresia.empresa_id = p_empresa_id
  limit 1;

  if v_rol_id is null then
    raise exception 'No tienes acceso a esta empresa';
  end if;

  select coalesce(jsonb_agg(to_jsonb(permiso) order by permiso.pantalla), '[]'::jsonb)
    into v_permisos
  from public.permisos_roles as permiso
  where permiso.rol_id = v_rol_id;

  return jsonb_build_object(
    'rol_id', v_rol_id,
    'permisos', v_permisos
  );
end;
$$;

revoke all on function public.get_mis_permisos_efectivos(text) from public;
revoke all on function public.get_mis_permisos_efectivos(text) from anon;
grant execute on function public.get_mis_permisos_efectivos(text) to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');
