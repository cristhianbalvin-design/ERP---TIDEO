-- Prueba transaccional del reinicio de roster minero.
-- Usa datos sintéticos dentro de BEGIN/ROLLBACK sobre el esquema real enlazado.

BEGIN;
SET LOCAL ROLE postgres;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path TO public, extensions;

CREATE TEMP TABLE test381_contexto (
  admin_user uuid NOT NULL,
  periodo_id text NOT NULL
) ON COMMIT DROP;

CREATE TEMP TABLE test381_resultados (
  preview jsonb,
  bloqueo jsonb,
  ejecucion jsonb,
  delete_bloqueado boolean NOT NULL DEFAULT false
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
    AND (r.es_admin_empresa = true OR r.es_superadmin = true)
  ORDER BY r.es_admin_empresa DESC, ue.created_at
  LIMIT 1;

  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'La prueba 381 requiere un administrador activo de DIFESMAQ';
  END IF;

  INSERT INTO public.sedes (id, empresa_id, codigo, nombre, estado, tipo)
  VALUES
    ('test381_sede_a', 'emp_20601829101', 'TEST381-A', 'UM TEST 381 A', 'activo', 'unidad_minera'),
    ('test381_sede_b', 'emp_20601829101', 'TEST381-B', 'UM TEST 381 B', 'activo', 'unidad_minera');

  INSERT INTO public.personal_operativo (
    id, empresa_id, nombre, estado, modalidad_contrato, tipo_contrato
  )
  VALUES
    ('test381_split', 'emp_20601829101', 'TEST 381 DIVIDIR', 'activo', 'planilla', 'indefinido'),
    ('test381_delete', 'emp_20601829101', 'TEST 381 ELIMINAR', 'activo', 'planilla', 'indefinido'),
    ('test381_blocked', 'emp_20601829101', 'TEST 381 BLOQUEADO', 'activo', 'planilla', 'indefinido');

  INSERT INTO public.personal_asignaciones_um (
    id, empresa_id, personal_id, personal_tipo, sede_id, fecha_inicio, fecha_fin, motivo
  ) VALUES
    ('test381_um_split_a', 'emp_20601829101', 'test381_split', 'operativo',
      'test381_sede_a', DATE '2199-08-01', DATE '2199-08-15', 'Prueba 381'),
    ('test381_um_split_b', 'emp_20601829101', 'test381_split', 'operativo',
      'test381_sede_b', DATE '2199-08-16', DATE '2199-09-30', 'Prueba 381'),
    ('test381_um_delete', 'emp_20601829101', 'test381_delete', 'operativo',
      'test381_sede_a', DATE '2199-08-01', DATE '2199-08-31', 'Prueba 381'),
    ('test381_um_blocked', 'emp_20601829101', 'test381_blocked', 'operativo',
      'test381_sede_a', DATE '2199-08-01', DATE '2199-08-31', 'Prueba 381');

  INSERT INTO public.personal_asignaciones_jornada (
    id, empresa_id, personal_id, personal_tipo, tipo_tramo,
    fecha_inicio, fecha_fin, regimen_jornada, motivo
  ) VALUES
    ('test381_j_split', 'emp_20601829101', 'test381_split', 'operativo', 'normal',
      DATE '2199-07-01', DATE '2199-09-30', 'general', 'Prueba 381'),
    ('test381_j_delete', 'emp_20601829101', 'test381_delete', 'operativo', 'normal',
      DATE '2199-08-01', DATE '2199-08-31', 'general', 'Prueba 381'),
    ('test381_j_blocked', 'emp_20601829101', 'test381_blocked', 'operativo', 'normal',
      DATE '2199-08-01', DATE '2199-08-31', 'general', 'Prueba 381');

  INSERT INTO public.registros_asistencia (
    id, empresa_id, trabajador_tipo, trabajador_id, fecha, estado
  ) VALUES (
    'test381_asistencia', 'emp_20601829101', 'operativo',
    'test381_delete', DATE '2199-08-05', 'completo'
  );

  INSERT INTO public.roster_minero_ajustes (
    id, empresa_id, personal_id, personal_tipo, fecha,
    tipo_dia_antes, tipo_dia_solicitado, motivo
  ) VALUES (
    'test381_ajuste', 'emp_20601829101', 'test381_delete', 'operativo',
    DATE '2199-08-05', 'trabajo', 'descanso', 'Prueba 381'
  );

  INSERT INTO public.roster_minero_snapshots (
    id, empresa_id, personal_id, personal_nombre, personal_tipo,
    periodo_anio, periodo_mes, regimen_jornada,
    dias_ciclo_trabajo, dias_ciclo_descanso
  ) VALUES
    ('test381_snap_split', 'emp_20601829101', 'test381_split', 'TEST 381 DIVIDIR',
      'operativo', 2199, 8, 'minero_14x7', 14, 7),
    ('test381_snap_delete', 'emp_20601829101', 'test381_delete', 'TEST 381 ELIMINAR',
      'operativo', 2199, 8, 'minero_14x7', 14, 7),
    ('test381_snap_blocked', 'emp_20601829101', 'test381_blocked', 'TEST 381 BLOQUEADO',
      'operativo', 2199, 8, 'minero_14x7', 14, 7);

  INSERT INTO public.periodos_nomina (
    id, empresa_id, anio, mes, periodo, fecha_inicio, fecha_fin, fecha_corte, estado
  ) VALUES (
    'test381_periodo', 'emp_20601829101', 2199, 8,
    '2199-08 TEST 381', DATE '2199-08-01', DATE '2199-08-31',
    DATE '2199-08-31', 'cerrado'
  ) RETURNING id::text INTO v_periodo_id;

  INSERT INTO public.nomina_detalle (
    empresa_id, periodo_id, trabajador_id, trabajador_tipo
  ) VALUES (
    'emp_20601829101', v_periodo_id, 'test381_blocked', 'operativo'
  );

  INSERT INTO test381_contexto (admin_user, periodo_id)
  VALUES (v_admin, v_periodo_id);
  INSERT INTO test381_resultados DEFAULT VALUES;
END;
$$;

GRANT SELECT ON test381_contexto TO authenticated;
GRANT SELECT, UPDATE ON test381_resultados TO authenticated;

SELECT extensions.plan(14);

DO $$
BEGIN
  PERFORM set_config(
    'request.jwt.claim.sub',
    (SELECT admin_user::text FROM test381_contexto),
    true
  );
END;
$$;
SET LOCAL ROLE authenticated;

UPDATE test381_resultados
SET preview = public.previsualizar_reinicio_roster_minero(
  'emp_20601829101', 'test381_sede_a', DATE '2199-08-01', DATE '2199-08-31'
);

SELECT extensions.is(
  (SELECT jsonb_build_array(
    (preview->>'trabajadores_afectados')::integer,
    (preview->>'jornadas_afectadas')::integer,
    (preview->>'jornadas_eliminar')::integer,
    (preview->>'jornadas_dividir')::integer,
    (preview->>'jornadas_bloqueadas')::integer
  ) FROM test381_resultados),
  '[3, 3, 2, 1, 1]'::jsonb,
  'La previsualización coincide con el conteo manual exacto'
);

SET LOCAL ROLE postgres;
SELECT extensions.is(
  (
    SELECT remociones::text
    FROM public.reinicio_roster_minero_impactos(
      'emp_20601829101', 'test381_sede_a', DATE '2199-08-01', DATE '2199-08-31'
    )
    WHERE jornada_id = 'test381_j_split'
  ),
  '{[2199-08-01,2199-08-16)}'::text,
  'El cambio de UM a mitad de mes limita el retiro a la intersección de la UM elegida'::text
);

DO $$ BEGIN
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000003810001', true);
END $$;
SET LOCAL ROLE authenticated;
SELECT extensions.throws_ok(
  $$SELECT public.previsualizar_reinicio_roster_minero(
    'emp_20601829101', 'test381_sede_a', DATE '2199-08-01', DATE '2199-08-31'
  )$$,
  'P0001',
  'REINICIO_ROSTER_PERMISO: requiere permiso editar en Control de Asistencia.',
  'Un usuario sin membresía ni permiso editar es rechazado'
);

SET LOCAL ROLE postgres;
DO $$ BEGIN
  PERFORM set_config(
    'request.jwt.claim.sub',
    (SELECT admin_user::text FROM test381_contexto),
    true
  );
END $$;
SET LOCAL ROLE authenticated;
SELECT extensions.throws_ok(
  $$SELECT public.previsualizar_reinicio_roster_minero(
    'emp_tenant_no_difesmaq', 'test381_sede_a', DATE '2199-08-01', DATE '2199-08-31'
  )$$,
  'P0001',
  'REINICIO_ROSTER_TENANT_NO_AUTORIZADO: esta acción solo está habilitada para DIFESMAQ.',
  'El RPC rechaza cualquier otro tenant'
);

DO $$
BEGIN
  BEGIN
    DELETE FROM public.personal_asignaciones_jornada
    WHERE id = 'test381_j_blocked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'RETRO_WALL_DELETE:%' THEN
      UPDATE test381_resultados SET delete_bloqueado = true;
    ELSE
      RAISE;
    END IF;
  END;
END;
$$;

SELECT extensions.ok(
  (SELECT delete_bloqueado FROM test381_resultados),
  'El trigger bloquea un DELETE directo cruzado con nómina procesada'
);

UPDATE test381_resultados
SET bloqueo = public.reiniciar_roster_minero(
  'emp_20601829101', 'test381_sede_a', DATE '2199-08-01', DATE '2199-08-31'
);

SELECT extensions.ok(
  (SELECT NOT (bloqueo->>'ok')::boolean FROM test381_resultados)
  AND (SELECT count(*) FROM public.personal_asignaciones_jornada
       WHERE id IN ('test381_j_split', 'test381_j_delete', 'test381_j_blocked')) = 3,
  'El intento bloqueado es todo-o-nada y no cambia jornadas'
);

SET LOCAL ROLE postgres;
SELECT extensions.ok(
  EXISTS (
    SELECT 1 FROM public.auditoria
    WHERE empresa_id = 'emp_20601829101'
      AND accion = 'reinicio_roster_bloqueado'
      AND entidad_id = 'test381_sede_a'
      AND valor_nuevo->>'fecha_inicio' = '2199-08-01'
  ),
  'El intento bloqueado deja auditoría con UM, período y detalle del bloqueo'
);

DELETE FROM public.nomina_detalle
WHERE periodo_id = (SELECT periodo_id FROM test381_contexto)
  AND trabajador_id = 'test381_blocked';

DO $$ BEGIN
  PERFORM set_config(
    'request.jwt.claim.sub',
    (SELECT admin_user::text FROM test381_contexto),
    true
  );
END $$;
SET LOCAL ROLE authenticated;
UPDATE test381_resultados
SET ejecucion = public.reiniciar_roster_minero(
  'emp_20601829101', 'test381_sede_a', DATE '2199-08-01', DATE '2199-08-31'
);

SET LOCAL ROLE postgres;
SELECT extensions.is(
  (SELECT jsonb_build_array(
    (ejecucion->>'trabajadores_afectados')::integer,
    (ejecucion->>'jornadas_eliminadas')::integer,
    (ejecucion->>'jornadas_divididas')::integer,
    (ejecucion->>'snapshots_eliminados')::integer
  ) FROM test381_resultados),
  '[3, 2, 1, 3]'::jsonb,
  'La ejecución devuelve los conteos exactos de afectados, eliminados, divididos y snapshots'
);

SELECT extensions.ok(
  EXISTS (
    SELECT 1 FROM public.personal_asignaciones_jornada
    WHERE personal_id = 'test381_split'
      AND fecha_inicio = DATE '2199-07-01'
      AND fecha_fin = DATE '2199-07-31'
  )
  AND EXISTS (
    SELECT 1 FROM public.personal_asignaciones_jornada
    WHERE personal_id = 'test381_split'
      AND fecha_inicio = DATE '2199-08-16'
      AND fecha_fin = DATE '2199-09-30'
  )
  AND EXISTS (
    SELECT 1 FROM public.personal_asignaciones_um
    WHERE id = 'test381_um_split_b'
      AND sede_id = 'test381_sede_b'
  ),
  'La jornada parcial se divide y conserva el tramo de la segunda UM'
);

SELECT extensions.is(
  (SELECT count(*) FROM public.personal_asignaciones_jornada
   WHERE id IN ('test381_j_delete', 'test381_j_blocked')),
  0::bigint,
  'Las jornadas completamente contenidas se eliminan'
);

SELECT extensions.is(
  (SELECT count(*) FROM public.roster_minero_snapshots
   WHERE id LIKE 'test381_snap_%'),
  0::bigint,
  'Los snapshots obsoletos del período y trabajadores afectados se eliminan'
);

SELECT extensions.is(
  jsonb_build_array(
    (SELECT count(*) FROM public.registros_asistencia WHERE id = 'test381_asistencia'),
    (SELECT count(*) FROM public.roster_minero_ajustes WHERE id = 'test381_ajuste')
  ),
  '[1, 1]'::jsonb,
  'Asistencia y ajustes de roster permanecen sin cambios'
);

SELECT extensions.ok(
  EXISTS (
    SELECT 1 FROM public.auditoria
    WHERE empresa_id = 'emp_20601829101'
      AND accion = 'reinicio_roster_minero'
      AND entidad_id = 'test381_sede_a'
      AND valor_nuevo->>'trabajadores_afectados' = '3'
      AND valor_nuevo->>'jornadas_eliminadas' = '2'
      AND valor_nuevo->>'jornadas_divididas' = '1'
  ),
  'La ejecución exitosa queda auditada con usuario, UM, período y conteos'
);

SELECT extensions.ok(
  NOT EXISTS (
    SELECT 1
    FROM public.reinicio_roster_minero_impactos(
      'emp_20601829101', 'test381_sede_a', DATE '2199-08-01', DATE '2199-08-31'
    )
    WHERE personal_id LIKE 'test381_%'
  ),
  'No queda ninguna jornada reiniciable de la UM objetivo en el período'
);

SELECT * FROM extensions.finish();
ROLLBACK;
