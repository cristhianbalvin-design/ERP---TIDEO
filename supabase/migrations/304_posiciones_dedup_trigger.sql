-- TIDEO ERP - Corrige la causa raiz #2 de posiciones duplicadas: el trigger de
-- retrocompatibilidad sincronizar_posicion_desde_asignacion (297_jerarquia_posiciones_rls.sql)
-- creaba una Posicion nueva por cada fila de usuarios_asignaciones que aun no tuviera una
-- posicion propia (via origen_asignacion_id), sin verificar si la MISMA persona ya ocupaba una
-- posicion activa con la misma unidad organizacional y el mismo jefe resultante -- el caso tipico
-- es alguien con asignacion principal + una o mas matriciales que en la practica describen el
-- mismo puesto (misma categoria/unidad, mismo jefe).
--
-- Esto no depende de cargos_empresa.modo_gestion (303): el trigger legado no conoce el cargo de
-- la asignacion vieja, solo categoria/jefe_user_id. La deduplicacion aqui es por
-- persona + unidad + jefe, siempre, sin importar el cargo.
--
-- Rama de creacion: antes de insertar una Posicion nueva, busca si el usuario ya tiene una
-- posicion activa (via posiciones_usuarios) con la misma unidad_organizacional_id y el mismo
-- reporta_a_posicion_id resuelto. Si existe, se reutiliza (solo se asegura el vinculo en
-- posiciones_usuarios si faltara) y esta asignacion NO reclama origen_asignacion_id -- se queda
-- "sin posicion propia", lo cual es intencional y estable: la proxima vez que el trigger dispare
-- para esta misma fila (ej. cambio de jefe), volvera a re-evaluar la reutilizacion desde cero.
--
-- Rama de baja (activo=false): ademas de cerrar la posicion PROPIA de la asignacion (sin
-- cambios), ahora tambien cierra la ocupacion de una posicion REUTILIZADA -- pero solo si
-- ninguna OTRA asignacion activa del mismo usuario sigue resolviendo a esa misma unidad+jefe (si
-- otra la sigue necesitando, ej. la principal sigue activa mientras se da de baja una matricial
-- que apuntaba al mismo puesto, no se toca la ocupacion compartida).

create or replace function public.sincronizar_posicion_desde_asignacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uo_id text;
  v_jefe_pos_id uuid;
  v_pos_id uuid;
  v_reusar_pos_id uuid;
  r_pos record;
  v_aun_necesaria boolean;
begin
  if new.activo = false then
    -- Cierra la posicion PROPIA de esta asignacion (si la tiene, via origen_asignacion_id).
    update public.posiciones_usuarios pu
    set fecha_fin = current_date, updated_at = now()
    from public.posiciones p
    where p.id = pu.posicion_id
      and p.origen_asignacion_id = new.id
      and pu.fecha_fin is null;

    -- Ademas, si esta asignacion estaba REUTILIZANDO la posicion de otra asignacion del mismo
    -- usuario (ver rama de creacion mas abajo), cierra esa ocupacion compartida tambien -- solo
    -- si ninguna otra asignacion activa del usuario sigue resolviendo a la misma unidad+jefe.
    v_uo_id := public.resolver_unidad_organizacional(new.empresa_id, new.categoria);
    v_jefe_pos_id := case when new.jefe_user_id is not null
      then public.resolver_posicion_principal_jefe(new.empresa_id, new.jefe_user_id)
      else null end;

    for r_pos in
      select p.id
      from public.posiciones_usuarios pu
      join public.posiciones p on p.id = pu.posicion_id
      where pu.user_id = new.user_id
        and pu.empresa_id = new.empresa_id
        and pu.fecha_fin is null
        and p.unidad_organizacional_id = v_uo_id
        and p.reporta_a_posicion_id is not distinct from v_jefe_pos_id
    loop
      v_aun_necesaria := exists (
        select 1
        from public.usuarios_asignaciones otra
        where otra.empresa_id = new.empresa_id
          and otra.user_id = new.user_id
          and otra.activo = true
          and otra.id <> new.id
          and public.resolver_unidad_organizacional(otra.empresa_id, otra.categoria) = v_uo_id
          and (
            case when otra.jefe_user_id is not null
              then public.resolver_posicion_principal_jefe(otra.empresa_id, otra.jefe_user_id)
              else null end
          ) is not distinct from v_jefe_pos_id
      );

      if not v_aun_necesaria then
        update public.posiciones_usuarios
        set fecha_fin = current_date, updated_at = now()
        where posicion_id = r_pos.id and user_id = new.user_id and fecha_fin is null;
      end if;
    end loop;

    return new;
  end if;

  select id into v_pos_id from public.posiciones where origen_asignacion_id = new.id;
  v_uo_id := public.resolver_unidad_organizacional(new.empresa_id, new.categoria);
  v_jefe_pos_id := case when new.jefe_user_id is not null
    then public.resolver_posicion_principal_jefe(new.empresa_id, new.jefe_user_id)
    else null end;

  if v_pos_id is not null then
    -- Esta asignacion ya es dueña de una posicion propia: comportamiento sin cambios.
    update public.posiciones
    set unidad_organizacional_id = v_uo_id,
        reporta_a_posicion_id = v_jefe_pos_id,
        updated_at = now()
    where id = v_pos_id
      and (
        unidad_organizacional_id is distinct from v_uo_id
        or reporta_a_posicion_id is distinct from v_jefe_pos_id
      );

    if not exists (
      select 1 from public.posiciones_usuarios
      where posicion_id = v_pos_id and user_id = new.user_id and fecha_fin is null
    ) then
      insert into public.posiciones_usuarios(empresa_id, posicion_id, user_id, fecha_inicio)
      values (new.empresa_id, v_pos_id, new.user_id, current_date);
    end if;

    return new;
  end if;

  -- No tiene posicion propia todavia: antes de crear una, reutiliza una posicion activa que el
  -- MISMO usuario ya ocupe con la misma unidad organizacional y el mismo jefe resultante (evita
  -- el duplicado tipico de alguien con asignacion principal + matricial(es) del mismo puesto).
  select p.id into v_reusar_pos_id
  from public.posiciones_usuarios pu
  join public.posiciones p on p.id = pu.posicion_id
  where pu.user_id = new.user_id
    and pu.empresa_id = new.empresa_id
    and pu.fecha_fin is null
    and p.unidad_organizacional_id = v_uo_id
    and p.reporta_a_posicion_id is not distinct from v_jefe_pos_id
  limit 1;

  if v_reusar_pos_id is not null then
    if not exists (
      select 1 from public.posiciones_usuarios
      where posicion_id = v_reusar_pos_id and user_id = new.user_id and fecha_fin is null
    ) then
      insert into public.posiciones_usuarios(empresa_id, posicion_id, user_id, fecha_inicio)
      values (new.empresa_id, v_reusar_pos_id, new.user_id, current_date);
    end if;
    return new;
  end if;

  insert into public.posiciones(empresa_id, unidad_organizacional_id, reporta_a_posicion_id, origen_asignacion_id)
  values (new.empresa_id, v_uo_id, v_jefe_pos_id, new.id)
  returning id into v_pos_id;

  insert into public.posiciones_usuarios(empresa_id, posicion_id, user_id, fecha_inicio)
  values (new.empresa_id, v_pos_id, new.user_id, current_date);

  return new;
end;
$$;

select pg_notify('pgrst', 'reload schema');
