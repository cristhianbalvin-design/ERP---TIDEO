-- TIDEO ERP - Fase 5 Parte A: las asignaciones matriciales (no principales) usan Posicion
--
-- El modelo ya estaba preparado desde la fase 3: posiciones.origen_asignacion_id es una FK
-- generica a CUALQUIER fila de usuarios_asignaciones (no solo la principal), con indice unico
-- parcial ux_posiciones_origen_asignacion (300_posicion_asignacion_frontend.sql). Faltaba la
-- capa de orquestacion para matriciales: posicion_guardar_asignaciones_extra.
--
-- Diseno critico a preservar si se toca esto en el futuro: el codigo legado de matriciales
-- (aun vivo en los edge functions, ver saveFunctionalAssignments) desactiva TODAS las filas
-- no-principales activas del usuario y reinserta como NUEVAS todas las que vengan en el
-- guardado -- un patron "borrar todo y recrear todo", no un diff/patch. Si simplemente
-- vinculamos cada fila nueva a una posicion sin cuidado, CADA guardado del formulario cerraria
-- y reabriria en posiciones_usuarios TODAS las matriciales, incluidas las que no cambiaron
-- (ruido historico espurio). posicion_guardar_asignaciones_extra evita esto haciendo detach de
-- las filas viejas ANTES de desactivarlas (para que el trigger legado no las cierre el solo) y
-- cerrando unicamente, al final, las posiciones que de verdad salieron del set.

-- resolver_jefe_desde_posicion ahora excluye auto-jefatura: nada impedia antes que alguien
-- terminara siendo su propio jefe_user_id derivado si ocupa la posicion padre de su propia
-- posicion. p_user_id es opcional (default null = comportamiento identico al de antes) para no
-- romper ningun otro caller.
drop function if exists public.resolver_jefe_desde_posicion(uuid);

create or replace function public.resolver_jefe_desde_posicion(p_posicion_id uuid, p_user_id uuid default null)
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
    and (p_user_id is null or pu.user_id <> p_user_id)
  order by pu.fecha_inicio asc
  limit 1;
$$;

-- posicion_guardar_asignacion_principal: sin cambios de comportamiento salvo pasar p_user_id
-- al resolver de jefe (misma correccion de auto-jefatura que arriba).
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
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  v_jefe_user_id := public.resolver_jefe_desde_posicion(p_posicion_id, p_user_id);

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

-- posicion_guardar_asignaciones_extra: unico punto de entrada desde los edge functions para
-- las asignaciones matriciales. p_extras es un array jsonb de
-- {rol_id, categoria, nivel_jerarquico, posicion_id} (categoria/nivel_jerarquico ya resueltos
-- en JS desde la tabla roles, igual que siempre).
--
-- Limitacion conocida, no resuelta aqui: origen_asignacion_id es unico por posicion. Si dos
-- usuarios distintos tienen sendas matriciales apuntando a la MISMA posicion compartida, cada
-- guardado de cualquiera de los dos sobreescribe cual asignacion es la "duena" de esa posicion
-- para el trigger legado (no afecta posiciones_usuarios, que si soporta multiples ocupantes
-- reales via estado 'parcial'). Ya existia conceptualmente desde la asignacion principal; se
-- vuelve mas probable aqui porque compartir una posicion es el caso normal de las matriciales.
create or replace function public.posicion_guardar_asignaciones_extra(
  p_empresa_id text,
  p_user_id uuid,
  p_extras jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old record;
  v_item record;
  v_jefe_user_id uuid;
  v_nuevo_id uuid;
  v_old_posicion_ids uuid[] := '{}';
  v_new_posicion_ids uuid[] := '{}';
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  if exists (
    select 1 from jsonb_to_recordset(p_extras) as x(posicion_id uuid)
    group by posicion_id having count(*) > 1
  ) then
    raise exception 'No se puede repetir la misma posicion en varias asignaciones matriciales.';
  end if;

  -- Capturar el set viejo (asignacion_id, posicion_id) ANTES de mutar nada, y desvincular cada
  -- una (detach) antes de desactivarla: si no se hace, el trigger legado (que dispara tambien
  -- en el update activo=false) cerraria de una las posiciones que en realidad se mantienen sin
  -- cambios, generando ruido historico espurio.
  for v_old in
    select ua.id as asignacion_id, p.id as posicion_id
    from public.usuarios_asignaciones ua
    join public.posiciones p on p.origen_asignacion_id = ua.id
    where ua.empresa_id = p_empresa_id and ua.user_id = p_user_id
      and ua.principal = false and ua.activo = true
  loop
    v_old_posicion_ids := array_append(v_old_posicion_ids, v_old.posicion_id);
    perform public.posicion_detach_origen(v_old.asignacion_id);
  end loop;

  update public.usuarios_asignaciones
  set activo = false, fecha_fin = current_date, updated_at = now()
  where empresa_id = p_empresa_id and user_id = p_user_id
    and principal = false and activo = true;

  for v_item in
    select * from jsonb_to_recordset(p_extras)
      as x(rol_id text, categoria text, nivel_jerarquico text, posicion_id uuid)
  loop
    v_jefe_user_id := public.resolver_jefe_desde_posicion(v_item.posicion_id, p_user_id);

    insert into public.usuarios_asignaciones(
      empresa_id, user_id, rol_id, categoria, nivel_jerarquico, jefe_user_id,
      alcance_tipo, alcance_id, principal, activo, fecha_fin, updated_at
    ) values (
      p_empresa_id, p_user_id, v_item.rol_id, v_item.categoria, v_item.nivel_jerarquico,
      v_jefe_user_id, 'tenant', null, false, true, null, now()
    )
    returning id into v_nuevo_id;

    -- p_posicion_anterior_id = null a proposito: el cierre de posiciones removidas se hace una
    -- sola vez, mas abajo, por diferencia de sets -- no aqui fila por fila.
    perform public.posicion_asignar_usuario(
      p_empresa_id, p_user_id, v_item.posicion_id, v_nuevo_id, null
    );
    v_new_posicion_ids := array_append(v_new_posicion_ids, v_item.posicion_id);
  end loop;

  -- Unico mecanismo real de cierre: las posiciones del set viejo que no siguen en el set nuevo.
  update public.posiciones_usuarios
  set fecha_fin = current_date, updated_at = now()
  where empresa_id = p_empresa_id and user_id = p_user_id and fecha_fin is null
    and posicion_id = any(v_old_posicion_ids)
    and not (posicion_id = any(v_new_posicion_ids));
end;
$$;

-- Mismo criterio de seguridad que el resto de funciones de 300_posicion_asignacion_frontend.sql:
-- no repiten validaciones de permiso/tenant (eso ya lo hace el edge function antes de llamar),
-- asi que se revoca EXECUTE de PUBLIC y se otorga solo a service_role.
revoke execute on function public.resolver_jefe_desde_posicion(uuid, uuid) from public;
revoke execute on function public.posicion_guardar_asignaciones_extra(text, uuid, jsonb) from public;

grant execute on function public.resolver_jefe_desde_posicion(uuid, uuid) to service_role;
grant execute on function public.posicion_guardar_asignaciones_extra(text, uuid, jsonb) to service_role;

select pg_notify('pgrst', 'reload schema');
