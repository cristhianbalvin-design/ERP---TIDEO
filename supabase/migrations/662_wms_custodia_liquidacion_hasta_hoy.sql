-- 662 · Custodia: la liquidación solo cuenta días ya transcurridos (hora de Lima).
-- Hallazgo de la prueba funcional: con "Hasta" en el futuro se cobraban posiciones-día que aún no ocurrieron.
-- wms_custodia_liquidacion corta la serie de días en hoy; wms_custodia_enviar_ventas rechaza un período que termina después de hoy.
-- Se parte de la versión remota vigente (pg_get_functiondef) y se reemplazan solo las anclas.

DO $mig$
DECLARE
  v_def text; v_new text;
BEGIN
  v_def := pg_get_functiondef('public.wms_custodia_liquidacion(text,text,text,date,date)'::regprocedure);
  v_new := replace(v_def,
    'generate_series(p_desde, p_hasta, interval ''1 day'')',
    'generate_series(p_desde, least(p_hasta, (now() AT TIME ZONE ''America/Lima'')::date), interval ''1 day'')');
  IF v_new = v_def THEN RAISE EXCEPTION '662: ancla no encontrada en wms_custodia_liquidacion'; END IF;
  EXECUTE v_new;

  v_def := pg_get_functiondef('public.wms_custodia_enviar_ventas(text,text,text,date,date,uuid)'::regprocedure);
  v_new := replace(v_def,
    '  liq := public.wms_custodia_liquidacion(',
    '  IF p_hasta > (now() AT TIME ZONE ''America/Lima'')::date THEN' || E'\r\n'
    || '    RAISE EXCEPTION ''Solo se liquidan días ya transcurridos: la fecha final no puede ser posterior a hoy.'';' || E'\r\n'
    || '  END IF;' || E'\r\n'
    || '  liq := public.wms_custodia_liquidacion(');
  IF v_new = v_def THEN RAISE EXCEPTION '662: ancla no encontrada en wms_custodia_enviar_ventas'; END IF;
  EXECUTE v_new;
END $mig$;

DO $chk$
BEGIN
  IF position('least(p_hasta, (now() AT TIME ZONE ''America/Lima'')::date)' IN pg_get_functiondef('public.wms_custodia_liquidacion(text,text,text,date,date)'::regprocedure)) = 0
     OR position('Solo se liquidan días ya transcurridos' IN pg_get_functiondef('public.wms_custodia_enviar_ventas(text,text,text,date,date,uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION '662: comprobación fallida';
  END IF;
END $chk$;
