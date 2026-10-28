-- 654 · Conteos y retiros de custodia piden el correlativo con la sociedad del documento
-- (los tenants multisociedad rechazan correlativos sin sociedad). Ajuste mínimo sobre la versión vigente (653).
DO $m$
DECLARE v_def text;
BEGIN
  v_def := pg_get_functiondef('public.wms_iniciar_conteo(text,text,uuid,text,text,text,text)'::regprocedure);
  IF (length(v_def) - length(replace(v_def, '''conteo_inventario'', ''CNT'', NULL)', ''))) / length('''conteo_inventario'', ''CNT'', NULL)') <> 2 THEN
    RAISE EXCEPTION 'wms_iniciar_conteo no coincide con la versión esperada';
  END IF;
  EXECUTE replace(v_def, '''conteo_inventario'', ''CNT'', NULL)', '''conteo_inventario'', ''CNT'', p_sociedad_id)');

  v_def := pg_get_functiondef('public.wms_custodia_crear_retiro(text,text,text,uuid,jsonb,date,text)'::regprocedure);
  IF position('''retiro_custodia'', ''CUS'', NULL)' IN v_def) = 0 THEN
    RAISE EXCEPTION 'wms_custodia_crear_retiro no coincide con la versión esperada';
  END IF;
  EXECUTE replace(v_def, '''retiro_custodia'', ''CUS'', NULL)', '''retiro_custodia'', ''CUS'', p_sociedad_id)');
END $m$;

DO $chk$
BEGIN
  IF position('p_sociedad_id)' IN pg_get_functiondef('public.wms_iniciar_conteo(text,text,uuid,text,text,text,text)'::regprocedure)) = 0
     OR position('''CUS'', p_sociedad_id)' IN pg_get_functiondef('public.wms_custodia_crear_retiro(text,text,text,uuid,jsonb,date,text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'no se aplicó el ajuste de correlativos';
  END IF;
END $chk$;

-- La guía es única por empresa + serie + número; el correlativo es por sociedad. Si el número ya existe, avanza.
DO $m$
DECLARE
  v_def text := pg_get_functiondef('public.wms_despachar_demanda(text,text,jsonb,jsonb)'::regprocedure);
  v_viejo text := 'v_num := public.wms_siguiente_numero(p_empresa_id, ''guia_remision'', v_serie, d.sociedad_id);';
BEGIN
  IF position('WHILE EXISTS (SELECT 1 FROM public.guias_remision' IN v_def) > 0 THEN RETURN; END IF;
  IF position(v_viejo IN v_def) = 0 THEN RAISE EXCEPTION 'wms_despachar_demanda no coincide con la versión esperada'; END IF;
  EXECUTE replace(v_def, v_viejo, v_viejo
    || ' WHILE EXISTS (SELECT 1 FROM public.guias_remision gx WHERE gx.empresa_id = p_empresa_id AND gx.serie = v_serie AND gx.numero = v_num) LOOP'
    || ' v_num := public.wms_siguiente_numero(p_empresa_id, ''guia_remision'', v_serie, d.sociedad_id); END LOOP;');
  IF position('WHILE EXISTS (SELECT 1 FROM public.guias_remision' IN pg_get_functiondef('public.wms_despachar_demanda(text,text,jsonb,jsonb)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'no se aplicó la protección de numeración de guías';
  END IF;
END $m$;
