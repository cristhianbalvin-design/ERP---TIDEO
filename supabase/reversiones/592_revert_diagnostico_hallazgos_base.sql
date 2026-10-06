-- Reversión manual de 592_diagnostico_hallazgos_base.sql.
-- UTF-8 sin BOM. Ejecutar solo con aprobación y tras validar dependencias.

BEGIN;

DO $$
DECLARE
  v_hallazgos bigint;
  v_mediciones bigint;
  v_enlaces bigint;
BEGIN
  SELECT count(*) INTO v_hallazgos FROM public.diagnostico_tecnico_hallazgos;
  SELECT count(*) INTO v_mediciones FROM public.diagnostico_tecnico_hallazgo_mediciones;
  SELECT count(*) INTO v_enlaces FROM public.diagnostico_tecnico_hallazgo_lineas;
  IF v_hallazgos > 0 OR v_mediciones > 0 OR v_enlaces > 0 THEN
    RAISE EXCEPTION 'REVERT_ABORTED_DATA_LOSS: hallazgos=%, mediciones=%, enlaces=%',
      v_hallazgos, v_mediciones, v_enlaces;
  END IF;
END
$$;

DROP TRIGGER IF EXISTS audit_diagnostico_tecnico_hallazgo_mediciones ON public.diagnostico_tecnico_hallazgo_mediciones;
DROP TRIGGER IF EXISTS audit_diagnostico_tecnico_hallazgos ON public.diagnostico_tecnico_hallazgos;
DROP TRIGGER IF EXISTS a_bloquear_hallazgo_linea_emitido ON public.diagnostico_tecnico_hallazgo_lineas;
DROP TRIGGER IF EXISTS b_sugerir_condicion_medicion ON public.diagnostico_tecnico_hallazgo_mediciones;
DROP TRIGGER IF EXISTS a_bloquear_medicion_emitida ON public.diagnostico_tecnico_hallazgo_mediciones;
DROP TRIGGER IF EXISTS c_calcular_hallazgo_prioridad ON public.diagnostico_tecnico_hallazgos;
DROP TRIGGER IF EXISTS b_validar_hallazgo_referencias ON public.diagnostico_tecnico_hallazgos;
DROP TRIGGER IF EXISTS a_bloquear_hallazgo_emitido ON public.diagnostico_tecnico_hallazgos;
DROP TRIGGER IF EXISTS trg_bloquear_cambio_linea_vinculada ON public.diagnostico_tecnico_lineas;
DROP TRIGGER IF EXISTS trg_bloquear_cambio_codigo_catalogo ON public.diagnostico_catalogo_valores;

DROP TABLE public.diagnostico_tecnico_hallazgo_lineas;
DROP TABLE public.diagnostico_tecnico_hallazgo_mediciones;
DROP TABLE public.diagnostico_tecnico_hallazgos;

DROP FUNCTION public.bloquear_hallazgo_linea_emitido();
DROP FUNCTION public.sugerir_condicion_medicion();
DROP FUNCTION public.bloquear_medicion_emitida();
DROP FUNCTION public.calcular_hallazgo_prioridad();
DROP FUNCTION public.validar_hallazgo_referencias();
DROP FUNCTION public.bloquear_hallazgo_emitido();
DROP FUNCTION public.bloquear_cambio_linea_vinculada();
DROP FUNCTION public.bloquear_cambio_codigo_catalogo();
DROP FUNCTION public.calcular_prioridad_diagnostico(text,text,text,text,smallint);
DROP FUNCTION public.inicializar_catalogos_diagnostico(text);

DROP TABLE public.diagnostico_matriz_prioridad;
DROP TABLE public.diagnostico_catalogo_valores;
DROP TABLE public.diagnostico_catalogo_defaults;

COMMIT;
