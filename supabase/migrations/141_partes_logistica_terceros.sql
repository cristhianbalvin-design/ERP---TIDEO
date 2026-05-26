-- Persiste costos de logística y terceros registrados en el parte diario.
-- Antes solo vivían en memoria y se perdían al recargar la página.
-- También guarda el nombre del técnico para que se muestre correctamente al recargar.

alter table public.partes_diarios
  add column if not exists logistica_lineas jsonb default '[]'::jsonb,
  add column if not exists terceros_lineas  jsonb default '[]'::jsonb,
  add column if not exists tecnico_nombre   text   default null;
