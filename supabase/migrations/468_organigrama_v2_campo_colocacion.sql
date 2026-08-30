-- TIDEO ERP - Configuracion de acceso a campo por cargo-colocacion.
-- La configuracion pertenece al cargo del organigrama v2, no a la ficha individual.

alter table public.cargo_colocaciones
  add column if not exists campo_habilitado boolean not null default false,
  add column if not exists campo_modulos text[] not null default '{}'::text[];

-- Normaliza el contrato de modulos en un unico punto:
-- - sin acceso a campo no conserva modulos residuales;
-- - con acceso a campo, asistencia siempre esta incluida;
-- - Mi espacio incluye Solicitudes, igual que la UI de usuarios.
create or replace function public.normalizar_campo_modulos_cargo_colocacion()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_modulos text[];
  v_permitidos constant text[] := array[
    'tecnico', 'logistica', 'vendedor', 'compras',
    'supervisor', 'gerencia', 'asistencia', 'mi_espacio', 'solicitudes'
  ];
  v_orden constant text[] := array[
    'tecnico', 'logistica', 'vendedor', 'compras',
    'supervisor', 'gerencia', 'asistencia', 'mi_espacio', 'solicitudes'
  ];
begin
  new.campo_habilitado := coalesce(new.campo_habilitado, false);

  if not new.campo_habilitado then
    new.campo_modulos := '{}'::text[];
    return new;
  end if;

  select coalesce(array_agg(modulo order by array_position(v_orden, modulo)), '{}'::text[])
    into v_modulos
  from (
    select distinct lower(btrim(valor)) as modulo
    from unnest(coalesce(new.campo_modulos, '{}'::text[])) as entrada(valor)
    where lower(btrim(valor)) = any(v_permitidos)
  ) normalizados;

  if not (v_modulos @> array['asistencia']::text[]) then
    v_modulos := v_modulos || array['asistencia']::text[];
  end if;

  if v_modulos @> array['mi_espacio']::text[]
     and not (v_modulos @> array['solicitudes']::text[]) then
    v_modulos := v_modulos || array['solicitudes']::text[];
  end if;

  select array_agg(modulo order by array_position(v_orden, modulo))
    into new.campo_modulos
  from unnest(v_modulos) as salida(modulo);

  return new;
end;
$$;

drop trigger if exists trg_normalizar_campo_modulos_cargo_colocacion
  on public.cargo_colocaciones;
create trigger trg_normalizar_campo_modulos_cargo_colocacion
before insert or update of campo_habilitado, campo_modulos
on public.cargo_colocaciones
for each row execute function public.normalizar_campo_modulos_cargo_colocacion();

alter table public.cargo_colocaciones
  drop constraint if exists cargo_colocaciones_campo_asistencia_check,
  add constraint cargo_colocaciones_campo_asistencia_check
    check (
      not campo_habilitado
      or campo_modulos @> array['asistencia']::text[]
    ),
  drop constraint if exists cargo_colocaciones_campo_vacio_si_deshabilitado_check,
  add constraint cargo_colocaciones_campo_vacio_si_deshabilitado_check
    check (
      campo_habilitado
      or cardinality(campo_modulos) = 0
    ),
  drop constraint if exists cargo_colocaciones_campo_modulos_permitidos_check,
  add constraint cargo_colocaciones_campo_modulos_permitidos_check
    check (
      campo_modulos <@ array[
        'tecnico', 'logistica', 'vendedor', 'compras',
        'supervisor', 'gerencia', 'asistencia', 'mi_espacio', 'solicitudes'
      ]::text[]
    );

-- Reemplaza la firma vigente de diez parametros. Los dos nuevos parametros
-- son opcionales para mantener compatibilidad con todas las llamadas previas.
drop function if exists public.crear_o_actualizar_cargo_colocacion(
  text, text, uuid, text, text, text, text, integer, text, text
);

create function public.crear_o_actualizar_cargo_colocacion(
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
    select 1
    from public.cargo_colocaciones cc
    where cc.id = v_id
      and cc.empresa_id <> p_empresa_id
  ) then
    raise exception 'La cargo-colocacion no pertenece al tenant indicado';
  end if;

  if p_reporta_a_cargo_colocacion_id is not null then
    select empresa_id, sociedad_id
      into v_empresa_padre, v_sociedad_padre
    from public.cargo_colocaciones
    where id = p_reporta_a_cargo_colocacion_id;

    if not found then
      raise exception
        'La cargo-colocacion padre % no existe',
        p_reporta_a_cargo_colocacion_id;
    end if;

    if v_empresa_padre <> p_empresa_id then
      raise exception
        'La cargo-colocacion padre debe pertenecer a la misma empresa';
    end if;

    if p_sociedad_id is not null
       and v_sociedad_padre is distinct from p_sociedad_id then
      raise exception
        'La cargo-colocacion padre debe pertenecer a la misma sociedad';
    end if;
  end if;

  select count(distinct p.id),
         string_agg(
           distinct coalesce(po.nombre, pa.nombre, pu.user_id::text),
           ', '
         )
    into v_ocupadas, v_ocupantes
  from public.posiciones p
  join public.posiciones_usuarios pu
    on pu.posicion_id = p.id
   and pu.fecha_fin is null
  left join public.personal_operativo po
    on po.auth_user_id = pu.user_id
  left join public.personal_administrativo pa
    on pa.auth_user_id = pu.user_id
  where p.cargo_colocacion_id = v_id;

  if coalesce(v_ocupadas, 0) > p_cantidad_posiciones then
    raise exception
      'La cantidad solicitada (%) es menor que las % posiciones ocupadas: %',
      p_cantidad_posiciones,
      v_ocupadas,
      coalesce(v_ocupantes, 'ocupantes sin ficha');
  end if;

  insert into public.cargo_colocaciones (
    id,
    empresa_id,
    sociedad_id,
    unidad_organizacional_id,
    cargo_id,
    nivel_jerarquico_id,
    rol_id,
    cantidad_posiciones,
    estado,
    reporta_a_cargo_colocacion_id,
    campo_habilitado,
    campo_modulos
  ) values (
    v_id,
    p_empresa_id,
    p_sociedad_id,
    p_unidad_organizacional_id,
    p_cargo_id,
    p_nivel_jerarquico_id,
    p_rol_id,
    p_cantidad_posiciones,
    coalesce(nullif(trim(p_estado), ''), 'activo'),
    p_reporta_a_cargo_colocacion_id,
    coalesce(p_campo_habilitado, false),
    coalesce(p_campo_modulos, '{}'::text[])
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

  return jsonb_build_object(
    'id', v_id,
    'ocupadas', coalesce(v_ocupadas, 0)
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
