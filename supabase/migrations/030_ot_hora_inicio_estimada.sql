  -- TIDEO ERP - Agregar hora_inicio_estimada a ordenes_trabajo
  -- Soporta planificación horaria en el Planner sin modificar el parte diario.

  alter table public.ordenes_trabajo
    add column if not exists hora_inicio_estimada time;
