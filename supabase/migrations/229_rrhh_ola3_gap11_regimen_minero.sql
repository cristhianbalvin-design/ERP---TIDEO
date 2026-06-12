-- TIDEO ERP - RRHH Ola 3 / GAP-11
-- Vista operativa del regimen minero.
-- Agrega soporte de induccion inicial a los ciclos mineros.
-- El regimen 2x1 usa ciclo_acumulativo con dias_ciclo_trabajo=2, dias_ciclo_descanso=1
-- (ya soportado por el modelo existente; no requiere nuevo valor de constraint).

-- Campos de induccion inicial en el ciclo minero
alter table public.asistencia_ciclos_mineros
  add column if not exists tiene_induccion   boolean not null default false,
  add column if not exists dias_induccion    integer,
  add column if not exists fecha_fin_induccion date;

-- Indice para filtrar ciclos activos con induccion
create index if not exists idx_ciclos_mineros_induccion
  on public.asistencia_ciclos_mineros (empresa_id, personal_id, tiene_induccion)
  where tiene_induccion = true;

select pg_notify('pgrst', 'reload schema');
