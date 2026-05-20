-- Campos adicionales para comisiones en personal_administrativo
alter table public.personal_administrativo
  add column if not exists ruc_vendedor text,
  add column if not exists retencion_ir_comision numeric(5,2) not null default 8;
