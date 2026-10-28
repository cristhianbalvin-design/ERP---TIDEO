-- 660 · WMS mejoras
-- 1) La devolución de taller rebaja el costo de materiales de la OT:
--    la entrada a cuarentena y la merma de su inspección quedan ligadas a la OT (referencia_tipo 'ot').
--    Así el costo de la OT = despachado − liberado a stock (la merma sigue cargada a la OT).
--    Se parte de la versión remota vigente (pg_get_functiondef) y se reemplazan solo las anclas.
-- 2) guia_reservar_numero: correlativo atómico de guías para Administración que salta números ocupados
--    (la unicidad de guías es empresa + serie + número).

DO $mig$
DECLARE
  v_def text; v_new text;
BEGIN
  -- 1a) wms_devolucion_registrar
  v_def := pg_get_functiondef('public.wms_devolucion_registrar(text,text,text,text,jsonb,text)'::regprocedure);
  v_new := replace(v_def,
    'p_referencia_tipo := ''devolucion'', p_referencia_id := v_id, p_nro_documento := v_numero,',
    'p_referencia_tipo := CASE p_origen WHEN ''taller'' THEN ''ot'' ELSE ''devolucion'' END, p_referencia_id := CASE p_origen WHEN ''taller'' THEN v_ot ELSE v_id END, p_nro_documento := v_numero,');
  IF v_new = v_def THEN RAISE EXCEPTION '660: ancla no encontrada en wms_devolucion_registrar'; END IF;
  EXECUTE v_new;

  -- 1b) wms_devolucion_cerrar (salida por merma)
  v_def := pg_get_functiondef('public.wms_devolucion_cerrar(text,text,jsonb)'::regprocedure);
  v_new := replace(v_def,
    'p_referencia_tipo := ''devolucion'', p_referencia_id := d.id, p_nro_documento := d.numero,',
    'p_referencia_tipo := CASE WHEN d.origen = ''taller'' THEN ''ot'' ELSE ''devolucion'' END, p_referencia_id := CASE WHEN d.origen = ''taller'' THEN d.ot_id ELSE d.id END, p_nro_documento := d.numero,');
  IF v_new = v_def THEN RAISE EXCEPTION '660: ancla no encontrada en wms_devolucion_cerrar'; END IF;
  EXECUTE v_new;
END $mig$;

-- Devoluciones de taller ya registradas: re-ligar su kardex a la OT
UPDATE public.kardex k
   SET referencia_tipo = 'ot', referencia_id = d.ot_id
  FROM public.wms_devoluciones d
 WHERE d.origen = 'taller' AND d.ot_id IS NOT NULL
   AND k.empresa_id = d.empresa_id AND k.referencia_tipo = 'devolucion' AND k.referencia_id = d.id;

CREATE OR REPLACE FUNCTION public.guia_reservar_numero(p_empresa_id text, p_serie text DEFAULT 'T001', p_sociedad_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_serie text := coalesce(nullif(btrim(coalesce(p_serie, '')), ''), 'T001');
  v_alc uuid[]; v_num integer; v_intentos integer := 0;
BEGIN
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'No perteneces a esta empresa.' USING ERRCODE = '42501';
  END IF;
  v_alc := public.usuario_alcance_sociedades(p_empresa_id);
  IF v_alc IS NOT NULL AND p_sociedad_id IS NOT NULL AND NOT (p_sociedad_id = ANY (v_alc)) THEN
    RAISE EXCEPTION 'La sociedad está fuera de tu alcance.' USING ERRCODE = '42501';
  END IF;
  v_num := public.wms_siguiente_numero(p_empresa_id, 'guia_remision', v_serie, p_sociedad_id);
  WHILE EXISTS (SELECT 1 FROM public.guias_remision g WHERE g.empresa_id = p_empresa_id AND g.serie = v_serie AND g.numero = v_num) LOOP
    v_intentos := v_intentos + 1;
    IF v_intentos > 10000 THEN RAISE EXCEPTION 'No se encontró un número de guía libre en la serie %.', v_serie; END IF;
    v_num := public.wms_siguiente_numero(p_empresa_id, 'guia_remision', v_serie, p_sociedad_id);
  END LOOP;
  RETURN jsonb_build_object('numero', v_num, 'numero_completo', v_serie || '-' || lpad(v_num::text, 8, '0'));
END $function$;

REVOKE ALL ON FUNCTION public.guia_reservar_numero(text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guia_reservar_numero(text, text, uuid) TO authenticated;

-- Comprobación
DO $chk$
BEGIN
  IF position('THEN ''ot'' ELSE ''devolucion''' IN pg_get_functiondef('public.wms_devolucion_registrar(text,text,text,text,jsonb,text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION '660: wms_devolucion_registrar no quedó ligada a la OT';
  END IF;
  IF position('THEN ''ot'' ELSE ''devolucion''' IN pg_get_functiondef('public.wms_devolucion_cerrar(text,text,jsonb)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION '660: wms_devolucion_cerrar no quedó ligada a la OT';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.guia_reservar_numero(text,text,uuid)', 'execute')
     OR has_function_privilege('anon', 'public.guia_reservar_numero(text,text,uuid)', 'execute') THEN
    RAISE EXCEPTION '660: permisos de guia_reservar_numero incorrectos';
  END IF;
END $chk$;
