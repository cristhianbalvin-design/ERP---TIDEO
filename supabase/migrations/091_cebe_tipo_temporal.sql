-- TIDEO ERP - Permitir tipo Temporal en Centros de Beneficio

alter table public.centros_beneficio drop constraint if exists centros_beneficio_tipo_check;
alter table public.centros_beneficio
  add constraint centros_beneficio_tipo_check
  check (tipo in ('linea_servicio', 'cliente', 'proyecto', 'producto', 'temporal'));

