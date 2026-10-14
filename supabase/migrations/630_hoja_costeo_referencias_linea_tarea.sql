-- Vínculos opcionales para atribuir activos y materiales a la línea de mano de obra de una tarea.
-- No altera filas existentes: ambas columnas aceptan NULL y la migración no se aplica automáticamente.
BEGIN;

ALTER TABLE public.hoja_costeo_lineas_activos
  ADD COLUMN IF NOT EXISTS linea_mano_obra_id uuid
    REFERENCES public.hoja_costeo_lineas_mano_obra(id) ON DELETE SET NULL;

ALTER TABLE public.hoja_costeo_lineas_mano_obra
  ADD COLUMN IF NOT EXISTS actividad_receta_id text
    REFERENCES public.tipos_servicio_interno(id) ON DELETE SET NULL;

ALTER TABLE public.hoja_costeo_lineas_materiales
  ADD COLUMN IF NOT EXISTS linea_mano_obra_id uuid
    REFERENCES public.hoja_costeo_lineas_mano_obra(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.hoja_costeo_lineas_activos.linea_mano_obra_id IS
  'Línea de costo de tarea a la que corresponde este activo; NULL para filas anteriores o costos sin tarea.';
COMMENT ON COLUMN public.hoja_costeo_lineas_mano_obra.actividad_receta_id IS
  'Actividad que agrupa esta tarea en la receta; actividad_id queda reservado al nivel de costo actividad por el CHECK XOR.';
COMMENT ON COLUMN public.hoja_costeo_lineas_materiales.linea_mano_obra_id IS
  'Línea de costo de tarea a la que corresponde este material; NULL para filas anteriores o costos sin tarea.';

COMMIT;
