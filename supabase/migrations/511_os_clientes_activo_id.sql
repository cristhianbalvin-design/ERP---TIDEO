-- Vínculo opcional entre una OS Cliente y el activo/equipo atendido.
-- No altera RLS ni deriva datos automáticamente.
alter table public.os_clientes
  add column if not exists activo_id text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.os_clientes'::regclass
      and conname = 'os_clientes_activo_id_fkey'
  ) then
    alter table public.os_clientes
      add constraint os_clientes_activo_id_fkey
      foreign key (activo_id) references public.activos(id);
  end if;
end;
$$;

select pg_notify('pgrst', 'reload schema');
