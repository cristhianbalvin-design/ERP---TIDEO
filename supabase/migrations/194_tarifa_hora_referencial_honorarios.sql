-- tarifa_hora_referencial: campo operativo para costeo de MO en partes diarios.
-- Nullable: solo aplica cuando modalidad_contrato = 'honorarios'.
-- Para planilla, el costo hora se obtiene de tarifa_hora (calculada automáticamente).

alter table public.personal_operativo
  add column if not exists tarifa_hora_referencial numeric(14,2) null;

alter table public.personal_administrativo
  add column if not exists tarifa_hora_referencial numeric(14,2) null;

select pg_notify('pgrst', 'reload schema');
