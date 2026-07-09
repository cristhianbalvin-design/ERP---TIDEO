-- TIDEO ERP - Backfill automatico de posiciones (Fase 1c del modelo Unidad -> Posicion -> Persona)
-- Fuente unica: usuarios_asignaciones (activo = true). Esa tabla ya contiene, sincronizada por
-- trigger (070_usuarios_asignaciones_funcionales.sql), una fila principal por cada usuario activo
-- de usuarios_empresas mas cualquier asignacion matricial adicional — no hace falta leer
-- usuarios_empresas por separado.
--
-- Orden de procesamiento por empresa: primero las asignaciones principales, en profundidad
-- ascendente sobre jefe_user_id (cupula primero), luego las principales huerfanas (cadena de
-- jefatura rota o ciclica, para no perder a nadie) y por ultimo las matriciales. Asi, cuando se
-- crea la posicion de un subordinado, la posicion principal de su jefe ya existe.
--
-- Idempotente por tenant: si una empresa ya tiene posiciones, se omite (permite re-ejecutar este
-- archivo sin duplicar al agregar tenants nuevos).

create table if not exists public._reporte_backfill_posiciones (
  id bigint generated always as identity primary key,
  empresa_id text references public.empresas(id),
  tipo text not null check (tipo in ('unidad_creada', 'usuario_no_mapeado', 'resumen')),
  detalle text not null,
  created_at timestamptz not null default now()
);

alter table public._reporte_backfill_posiciones enable row level security;

drop policy if exists tenant_reporte_backfill_posiciones_isolation on public._reporte_backfill_posiciones;
create policy tenant_reporte_backfill_posiciones_isolation
on public._reporte_backfill_posiciones
for all
using (empresa_id is null or public.usuario_tiene_empresa(empresa_id))
with check (empresa_id is null or public.usuario_tiene_empresa(empresa_id));

do $$
declare
  r_empresa record;
  r_asig record;
  r_uo record;
  v_uo_id text;
  v_pos_id uuid;
  v_jefe_pos_id uuid;
  v_seq int;
  v_creadas int;
  v_no_mapeados int;
  v_total int;
