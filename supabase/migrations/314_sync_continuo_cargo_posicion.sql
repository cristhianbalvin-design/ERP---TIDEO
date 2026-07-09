-- TIDEO ERP - Sincronizacion continua: posiciones.cargo_id <- cargo_id de la ficha legada
--
-- Continuacion de 313_backfill_posiciones_cargo_desde_legado.sql (backfill puntual, una sola
-- vez). Sin este trigger, cualquier edicion futura del cargo en personal_operativo /
-- personal_administrativo, o una fusion de cargos via fusionar_cargos (que hasta ahora solo
-- reescribia la ficha legada y nunca posiciones.cargo_id), reabre en silencio la brecha entre
-- ambas fuentes.
--
-- Direccion unica: ficha legada -> posicion. Nunca al reves -- personal_operativo /
-- personal_administrativo no se tocan aqui.
--
-- Mismo criterio conservador que el backfill 313: una posicion solo se actualiza cuando TODOS
-- sus ocupantes activos (posiciones_usuarios.fecha_fin is null) que tienen cargo legado
-- coinciden en el mismo valor. Si una posicion "compartida" (matricial) tiene ocupantes activos
-- con cargos legados distintos entre si, no se fuerza ningun valor: la posicion queda como
-- estaba y el conflicto se registra en _reporte_sync_cargo_posiciones para revision manual.

create table if not exists public._reporte_sync_cargo_posiciones (
  id bigint generated always as identity primary key,
  empresa_id text references public.empresas(id),
  posicion_id uuid references public.posiciones(id) on delete cascade,
  tipo text not null check (tipo in ('conflicto_cargos_distintos')),
  detalle text not null,
  created_at timestamptz not null default now()
);

alter table public._reporte_sync_cargo_posiciones enable row level security;

drop policy if exists tenant_reporte_sync_cargo_posiciones_isolation on public._reporte_sync_cargo_posiciones;
create policy tenant_reporte_sync_cargo_posiciones_isolation
on public._reporte_sync_cargo_posiciones
for all
using (empresa_id is null or public.usuario_tiene_empresa(empresa_id))
with check (empresa_id is null or public.usuario_tiene_empresa(empresa_id));

