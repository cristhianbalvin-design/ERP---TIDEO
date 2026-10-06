-- Pruebas reversibles de la guarda y de la reversión 592.
-- UTF-8 sin BOM. Un único BEGIN…ROLLBACK; ambos casos se reportan antes del ROLLBACK.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE _592_revert_results (
  prueba text PRIMARY KEY,
  ok boolean NOT NULL,
  detalle text NOT NULL
);

CREATE TEMP TABLE _592_line_triggers_before AS
SELECT tgname, pg_get_triggerdef(oid) AS definicion
FROM pg_trigger
WHERE tgrelid = 'public.diagnostico_tecnico_lineas'::regclass
  AND NOT tgisinternal
  AND tgname IN (
    'trg_bloquear_diagnostico_tecnico_linea_emitido',
    'trg_validar_diagnostico_tecnico_linea_referencias'
  );

CREATE FUNCTION pg_temp._592_objects_remaining()
RETURNS bigint
LANGUAGE sql
AS $fn$
  SELECT count(*)
  FROM (
    VALUES
      (to_regclass('public.diagnostico_catalogo_defaults')::text),
      (to_regclass('public.diagnostico_catalogo_valores')::text),
      (to_regclass('public.diagnostico_matriz_prioridad')::text),
      (to_regclass('public.diagnostico_tecnico_hallazgos')::text),
      (to_regclass('public.diagnostico_tecnico_hallazgo_mediciones')::text),
      (to_regclass('public.diagnostico_tecnico_hallazgo_lineas')::text),
      (to_regprocedure('public.bloquear_hallazgo_linea_emitido()')::text),
      (to_regprocedure('public.sugerir_condicion_medicion()')::text),
      (to_regprocedure('public.bloquear_medicion_emitida()')::text),
      (to_regprocedure('public.calcular_hallazgo_prioridad()')::text),
      (to_regprocedure('public.validar_hallazgo_referencias()')::text),
      (to_regprocedure('public.bloquear_hallazgo_emitido()')::text),
      (to_regprocedure('public.bloquear_cambio_linea_vinculada()')::text),
      (to_regprocedure('public.bloquear_cambio_codigo_catalogo()')::text),
      (to_regprocedure('public.calcular_prioridad_diagnostico(text,text,text,text,smallint)')::text),
      (to_regprocedure('public.inicializar_catalogos_diagnostico(text)')::text)
  ) AS objects(object_ref)
  WHERE object_ref IS NOT NULL
$fn$;

DO $test_guard$
DECLARE
  v_diag text;
  v_familia uuid;
  v_hallazgo uuid;
  v_hallazgos bigint;
  v_mediciones bigint;
  v_enlaces bigint;
  v_objects bigint;
  v_sqlstate text := '00000';
  v_message text := 'NO_EXCEPTION';
  v_expected text;
BEGIN
  SELECT d.id, l.familia_trabajo_id
    INTO v_diag, v_familia
  FROM public.diagnosticos_tecnicos d
  JOIN public.diagnostico_tecnico_lineas l
    ON l.diagnostico_id = d.id
   AND l.empresa_id = d.empresa_id
  WHERE d.empresa_id = 'emp_2000000000'
    AND d.estado = 'borrador'
  ORDER BY d.id, l.id
  LIMIT 1;

  IF v_diag IS NULL OR v_familia IS NULL THEN
    INSERT INTO _592_revert_results
    VALUES ('a_guard_con_hallazgo', false, 'SKIPPED: falta diagnóstico/línea de PRUEBA');
    RETURN;
  END IF;

  INSERT INTO public.diagnostico_tecnico_hallazgos
    (empresa_id, diagnostico_id, familia_trabajo_id, componente_parte,
     tipo_dano_codigo, causa_probable_codigo, condicion, riesgo,
     accion_recomendada, atribuible_a, observacion)
  VALUES
    ('emp_2000000000', v_diag, v_familia, 'fixture_revert_592',
     'desgaste', 'desgaste_normal', 'conforme', 'monitorear',
     'monitorear', 'desgaste_normal', 'fixture_revert_592')
  RETURNING id INTO v_hallazgo;

  SELECT count(*) INTO v_hallazgos FROM public.diagnostico_tecnico_hallazgos;
  SELECT count(*) INTO v_mediciones FROM public.diagnostico_tecnico_hallazgo_mediciones;
  SELECT count(*) INTO v_enlaces FROM public.diagnostico_tecnico_hallazgo_lineas;

  BEGIN
    IF v_hallazgos > 0 OR v_mediciones > 0 OR v_enlaces > 0 THEN
      RAISE EXCEPTION 'REVERT_ABORTED_DATA_LOSS: hallazgos=%, mediciones=%, enlaces=%',
        v_hallazgos, v_mediciones, v_enlaces;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_sqlstate = RETURNED_SQLSTATE,
      v_message = MESSAGE_TEXT;
  END;

  v_objects := pg_temp._592_objects_remaining();
  v_expected := format(
    'REVERT_ABORTED_DATA_LOSS: hallazgos=%s, mediciones=%s, enlaces=%s',
    v_hallazgos, v_mediciones, v_enlaces
  );
  INSERT INTO _592_revert_results
  VALUES (
    'a_guard_con_hallazgo',
    v_sqlstate = 'P0001' AND v_message = v_expected AND v_objects = 16,
    format('sqlstate=%s mensaje=%s objetos_592=%s', v_sqlstate, v_message, v_objects)
  );

  DELETE FROM public.diagnostico_tecnico_hallazgos WHERE id = v_hallazgo;
END
$test_guard$;

