-- Verificación posterior de 592. No deja cambios persistentes; termina en ROLLBACK.
-- La tabla temporal de reporte vive únicamente dentro de esta transacción.

BEGIN;

CREATE TEMP TABLE _592_posterior_report (
  verificacion text NOT NULL,
  detalle text,
  valor bigint,
  md5_cuerpo text,
  proacl text,
  proowner text,
  prosecdef boolean,
  proconfig text,
  provolatile text
) ON COMMIT DROP;

INSERT INTO _592_posterior_report(verificacion, detalle, valor)
SELECT '592_objects_remaining', 'tablas nuevas', count(*)::bigint
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('diagnostico_catalogo_defaults','diagnostico_catalogo_valores',
                    'diagnostico_matriz_prioridad','diagnostico_tecnico_hallazgos',
                    'diagnostico_tecnico_hallazgo_mediciones','diagnostico_tecnico_hallazgo_lineas');

INSERT INTO _592_posterior_report(verificacion, detalle, valor, md5_cuerpo, proacl, proowner, prosecdef, proconfig, provolatile)
SELECT 'funcion_592', p.oid::regprocedure::text, NULL, md5(pg_get_functiondef(p.oid)),
       p.proacl::text, p.proowner::regrole::text, p.prosecdef, p.proconfig::text, p.provolatile::text
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('inicializar_catalogos_diagnostico','calcular_prioridad_diagnostico',
                    'bloquear_hallazgo_emitido','validar_hallazgo_referencias',
                    'bloquear_cambio_codigo_catalogo','calcular_hallazgo_prioridad','bloquear_medicion_emitida',
                    'sugerir_condicion_medicion','bloquear_hallazgo_linea_emitido','bloquear_cambio_linea_vinculada');

INSERT INTO _592_posterior_report(verificacion, detalle, valor)
SELECT 'funciones_592_restantes', 'funciones', count(*)::bigint
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('inicializar_catalogos_diagnostico','calcular_prioridad_diagnostico',
                    'bloquear_hallazgo_emitido','validar_hallazgo_referencias',
                    'bloquear_cambio_codigo_catalogo','calcular_hallazgo_prioridad','bloquear_medicion_emitida',
                    'sugerir_condicion_medicion','bloquear_hallazgo_linea_emitido','bloquear_cambio_linea_vinculada');

DO $$
DECLARE v_mojibake bigint := 0;
BEGIN
  IF to_regclass('public.diagnostico_catalogo_defaults') IS NOT NULL
     AND to_regclass('public.diagnostico_catalogo_valores') IS NOT NULL
     AND to_regclass('public.diagnostico_matriz_prioridad') IS NOT NULL THEN
    EXECUTE $q$
      SELECT count(*) FROM (
        SELECT catalogo AS texto FROM public.diagnostico_catalogo_defaults
        UNION ALL SELECT codigo FROM public.diagnostico_catalogo_defaults
        UNION ALL SELECT etiqueta FROM public.diagnostico_catalogo_defaults
        UNION ALL SELECT catalogo FROM public.diagnostico_catalogo_valores
        UNION ALL SELECT codigo FROM public.diagnostico_catalogo_valores
        UNION ALL SELECT etiqueta FROM public.diagnostico_catalogo_valores
        UNION ALL SELECT condicion_codigo FROM public.diagnostico_matriz_prioridad
        UNION ALL SELECT riesgo_codigo FROM public.diagnostico_matriz_prioridad
        UNION ALL SELECT prioridad FROM public.diagnostico_matriz_prioridad
      ) s
      WHERE position(chr(194) IN s.texto) > 0
         OR position(chr(195) IN s.texto) > 0
         OR position(chr(65533) IN s.texto) > 0
         OR position(chr(226) || chr(8364) IN s.texto) > 0
    $q$ INTO v_mojibake;
  END IF;
  INSERT INTO _592_posterior_report(verificacion, detalle, valor)
  VALUES ('mojibake_catalogos_matriz', 'ocurrencias', v_mojibake);
END $$;

SELECT * FROM _592_posterior_report
ORDER BY verificacion, detalle;

ROLLBACK;
