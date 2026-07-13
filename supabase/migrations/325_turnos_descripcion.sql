alter table public.turnos
add column if not exists descripcion text default null;

select pg_notify('pgrst', 'reload schema');
