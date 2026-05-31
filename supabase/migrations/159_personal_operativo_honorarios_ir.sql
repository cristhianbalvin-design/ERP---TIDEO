-- TIDEO ERP — Migración 159: Campos para personal operativo en recibos por honorarios
alter table public.personal_operativo
  add column if not exists ruc_colaborador         text,
  add column if not exists retencion_ir           numeric(5,2) default 8,
  add column if not exists suspension_retenciones boolean not null default false,
  add column if not exists vencimiento_suspension  date;

select pg_notify('pgrst', 'reload schema');
