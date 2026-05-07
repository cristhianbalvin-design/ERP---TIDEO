-- TIDEO ERP - Modalidad contractual en personal operativo
-- Completa datos de planilla y permite distinguir recibos por honorarios.

alter table public.personal_operativo
  add column if not exists tipo_contrato text default 'Planilla',
  add column if not exists afp_nombre text,
  add column if not exists tiene_hijos boolean default false,
  add column if not exists regimen_laboral text,
  add column if not exists cuota_prestamo_mes numeric(14,2) default 0,
  add column if not exists descuento_judicial numeric(14,2) default 0;

update public.personal_operativo
set tipo_contrato = coalesce(tipo_contrato, 'Planilla'),
    tiene_hijos = coalesce(tiene_hijos, false),
    cuota_prestamo_mes = coalesce(cuota_prestamo_mes, 0),
    descuento_judicial = coalesce(descuento_judicial, 0);

select pg_notify('pgrst', 'reload schema');
