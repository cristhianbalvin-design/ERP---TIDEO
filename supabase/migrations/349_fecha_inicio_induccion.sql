-- ============================================================================
-- 349 · fecha_inicio_induccion en asistencia_ciclos_mineros (aditiva)
-- ============================================================================
-- La inducción ocurre en oficinas administrativas, antes de que el ciclo real
-- de mina/descanso comience. Hasta ahora solo existían dias_induccion (número
-- libre) y fecha_fin_induccion; el inicio de la inducción quedaba implícito
-- (derivado restando dias_induccion-1 a fecha_fin_induccion, o coincidiendo
-- por defecto con fecha_inicio_ciclo). Esta migración agrega la fecha de
-- inicio explícita como fuente única del rango de inducción — dias_induccion
-- pasa a ser un valor derivado del rango (fecha_fin_induccion -
-- fecha_inicio_induccion + 1), calculado por el propio formulario en el
-- frontend, no una entrada libre independiente que pueda desincronizarse.
--
-- Backfill: para Juan (pop_1783959070510) y Mariano Cárdenas
-- (pop_1780692098054) — los únicos dos con tiene_induccion=true en todo el
-- sistema — se puebla fecha_inicio_induccion con el mismo cálculo ya usado en
-- la corrección de calcularEstadoCicloMinero (fecha_fin_induccion -
-- dias_induccion + 1), preservando exactamente el rango que ya se había
-- corregido y validado.

ALTER TABLE public.asistencia_ciclos_mineros
  ADD COLUMN IF NOT EXISTS fecha_inicio_induccion date;

UPDATE public.asistencia_ciclos_mineros
SET fecha_inicio_induccion = fecha_fin_induccion - (dias_induccion - 1)
WHERE tiene_induccion = true
  AND fecha_fin_induccion IS NOT NULL
  AND dias_induccion IS NOT NULL
  AND fecha_inicio_induccion IS NULL
  AND personal_id IN ('pop_1783959070510', 'pop_1780692098054');

SELECT pg_notify('pgrst', 'reload schema');
