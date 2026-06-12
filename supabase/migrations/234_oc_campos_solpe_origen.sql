-- Columnas de SOLPE y origen que faltaban en ordenes_compra

alter table public.ordenes_compra
  add column if not exists solpe_id    text,
  add column if not exists solpe_codigo text,
  add column if not exists origen_tipo  text default 'directa';
