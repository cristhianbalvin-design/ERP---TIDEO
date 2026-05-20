-- Desglose de costos reales en el cierre técnico.
-- MO y materiales se calculan desde partes aprobados.
-- Terceros y logística se ingresan manualmente al cerrar la OT.

alter table public.cierres_tecnicos
  add column if not exists costo_terceros  numeric(12,2) default 0,
  add column if not exists costo_logistica numeric(12,2) default 0;
