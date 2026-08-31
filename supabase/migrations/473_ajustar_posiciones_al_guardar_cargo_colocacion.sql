-- La cantidad de una cargo-colocación es el número de posiciones físicas que
-- debe existir en el lienzo. Antes sólo se aplicaba al crear o al ejecutar una
-- acción manual, por lo que bajar la cantidad dejaba tarjetas Vacante sobrantes.

create or replace function public.ajustar_posiciones_cargo_colocacion(
  p_cargo_colocacion_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_colocacion public.cargo_colocaciones%rowtype;
  v_actual integer;
  v_ocupadas integer;
  v_creadas integer := 0;
  v_eliminadas integer := 0;
begin
  select * into v_colocacion
  from public.cargo_colocaciones
  where id = p_cargo_colocacion_id
  for update;

  if not found then
    raise exception 'Cargo-colocacion no encontrada';
  end if;

  select count(*) into v_actual
  from public.posiciones
  where cargo_colocacion_id = v_colocacion.id
    and activa = true;

  select count(distinct p.id) into v_ocupadas
  from public.posiciones p
  join public.posiciones_usuarios pu
    on pu.posicion_id = p.id
   and pu.fecha_fin is null
  where p.cargo_colocacion_id = v_colocacion.id
    and p.activa = true;

  if v_ocupadas > v_colocacion.cantidad_posiciones then
    raise exception
      'No se puede reducir: hay % posiciones ocupadas y la cantidad es %',
      v_ocupadas,
      v_colocacion.cantidad_posiciones;
  end if;

  if v_actual < v_colocacion.cantidad_posiciones then
    insert into public.posiciones (
      empresa_id, cargo_colocacion_id, cargo_id,
      unidad_organizacional_id, estado, activa
    )
    select
      v_colocacion.empresa_id,
      v_colocacion.id,
      v_colocacion.cargo_id,
      v_colocacion.unidad_organizacional_id,
      'vacante',
      true
    from generate_series(1, v_colocacion.cantidad_posiciones - v_actual);
    get diagnostics v_creadas = row_count;
  elsif v_actual > v_colocacion.cantidad_posiciones then
    with vacantes as (
      select p.id
      from public.posiciones p
      where p.cargo_colocacion_id = v_colocacion.id
        and p.activa = true
        and not exists (
          select 1
          from public.posiciones_usuarios pu
          where pu.posicion_id = p.id
            and pu.fecha_fin is null
        )
      order by p.created_at desc, p.id desc
      limit (v_actual - v_colocacion.cantidad_posiciones)
    )
    delete from public.posiciones p
    using vacantes v
    where p.id = v.id;
    get diagnostics v_eliminadas = row_count;
  end if;

  return jsonb_build_object(
    'cargo_colocacion_id', v_colocacion.id,
    'creadas', v_creadas,
    'eliminadas', v_eliminadas
  );
end;
$$;

revoke all on function public.ajustar_posiciones_cargo_colocacion(text) from public;
revoke all on function public.ajustar_posiciones_cargo_colocacion(text) from anon;
revoke all on function public.ajustar_posiciones_cargo_colocacion(text) from authenticated;
grant execute on function public.ajustar_posiciones_cargo_colocacion(text) to service_role;

-- Conserva el comando manual y sus controles de permiso, delegando la regla
-- real al mismo núcleo usado por el guardado.
create or replace function public.generar_posiciones_desde_colocacion(
  p_cargo_colocacion_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id text;
begin
  select empresa_id into v_empresa_id
  from public.cargo_colocaciones
  where id = p_cargo_colocacion_id;

  if not found then
    raise exception 'Cargo-colocacion no encontrada';
  end if;

  if not public.usuario_tiene_empresa(v_empresa_id)
     or not public.usuario_puede(v_empresa_id, 'organigrama', 'editar') then
    raise exception 'No tiene permiso para generar posiciones';
  end if;

  return public.ajustar_posiciones_cargo_colocacion(p_cargo_colocacion_id);
end;
$$;

create or replace function public.crear_o_actualizar_cargo_colocacion(
  p_id text,
  p_empresa_id text,
  p_sociedad_id uuid,
  p_unidad_organizacional_id text,
  p_cargo_id text,
  p_nivel_jerarquico_id text,
  p_rol_id text,
  p_cantidad_posiciones integer,
  p_estado text default 'activo',
  p_reporta_a_cargo_colocacion_id text default null,
  p_campo_habilitado boolean default false,
  p_campo_modulos text[] default '{}'::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text := coalesce(
    nullif(trim(p_id), ''),
    'ccol_' || left(replace(gen_random_uuid()::text, '-', ''), 18)
  );
  v_ocupadas integer;
  v_ocupantes text;
  v_empresa_padre text;
  v_sociedad_padre uuid;
  v_ajuste jsonb;
begin
  if p_rol_id is null or trim(p_rol_id) = '' then
    raise exception 'El rol de sistema es obligatorio para una cargo-colocacion';
  end if;

  if p_cantidad_posiciones is null or p_cantidad_posiciones < 1 then
    raise exception 'cantidad_posiciones debe ser al menos 1';
  end if;

  if not public.usuario_tiene_empresa(p_empresa_id)
     or not public.usuario_puede(p_empresa_id, 'organigrama', 'editar') then
    raise exception 'No tiene permiso para editar cargo-colocaciones';
  end if;

  if exists (
    select 1 from public.cargo_colocaciones cc
    where cc.id = v_id and cc.empresa_id <> p_empresa_id
  ) then
    raise exception 'La cargo-colocacion no pertenece al tenant indicado';
  end if;

  if p_reporta_a_cargo_colocacion_id is not null then
    select empresa_id, sociedad_id
      into v_empresa_padre, v_sociedad_padre
    from public.cargo_colocaciones
    where id = p_reporta_a_cargo_colocacion_id;

    if not found then
      raise exception 'La cargo-colocacion padre % no existe', p_reporta_a_cargo_colocacion_id;
    end if;
    if v_empresa_padre <> p_empresa_id then
      raise exception 'La cargo-colocacion padre debe pertenecer a la misma empresa';
    end if;
    if p_sociedad_id is not null and v_sociedad_padre is distinct from p_sociedad_id then
      raise exception 'La cargo-colocacion padre debe pertenecer a la misma sociedad';
    end if;
  end if;

  select count(distinct p.id),
         string_agg(distinct coalesce(po.nombre, pa.nombre, pu.user_id::text), ', ')
    into v_ocupadas, v_ocupantes
  from public.posiciones p
  join public.posiciones_usuarios pu
    on pu.posicion_id = p.id and pu.fecha_fin is null
  left join public.personal_operativo po on po.auth_user_id = pu.user_id
  left join public.personal_administrativo pa on pa.auth_user_id = pu.user_id
  where p.cargo_colocacion_id = v_id;

  if coalesce(v_ocupadas, 0) > p_cantidad_posiciones then
    raise exception
      'La cantidad solicitada (%) es menor que las % posiciones ocupadas: %',
      p_cantidad_posiciones, v_ocupadas, coalesce(v_ocupantes, 'ocupantes sin ficha');
  end if;

  insert into public.cargo_colocaciones (
    id, empresa_id, sociedad_id, unidad_organizacional_id, cargo_id,
    nivel_jerarquico_id, rol_id, cantidad_posiciones, estado,
    reporta_a_cargo_colocacion_id, campo_habilitado, campo_modulos
  ) values (
    v_id, p_empresa_id, p_sociedad_id, p_unidad_organizacional_id, p_cargo_id,
    p_nivel_jerarquico_id, p_rol_id, p_cantidad_posiciones,
    coalesce(nullif(trim(p_estado), ''), 'activo'), p_reporta_a_cargo_colocacion_id,
    coalesce(p_campo_habilitado, false), coalesce(p_campo_modulos, '{}'::text[])
  )
  on conflict (id) do update set
    sociedad_id = excluded.sociedad_id,
    unidad_organizacional_id = excluded.unidad_organizacional_id,
    cargo_id = excluded.cargo_id,
    nivel_jerarquico_id = excluded.nivel_jerarquico_id,
    rol_id = excluded.rol_id,
    cantidad_posiciones = excluded.cantidad_posiciones,
    estado = excluded.estado,
    reporta_a_cargo_colocacion_id = excluded.reporta_a_cargo_colocacion_id,
    campo_habilitado = excluded.campo_habilitado,
    campo_modulos = excluded.campo_modulos,
    updated_at = now();

  -- Invariante: al retornar del guardado, las tarjetas físicas coinciden con
  -- cantidad_posiciones. Las ocupadas se preservan; sólo se crean/eliminan vacantes.
  v_ajuste := public.ajustar_posiciones_cargo_colocacion(v_id);

  return jsonb_build_object(
    'id', v_id,
    'ocupadas', coalesce(v_ocupadas, 0),
    'posiciones_creadas', coalesce((v_ajuste ->> 'creadas')::integer, 0),
    'posiciones_eliminadas', coalesce((v_ajuste ->> 'eliminadas')::integer, 0)
  );
end;
$$;

revoke all on function public.crear_o_actualizar_cargo_colocacion(
  text, text, uuid, text, text, text, text, integer, text, text, boolean, text[]
) from public;
grant execute on function public.crear_o_actualizar_cargo_colocacion(
  text, text, uuid, text, text, text, text, integer, text, text, boolean, text[]
) to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');
