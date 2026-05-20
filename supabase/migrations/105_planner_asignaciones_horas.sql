-- Corrige persistencia de horarios en asignaciones de tecnicos.
-- El frontend guarda estos campos en planner_asignaciones al asignar personal a una OT.

alter table public.planner_asignaciones
  add column if not exists hora_inicio_estimada time,
  add column if not exists hora_fin_estimada time;

