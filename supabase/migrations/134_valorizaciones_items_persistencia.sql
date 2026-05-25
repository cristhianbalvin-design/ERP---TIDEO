-- Persistencia del detalle de valorizaciones usado por el frontend.

alter table public.valorizaciones
  add column if not exists items jsonb default '[]',
  add column if not exists ot_ids jsonb default '[]',
  add column if not exists historial jsonb default '[]',
  add column if not exists modelo_calculo text,
  add column if not exists notas text,
  add column if not exists fecha_aprobacion date,
  add column if not exists motivo_anulacion text;

select pg_notify('pgrst', 'reload schema');
