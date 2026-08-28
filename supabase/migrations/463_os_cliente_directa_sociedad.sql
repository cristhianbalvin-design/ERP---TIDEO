-- Permite registrar una OS Cliente directa (sin cotizacion) en tenants multisociedad.
-- Con cotizacion, la sociedad siempre se deriva de ella; sin cotizacion se conserva la
-- sociedad valida seleccionada en el formulario.

create or replace function public.derivar_sociedad_os_cliente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sociedad_id uuid;
begin
  if new.cotizacion_id is not null then
    select c.sociedad_id
    into v_sociedad_id
    from public.cotizaciones c
    where c.id = new.cotizacion_id
      and c.empresa_id = new.empresa_id;

    if v_sociedad_id is null then
      raise exception 'La cotizacion vinculada no tiene una sociedad valida.';
    end if;
    new.sociedad_id := v_sociedad_id;
  elsif new.sociedad_id is not null and not exists (
    select 1
    from public.sociedades s
    where s.id = new.sociedad_id
      and s.empresa_id = new.empresa_id
      and coalesce(s.activa, true)
  ) then
    raise exception 'La sociedad seleccionada no es valida para esta empresa.';
  end if;

  return new;
end;
$$;

select pg_notify('pgrst', 'reload schema');
