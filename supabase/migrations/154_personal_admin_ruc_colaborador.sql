-- Agrega ruc_colaborador a personal_administrativo.
-- Campo requerido para emitir recibos por honorarios a colaboradores admin.

alter table public.personal_administrativo
  add column if not exists ruc_colaborador text,
  add column if not exists retencion_ir    numeric(5,2) not null default 8;

select pg_notify('pgrst', 'reload schema');
