SELECT json_build_object(
  'asistencia_marcaciones', (
    SELECT json_agg(row_to_json(m))
    FROM (
      SELECT id, fecha, sociedad_id, empresa_id 
      FROM asistencia_marcaciones 
      WHERE personal_id = 'pop_1781016512343' AND fecha >= '2026-07-01' AND fecha <= '2026-07-21'
    ) m
  ),
  'registros_asistencia', (
    SELECT json_agg(row_to_json(r))
    FROM (
      SELECT id, fecha, sociedad_id, empresa_id, es_falta
      FROM registros_asistencia
      WHERE trabajador_id = 'pop_1781016512343' AND fecha >= '2026-07-01' AND fecha <= '2026-07-21'
    ) r
  ),
  'personal_asignaciones_jornada', (
    SELECT json_agg(row_to_json(a))
    FROM (
      SELECT id, sociedad_id, regimen_jornada, fecha_inicio, fecha_fin, dias_ciclo_trabajo, dias_ciclo_descanso
      FROM personal_asignaciones_jornada
      WHERE personal_id = 'pop_1781016512343'
    ) a
  )
) as result;
