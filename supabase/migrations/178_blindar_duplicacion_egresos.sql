-- TIDEO ERP — Migración 178: Blindar duplicación de egresos
-- R4: no_devengar_er en cxp para que el flag pase por el flujo NuevoEgreso
-- R3: UNIQUE parcial en caja_chica.gasto_id para impedir dos registros CC al mismo gasto

-- ─── 1. CxP: columna no_devengar_er ─────────────────────────────────────────
-- Sin esta columna el campo se descarta silenciosamente al insertar y cada
-- CxP creada por NuevoEgreso devengaba dos veces en el ER.

alter table public.cxp
  add column if not exists no_devengar_er boolean not null default false;

-- ─── 2. caja_chica: UNIQUE parcial en gasto_id ───────────────────────────────
-- Impide a nivel de base de datos que el mismo compras_gastos sea referenciado
-- por dos registros de caja_chica. WHERE gasto_id IS NOT NULL para no afectar
-- registros legacy sin gasto_id.

create unique index if not exists caja_chica_gasto_id_unique
  on public.caja_chica (gasto_id)
  where gasto_id is not null;

select pg_notify('pgrst', 'reload schema');
