-- usuarios.id conserva el tipo text por compatibilidad historica, mientras que
-- usuarios_empresas.user_id y usuarios_asignaciones.user_id son uuid.
-- La operacion atomica debe convertir explicitamente al sincronizar el legado.

create or replace function public.reasignar_rol_usuario(
  p_empresa_id text,
  p_user_id uuid,
  p_rol_id text,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membresia public.usuarios_empresas%rowtype;
  v_rol public.roles%rowtype;
  v_asignaciones jsonb;
begin
  select *
  into v_membresia
  from public.usuarios_empresas
  where empresa_id = p_empresa_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception 'El usuario no pertenece al tenant seleccionado.';
  end if;

  select *
  into v_rol
  from public.roles
  where id = p_rol_id
    and empresa_id = p_empresa_id
    and activo = true;

  if not found then
    raise exception 'El rol seleccionado no existe, no pertenece al tenant o esta inactivo.';
  end if;

  update public.usuarios_empresas
  set rol_id = p_rol_id,
      updated_at = now()
  where empresa_id = p_empresa_id
    and user_id = p_user_id;

  update public.usuarios
  set rol = p_rol_id,
      updated_at = now()
  where id = p_user_id::text
    and empresa_id = p_empresa_id;

  insert into public.auditoria (
    empresa_id, user_id, modulo, entidad, entidad_id, accion, valor_anterior, valor_nuevo
  )
  values (
    p_empresa_id,
    p_actor_id,
    'usuarios',
    'usuarios_empresas',
    p_user_id::text,
    'reasignar_rol',
    jsonb_build_object('rol_id', v_membresia.rol_id),
    jsonb_build_object('rol_id', p_rol_id)
  );

  select coalesce(jsonb_agg(to_jsonb(ua) order by ua.principal desc, ua.created_at), '[]'::jsonb)
  into v_asignaciones
  from public.usuarios_asignaciones ua
  where ua.empresa_id = p_empresa_id
    and ua.user_id = p_user_id
    and ua.activo = true;

  return jsonb_build_object(
    'rol_id', p_rol_id,
    'rol_nombre', v_rol.nombre,
    'rol_categoria', v_rol.categoria,
    'nivel_jerarquico', v_rol.nivel_jerarquico,
    'asignaciones', v_asignaciones
  );
end;
$$;

revoke all on function public.reasignar_rol_usuario(text, uuid, text, uuid) from public;
revoke all on function public.reasignar_rol_usuario(text, uuid, text, uuid) from anon;
revoke all on function public.reasignar_rol_usuario(text, uuid, text, uuid) from authenticated;
grant execute on function public.reasignar_rol_usuario(text, uuid, text, uuid) to service_role;

select pg_notify('pgrst', 'reload schema');
