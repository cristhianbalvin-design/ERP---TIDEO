-- TIDEO ERP - Fase 3: el frontend asigna Posiciones directamente
--
-- El trigger legado trg_usuarios_asignaciones_sync_posicion (297_jerarquia_posiciones_rls.sql)
-- sigue activo: seguimos escribiendo jefe_user_id/categoria en usuarios_asignaciones porque
-- hay consumidores vivos fuera de este alcance (desempeno_es_jefe_directo en
-- 151_evaluaciones_desempeno.sql, notificaciones en 224_rrhh_ola2_gap05_contratos_bloqueo.sql).
-- Pero ese trigger, ante un cambio de puesto, muta la posicion existente in-place en vez de
-- cerrar la ocupacion vieja y abrir una nueva. Las funciones de abajo permiten que el frontend
-- fije un posicion_id explicito sin que el trigger legado corrompa una posicion real:
--
--   1. resolver_jefe_desde_posicion: dado un posicion_id, deriva quien es el jefe (ocupante
--      activo de reporta_a_posicion_id) para seguir alimentando jefe_user_id.
--   2. posicion_detach_origen: antes de tocar una fila existente de usuarios_asignaciones,
--      desvincula la posicion real que tuviera enganchada (origen_asignacion_id = null) para
--      que el trigger legado, al disparar, no la encuentre y por lo tanto no la mute in-place
--      -- en cambio crea una posicion "fantasma" desechable, que limpiamos despues.
--   3. posicion_asignar_usuario: despues del insert/update, borra el fantasma (si lo hubo,
--      siempre recien creado en la misma transaccion, nunca una posicion real), cierra
--      unicamente la ocupacion anterior puntual (no todas las del usuario, para no romper
--      asignaciones matriciales independientes) y abre la nueva.
--   4. posicion_guardar_asignacion_principal: orquestador, unico punto de entrada desde los
--      edge functions (una sola llamada rpc = una transaccion Postgres = atomico). Sin esto,
--      llamadas rpc separadas desde el edge function no comparten transaccion y dejarian
--      ventanas de inconsistencia si el edge function falla a mitad de camino.

