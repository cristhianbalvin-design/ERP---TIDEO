-- 545 · Permite que documentos sin oportunidad conserven la línea elegida
-- por el cliente. Cuando existe oportunidad_id, la derivación 544 sigue
-- siendo autoritativa y lee oportunidades.linea_negocio server-side.

begin;

create or replace function public.derivar_linea_negocio_desde_oportunidad()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.oportunidad_id is not null then
    select o.linea_negocio
      into new.linea_negocio
    from public.oportunidades o
    where o.id = new.oportunidad_id
      and o.empresa_id = new.empresa_id;
  end if;

  return new;
end;
$$;

revoke all on function public.derivar_linea_negocio_desde_oportunidad()
  from public, anon, authenticated, service_role;

select pg_notify('pgrst', 'reload schema');
commit;
