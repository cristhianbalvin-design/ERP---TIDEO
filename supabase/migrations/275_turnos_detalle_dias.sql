alter table public.turnos
add column if not exists detalle_dias jsonb default null;

select pg_notify('pgrst', 'reload schema');
