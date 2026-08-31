-- Los préstamos se crean desde distintos flujos. El id es text y era obligatorio,
-- pero ni la tabla ni el servicio original lo generaban de forma consistente.
-- Se cubren ambos casos: omisión del campo (DEFAULT) y NULL/cadena vacía (trigger).

alter table public.prestamos_personal
  alter column id set default ('pre_' || replace(gen_random_uuid()::text, '-', ''));

create or replace function public.prestamos_personal_asignar_id()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.id is null or btrim(new.id) = '' then
    new.id := 'pre_' || replace(gen_random_uuid()::text, '-', '');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prestamos_personal_asignar_id on public.prestamos_personal;
create trigger trg_prestamos_personal_asignar_id
before insert on public.prestamos_personal
for each row execute function public.prestamos_personal_asignar_id();

select pg_notify('pgrst', 'reload schema');
