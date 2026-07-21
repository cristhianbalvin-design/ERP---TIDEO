-- ============================================================================
-- 338 · Backfill: ciclos mineros faltantes en asistencia_ciclos_mineros
-- ============================================================================
-- Diagnóstico: personal_operativo.regimen_jornada ya está correctamente
-- configurado como 'minero_*' para el personal en régimen minero (vía el
-- panel de "Asignación de jornada" de nómina, que escribe en
-- personal_asignaciones_jornada). Pero nadie ejecutó, para ese mismo
-- personal, el paso separado de "Registrar ciclo" dentro de Control de
-- Asistencia → pestaña "Régimen Minero" — el único punto que inserta filas
-- en asistencia_ciclos_mineros. Sin esa fila:
--   - La pestaña "Régimen Minero" muestra al trabajador con badge "Sin ciclo"
--     y sin día/progreso/próxima bajada calculados.
--   - El Roster minero (calcularRosterPeriodo) no tiene fecha_inicio_ciclo
--     de referencia y no puede marcar los días sin registro diario como
--     "pendientes de revisión".
-- Esto es sistémico (no específico de un tenant): verificado que ningún
-- trabajador en régimen minero de ninguna empresa tenía fila en
-- asistencia_ciclos_mineros antes de esta migración.
--
-- Esta migración inserta, para cada trabajador de personal_operativo en
-- régimen minero sin fila existente en asistencia_ciclos_mineros, un único
-- ciclo "ancla" tomando fecha_inicio_ciclo / dias_ciclo_trabajo /
-- dias_ciclo_descanso de su asignación de jornada vigente
-- (personal_asignaciones_jornada con fecha_fin IS NULL). No genera
-- registros_asistencia diarios: calcularEstadoCicloMinero() y
-- calcularRosterPeriodo() derivan el estado del ciclo en curso a partir de
-- esta única fecha_inicio_ciclo (aritmética de módulo), y no hay asistencia
-- diaria real que fabricar retroactivamente.

INSERT INTO public.asistencia_ciclos_mineros (
  id, empresa_id, personal_id, personal_nombre, personal_tipo,
  regimen_jornada, fecha_inicio_ciclo, fecha_fin_ciclo,
  dias_ciclo_trabajo, dias_ciclo_descanso,
  tiene_induccion, dias_induccion, fecha_fin_induccion
)
SELECT
  'ciclo_' || replace(gen_random_uuid()::text, '-', ''),
  po.empresa_id,
  po.id,
  po.nombre,
  'operativo',
  po.regimen_jornada,
  asig.fecha_inicio_ciclo,
  asig.fecha_inicio_ciclo + (asig.dias_ciclo_trabajo + asig.dias_ciclo_descanso - 1),
  asig.dias_ciclo_trabajo,
  asig.dias_ciclo_descanso,
  false, NULL, NULL
FROM public.personal_operativo po
JOIN public.personal_asignaciones_jornada asig
  ON asig.personal_id = po.id AND asig.fecha_fin IS NULL
WHERE (po.regimen_jornada LIKE 'minero_%' OR po.regimen_jornada = 'ciclo_acumulativo')
  AND asig.fecha_inicio_ciclo IS NOT NULL
  AND asig.dias_ciclo_trabajo IS NOT NULL
  AND asig.dias_ciclo_descanso IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.asistencia_ciclos_mineros acm WHERE acm.personal_id = po.id
  );
