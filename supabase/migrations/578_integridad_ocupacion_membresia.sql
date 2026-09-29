-- Una ocupacion activa representa a un usuario con acceso activo al mismo tenant.
-- La ausencia de esta regla permitia borrar/mover una fila de usuarios_empresas y
-- dejar posiciones_usuarios abierta: el organigrama la contaba, pero Usuarios no
-- podia mostrar a la persona. Esta migracion conserva el historial y evita nuevas
-- inconsistencias sin cerrar automaticamente los casos heredados.

create or replace function public.cerrar_ocupaciones_al_retirar_membresia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update public.posiciones_usuarios
    set fecha_fin = current_date,
        updated_at = now()
    where empresa_id = old.empresa_id
      and user_id = old.user_id
      and fecha_fin is null;
    return old;
  end if;

  if old.empresa_id is distinct from new.empresa_id
     or old.user_id is distinct from new.user_id then
    update public.posiciones_usuarios
    set fecha_fin = current_date,
        updated_at = now()
    where empresa_id = old.empresa_id
      and user_id = old.user_id
      and fecha_fin is null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_cerrar_ocupaciones_al_retirar_membresia on public.usuarios_empresas;
create trigger trg_cerrar_ocupaciones_al_retirar_membresia
before delete or update of empresa_id, user_id
on public.usuarios_empresas
for each row execute function public.cerrar_ocupaciones_al_retirar_membresia();

create or replace function public.validar_membresia_activa_ocupacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Cerrar una ocupacion siempre esta permitido: conserva el historial laboral.
  if new.fecha_fin is not null then
    return new;
  end if;

  if not exists (
    select 1
    from public.usuarios_empresas ue
    where ue.empresa_id = new.empresa_id
      and ue.user_id = new.user_id
      and ue.estado = 'activo'
  ) then
    raise exception
      'El usuario % no tiene una membresia activa en el tenant %; no puede ocupar una posicion activa.',
      new.user_id, new.empresa_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_posiciones_usuarios_validar_membresia on public.posiciones_usuarios;
create trigger trg_posiciones_usuarios_validar_membresia
before insert or update of empresa_id, user_id, fecha_fin
on public.posiciones_usuarios
for each row execute function public.validar_membresia_activa_ocupacion();

-- Los casos previos NO se cierran aqui. listar-usuarios-acceso los expone como
-- "Sin membresia" para que un administrador decida restaurar el acceso o cerrar
-- la ocupacion de forma informada.

grant execute on function public.cerrar_ocupaciones_al_retirar_membresia() to authenticated, service_role;
grant execute on function public.validar_membresia_activa_ocupacion() to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');
