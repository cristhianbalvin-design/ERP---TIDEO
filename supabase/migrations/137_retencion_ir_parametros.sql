-- Parámetros de retención IR para honorarios.

-- 1. empresa es agente de retención (nivel empresa, una sola vez)
alter table public.empresa_config
  add column if not exists agente_retencion boolean default false;

-- 2. suspensión de retenciones por colaborador
alter table public.personal_administrativo
  add column if not exists suspension_retenciones boolean default false,
  add column if not exists vencimiento_suspension  date;
