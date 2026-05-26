-- Permite asignar personal administrativo al planner.
-- La FK anterior solo permitía personal_operativo; ahora el ID puede
-- venir de personal_operativo O personal_admin, la validación es en la app.

alter table public.planner_asignaciones
  drop constraint if exists planner_asignaciones_tecnico_id_fkey;
