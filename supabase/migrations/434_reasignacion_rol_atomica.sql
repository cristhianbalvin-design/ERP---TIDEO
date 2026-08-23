-- La reasignacion de rol no es una edicion de ficha: debe conservar la jerarquia,
-- la posicion y el alcance societario existentes del colaborador.

create or replace function public.sync_usuario_asignacion_principal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol record;
  v_jefe_cambio boolean := true;
begin
  select id, categoria, nivel_jerarquico
  into v_rol
  from public.roles
  where id = new.rol_id
  limit 1;

  if tg_op = 'UPDATE' then
    v_jefe_cambio := new.jefe_user_id is distinct from old.jefe_user_id;
  end if;

  if new.estado = 'activo' then
    -- usuarios_empresas no conoce el alcance ni la posicion. Por eso nunca debe
    -- restablecerlos al sincronizar un rol; solo propaga una jefatura cuando esta
    -- fue modificada explicitamente desde la ficha del usuario.
    update public.usuarios_asignaciones
    set
      rol_id = new.rol_id,
      categoria = coalesce(nullif(v_rol.categoria, ''), 'otro'),
      nivel_jerarquico = coalesce(nullif(v_rol.nivel_jerarquico, ''), 'operativo'),
      jefe_user_id = case when v_jefe_cambio then new.jefe_user_id else jefe_user_id end,
      principal = true,
      activo = true,
      fecha_fin = null,
      updated_at = now()
    where empresa_id = new.empresa_id
      and user_id = new.user_id
      and principal = true;

    if not found then
      insert into public.usuarios_asignaciones (
        empresa_id, user_id, rol_id, categoria, nivel_jerarquico, jefe_user_id,
        alcance_tipo, principal, activo
      )
      values (
        new.empresa_id, new.user_id, new.rol_id,
        coalesce(nullif(v_rol.categoria, ''), 'otro'),
        coalesce(nullif(v_rol.nivel_jerarquico, ''), 'operativo'),
        new.jefe_user_id,
        'tenant', true, true
      );
    end if;
  else
    update public.usuarios_asignaciones
    set activo = false, fecha_fin = coalesce(fecha_fin, current_date), updated_at = now()
    where empresa_id = new.empresa_id
      and user_id = new.user_id
      and principal = true;
  end if;

  return new;
end;
$$;

-- Esta funcion es exclusivamente interna: la Edge Function autentica y autoriza
-- al actor antes de invocarla con service_role. El cambio y su auditoria quedan
-- en una sola transaccion de base de datos.
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

  -- La tabla usuarios es legado y solo se actualiza si su fila pertenece al
  -- mismo tenant; asi una membresia adicional no pisa el rol de otro tenant.
  update public.usuarios
  set rol = p_rol_id,
      updated_at = now()
  where id = p_user_id
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
