-- TIDEO ERP — Migración 167: Columnas faltantes en recibos_honorarios
-- La migración 135 no fue aplicada en producción.
-- Agrega motivo_retencion, numero_rhe y personal_id que el frontend envía.

alter table public.recibos_honorarios
  add column if not exists motivo_retencion text,
  add column if not exists numero_rhe       text,
  add column if not exists moneda_cxp       text,
  add column if not exists personal_id     text references public.personal_administrativo(id) on delete set null;

select pg_notify('pgrst', 'reload schema');
