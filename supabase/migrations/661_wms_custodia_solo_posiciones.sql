-- 661 · Custodia: solo posiciones y pisos se ofrecen y se asignan a clientes (no zonas ni racks).
-- Hallazgo de la prueba funcional: una zona aparecía como "posición libre".
-- Se parte de la versión remota vigente (pg_get_functiondef) y se reemplazan solo las anclas.

DO $mig$
DECLARE
  v_def text; v_new text;
BEGIN
  v_def := pg_get_functiondef('public.wms_custodia_resumen(text,text)'::regprocedure);
  v_new := replace(v_def,
    'WHERE u.propietario_cuenta_id IS NULL AND NOT u.es_general AND coalesce(u.activo, true) AND u.uso = ''almacenaje''',
    'WHERE u.propietario_cuenta_id IS NULL AND NOT u.es_general AND coalesce(u.activo, true) AND u.uso = ''almacenaje'' AND u.tipo IN (''posicion'', ''piso'')');
  IF v_new = v_def THEN RAISE EXCEPTION '661: ancla no encontrada en wms_custodia_resumen'; END IF;
  EXECUTE v_new;

  v_def := pg_get_functiondef('public.wms_custodia_asignar(text,text,text,text[])'::regprocedure);
  v_new := replace(v_def,
    'IF u.es_general THEN RAISE EXCEPTION ''La ubicación General no se asigna a clientes.''; END IF;',
    'IF u.es_general THEN RAISE EXCEPTION ''La ubicación General no se asigna a clientes.''; END IF;'
    || E'\r\n    IF p_cuenta_id IS NOT NULL AND u.tipo NOT IN (''posicion'', ''piso'') THEN RAISE EXCEPTION ''Solo se asignan posiciones o pisos a clientes (% es %).'', u.codigo, u.tipo; END IF;');
  IF v_new = v_def THEN RAISE EXCEPTION '661: ancla no encontrada en wms_custodia_asignar'; END IF;
  EXECUTE v_new;
END $mig$;

DO $chk$
BEGIN
  IF position('u.tipo IN (''posicion'', ''piso'')' IN pg_get_functiondef('public.wms_custodia_resumen(text,text)'::regprocedure)) = 0
     OR position('Solo se asignan posiciones o pisos' IN pg_get_functiondef('public.wms_custodia_asignar(text,text,text,text[])'::regprocedure)) = 0 THEN
    RAISE EXCEPTION '661: comprobación fallida';
  END IF;
END $chk$;
