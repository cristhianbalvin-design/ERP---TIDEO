-- 659 · El mensaje del tope de devolución muestra la cantidad sin ceros sobrantes ("1" en lugar de "1.0000").
DO $m$
DECLARE
  v_def text := pg_get_functiondef('public.wms_devolucion_registrar(text,text,text,text,jsonb,text)'::regprocedure);
  v_viejo text := 'greatest(v_max, 0),';
BEGIN
  IF position('trim(trailing ''.'' from trim(trailing ''0'' from' IN v_def) > 0 THEN RETURN; END IF;
  IF (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo) <> 1 THEN
    RAISE EXCEPTION 'wms_devolucion_registrar no coincide con la versión esperada';
  END IF;
  EXECUTE replace(v_def, v_viejo, 'trim(trailing ''.'' from trim(trailing ''0'' from round(greatest(v_max, 0), 2)::text)),');
  IF position('trim(trailing ''.'' from trim(trailing ''0'' from' IN pg_get_functiondef('public.wms_devolucion_registrar(text,text,text,text,jsonb,text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'no se aplicó el ajuste del mensaje';
  END IF;
END $m$;
