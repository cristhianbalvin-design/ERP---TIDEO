-- TIDEO ERP - Sincronizacion continua (cont.): tambien al dar de alta un ocupante nuevo
--
-- Complementa 314_sync_continuo_cargo_posicion.sql, que cubre cambios de cargo_id en la ficha
-- legada y fusionar_cargos, pero no el tercer disparador posible: asignar un ocupante nuevo a
-- una posicion (INSERT en posiciones_usuarios con fecha_fin null). Si esa persona ya tiene cargo
-- legado y la posicion queda sin cargo, sin este trigger se repite el mismo tipo de gap resuelto
-- manualmente para la posicion 244c77b6-121e-448e-96cb-227f62363457 (emp_20541435833, "Soldador").
--
-- Reglas (mismo criterio conservador de 313/314):
--   - Posicion sin cargo (cargo_id is null): se reutiliza sincronizar_cargo_posicion, que ya
--     resuelve correctamente el caso general -- si todos los ocupantes activos (incluido el
--     recien insertado) coinciden en su cargo legado, lo propaga; si hay 2+ valores legados
--     distintos entre ellos (matricial en conflicto), no fuerza nada y lo reporta.
--   - Posicion que YA tiene cargo asignado: no se sobreescribe -- la posicion manda una vez que
--     ya tiene un valor. Si el ocupante nuevo trae un cargo legado distinto al de la posicion,
--     se deja constancia en _reporte_sync_cargo_posiciones para revision manual.

create or replace function public.trg_fn_sincronizar_cargo_posicion_alta_ocupante()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id text;
  v_cargo_actual text;
  v_cargo_legado_nuevo text;
begin
  select p.empresa_id, p.cargo_id into v_empresa_id, v_cargo_actual
  from public.posiciones p
  where p.id = new.posicion_id;

  if not found then
    return new;
  end if;

  -- Cargo legado del ocupante recien asignado (personal_operativo primero, luego
  -- personal_administrativo -- mismo orden de coalesce usado en sincronizar_cargo_posicion).
  select cargo_id into v_cargo_legado_nuevo
  from public.personal_operativo
  where auth_user_id = new.user_id and empresa_id = new.empresa_id
  limit 1;

  if v_cargo_legado_nuevo is null then
    select cargo_id into v_cargo_legado_nuevo
    from public.personal_administrativo
    where auth_user_id = new.user_id and empresa_id = new.empresa_id
    limit 1;
  end if;

  if v_cargo_legado_nuevo is null then
    -- El ocupante nuevo no tiene cargo legado: nada que propagar.
    return new;
  end if;

  if v_cargo_actual is null then
    -- Posicion sin cargo: delega en la funcion que ya resuelve consenso/conflicto entre TODOS
    -- los ocupantes activos de la posicion (incluye al recien insertado, visible dentro de la
    -- misma transaccion por ser un trigger AFTER INSERT).
    perform public.sincronizar_cargo_posicion(new.posicion_id);
    return new;
  end if;

  if v_cargo_legado_nuevo is distinct from v_cargo_actual then
    -- La posicion ya tenia cargo asignado y el ocupante nuevo trae uno distinto: no se
    -- sobreescribe, solo se reporta para revision manual.
    insert into public._reporte_sync_cargo_posiciones(empresa_id, posicion_id, tipo, detalle)
    values (
      v_empresa_id, new.posicion_id, 'conflicto_cargos_distintos',
      'Nuevo ocupante (user_id ' || new.user_id || ') de la posicion ' || new.posicion_id ||
      ' tiene cargo legado ' || v_cargo_legado_nuevo ||
      ', distinto del cargo ya asignado a la posicion (' || v_cargo_actual ||
      ') -- no se sobreescribio, revisar manualmente.'
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_posiciones_usuarios_sync_cargo_alta on public.posiciones_usuarios;
create trigger trg_posiciones_usuarios_sync_cargo_alta
after insert on public.posiciones_usuarios
for each row
when (new.fecha_fin is null)
execute function public.trg_fn_sincronizar_cargo_posicion_alta_ocupante();

select pg_notify('pgrst', 'reload schema');
