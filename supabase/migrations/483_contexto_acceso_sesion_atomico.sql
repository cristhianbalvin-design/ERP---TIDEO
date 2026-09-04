-- Devuelve en una sola lectura autorizada el rol efectivo y sus permisos.
-- El frontend no debe inferir privilegios administrativos cuando falten datos.

create or replace function public.get_mis_permisos_efectivos(p_empresa_id text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_rol_id text;
  v_rol jsonb;
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

  select jsonb_build_object(
      'id', r.id,
      'empresa_id', r.empresa_id,
      'nombre', r.nombre,
      'descripcion', r.descripcion,
      'categoria', r.categoria,
      'nivel_jerarquico', r.nivel_jerarquico,
      'es_admin_empresa', r.es_admin_empresa,
      'es_superadmin', r.es_superadmin,
      'activo', r.activo
    )
    into v_rol
  from public.roles as r
  where r.id = v_rol_id
    and (
      r.empresa_id = p_empresa_id
      or r.empresa_id is null
      or (r.es_superadmin = true and public.usuario_es_superadmin_plataforma())
    )
    and r.activo = true;

  if v_rol is null then
    raise exception 'El rol asignado no existe, esta inactivo o no pertenece a la empresa';
  end if;

  select coalesce(jsonb_agg(to_jsonb(permiso) order by permiso.pantalla), '[]'::jsonb)
    into v_permisos
  from public.permisos_roles as permiso
  where permiso.rol_id = v_rol_id;

  return jsonb_build_object(
    'empresa_id', p_empresa_id,
    'rol_id', v_rol_id,
    'rol', v_rol,
    'permisos', v_permisos
  );
end;
$$;

revoke all on function public.get_mis_permisos_efectivos(text) from public;
revoke all on function public.get_mis_permisos_efectivos(text) from anon;
grant execute on function public.get_mis_permisos_efectivos(text) to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');
