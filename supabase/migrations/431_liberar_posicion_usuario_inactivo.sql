-- Un usuario sin acceso activo no debe seguir ocupando una posición organizacional.
-- La posición no se elimina: queda vacante y conserva su unidad, cargo y jerarquía.
create or replace function public.liberar_posiciones_usuario_inactivo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado is distinct from 'activo' then
    update public.posiciones_usuarios
    set fecha_fin = current_date,
        updated_at = now()
    where empresa_id = new.empresa_id
      and user_id = new.user_id
      and fecha_fin is null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_zzz_liberar_posiciones_usuario_inactivo on public.usuarios_empresas;
create trigger trg_zzz_liberar_posiciones_usuario_inactivo
after insert or update of estado
on public.usuarios_empresas
for each row execute function public.liberar_posiciones_usuario_inactivo();

-- Corrige ocupaciones heredadas de usuarios que ya estaban inactivos antes de esta regla.
update public.posiciones_usuarios pu
set fecha_fin = current_date,
    updated_at = now()
from public.usuarios_empresas ue
where ue.empresa_id = pu.empresa_id
  and ue.user_id = pu.user_id
  and ue.estado is distinct from 'activo'
  and pu.fecha_fin is null;

grant execute on function public.liberar_posiciones_usuario_inactivo() to authenticated, service_role;