DO $test_roundtrip$
DECLARE
  v_hallazgos bigint;
  v_mediciones bigint;
  v_enlaces bigint;
  v_before_triggers bigint;
  v_objects bigint;
  v_trigger_diff bigint;
BEGIN
  SELECT count(*) INTO v_hallazgos FROM public.diagnostico_tecnico_hallazgos;
  SELECT count(*) INTO v_mediciones FROM public.diagnostico_tecnico_hallazgo_mediciones;
  SELECT count(*) INTO v_enlaces FROM public.diagnostico_tecnico_hallazgo_lineas;
  SELECT count(*) INTO v_before_triggers FROM _592_line_triggers_before;

  IF v_hallazgos > 0 OR v_mediciones > 0 OR v_enlaces > 0 THEN
    INSERT INTO _592_revert_results
    VALUES (
      'b_reversion_sin_datos',
      false,
      format('SKIPPED: hay datos de usuario hallazgos=%s mediciones=%s enlaces=%s',
        v_hallazgos, v_mediciones, v_enlaces)
    );
    RETURN;
  END IF;

  IF v_before_triggers <> 2 THEN
    INSERT INTO _592_revert_results
    VALUES (
      'b_reversion_sin_datos',
      false,
      format('SKIPPED: triggers esperados=2 encontrados=%s', v_before_triggers)
    );
    RETURN;
  END IF;

  EXECUTE 'DROP TRIGGER IF EXISTS audit_diagnostico_tecnico_hallazgo_mediciones ON public.diagnostico_tecnico_hallazgo_mediciones';
  EXECUTE 'DROP TRIGGER IF EXISTS audit_diagnostico_tecnico_hallazgos ON public.diagnostico_tecnico_hallazgos';
  EXECUTE 'DROP TRIGGER IF EXISTS a_bloquear_hallazgo_linea_emitido ON public.diagnostico_tecnico_hallazgo_lineas';
  EXECUTE 'DROP TRIGGER IF EXISTS b_sugerir_condicion_medicion ON public.diagnostico_tecnico_hallazgo_mediciones';
  EXECUTE 'DROP TRIGGER IF EXISTS a_bloquear_medicion_emitida ON public.diagnostico_tecnico_hallazgo_mediciones';
  EXECUTE 'DROP TRIGGER IF EXISTS c_calcular_hallazgo_prioridad ON public.diagnostico_tecnico_hallazgos';
  EXECUTE 'DROP TRIGGER IF EXISTS b_validar_hallazgo_referencias ON public.diagnostico_tecnico_hallazgos';
  EXECUTE 'DROP TRIGGER IF EXISTS a_bloquear_hallazgo_emitido ON public.diagnostico_tecnico_hallazgos';
  EXECUTE 'DROP TRIGGER IF EXISTS trg_bloquear_cambio_linea_vinculada ON public.diagnostico_tecnico_lineas';
  EXECUTE 'DROP TRIGGER IF EXISTS trg_bloquear_cambio_codigo_catalogo ON public.diagnostico_catalogo_valores';

  EXECUTE 'DROP TABLE public.diagnostico_tecnico_hallazgo_lineas';
  EXECUTE 'DROP TABLE public.diagnostico_tecnico_hallazgo_mediciones';
  EXECUTE 'DROP TABLE public.diagnostico_tecnico_hallazgos';

  EXECUTE 'DROP FUNCTION public.bloquear_hallazgo_linea_emitido()';
  EXECUTE 'DROP FUNCTION public.sugerir_condicion_medicion()';
  EXECUTE 'DROP FUNCTION public.bloquear_medicion_emitida()';
  EXECUTE 'DROP FUNCTION public.calcular_hallazgo_prioridad()';
  EXECUTE 'DROP FUNCTION public.validar_hallazgo_referencias()';
  EXECUTE 'DROP FUNCTION public.bloquear_hallazgo_emitido()';
  EXECUTE 'DROP FUNCTION public.bloquear_cambio_linea_vinculada()';
  EXECUTE 'DROP FUNCTION public.bloquear_cambio_codigo_catalogo()';
  EXECUTE 'DROP FUNCTION public.calcular_prioridad_diagnostico(text,text,text,text,smallint)';
  EXECUTE 'DROP FUNCTION public.inicializar_catalogos_diagnostico(text)';

  EXECUTE 'DROP TABLE public.diagnostico_matriz_prioridad';
  EXECUTE 'DROP TABLE public.diagnostico_catalogo_valores';
  EXECUTE 'DROP TABLE public.diagnostico_catalogo_defaults';

  v_objects := pg_temp._592_objects_remaining();
  SELECT count(*) INTO v_trigger_diff
  FROM (
    SELECT b.tgname, b.definicion, a.tgname AS after_name, a.definicion AS after_definicion
    FROM _592_line_triggers_before b
    FULL JOIN (
      SELECT tgname, pg_get_triggerdef(oid) AS definicion
      FROM pg_trigger
      WHERE tgrelid = 'public.diagnostico_tecnico_lineas'::regclass
        AND NOT tgisinternal
        AND tgname IN (
          'trg_bloquear_diagnostico_tecnico_linea_emitido',
          'trg_validar_diagnostico_tecnico_linea_referencias'
        )
    ) a ON a.tgname = b.tgname
    WHERE b.tgname IS DISTINCT FROM a.tgname
       OR b.definicion IS DISTINCT FROM a.definicion
  ) differences;

  INSERT INTO _592_revert_results
  VALUES (
    'b_reversion_sin_datos',
    v_objects = 0 AND v_trigger_diff = 0,
    format('objetos_592=%s diferencias_triggers_lineas=%s', v_objects, v_trigger_diff)
  );
END
$test_roundtrip$;

SELECT * FROM _592_revert_results ORDER BY prueba;
ROLLBACK;