create or replace function public.resolver_jefe_desde_posicion(p_posicion_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select pu.user_id
  from public.posiciones p
  join public.posiciones_usuarios pu
    on pu.posicion_id = p.reporta_a_posicion_id and pu.fecha_fin is null
  where p.id = p_posicion_id
  order by pu.fecha_inicio asc
  limit 1;
$$;

create or replace function public.posicion_detach_origen(p_asignacion_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pos_id uuid;
begin
  select id into v_pos_id from public.posiciones where origen_asignacion_id = p_asignacion_id;

  if v_pos_id is not null then
    update public.posiciones
    set origen_asignacion_id = null, updated_at = now()
    where id = v_pos_id;
  end if;

  return v_pos_id;
end;
$$;

create or replace function public.posicion_asignar_usuario(
  p_empresa_id text,
  p_user_id uuid,
  p_posicion_id uuid,
  p_asignacion_id uuid,
  p_posicion_anterior_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fantasma_id uuid;
begin
  -- El fantasma (si existe) fue creado por el trigger legado en esta misma transaccion, al no
  -- encontrar la posicion real (ya desvinculada via posicion_detach_origen). Nunca puede ser
  -- una posicion preexistente real, porque esas ya fueron desvinculadas antes del insert/update.
  select id into v_fantasma_id
  from public.posiciones
  where origen_asignacion_id = p_asignacion_id
    and id <> p_posicion_id;

  if v_fantasma_id is not null then
    delete from public.posiciones_usuarios where posicion_id = v_fantasma_id;
    delete from public.posiciones where id = v_fantasma_id;
  end if;

  if p_posicion_anterior_id is not null and p_posicion_anterior_id <> p_posicion_id then
    update public.posiciones_usuarios
    set fecha_fin = current_date, updated_at = now()
    where posicion_id = p_posicion_anterior_id
      and user_id = p_user_id
      and fecha_fin is null;
  end if;

  insert into public.posiciones_usuarios(empresa_id, posicion_id, user_id, fecha_inicio)
  values (p_empresa_id, p_posicion_id, p_user_id, current_date)
  on conflict (posicion_id, user_id) where fecha_fin is null do nothing;

  update public.posiciones
  set origen_asignacion_id = p_asignacion_id, updated_at = now()
  where id = p_posicion_id
    and origen_asignacion_id is distinct from p_asignacion_id;
end;
$$;

create or replace function public.posicion_guardar_asignacion_principal(
  p_asignacion_id uuid,
  p_empresa_id text,
  p_user_id uuid,
  p_rol_id text,
  p_categoria text,
  p_nivel_jerarquico text,
  p_posicion_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asignacion_id uuid := p_asignacion_id;
  v_pos_anterior_id uuid;
  v_jefe_user_id uuid;
begin
  -- Serializa cambios de posicion concurrentes del mismo usuario: sin este lock, dos ediciones
  -- simultaneas moviendolo a posiciones distintas podrian dejarlo activo en ambas.
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  v_jefe_user_id := public.resolver_jefe_desde_posicion(p_posicion_id);

  if v_asignacion_id is not null then
    v_pos_anterior_id := public.posicion_detach_origen(v_asignacion_id);

    update public.usuarios_asignaciones
    set rol_id = p_rol_id,
        categoria = p_categoria,
        nivel_jerarquico = p_nivel_jerarquico,
        jefe_user_id = v_jefe_user_id,
        alcance_tipo = 'tenant',
        alcance_id = null,
        principal = true,
        activo = true,
        fecha_fin = null,
        updated_at = now()
    where id = v_asignacion_id;
  else
    insert into public.usuarios_asignaciones(
      empresa_id, user_id, rol_id, categoria, nivel_jerarquico, jefe_user_id,
      alcance_tipo, alcance_id, principal, activo, fecha_fin, updated_at
    ) values (
      p_empresa_id, p_user_id, p_rol_id, p_categoria, p_nivel_jerarquico, v_jefe_user_id,
      'tenant', null, true, true, null, now()
    )
    returning id into v_asignacion_id;
  end if;

  perform public.posicion_asignar_usuario(
    p_empresa_id, p_user_id, p_posicion_id, v_asignacion_id, v_pos_anterior_id
  );

  return jsonb_build_object('asignacion_id', v_asignacion_id, 'jefe_user_id', v_jefe_user_id);
end;
$$;

-- Red de seguridad: hoy el invariante "una asignacion origina a lo sumo una posicion" solo lo
-- respeta la convencion del trigger legado; lo hacemos explicito. Si hubiera duplicados
-- preexistentes, la migracion falla con un mensaje claro en vez de aplicar el indice a ciegas.
do $$
begin
  if exists (
    select 1 from public.posiciones
    where origen_asignacion_id is not null
    group by origen_asignacion_id
    having count(*) > 1
  ) then
    raise exception 'Hay posiciones duplicadas para el mismo origen_asignacion_id: limpiar antes de aplicar el indice unico.';
  end if;
end;
$$;

create unique index if not exists ux_posiciones_origen_asignacion
  on public.posiciones(origen_asignacion_id)
  where origen_asignacion_id is not null;

-- Estas 4 funciones NO repiten las validaciones de permiso/tenant que ya hace el edge function
-- (rol pertenece al tenant, posicion pertenece al tenant, etc.) y mueven historial de
-- CUALQUIER usuario del tenant: a diferencia del resto de funciones SECURITY DEFINER del repo
-- (que se autoprotegen re-chequeando auth.uid()/usuario_puede(...)), estas confian en que el
-- caller ya valido todo antes. Postgres/PostgREST exponen EXECUTE a PUBLIC por defecto, asi que
-- se revoca explicitamente y se otorga solo a service_role (usado por los edge functions).
revoke execute on function public.resolver_jefe_desde_posicion(uuid) from public;
revoke execute on function public.posicion_detach_origen(uuid) from public;
revoke execute on function public.posicion_asignar_usuario(text, uuid, uuid, uuid, uuid) from public;
revoke execute on function public.posicion_guardar_asignacion_principal(uuid, text, uuid, text, text, text, uuid) from public;

grant execute on function public.posicion_guardar_asignacion_principal(uuid, text, uuid, text, text, text, uuid) to service_role;

select pg_notify('pgrst', 'reload schema');
