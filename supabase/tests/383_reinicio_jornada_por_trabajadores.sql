-- Regresión transaccional del reinicio directo por uno o varios trabajadores.
-- Los trabajadores sintéticos no tienen asignación UM. Todo termina en ROLLBACK.

BEGIN;
SET LOCAL ROLE postgres;
SET LOCAL search_path TO public, extensions;

CREATE TEMP TABLE test383_contexto (
  admin_user uuid NOT NULL,
  periodo_id text NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE test383_resultados (
  preview_uno jsonb,
  preview_varios jsonb,
  preview_bloqueado jsonb,
  bloqueo jsonb,
  ejecucion jsonb
) ON COMMIT DROP;

DO $$
DECLARE
  v_admin uuid;
  v_periodo_id text;
BEGIN
  SELECT ue.user_id
  INTO v_admin
  FROM public.usuarios_empresas ue
  JOIN public.roles r ON r.id = ue.rol_id
  WHERE ue.empresa_id = 'emp_20601829101'
    AND ue.estado = 'activo'
    AND r.activo = true
    AND (r.es_admin_empresa OR r.es_superadmin)
  LIMIT 1;

  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'La prueba 383 requiere un administrador activo de DIFESMAQ';
  END IF;

  INSERT INTO public.personal_operativo (
    id, empresa_id, nombre, estado, modalidad_contrato, tipo_contrato
  ) VALUES
    ('test383_split', 'emp_20601829101', 'TEST 383 DIVIDIR SIN UM', 'activo', 'planilla', 'indefinido'),
    ('test383_delete', 'emp_20601829101', 'TEST 383 ELIMINAR SIN UM', 'activo', 'planilla', 'indefinido'),
    ('test383_blocked', 'emp_20601829101', 'TEST 383 BLOQUEADO SIN UM', 'activo', 'planilla', 'indefinido');

  INSERT INTO public.personal_asignaciones_jornada (
    id, empresa_id, personal_id, personal_tipo, tipo_tramo,
    fecha_inicio, fecha_fin, regimen_jornada,
    dias_ciclo_trabajo, dias_ciclo_descanso, fecha_inicio_ciclo, motivo
  ) VALUES
    ('test383_j_split_anchor', 'emp_20601829101', 'test383_split', 'operativo', 'normal',
      DATE '2197-07-01', DATE '2197-07-10', 'ciclo_acumulativo', 14, 7, DATE '2197-07-01', 'Prueba 383'),
    ('test383_j_split', 'emp_20601829101', 'test383_split', 'operativo', 'normal',
      DATE '2197-07-11', NULL, 'ciclo_acumulativo', 14, 7, DATE '2197-07-01', 'Prueba 383'),
    ('test383_j_delete', 'emp_20601829101', 'test383_delete', 'operativo', 'normal',
      DATE '2197-07-01', DATE '2197-07-31', 'general', NULL, NULL, NULL, 'Prueba 383'),
    ('test383_j_blocked', 'emp_20601829101', 'test383_blocked', 'operativo', 'normal',
      DATE '2197-07-01', DATE '2197-07-31', 'general', NULL, NULL, NULL, 'Prueba 383');

  INSERT INTO public.roster_minero_snapshots (
    id, empresa_id, personal_id, personal_nombre, personal_tipo,
    periodo_anio, periodo_mes, regimen_jornada,
    dias_ciclo_trabajo, dias_ciclo_descanso
  ) VALUES
    ('test383_snap_split', 'emp_20601829101', 'test383_split', 'TEST 383 DIVIDIR SIN UM',
      'operativo', 2197, 7, 'minero_14x7', 14, 7),
    ('test383_snap_delete', 'emp_20601829101', 'test383_delete', 'TEST 383 ELIMINAR SIN UM',
      'operativo', 2197, 7, 'general', 0, 0),
    ('test383_snap_blocked', 'emp_20601829101', 'test383_blocked', 'TEST 383 BLOQUEADO SIN UM',
      'operativo', 2197, 7, 'general', 0, 0);

  INSERT INTO public.registros_asistencia (
    id, empresa_id, trabajador_tipo, trabajador_id, fecha, estado
  ) VALUES (
    'test383_asistencia', 'emp_20601829101', 'operativo',
    'test383_delete', DATE '2197-07-05', 'completo'
  );

  INSERT INTO public.roster_minero_ajustes (
    id, empresa_id, personal_id, personal_tipo, fecha,
    tipo_dia_antes, tipo_dia_solicitado, motivo
  ) VALUES (
    'test383_ajuste', 'emp_20601829101', 'test383_delete', 'operativo',
    DATE '2197-07-05', 'trabajo', 'descanso', 'Prueba 383'
  );

  INSERT INTO public.periodos_nomina (
    id, empresa_id, anio, mes, periodo, fecha_inicio, fecha_fin, fecha_corte, estado
  ) VALUES (
    'test383_periodo', 'emp_20601829101', 2197, 7,
    '2197-07 TEST 383', DATE '2197-07-01', DATE '2197-07-31',
    DATE '2197-07-31', 'cerrado'
  ) RETURNING id::text INTO v_periodo_id;

  INSERT INTO public.nomina_detalle (
    empresa_id, periodo_id, trabajador_id, trabajador_tipo
  ) VALUES (
    'emp_20601829101', v_periodo_id, 'test383_blocked', 'operativo'
  );

  INSERT INTO test383_contexto VALUES (v_admin, v_periodo_id);
  INSERT INTO test383_resultados DEFAULT VALUES;
END;
$$;

GRANT SELECT ON test383_contexto TO authenticated;
GRANT SELECT, UPDATE ON test383_resultados TO authenticated;

SELECT extensions.plan(15);

DO $$ BEGIN
  PERFORM set_config(
    'request.jwt.claim.sub',
    (SELECT admin_user::text FROM test383_contexto),
    true
  );
END $$;
SET LOCAL ROLE authenticated;

UPDATE test383_resultados
SET preview_uno = public.previsualizar_reinicio_jornada_trabajadores(
  'emp_20601829101', ARRAY['test383_split'], DATE '2197-07-01', DATE '2197-07-31'
),
preview_varios = public.previsualizar_reinicio_jornada_trabajadores(
  'emp_20601829101', ARRAY['test383_split', 'test383_delete'], DATE '2197-07-01', DATE '2197-07-31'
),
preview_bloqueado = public.previsualizar_reinicio_jornada_trabajadores(
  'emp_20601829101', ARRAY['test383_blocked'], DATE '2197-07-01', DATE '2197-07-31'
);

SELECT extensions.is(
  (SELECT jsonb_build_array(
    (preview_uno->>'trabajadores_afectados')::integer,
    (preview_uno->>'jornadas_afectadas')::integer,
    (preview_uno->>'jornadas_eliminar')::integer,
    (preview_uno->>'jornadas_dividir')::integer,
    (preview_uno->>'jornadas_bloqueadas')::integer
  ) FROM test383_resultados),
  '[1, 2, 1, 1, 0]'::jsonb,
  'La previsualización de un trabajador devuelve cifras exactas'
);

SELECT extensions.is(
  (SELECT jsonb_build_array(
    (preview_varios->>'trabajadores_afectados')::integer,
    (preview_varios->>'jornadas_afectadas')::integer,
    (preview_varios->>'jornadas_eliminar')::integer,
    (preview_varios->>'jornadas_dividir')::integer,
    (preview_varios->>'jornadas_bloqueadas')::integer
  ) FROM test383_resultados),
  '[2, 3, 2, 1, 0]'::jsonb,
  'La previsualización múltiple coincide con el conteo manual'
);

SET LOCAL ROLE postgres;
SELECT extensions.is(
  (SELECT count(*) FROM public.personal_asignaciones_um WHERE personal_id LIKE 'test383_%'),
  0::bigint,
  'La vía directa no requiere ninguna asignación UM'
);

DO $$ BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000003830001', true);
END $$;
SET LOCAL ROLE authenticated;
SELECT extensions.throws_ok(
  $$SELECT public.previsualizar_reinicio_jornada_trabajadores(
    'emp_20601829101', ARRAY['test383_split'], DATE '2197-07-01', DATE '2197-07-31'
  )$$,
  'P0001',
  'REINICIO_JORNADA_PERMISO: requiere permiso editar en Control de Asistencia.',
  'Un usuario sin permiso editar es rechazado'
);

SET LOCAL ROLE postgres;
DO $$ BEGIN
  PERFORM set_config(
    'request.jwt.claim.sub',
    (SELECT admin_user::text FROM test383_contexto),
    true
  );
END $$;
SET LOCAL ROLE authenticated;
SELECT extensions.throws_ok(
  $$SELECT public.previsualizar_reinicio_jornada_trabajadores(
    'emp_tenant_no_difesmaq', ARRAY['test383_split'], DATE '2197-07-01', DATE '2197-07-31'
  )$$,
  'P0001',
  'REINICIO_JORNADA_TENANT_NO_AUTORIZADO: esta acción solo está habilitada para DIFESMAQ.',
  'La vía directa rechaza cualquier otro tenant'
);

SELECT extensions.is(
  (SELECT jsonb_build_array(
    (preview_bloqueado->>'jornadas_bloqueadas')::integer,
    preview_bloqueado->'bloqueos'->0->'periodos'
  ) FROM test383_resultados),
  '[1, ["2197-07 TEST 383"]]'::jsonb,
  'La previsualización identifica el cruce exacto con nómina procesada'
);

UPDATE test383_resultados
SET bloqueo = public.reiniciar_jornada_trabajadores(
  'emp_20601829101', ARRAY['test383_blocked'], DATE '2197-07-01', DATE '2197-07-31'
);

SELECT extensions.ok(
  (SELECT NOT (bloqueo->>'ok')::boolean FROM test383_resultados),
  'El RPC devuelve RETRO_WALL para el trabajador bloqueado'
);

SET LOCAL ROLE postgres;
SELECT extensions.ok(
  EXISTS (SELECT 1 FROM public.personal_asignaciones_jornada WHERE id = 'test383_j_blocked')
  AND EXISTS (
    SELECT 1 FROM public.auditoria
    WHERE empresa_id = 'emp_20601829101'
      AND accion = 'reinicio_jornada_trabajadores_bloqueado'
      AND entidad_id = 'test383_blocked'
      AND valor_nuevo->>'resultado' = 'bloqueado'
  ),
  'El bloqueo no modifica la jornada y queda auditado'
);

DELETE FROM public.nomina_detalle
WHERE periodo_id = (SELECT periodo_id FROM test383_contexto)
  AND trabajador_id = 'test383_blocked';

DO $$ BEGIN
  PERFORM set_config(
    'request.jwt.claim.sub',
    (SELECT admin_user::text FROM test383_contexto),
    true
  );
END $$;
SET LOCAL ROLE authenticated;
UPDATE test383_resultados
SET ejecucion = public.reiniciar_jornada_trabajadores(
  'emp_20601829101', ARRAY['test383_split', 'test383_delete'], DATE '2197-07-01', DATE '2197-07-31'
);

SET LOCAL ROLE postgres;
SELECT extensions.is(
  (SELECT jsonb_build_array(
    (ejecucion->>'trabajadores_afectados')::integer,
    (ejecucion->>'jornadas_eliminadas')::integer,
    (ejecucion->>'jornadas_divididas')::integer,
    (ejecucion->>'snapshots_eliminados')::integer
  ) FROM test383_resultados),
  '[2, 2, 1, 2]'::jsonb,
  'La ejecución múltiple devuelve los conteos exactos'
);

SELECT extensions.ok(
  NOT EXISTS (
    SELECT 1 FROM public.personal_asignaciones_jornada
    WHERE id IN ('test383_j_split_anchor', 'test383_j_split')
  )
  AND EXISTS (
    SELECT 1 FROM public.personal_asignaciones_jornada
    WHERE empresa_id = 'emp_20601829101'
      AND personal_id = 'test383_split'
      AND fecha_inicio = DATE '2197-08-01'
      AND fecha_fin IS NULL
      AND fecha_inicio_ciclo = DATE '2197-07-01'
      AND dias_ciclo_trabajo = 14
      AND dias_ciclo_descanso = 7
  ),
  'La jornada abierta se divide con el orden seguro y conserva el ancla'
);

SELECT extensions.is(
  (SELECT count(*) FROM public.personal_asignaciones_jornada WHERE id = 'test383_j_delete'),
  0::bigint,
  'La jornada contenida completamente en el período se elimina'
);

SELECT extensions.is(
  (SELECT count(*) FROM public.roster_minero_snapshots
   WHERE id IN ('test383_snap_split', 'test383_snap_delete')),
  0::bigint,
  'Solo se eliminan los snapshots de los trabajadores ejecutados'
);

SELECT extensions.is(
  jsonb_build_array(
    (SELECT count(*) FROM public.registros_asistencia WHERE id = 'test383_asistencia'),
    (SELECT count(*) FROM public.roster_minero_ajustes WHERE id = 'test383_ajuste'),
    (SELECT count(*) FROM public.personal_asignaciones_jornada WHERE id = 'test383_j_blocked'),
    (SELECT count(*) FROM public.roster_minero_snapshots WHERE id = 'test383_snap_blocked')
  ),
  '[1, 1, 1, 1]'::jsonb,
  'Asistencia, ajustes y trabajadores no seleccionados permanecen intactos'
);

SELECT extensions.ok(
  EXISTS (
    SELECT 1 FROM public.auditoria
    WHERE empresa_id = 'emp_20601829101'
      AND accion = 'reinicio_jornada_trabajadores'
      AND entidad_id = 'emp_20601829101'
      AND valor_nuevo->>'resultado' = 'ejecutado'
      AND valor_nuevo->>'trabajadores_afectados' = '2'
      AND jsonb_array_length(valor_nuevo->'trabajadores') = 2
  ),
  'La ejecución múltiple audita usuario, trabajadores, período y resultado'
);

SELECT extensions.ok(
  NOT EXISTS (
    SELECT 1
    FROM public.reinicio_jornada_trabajadores_impactos(
      'emp_20601829101', ARRAY['test383_split', 'test383_delete'],
      DATE '2197-07-01', DATE '2197-07-31'
    )
  ),
  'No quedan jornadas reiniciables de los trabajadores ejecutados en el período'
);

SELECT * FROM extensions.finish();
ROLLBACK;
