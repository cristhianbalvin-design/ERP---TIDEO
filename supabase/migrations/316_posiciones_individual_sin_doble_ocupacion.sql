-- TIDEO ERP - Cierra el hueco de doble ocupacion en posiciones de cargo individual.
--
-- Auditoria previa confirmo: el frontend (PosicionSelector) solo advertia con un window.confirm
-- ignorable, y no habia ninguna validacion real en backend -- una posicion de cargo individual
-- podia terminar con 2+ ocupantes activos simultaneos sin que nada lo impidiera. 0 casos de
-- corrupcion en produccion hoy; esto cierra el hueco antes de que ocurra el primero.
--
-- Trigger BEFORE INSERT/UPDATE en posiciones_usuarios (no en la Edge Function): asi protege por
-- igual los 3 caminos reales de escritura -- posicion_asignar_usuario (llamado tanto por
-- posicion_guardar_asignacion_principal como por posicion_guardar_asignaciones_extra, usados por
-- las Edge Functions crear-usuario-acceso/actualizar-usuario-acceso) y el trigger legado
-- sincronizar_posicion_desde_asignacion -- sin depender de que cada punto de entrada recuerde
-- validar.
--
-- Cargos 'compartido' (Maestros -> Cargos) quedan sin restriccion, tal como ya se comportan hoy.
-- Una posicion sin cargo asignado (cargo_id null) se trata como individual por default, mismo
-- criterio que ya usa el frontend (PosicionSelector.jsx: cargoSeleccionado?.modo_gestion ===
-- 'compartido').

create or replace function public.validar_posicion_individual_sin_duplicado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_modo_gestion text;
  v_ocupante_existente uuid;
begin
  if new.fecha_fin is not null then
    -- Solo valida altas/reactivaciones activas; cerrar una ocupacion nunca genera conflicto.
    return new;
  end if;

  select ce.modo_gestion into v_modo_gestion
  from public.posiciones p
  left join public.cargos_empresa ce on ce.id = p.cargo_id
  where p.id = new.posicion_id;

  if coalesce(v_modo_gestion, 'individual') = 'compartido' then
    return new;
  end if;

  select pu.user_id into v_ocupante_existente
  from public.posiciones_usuarios pu
  where pu.posicion_id = new.posicion_id
    and pu.fecha_fin is null
    and pu.user_id <> new.user_id
    and pu.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
  limit 1;

  if v_ocupante_existente is not null then
    raise exception 'La posicion % ya tiene un ocupante activo distinto (%) -- es de cargo individual, no admite doble ocupacion.',
      new.posicion_id, v_ocupante_existente
      using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_posiciones_usuarios_validar_individual on public.posiciones_usuarios;
create trigger trg_posiciones_usuarios_validar_individual
before insert or update of posicion_id, user_id, fecha_fin
on public.posiciones_usuarios
for each row
execute function public.validar_posicion_individual_sin_duplicado();

select pg_notify('pgrst', 'reload schema');
