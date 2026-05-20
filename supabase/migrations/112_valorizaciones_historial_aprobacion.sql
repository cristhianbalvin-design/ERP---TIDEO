-- Agrega campos para historial de estados, fecha de aprobación y motivo de anulación.
alter table public.valorizaciones
  add column if not exists historial jsonb default '[]',
  add column if not exists fecha_aprobacion date,
  add column if not exists motivo_anulacion text;
