-- Desglose del presupuesto estimado por categoría en la OT.
-- Se hereda de la HC vinculada (via OS → cotización → HC) o se ingresa manualmente.
-- Todos opcionales: null significa sin presupuesto por categoría.

alter table public.ordenes_trabajo
  add column if not exists est_mo          numeric(12,2) default null,
  add column if not exists est_materiales  numeric(12,2) default null,
  add column if not exists est_terceros    numeric(12,2) default null,
  add column if not exists est_logistica   numeric(12,2) default null;
