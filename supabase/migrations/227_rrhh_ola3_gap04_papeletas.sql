-- TIDEO ERP - RRHH Ola 3 / GAP-04
-- Papeletas de movimiento DI-FG-48.
-- Agrega tipos bajada y comision_trabajo, clasificacion_pago, campos de papeleta y correlativo PM-XXXX.

-- 1. Ampliar el check de tipo (idempotente: drop + recrear)
alter table public.solicitudes_rrhh
  drop constraint if exists solicitudes_rrhh_tipo_check;

alter table public.solicitudes_rrhh
  add constraint solicitudes_rrhh_tipo_check
  check (tipo in (
    'vacaciones', 'permiso_con_goce', 'permiso_sin_goce',
    'licencia_medica', 'licencia_maternidad', 'licencia_paternidad',
    'compensacion_horas', 'bajada', 'comision_trabajo'
  ));

-- 2. Nuevos campos para la papeleta oficial
alter table public.solicitudes_rrhh
  add column if not exists clasificacion_pago text
    check (clasificacion_pago in ('remunerado', 'no_remunerado', 'recuperacion_horas')),
  add column if not exists fecha_retorno date,
  add column if not exists unidad text not null default 'dias'
    check (unidad in ('dias', 'horas')),
  add column if not exists cantidad_horas numeric(6,2),
  add column if not exists numero_correlativo text;

-- 3. Indice de unicidad para correlativos PM por tenant
create unique index if not exists solicitudes_rrhh_correlativo_unique
  on public.solicitudes_rrhh (empresa_id, numero_correlativo)
  where numero_correlativo is not null;

select pg_notify('pgrst', 'reload schema');
