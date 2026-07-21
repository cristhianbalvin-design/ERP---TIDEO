-- Reasignación segura de la jerarquía organizacional entre posiciones.
-- La fuente de verdad del árbol es posiciones.reporta_a_posicion_id. El
-- jefe_user_id se conserva únicamente como dato derivado de compatibilidad.

create or replace function public.reasignar_padre_posicion(
  p_posicion_id uuid,
  p_reporta_a_posicion_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_posicion public.posiciones%rowtype;
  v_padre public.posiciones%rowtype;
  v_hay_ciclo boolean := false;
begin
  select * into v_posicion
  from public.posiciones
  where id = p_posicion_id
  for update;

  if not found then
    raise exception 'La posición a reorganizar no existe.';
  end if;

  if not public.usuario_tiene_empresa(v_posicion.empresa_id)
     or not public.usuario_puede(v_posicion.empresa_id, 'maestros', 'editar') then
    raise exception 'No tienes permiso para reorganizar posiciones de esta empresa.';
  end if;

  -- Serializa las reorganizaciones de un tenant para impedir ciclos por concurrencia.
  perform pg_advisory_xact_lock(hashtext('jerarquia_posiciones:' || v_posicion.empresa_id));

  if p_reporta_a_posicion_id is not null then
    if p_reporta_a_posicion_id = p_posicion_id then
      raise exception 'Una posición no puede reportarse a sí misma.';
    end if;

    select * into v_padre
    from public.posiciones
    where id = p_reporta_a_posicion_id
    for update;

    if not found then
      raise exception 'La posición padre seleccionada no existe.';
    end if;

    if v_padre.empresa_id <> v_posicion.empresa_id then
      raise exception 'La posición padre debe pertenecer a la misma empresa.';
    end if;

    with recursive ancestros as (
      select p.id, p.reporta_a_posicion_id, array[p.id] as recorrido
      from public.posiciones p
      where p.id = p_reporta_a_posicion_id

      union all

      select p.id, p.reporta_a_posicion_id, a.recorrido || p.id
      from public.posiciones p
      join ancestros a on p.id = a.reporta_a_posicion_id
      where not p.id = any(a.recorrido)
    )
    select exists (
      select 1 from ancestros where id = p_posicion_id
    ) into v_hay_ciclo;

    if v_hay_ciclo then
      raise exception 'La posición padre seleccionada generaría un ciclo en la jerarquía.';
    end if;
  end if;

  update public.posiciones
  set reporta_a_posicion_id = p_reporta_a_posicion_id,
      updated_at = now()
  where id = p_posicion_id
  returning * into v_posicion;

  -- Compatibilidad: sincroniza el jefe legado únicamente de la asignación que
  -- originó esta posición; el árbol nunca depende de este campo.
  if v_posicion.origen_asignacion_id is not null then
    update public.usuarios_asignaciones ua
    set jefe_user_id = public.resolver_jefe_desde_posicion(v_posicion.id, ua.user_id),
        updated_at = now()
    where ua.id = v_posicion.origen_asignacion_id
      and ua.activo is true;
  end if;

  return jsonb_build_object(
    'id', v_posicion.id,
    'empresa_id', v_posicion.empresa_id,
    'reporta_a_posicion_id', v_posicion.reporta_a_posicion_id
  );
end;
$$;

revoke all on function public.reasignar_padre_posicion(uuid, uuid) from public;
grant execute on function public.reasignar_padre_posicion(uuid, uuid) to authenticated;
grant execute on function public.reasignar_padre_posicion(uuid, uuid) to service_role;

select pg_notify('pgrst', 'reload schema');
