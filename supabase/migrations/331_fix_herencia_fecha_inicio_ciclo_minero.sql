-- ============================================================================
-- 331 · Reparación retroactiva: fecha_inicio_ciclo reiniciada indebidamente
-- ============================================================================
-- Bug (src/context.jsx, aplicarSnapshotDocumentoPersonal): al crear un nuevo
-- tramo de jornada por validación de contrato, fecha_inicio_ciclo se fijaba
-- siempre a la fecha de vigencia del cambio, sin verificar si el tramo
-- anterior ya tenía el mismo régimen de ciclo minero (dias_ciclo_trabajo y
-- dias_ciclo_descanso iguales). Esto reiniciaba el conteo del ciclo de
-- guardia aunque el trabajador nunca dejó de seguir su patrón real.
-- El código ya fue corregido para heredar fecha_inicio_ciclo del tramo
-- anterior cuando el régimen no cambia. Esta migración repara los dos
-- registros ya identificados con el mismo bug.

UPDATE public.personal_asignaciones_jornada
SET fecha_inicio_ciclo = '2026-06-25'
WHERE id = 'asig_33fa3ecfe3fd'
  AND personal_id = 'pop_1781015087846'
  AND fecha_inicio = '2026-06-30';

UPDATE public.personal_asignaciones_jornada
SET fecha_inicio_ciclo = '2026-07-01'
WHERE id = 'asig_2ef74023d106'
  AND personal_id = 'pop_1781016883372'
  AND fecha_inicio = '2026-07-09';