begin
  create temporary table _backfill_pos_principal_map (
    empresa_id text,
    user_id uuid,
    posicion_id uuid
  ) on commit drop;

  for r_empresa in select id from public.empresas loop

    if exists (select 1 from public.posiciones where empresa_id = r_empresa.id) then
      raise notice 'Empresa % ya tiene posiciones creadas, se omite backfill', r_empresa.id;
      continue;
    end if;

    v_creadas := 0;
    v_no_mapeados := 0;
    v_total := 0;

    for r_asig in
      with recursive cadena_principal as (
        select ua.id, ua.user_id, ua.categoria, ua.jefe_user_id, true as es_principal, 0 as profundidad
        from public.usuarios_asignaciones ua
        where ua.empresa_id = r_empresa.id
          and ua.principal = true
          and ua.activo = true
          and ua.jefe_user_id is null

        union all

        select ua.id, ua.user_id, ua.categoria, ua.jefe_user_id, true, cp.profundidad + 1
        from public.usuarios_asignaciones ua
        join cadena_principal cp on ua.jefe_user_id = cp.user_id
        where ua.empresa_id = r_empresa.id
          and ua.principal = true
          and ua.activo = true
      ),
      huerfanos_principal as (
        -- Principales cuya cadena de jefatura no llego a una raiz (jefe inactivo, sin posicion
        -- principal, o ciclo). Se procesan igual, sin reporta_a_posicion_id resuelto.
        select ua.id, ua.user_id, ua.categoria, ua.jefe_user_id, true as es_principal,
          (select coalesce(max(profundidad), 0) from cadena_principal) + 1 as profundidad
        from public.usuarios_asignaciones ua
        where ua.empresa_id = r_empresa.id
          and ua.principal = true
          and ua.activo = true
          and ua.id not in (select id from cadena_principal)
      ),
      matriciales as (
        select ua.id, ua.user_id, ua.categoria, ua.jefe_user_id, false as es_principal,
          (select coalesce(max(profundidad), 0) from cadena_principal) + 2 as profundidad
        from public.usuarios_asignaciones ua
        where ua.empresa_id = r_empresa.id
          and ua.principal = false
          and ua.activo = true
      )
      select * from cadena_principal
      union all
      select * from huerfanos_principal
      union all
      select * from matriciales
      order by profundidad, es_principal desc
    loop
      -- Resolver unidad organizacional por categoria (match exacto contra nombre, sin distinguir
      -- mayusculas/espacios); si no existe, se crea con el nombre de la categoria.
      select id into v_uo_id
      from public.unidades_organizacionales
      where empresa_id = r_empresa.id
        and lower(trim(nombre)) = lower(trim(r_asig.categoria))
      limit 1;

      if v_uo_id is null then
        select coalesce(max(
          case when codigo ~ '^UO-[0-9]+$'
          then (regexp_match(codigo, '([0-9]+)$'))[1]::int
          else 0 end
        ), 0) + 1 into v_seq
        from public.unidades_organizacionales
        where empresa_id = r_empresa.id;

        v_uo_id := 'uo_' || left(replace(gen_random_uuid()::text, '-', ''), 18);

        insert into public.unidades_organizacionales(id, empresa_id, codigo, nombre, estado)
        values (v_uo_id, r_empresa.id, 'UO-' || lpad(v_seq::text, 3, '0'), r_asig.categoria, 'activo');

        v_creadas := v_creadas + 1;
        insert into public._reporte_backfill_posiciones(empresa_id, tipo, detalle)
        values (
          r_empresa.id, 'unidad_creada',
          'Unidad "' || r_asig.categoria || '" creada por falta de mapeo contra areas_empresa (id ' || v_uo_id || ')'
        );
      end if;

      -- Resolver reporta_a_posicion_id: siempre contra la posicion PRINCIPAL del jefe (si ya existe).
      v_jefe_pos_id := null;
      if r_asig.jefe_user_id is not null then
        select posicion_id into v_jefe_pos_id
        from _backfill_pos_principal_map
        where empresa_id = r_empresa.id and user_id = r_asig.jefe_user_id
        limit 1;

        if v_jefe_pos_id is null then
          v_no_mapeados := v_no_mapeados + 1;
          insert into public._reporte_backfill_posiciones(empresa_id, tipo, detalle)
          values (
            r_empresa.id, 'usuario_no_mapeado',
            'Usuario ' || r_asig.user_id || case when r_asig.es_principal then '' else ' (asignacion matricial)' end ||
            ': jefe ' || r_asig.jefe_user_id || ' sin posicion principal resuelta al momento del backfill'
          );
        end if;
      end if;

      insert into public.posiciones(empresa_id, unidad_organizacional_id, reporta_a_posicion_id)
      values (r_empresa.id, v_uo_id, v_jefe_pos_id)
      returning id into v_pos_id;

      insert into public.posiciones_usuarios(empresa_id, posicion_id, user_id, fecha_inicio)
      values (r_empresa.id, v_pos_id, r_asig.user_id, current_date);

      if r_asig.es_principal then
        insert into _backfill_pos_principal_map(empresa_id, user_id, posicion_id)
        values (r_empresa.id, r_asig.user_id, v_pos_id);
      end if;

      v_total := v_total + 1;
    end loop;

    insert into public._reporte_backfill_posiciones(empresa_id, tipo, detalle)
    values (
      r_empresa.id, 'resumen',
      'Posiciones creadas: ' || v_total || '. Unidades organizacionales nuevas: ' || v_creadas ||
      '. Vinculos jefe -> posicion sin resolver: ' || v_no_mapeados || '.'
    );

  end loop;

  -- Resolver responsable_posicion_id de cada unidad a partir del texto libre responsable_legado,
  -- buscando un usuario de ese nombre en el mismo tenant y tomando su posicion principal.
  for r_uo in
    select id, empresa_id, responsable_legado
    from public.unidades_organizacionales
    where responsable_legado is not null
      and trim(responsable_legado) <> ''
      and responsable_posicion_id is null
  loop
    v_pos_id := null;

    select m.posicion_id into v_pos_id
    from public.usuarios u
    join _backfill_pos_principal_map m
      on m.empresa_id = u.empresa_id and m.user_id::text = u.id
    where u.empresa_id = r_uo.empresa_id
      and lower(trim(u.nombre)) = lower(trim(r_uo.responsable_legado))
    limit 1;

    if v_pos_id is not null then
      update public.unidades_organizacionales
      set responsable_posicion_id = v_pos_id, updated_at = now()
      where id = r_uo.id;
    else
      insert into public._reporte_backfill_posiciones(empresa_id, tipo, detalle)
      values (
        r_uo.empresa_id, 'usuario_no_mapeado',
        'Responsable de area "' || r_uo.responsable_legado || '" (unidad ' || r_uo.id || ') no pudo resolverse a una posicion'
      );
    end if;
  end loop;
end;
$$;

-- Verificacion rapida en Supabase Studio:
--   select * from public._reporte_backfill_posiciones order by empresa_id, tipo, id;
select pg_notify('pgrst', 'reload schema');
