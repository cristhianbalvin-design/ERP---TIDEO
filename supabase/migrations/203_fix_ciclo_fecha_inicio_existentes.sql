-- Establece fecha_inicio_ciclo = '2026-06-01' para todos los trabajadores con
-- régimen ciclo_acumulativo que aún no tienen fecha de inicio registrada.
-- Los días (dias_ciclo_trabajo / dias_ciclo_descanso) ya fueron rellenados por
-- la migración 192 al convertir minero_14x7/20x10/28x14 a ciclo_acumulativo.

UPDATE public.personal_operativo
SET fecha_inicio_ciclo = '2026-06-01'
WHERE regimen_jornada = 'ciclo_acumulativo'
  AND fecha_inicio_ciclo IS NULL;

UPDATE public.personal_administrativo
SET fecha_inicio_ciclo = '2026-06-01'
WHERE regimen_jornada = 'ciclo_acumulativo'
  AND fecha_inicio_ciclo IS NULL;

select pg_notify('pgrst', 'reload schema');
