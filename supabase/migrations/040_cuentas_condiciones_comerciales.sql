-- Campos adicionales de condiciones comerciales y datos fiscales de cuentas.

alter table public.cuentas
  add column if not exists requiere_oc text,
  add column if not exists clasificacion_interna text,
  add column if not exists condicion_tributaria text;

select pg_notify('pgrst', 'reload schema');
