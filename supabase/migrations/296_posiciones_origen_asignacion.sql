-- TIDEO ERP - Trazabilidad posicion <-> asignacion de origen (Fase 2, previo al sync)
--
-- El backfill de la Fase 1 (294) no dejo registro de que fila de usuarios_asignaciones
-- origino cada posicion. Para la mayoria de usuarios (una sola asignacion activa) no hace
-- falta: la posicion es obvia. Pero un usuario con asignacion principal + matricial(es)
-- activas puede tener varias posiciones, y si dos de esas asignaciones comparten la misma
-- categoria (y por lo tanto la misma unidad organizacional), no hay forma de saber desde
-- afuera cual posicion corresponde a cual asignacion. Esto es necesario para que un futuro
-- trigger de sincronizacion (cuando cambie jefe_user_id en usuarios_asignaciones) sepa
-- exactamente que posicion actualizar.
--
-- Estrategia de emparejamiento, por cada asignacion activa:
--   1. Candidatas = posiciones activas del mismo usuario, en la unidad organizacional cuyo
--      nombre coincide con la categoria de la asignacion, aun no reclamadas por otra.
--   2. Si hay exactamente 1 candidata, se asigna directo.
--   3. Si hay mas de 1 (categoria repetida entre asignaciones del mismo usuario), se
--      desempata exigiendo que el ocupante actual de reporta_a_posicion_id coincida con el
--      jefe_user_id de esa asignacion especifica (o que ambos sean null).
--   4. Si sigue sin resolver, se reporta en _reporte_backfill_posiciones para revision manual.

alter table public.posiciones
  add column if not exists origen_asignacion_id uuid references public.usuarios_asignaciones(id) on delete set null;

create index if not exists idx_posiciones_origen_asignacion
  on public.posiciones(origen_asignacion_id);

comment on column public.posiciones.origen_asignacion_id is
  'Asignacion de usuarios_asignaciones que origino esta posicion en el backfill. La usa el trigger de sincronizacion para saber que posicion actualizar cuando cambia el jefe de una asignacion especifica.';

do $$
declare
  r_empresa record;
  r_asig record;
  v_candidatos int;
  v_pos_id uuid;
begin
  for r_empresa in select id from public.empresas loop
    for r_asig in
      select ua.id, ua.user_id, ua.categoria, ua.jefe_user_id
      from public.usuarios_asignaciones ua
      where ua.empresa_id = r_empresa.id
        and ua.activo = true
      order by ua.principal desc, ua.id
    loop
      -- Paso 1: candidatas solo por categoria/unidad.
      select count(*) into v_candidatos
      from public.posiciones_usuarios pu
      join public.posiciones p on p.id = pu.posicion_id
      join public.unidades_organizacionales uo on uo.id = p.unidad_organizacional_id
      where pu.empresa_id = r_empresa.id
        and pu.user_id = r_asig.user_id
        and pu.fecha_fin is null
        and p.origen_asignacion_id is null
        and lower(trim(uo.nombre)) = lower(trim(r_asig.categoria));

      if v_candidatos = 1 then
        select p.id into v_pos_id
        from public.posiciones_usuarios pu
        join public.posiciones p on p.id = pu.posicion_id
        join public.unidades_organizacionales uo on uo.id = p.unidad_organizacional_id
        where pu.empresa_id = r_empresa.id
          and pu.user_id = r_asig.user_id
          and pu.fecha_fin is null
          and p.origen_asignacion_id is null
          and lower(trim(uo.nombre)) = lower(trim(r_asig.categoria));

        update public.posiciones set origen_asignacion_id = r_asig.id where id = v_pos_id;
        continue;
      end if;

      -- Paso 2: mas de una candidata (categoria repetida) -> desempatar por jefe consistente.
      if v_candidatos > 1 then
        select count(*) into v_candidatos
        from public.posiciones_usuarios pu
        join public.posiciones p on p.id = pu.posicion_id
        join public.unidades_organizacionales uo on uo.id = p.unidad_organizacional_id
        left join public.posiciones_usuarios jefe_pu
          on jefe_pu.posicion_id = p.reporta_a_posicion_id and jefe_pu.fecha_fin is null
        where pu.empresa_id = r_empresa.id
          and pu.user_id = r_asig.user_id
          and pu.fecha_fin is null
          and p.origen_asignacion_id is null
          and lower(trim(uo.nombre)) = lower(trim(r_asig.categoria))
          and (
            (r_asig.jefe_user_id is null and p.reporta_a_posicion_id is null)
            or (r_asig.jefe_user_id is not null and jefe_pu.user_id = r_asig.jefe_user_id)
          );

        if v_candidatos = 1 then
          select p.id into v_pos_id
          from public.posiciones_usuarios pu
          join public.posiciones p on p.id = pu.posicion_id
          join public.unidades_organizacionales uo on uo.id = p.unidad_organizacional_id
          left join public.posiciones_usuarios jefe_pu
            on jefe_pu.posicion_id = p.reporta_a_posicion_id and jefe_pu.fecha_fin is null
          where pu.empresa_id = r_empresa.id
            and pu.user_id = r_asig.user_id
            and pu.fecha_fin is null
            and p.origen_asignacion_id is null
            and lower(trim(uo.nombre)) = lower(trim(r_asig.categoria))
            and (
              (r_asig.jefe_user_id is null and p.reporta_a_posicion_id is null)
              or (r_asig.jefe_user_id is not null and jefe_pu.user_id = r_asig.jefe_user_id)
            );

          update public.posiciones set origen_asignacion_id = r_asig.id where id = v_pos_id;
          continue;
        end if;
      end if;

      -- No se pudo resolver (0 candidatas, o mas de 1 incluso tras desempatar por jefe).
      insert into public._reporte_backfill_posiciones(empresa_id, tipo, detalle)
      values (
        r_empresa.id, 'usuario_no_mapeado',
        'Asignacion ' || r_asig.id || ' (usuario ' || r_asig.user_id || ', categoria "' || r_asig.categoria ||
        '") no pudo vincularse a una unica posicion (candidatas: ' || v_candidatos || '). Revisar y setear origen_asignacion_id manualmente.'
      );
    end loop;
  end loop;
end;
$$;

-- Verificacion rapida en Supabase Studio:
--   select count(*) from public.posiciones where origen_asignacion_id is null;
--   select * from public._reporte_backfill_posiciones where detalle like 'Asignacion %' order by id;
select pg_notify('pgrst', 'reload schema');
