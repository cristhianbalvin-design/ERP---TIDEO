-- Bug fix: regimen_laboral era NOT NULL sin DEFAULT, bloqueaba INSERT de colaboradores honorarios.
-- Agregar DEFAULT 'general' es más seguro que hacer la columna nullable ya que preserva registros existentes.

alter table public.personal_administrativo
  alter column regimen_laboral set default 'general';

alter table public.personal_operativo
  alter column regimen_laboral set default 'general';

select pg_notify('pgrst', 'reload schema');