-- ─── Funcion nucleo: recalcula posiciones.cargo_id de UNA posicion a partir del cargo legado de
-- sus ocupantes activos. Reutilizable tanto desde el trigger de personal_operativo/administrativo
-- como, a futuro, desde cualquier otro punto que necesite forzar el recalculo de una posicion.
create or replace function public.sincronizar_cargo_posicion(p_posicion_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id text;
  v_cargo_actual text;
  v_legados text[];
begin
  select empresa_id, cargo_id into v_empresa_id, v_cargo_actual
  from public.posiciones
  where id = p_posicion_id;

  if not found then
    return;
  end if;

  -- Cargos legados (no nulos) de los ocupantes activos de la posicion, sin duplicados.
  select array_agg(distinct oc.cargo_legado)
  into v_legados
  from (
    select coalesce(po.cargo_id, pa.cargo_id) as cargo_legado
    from public.posiciones_usuarios pu
    left join public.personal_operativo po
           on po.auth_user_id = pu.user_id and po.empresa_id = pu.empresa_id
    left join public.personal_administrativo pa
           on pa.auth_user_id = pu.user_id and pa.empresa_id = pu.empresa_id
    where pu.posicion_id = p_posicion_id
      and pu.fecha_fin is null
  ) oc
  where oc.cargo_legado is not null;

  if v_legados is null then
    -- Ningun ocupante activo tiene cargo legado (o la posicion esta vacante): nada que propagar.
    return;
  end if;

  if array_length(v_legados, 1) > 1 then
    -- Conflicto real: ocupantes activos de la misma posicion (matricial) con cargos legados
    -- distintos entre si. No se fuerza ningun valor -- mismo criterio conservador del backfill 313.
    insert into public._reporte_sync_cargo_posiciones(empresa_id, posicion_id, tipo, detalle)
    values (
      v_empresa_id, p_posicion_id, 'conflicto_cargos_distintos',
      'Posicion ' || p_posicion_id || ' tiene ocupantes activos con cargos legados distintos entre si (' ||
      array_to_string(v_legados, ', ') || ') -- no se sincronizo, revisar manualmente.'
    );
    return;
  end if;

  if v_legados[1] is distinct from v_cargo_actual then
    update public.posiciones
    set cargo_id = v_legados[1], updated_at = now()
    where id = p_posicion_id;
  end if;
end;
$$;

-- ─── Trigger sobre personal_operativo / personal_administrativo: al cambiar el cargo legado de
-- una persona, recalcula el cargo de todas sus posiciones activas.
create or replace function public.trg_fn_sincronizar_cargo_posicion_desde_legado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select posicion_id
    from public.posiciones_usuarios
    where user_id = new.auth_user_id
      and empresa_id = new.empresa_id
      and fecha_fin is null
  loop
    perform public.sincronizar_cargo_posicion(r.posicion_id);
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_personal_operativo_sync_cargo_posicion on public.personal_operativo;
create trigger trg_personal_operativo_sync_cargo_posicion
after update of cargo_id on public.personal_operativo
for each row
when (old.cargo_id is distinct from new.cargo_id and new.auth_user_id is not null)
execute function public.trg_fn_sincronizar_cargo_posicion_desde_legado();

drop trigger if exists trg_personal_administrativo_sync_cargo_posicion on public.personal_administrativo;
create trigger trg_personal_administrativo_sync_cargo_posicion
after update of cargo_id on public.personal_administrativo
for each row
when (old.cargo_id is distinct from new.cargo_id and new.auth_user_id is not null)
execute function public.trg_fn_sincronizar_cargo_posicion_desde_legado();

-- ─── fusionar_cargos: ahora tambien propaga a posiciones.cargo_id. Sustitucion directa de un
-- valor que ya existe (cargo_id = origen -> destino), no hay ambiguedad posible aqui a diferencia
-- de sincronizar_cargo_posicion (que resuelve el valor desde el cargo legado de los ocupantes).
create or replace function public.fusionar_cargos(
  p_cargo_origen_id  text,
  p_cargo_destino_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id text;
begin
  -- Cargo destino válido y accesible para el usuario
  select empresa_id into v_empresa_id
  from public.cargos_empresa
  where id = p_cargo_destino_id;

  if not found then
    raise exception 'Cargo destino no encontrado';
  end if;

  if not public.usuario_tiene_empresa(v_empresa_id) then
    raise exception 'Acceso denegado al tenant';
  end if;

  -- Cargo origen debe pertenecer al mismo tenant
  if not exists (
    select 1 from public.cargos_empresa
    where id = p_cargo_origen_id and empresa_id = v_empresa_id
  ) then
    raise exception 'El cargo origen no pertenece al mismo tenant';
  end if;

  if p_cargo_origen_id = p_cargo_destino_id then
    raise exception 'Origen y destino deben ser cargos distintos';
  end if;

  -- Reapuntar fichas
  update public.personal_operativo
    set cargo_id = p_cargo_destino_id
    where cargo_id = p_cargo_origen_id;

  update public.personal_administrativo
    set cargo_id = p_cargo_destino_id
    where cargo_id = p_cargo_origen_id;

  -- Reapuntar posiciones que ya apuntaban al cargo origen (ver comentario arriba de la funcion).
  update public.posiciones
    set cargo_id = p_cargo_destino_id, updated_at = now()
    where cargo_id = p_cargo_origen_id;

  -- Desactivar origen (no eliminar — regla de auditoría del sistema)
  update public.cargos_empresa
    set estado = 'inactivo', updated_at = now()
    where id = p_cargo_origen_id;
end;
$$;

select pg_notify('pgrst', 'reload schema');
