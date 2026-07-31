-- Regresión del caso HUAMANCHA: una jornada abierta empieza y ancla su ciclo
-- dentro del mes retirado. El segmento posterior debe conservarse sin que el
-- trigger derivado emita JORNADA_NO_ASIGNADA. Todo se revierte al terminar.

BEGIN;
SET LOCAL ROLE postgres;
SET LOCAL search_path TO public, extensions;

CREATE TEMP TABLE test382_contexto (admin_user uuid NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE test382_resultado (resultado jsonb) ON COMMIT DROP;

DO $$
DECLARE
  v_admin uuid;
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
    RAISE EXCEPTION 'La prueba 382 requiere un administrador activo de DIFESMAQ';
  END IF;

  INSERT INTO public.sedes (id, empresa_id, codigo, nombre, estado, tipo)
  VALUES (
    'test382_sede', 'emp_20601829101', 'TEST382',
    'UM TEST 382', 'activo', 'unidad_minera'
  );

  INSERT INTO public.personal_operativo (
    id, empresa_id, nombre, estado, modalidad_contrato, tipo_contrato
  ) VALUES (
    'test382_personal', 'emp_20601829101', 'TEST 382 JORNADA ABIERTA',
    'activo', 'planilla', 'indefinido'
  );

  INSERT INTO public.personal_asignaciones_um (
    id, empresa_id, personal_id, personal_tipo, sede_id,
    fecha_inicio, fecha_fin, motivo
  ) VALUES (
    'test382_um', 'emp_20601829101', 'test382_personal', 'operativo',
    'test382_sede', DATE '2198-07-01', DATE '2198-07-31', 'Prueba 382'
  );

  INSERT INTO public.personal_asignaciones_jornada (
    id, empresa_id, personal_id, personal_tipo, tipo_tramo,
    fecha_inicio, fecha_fin, regimen_jornada,
    dias_ciclo_trabajo, dias_ciclo_descanso, fecha_inicio_ciclo, motivo
  ) VALUES (
    'test382_jornada', 'emp_20601829101', 'test382_personal', 'operativo', 'normal',
    DATE '2198-07-01', NULL, 'ciclo_acumulativo',
    14, 7, DATE '2198-07-01', 'Prueba 382'
  );

  INSERT INTO test382_contexto VALUES (v_admin);
  INSERT INTO test382_resultado DEFAULT VALUES;
END;
$$;

GRANT SELECT ON test382_contexto TO authenticated;
GRANT SELECT, UPDATE ON test382_resultado TO authenticated;

SELECT extensions.plan(4);

DO $$ BEGIN
  PERFORM set_config(
    'request.jwt.claim.sub',
    (SELECT admin_user::text FROM test382_contexto),
    true
  );
END $$;
SET LOCAL ROLE authenticated;

UPDATE test382_resultado
SET resultado = public.reiniciar_roster_minero(
  'emp_20601829101', 'test382_sede', DATE '2198-07-01', DATE '2198-07-31'
);

SET LOCAL ROLE postgres;

SELECT extensions.ok(
  (SELECT (resultado->>'ok')::boolean FROM test382_resultado),
  'El RPC termina sin JORNADA_NO_ASIGNADA'
);

SELECT extensions.is(
  (SELECT jsonb_build_array(
    (resultado->>'trabajadores_afectados')::integer,
    (resultado->>'jornadas_eliminadas')::integer,
    (resultado->>'jornadas_divididas')::integer
  ) FROM test382_resultado),
  '[1, 0, 1]'::jsonb,
  'La jornada abierta se clasifica como una división'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM public.personal_asignaciones_jornada
    WHERE id = 'test382_jornada'
  )
  AND EXISTS (
    SELECT 1 FROM public.personal_asignaciones_jornada
    WHERE empresa_id = 'emp_20601829101'
      AND personal_id = 'test382_personal'
      AND personal_tipo = 'operativo'
      AND fecha_inicio = DATE '2198-08-01'
      AND fecha_fin IS NULL
      AND fecha_inicio_ciclo = DATE '2198-07-01'
      AND dias_ciclo_trabajo = 14
      AND dias_ciclo_descanso = 7
  ),
  'Se conserva el segmento abierto posterior con el ancla original'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM public.asistencia_ciclos_mineros
    WHERE empresa_id = 'emp_20601829101'
      AND personal_id = 'test382_personal'
      AND personal_tipo = 'operativo'
      AND fecha_inicio_ciclo = DATE '2198-07-01'
      AND dias_ciclo_trabajo = 14
      AND dias_ciclo_descanso = 7
  ),
  'El ciclo derivado conserva su ancla y patrón 14x7'
);

SELECT * FROM extensions.finish();
ROLLBACK;
