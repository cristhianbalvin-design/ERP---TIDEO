-- Campos adicionales para el cierre técnico detallado desde la ficha de OT.

alter table public.cierres_tecnicos
  add column if not exists descripcion_trabajo text,
  add column if not exists fecha_inicio_real   date,
  add column if not exists horas_total         numeric(8,2) default 0,
  add column if not exists avance_final        int          default 100;
