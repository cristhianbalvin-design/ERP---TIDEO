-- Permite completar la trazabilidad de una Hoja de Costeo aprobada.
-- El contenido de costeo sigue siendo inmutable; solo cotizacion_id puede
-- cambiar después de la aprobación para vincular la cotización generada.

create or replace function public.bloquear_hoja_costeo_aprobada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_sin_cotizacion public.hojas_costeo%rowtype;
  new_sin_cotizacion public.hojas_costeo%rowtype;
begin
  if old.estado = 'aprobada' and new.estado = 'aprobada' then
    old_sin_cotizacion := old;
    new_sin_cotizacion := new;
    old_sin_cotizacion.cotizacion_id := null;
    new_sin_cotizacion.cotizacion_id := null;

    if old_sin_cotizacion is distinct from new_sin_cotizacion then
      raise exception 'No se puede modificar una Hoja de Costeo aprobada.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.bloquear_hoja_costeo_aprobada()
  from public, anon, authenticated, service_role;

select pg_notify('pgrst', 'reload schema');

-- El trigger existe en produccion pero no estaba versionado en el repo.
drop trigger if exists trg_bloquear_hoja_costeo_aprobada on public.hojas_costeo;
create trigger trg_bloquear_hoja_costeo_aprobada
before update on public.hojas_costeo
for each row execute function public.bloquear_hoja_costeo_aprobada();