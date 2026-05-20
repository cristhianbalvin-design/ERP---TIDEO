-- Agrega campos para modelo de cálculo, notas y referencia de OTs incluidas.
alter table public.valorizaciones
  add column if not exists modelo_calculo text,
  add column if not exists notas text,
  add column if not exists ot_ids jsonb default '[]';
