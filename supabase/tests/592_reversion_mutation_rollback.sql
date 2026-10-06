-- Mutación intencional de la reversión 592: se elimina la guarda de datos.
-- UTF-8 sin BOM. El resultado esperado es detectar pérdida dentro de la
-- transacción y terminar con ROLLBACK.

BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE _592_revert_mutation_results (
  prueba text PRIMARY KEY,
  ok boolean NOT NULL,
  detalle text NOT NULL
);

DO $mutation$
DECLARE
  v_diag text;
  v_familia uuid;
  v_hallazgo uuid;
  v_exception boolean := false;
  v_error text := '';
  v_objects bigint;
  v_hallazgos bigint;
  v_mediciones bigint;
  v_enlaces bigint;
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
    INSERT INTO _592_revert_mutation_results
    VALUES ('c_mutacion_sin_guarda', false, 'SKIPPED: falta diagnóstico/línea de PRUEBA');
    RETURN;
  END IF;

  INSERT INTO public.diagnostico_tecnico_hallazgos
    (empresa_id, diagnostico_id, familia_trabajo_id, componente_parte,
     tipo_dano_codigo, causa_probable_codigo, condicion, riesgo,
     accion_recomendada, atribuible_a, observacion)
  VALUES
    ('emp_2000000000', v_diag, v_familia, 'fixture_revert_mutation_592',
     'desgaste', 'desgaste_normal', 'conforme', 'monitorear',
     'monitorear', 'desgaste_normal', 'fixture_revert_mutation_592')
  RETURNING id INTO v_hallazgo;

  BEGIN
    -- MUTACIÓN: la guarda REVERT_ABORTED_DATA_LOSS fue eliminada.
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
  EXCEPTION WHEN OTHERS THEN
    v_exception := true;
    v_error := format('%s / %s', SQLSTATE, SQLERRM);
  END;

  SELECT count(*) INTO v_objects
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
  WHERE object_ref IS NOT NULL;

  SELECT count(*) INTO v_hallazgos
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'diagnostico_tecnico_hallazgos';
  SELECT count(*) INTO v_mediciones
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'diagnostico_tecnico_hallazgo_mediciones';
  SELECT count(*) INTO v_enlaces
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'diagnostico_tecnico_hallazgo_lineas';

  INSERT INTO _592_revert_mutation_results
  VALUES (
    'c_mutacion_sin_guarda',
    NOT v_exception AND v_objects = 0 AND v_hallazgos = 0 AND v_mediciones = 0 AND v_enlaces = 0,
    format('excepcion=%s error=%s objetos_592=%s tablas_hallazgos=%s/%s/%s',
      v_exception, coalesce(v_error, 'NO_EXCEPTION'), v_objects,
      v_hallazgos, v_mediciones, v_enlaces)
  );
END
$mutation$;

SELECT * FROM _592_revert_mutation_results ORDER BY prueba;
ROLLBACK;

