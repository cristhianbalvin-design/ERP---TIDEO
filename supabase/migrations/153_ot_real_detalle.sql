-- Desglose de costos reales ingresados manualmente en el tab Costos de la OT.
-- Complementa (o reemplaza por sección) a los costos calculados desde partes aprobados.
-- Estructura: { mano_obra: [...], materiales: [...], terceros: [...], logistica: [...] }

alter table public.ordenes_trabajo
  add column if not exists real_detalle jsonb default null;
