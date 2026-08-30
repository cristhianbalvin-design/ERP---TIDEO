-- TIDEO ERP - Organigrama v2: eliminacion fisica segura de UO y cargo-colocacion.
-- Las validaciones se ejecutan dentro de RPCs SECURITY DEFINER para no depender
-- del estado visual del lienzo ni dejar que las FK devuelvan errores sin contexto.

create or replace function public.eliminar_unidad_organizacional(
  p_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unidad public.unidades_organizacionales%rowtype;
  v_cantidad integer;
  v_detalle text;
begin
  select *
    into v_unidad
  from public.unidades_organizacionales
  where id = p_id
  for update;

  if not found then
    raise exception 'La unidad organizacional no existe.';
  end if;

  if not public.usuario_tiene_empresa(v_unidad.empresa_id)
     or not public.usuario_puede(v_unidad.empresa_id, 'organigrama', 'editar')
     or not public.usuario_puede(v_unidad.empresa_id, 'maestros', 'editar') then
    raise exception 'No tiene los permisos de Organigrama y Maestros requeridos para eliminar una unidad organizacional.';
  end if;

  select count(*), string_agg(nombre, ', ' order by nombre)
    into v_cantidad, v_detalle
  from public.unidades_organizacionales
  where empresa_id = v_unidad.empresa_id
    and unidad_padre_id = v_unidad.id;

  if v_cantidad > 0 then
    raise exception 'Esta UO tiene % unidad(es) hija(s): %. Reasígnalas a otra UO padre antes de eliminar.',
      v_cantidad, v_detalle;
  end if;

  select count(*), string_agg(coalesce(c.nombre, cc.id), ', ' order by coalesce(c.nombre, cc.id))
    into v_cantidad, v_detalle
  from public.cargo_colocaciones cc
  left join public.cargos_empresa c on c.id = cc.cargo_id
  where cc.empresa_id = v_unidad.empresa_id
    and cc.unidad_organizacional_id = v_unidad.id
    and cc.estado = 'activo';

  if v_cantidad > 0 then
    raise exception 'Esta UO tiene % cargo(s) asignado(s): %. Reasígnalos a otra UO antes de eliminar.',
      v_cantidad, v_detalle;
  end if;

  -- Una cargo-colocacion inactiva sigue teniendo FK RESTRICT hacia la UO.
  -- Tambien se bloquean posiciones archivadas o con ocupacion cerrada para
  -- preservar historia y evitar que el DELETE llegue a una FK sin contexto.
  with referencias_historicas as (
    select format('%s (cargo inactivo)', coalesce(c.nombre, cc.id)) as detalle
    from public.cargo_colocaciones cc
    left join public.cargos_empresa c on c.id = cc.cargo_id
    where cc.empresa_id = v_unidad.empresa_id
      and cc.unidad_organizacional_id = v_unidad.id
      and cc.estado <> 'activo'

    union all

    select format('posición %s (histórica)', p.id::text) as detalle
    from public.posiciones p
    where p.empresa_id = v_unidad.empresa_id
      and p.unidad_organizacional_id = v_unidad.id
      and (
        p.activa = false
        or exists (
          select 1
          from public.posiciones_usuarios pu
          where pu.posicion_id = p.id
            and pu.fecha_fin is not null
        )
      )
  )
  select count(*), string_agg(detalle, ', ' order by detalle)
    into v_cantidad, v_detalle
  from referencias_historicas;

  if v_cantidad > 0 then
    raise exception 'Esta UO tiene % cargo(s) inactivo(s) o posiciones históricas asociadas: %. No se puede eliminar físicamente mientras existan registros históricos vinculados.',
      v_cantidad, v_detalle;
  end if;

  -- Posiciones antiguas sin cargo-colocacion tambien impedirian el DELETE por
  -- FK; se informan antes de intentar borrar la UO.
  select count(*), string_agg(p.id::text, ', ' order by p.id::text)
    into v_cantidad, v_detalle
  from public.posiciones p
  where p.empresa_id = v_unidad.empresa_id
    and p.unidad_organizacional_id = v_unidad.id
    and p.cargo_colocacion_id is null;

  if v_cantidad > 0 then
    raise exception 'Esta UO tiene % posición(es) directa(s) asociada(s): %. Reasígnalas o elimínalas antes de eliminar la UO.',
      v_cantidad, v_detalle;
  end if;

  delete from public.organigrama_v2_layout
  where empresa_id = v_unidad.empresa_id
    and tipo_nodo = 'uo'
    and nodo_id = v_unidad.id;

  delete from public.unidades_organizacionales
  where id = v_unidad.id
    and empresa_id = v_unidad.empresa_id;

  return jsonb_build_object(
    'id', v_unidad.id,
    'nombre', v_unidad.nombre,
    'eliminada', true
  );
end;
$$;

create or replace function public.eliminar_cargo_colocacion(
  p_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_colocacion public.cargo_colocaciones%rowtype;
  v_cantidad integer;
  v_detalle text;
  v_posiciones_eliminadas integer := 0;
  v_relaciones_eliminadas integer := 0;
begin
  select *
    into v_colocacion
  from public.cargo_colocaciones
  where id = p_id
  for update;

  if not found then
    raise exception 'La cargo-colocación no existe.';
  end if;

  if not public.usuario_tiene_empresa(v_colocacion.empresa_id)
     or not public.usuario_puede(v_colocacion.empresa_id, 'organigrama', 'editar')
     or not public.usuario_puede(v_colocacion.empresa_id, 'maestros', 'editar') then
    raise exception 'No tiene los permisos de Organigrama y Maestros requeridos para eliminar una cargo-colocación.';
  end if;

  -- Bloquea las posiciones para que no aparezca una ocupacion concurrente entre
  -- la validacion y el DELETE.
  perform 1
  from public.posiciones
  where empresa_id = v_colocacion.empresa_id
    and cargo_colocacion_id = v_colocacion.id
  for update;

  select count(distinct p.id),
         string_agg(
           distinct coalesce(po.nombre, pa.nombre, au.email, pu.user_id::text),
           ', ' order by coalesce(po.nombre, pa.nombre, au.email, pu.user_id::text)
         )
    into v_cantidad, v_detalle
  from public.posiciones p
  join public.posiciones_usuarios pu
    on pu.posicion_id = p.id
   and pu.fecha_fin is null
  left join public.personal_operativo po on po.auth_user_id = pu.user_id
  left join public.personal_administrativo pa on pa.auth_user_id = pu.user_id
  left join auth.users au on au.id = pu.user_id
  where p.empresa_id = v_colocacion.empresa_id
    and p.cargo_colocacion_id = v_colocacion.id;

  if v_cantidad > 0 then
    raise exception 'Este cargo tiene % posición(es) ocupada(s) por: %. Reasigna a esas personas antes de eliminar.',
      v_cantidad, v_detalle;
  end if;

  select count(*), string_agg(coalesce(c.nombre, cc.id), ', ' order by coalesce(c.nombre, cc.id))
    into v_cantidad, v_detalle
  from public.cargo_colocaciones cc
  left join public.cargos_empresa c on c.id = cc.cargo_id
  where cc.empresa_id = v_colocacion.empresa_id
    and cc.reporta_a_cargo_colocacion_id = v_colocacion.id;

  if v_cantidad > 0 then
    raise exception '% cargo(s) reportan a este: %. Reasigna su jerarquía antes de eliminar.',
      v_cantidad, v_detalle;
  end if;

  -- Las relaciones matriciales activas no se eliminan por cascada. Se bloquea
  -- tanto jefe como subordinada para no borrar una relacion vigente en silencio.
  with relaciones_activas as (
    select prm.id,
           coalesce(po.nombre, pa.nombre, c_sub.nombre, p_sub.id::text) as detalle
    from public.posicion_relaciones_matriciales prm
    join public.posiciones p_objetivo
      on p_objetivo.id = prm.posicion_jefe_id
      or p_objetivo.id = prm.posicion_subordinada_id
    join public.posiciones p_sub on p_sub.id = prm.posicion_subordinada_id
    left join public.cargo_colocaciones cc_sub on cc_sub.id = p_sub.cargo_colocacion_id
    left join public.cargos_empresa c_sub on c_sub.id = cc_sub.cargo_id
    left join public.posiciones_usuarios pu
      on pu.posicion_id = p_sub.id
     and pu.fecha_fin is null
    left join public.personal_operativo po on po.auth_user_id = pu.user_id
    left join public.personal_administrativo pa on pa.auth_user_id = pu.user_id
    where prm.empresa_id = v_colocacion.empresa_id
      and prm.estado = 'activo'
      and p_objetivo.cargo_colocacion_id = v_colocacion.id
  )
  select count(distinct id), string_agg(distinct detalle, ', ' order by detalle)
    into v_cantidad, v_detalle
  from relaciones_activas;

  if v_cantidad > 0 then
    raise exception 'Este cargo tiene % relación(es) matricial(es) activa(s) con: %. Reasigna o elimina esas relaciones antes de eliminar.',
      v_cantidad, v_detalle;
  end if;

  -- La jerarquia historica de posiciones tambien usa ON DELETE SET NULL. Se
  -- bloquea para que la eliminacion fisica no rompa relaciones vigentes sin aviso.
  with reportes_directos as (
    select p_hija.id::text as detalle
    from public.posiciones p_hija
    join public.posiciones p_padre on p_padre.id = p_hija.reporta_a_posicion_id
    where p_hija.empresa_id = v_colocacion.empresa_id
      and p_padre.cargo_colocacion_id = v_colocacion.id
  )
  select count(*), string_agg(detalle, ', ' order by detalle)
    into v_cantidad, v_detalle
  from reportes_directos;

  if v_cantidad > 0 then
    raise exception '% posición(es) reportan a este cargo: %. Reasigna su jerarquía antes de eliminar.',
      v_cantidad, v_detalle;
  end if;

  delete from public.organigrama_v2_layout l
  using public.posiciones p
  where p.empresa_id = v_colocacion.empresa_id
    and p.cargo_colocacion_id = v_colocacion.id
    and l.empresa_id = p.empresa_id
    and l.tipo_nodo = 'posicion'
    and l.nodo_id = p.id::text;

  -- Las relaciones matriciales inactivas y las ocupaciones cerradas asociadas a
  -- estas posiciones se eliminan fisicamente por las FK ON DELETE CASCADE.
  delete from public.posiciones
  where empresa_id = v_colocacion.empresa_id
    and cargo_colocacion_id = v_colocacion.id;
  get diagnostics v_posiciones_eliminadas = row_count;

  delete from public.organigrama_v2_layout
  where empresa_id = v_colocacion.empresa_id
    and tipo_nodo = 'cargo_colocacion'
    and nodo_id = v_colocacion.id;

  delete from public.cargo_colocaciones
  where id = v_colocacion.id
    and empresa_id = v_colocacion.empresa_id;

  return jsonb_build_object(
    'id', v_colocacion.id,
    'cargo_id', v_colocacion.cargo_id,
    'posiciones_eliminadas', v_posiciones_eliminadas,
    'relaciones_eliminadas', v_relaciones_eliminadas,
    'eliminada', true
  );
end;
$$;

revoke all on function public.eliminar_unidad_organizacional(text) from public;
revoke all on function public.eliminar_cargo_colocacion(text) from public;

grant execute on function public.eliminar_unidad_organizacional(text) to authenticated, service_role;
grant execute on function public.eliminar_cargo_colocacion(text) to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');
