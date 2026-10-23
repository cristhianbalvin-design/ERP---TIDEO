-- 641: WHYNCO — 9 registros sin trabajo guardados como «actividad» son tareas (aprobado por
-- Cristhian el 2026-10-21). Pasan a rol 'tarea' y, en las 3 Hojas de Costeo en borrador que los
-- usaban (HC-2026-2303, HC-2026-6519, HC-2026-8840), cada línea pasa de actividad_id a tarea_id.
-- Horas y costos no cambian. Aplicada en producción el 2026-10-21.

BEGIN;

CREATE TEMP TABLE _a_tareas(id text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _a_tareas VALUES
  ('tsi_908c3c9e2eac4bfbb6'),('tsi_8ee6176db08d47bdbf'),('tsi_e470232aca1c486a98'),
  ('tsi_3a6e18c316e74c3cbe'),('tsi_41c5b0697366476ba2'),('tsi_e0fb10ed92fd4907a9'),
  ('tsi_5631213d72dc49f6aa'),('tsi_4ab8205db1824ebeb8'),('tsi_66e8e84e69d448e88b');

DO $pre$
BEGIN
  ASSERT (SELECT count(*) FROM public.tipos_servicio_interno t JOIN _a_tareas a ON a.id=t.id
           WHERE t.empresa_id='emp_20513453711' AND t.rol='actividad' AND t.familia_trabajo_id IS NULL) = 9,
    'PRECONDITION_FAILED: los 9 registros no están como actividad sin trabajo';
  ASSERT NOT EXISTS (SELECT 1 FROM public.plantillas_actividad p JOIN _a_tareas a ON a.id=p.actividad_id)
     AND NOT EXISTS (SELECT 1 FROM public.diagnostico_tecnico_lineas l JOIN _a_tareas a ON a.id=l.actividad_id)
     AND NOT EXISTS (SELECT 1 FROM public.hoja_costeo_lineas_mano_obra m JOIN _a_tareas a ON a.id=m.actividad_id
                     JOIN public.hojas_costeo h ON h.id=m.hoja_costeo_id WHERE h.estado<>'borrador' OR m.tarea_id IS NOT NULL),
    'PRECONDITION_FAILED: hay usos que no son líneas en borrador sin tarea';
END
$pre$;

UPDATE public.hoja_costeo_lineas_mano_obra m SET tarea_id=m.actividad_id, actividad_id=NULL
  FROM _a_tareas a WHERE m.actividad_id=a.id AND m.tarea_id IS NULL;

UPDATE public.tipos_servicio_interno t SET rol='tarea' FROM _a_tareas a WHERE t.id=a.id;

DO $verify$
BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM public.hoja_costeo_lineas_mano_obra m JOIN _a_tareas a ON a.id=m.actividad_id),
    'VERIFY_FAILED: quedan líneas con estas tareas como actividad';
  ASSERT (SELECT count(*) FROM public.tipos_servicio_interno WHERE empresa_id='emp_20513453711' AND rol='actividad'
           AND estado='activo' AND familia_trabajo_id IS NULL) = 0,
    'VERIFY_FAILED: quedan actividades de WHYNCO sin trabajo';
END
$verify$;

COMMIT;
