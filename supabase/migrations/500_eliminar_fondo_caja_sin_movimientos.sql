-- Un fondo sólo puede eliminarse antes de registrar actividad operativa.
-- La constitución inicial en tesorería se revierte junto con el fondo.

create or replace function public.eliminar_fondo_caja_sin_movimientos(p_fondo_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fondo public.caja_chica_fondos%rowtype;
begin
  select *
    into v_fondo
  from public.caja_chica_fondos
  where id = p_fondo_id
  for update;

  if not found then
    raise exception 'El fondo de caja chica no existe.';
  end if;

  if not public.usuario_tiene_empresa(v_fondo.empresa_id)
     or not public.usuario_puede(v_fondo.empresa_id, 'caja', 'anular') then
    raise exception 'No tienes permiso para eliminar fondos de caja chica.';
  end if;

  if exists (select 1 from public.caja_chica where fondo_id = v_fondo.id)
     or exists (select 1 from public.caja_chica_rendiciones where fondo_id = v_fondo.id)
     or exists (select 1 from public.caja_chica_arqueos where fondo_id = v_fondo.id) then
    raise exception 'No se puede eliminar un fondo que ya tiene movimientos.';
  end if;

  delete from public.movimientos_tesoreria
  where empresa_id = v_fondo.empresa_id
    and vinculo_tipo = 'caja_chica_fondo'
    and vinculo_id = v_fondo.id;

  delete from public.caja_chica_fondos
  where id = v_fondo.id;
end;
$$;

revoke execute on function public.eliminar_fondo_caja_sin_movimientos(text) from public, anon;
grant execute on function public.eliminar_fondo_caja_sin_movimientos(text) to authenticated, service_role;
