-- TIDEO ERP - Agregar hora_fin_estimada a ordenes_trabajo
alter table public.ordenes_trabajo
  add column if not exists hora_fin_estimada time;
