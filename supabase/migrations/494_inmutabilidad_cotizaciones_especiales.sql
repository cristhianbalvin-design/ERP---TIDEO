-- 494 · Defensa en profundidad para Cotización Especial emitida/anulada.
-- La RLS restringe las actualizaciones normales a borradores; este trigger
-- también protege frente a rutas privilegiadas. Se preserva únicamente la
-- transición futura emitido -> anulado, sin permitir alterar otra columna.

create or replace function public.proteger_inmutabilidad_cotizacion_especial()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.estado = 'anulado' then
    raise exception 'Una Cotización Especial anulada es inmutable.'
      using errcode = '55000';
  end if;

  if old.estado = 'emitido' then
    if new.estado <> 'anulado'
       or (to_jsonb(new) - 'estado') is distinct from (to_jsonb(old) - 'estado') then
      raise exception 'Una Cotización Especial emitida sólo puede pasar a anulado sin modificar sus demás datos.'
        using errcode = '55000';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.proteger_inmutabilidad_cotizacion_especial()
  from public, anon, authenticated, service_role;

create trigger ab_proteger_inmutabilidad_cotizacion_especial
before update on public.cotizaciones_especiales
for each row execute function public.proteger_inmutabilidad_cotizacion_especial();

select pg_notify('pgrst', 'reload schema');
