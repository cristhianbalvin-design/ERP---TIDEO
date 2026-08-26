-- TIDEO ERP - Jerarquia explicita entre cargo-colocaciones.
-- No realiza backfill: las colocaciones existentes permanecen sin padre.

alter table public.cargo_colocaciones
  add column reporta_a_cargo_colocacion_id text null;

alter table public.cargo_colocaciones
  add constraint cargo_colocaciones_reporta_a_fkey
  foreign key (reporta_a_cargo_colocacion_id)
  references public.cargo_colocaciones(id)
  on delete set null;

alter table public.cargo_colocaciones
  add constraint cargo_colocaciones_no_self_reporte_check
  check (
    reporta_a_cargo_colocacion_id is null
    or reporta_a_cargo_colocacion_id <> id
  );

create index idx_cargo_colocaciones_reporta_a
  on public.cargo_colocaciones (
    empresa_id,
    reporta_a_cargo_colocacion_id
  )
  where reporta_a_cargo_colocacion_id is not null;

create or replace function public.validar_ciclo_cargo_colocacion()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_actual text;
  v_empresa_padre text;
  v_sociedad_padre uuid;
begin
  if new.reporta_a_cargo_colocacion_id is null then
    return new;
  end if;

  select empresa_id, sociedad_id
    into v_empresa_padre, v_sociedad_padre
  from public.cargo_colocaciones
  where id = new.reporta_a_cargo_colocacion_id;

  if not found then
    raise exception
      'La cargo-colocacion padre % no existe',
      new.reporta_a_cargo_colocacion_id;
  end if;

  if v_empresa_padre <> new.empresa_id then
    raise exception
      'La cargo-colocacion padre debe pertenecer a la misma empresa';
  end if;

  if new.sociedad_id is not null
     and v_sociedad_padre is distinct from new.sociedad_id then
    raise exception
      'La cargo-colocacion padre debe pertenecer a la misma sociedad';
  end if;

  -- Patron equivalente a validar_ciclo_unidad_organizacional.
  v_actual := new.reporta_a_cargo_colocacion_id;

  while v_actual is not null loop
    if v_actual = new.id then
      raise exception
        'La cargo-colocacion % generaria un ciclo en la jerarquia',
        new.id;
    end if;

    select reporta_a_cargo_colocacion_id
      into v_actual
    from public.cargo_colocaciones
    where id = v_actual;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_cargo_colocaciones_validar_ciclo
  on public.cargo_colocaciones;

create trigger trg_cargo_colocaciones_validar_ciclo
before insert or update of reporta_a_cargo_colocacion_id
on public.cargo_colocaciones
for each row execute function public.validar_ciclo_cargo_colocacion();

-- Se reemplaza la firma anterior de 9 parametros. El nuevo parametro es opcional.
drop function if exists public.crear_o_actualizar_cargo_colocacion(
  text, text, uuid, text, text, text, text, integer, text
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
  p_reporta_a_cargo_colocacion_id text default null
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
    reporta_a_cargo_colocacion_id
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
    p_reporta_a_cargo_colocacion_id
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
    updated_at = now();

  return jsonb_build_object(
    'id', v_id,
    'ocupadas', coalesce(v_ocupadas, 0)
  );
end;
$$;

grant execute on function public.crear_o_actualizar_cargo_colocacion(
  text, text, uuid, text, text, text, text, integer, text, text
) to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');
