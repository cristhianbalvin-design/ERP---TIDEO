BEGIN;

CREATE OR REPLACE FUNCTION public.asistente_comparar_periodos(
 p_empresa_id text,p_sociedad_id uuid,p_entidad text,
 p_desde_actual date,p_hasta_actual date,p_desde_anterior date,p_hasta_anterior date,
 p_moneda text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE
 a uuid[]; p jsonb; permiso boolean; omitidos text[]:=ARRAY[]::text[];
 desde_actual date:=p_desde_actual; hasta_actual date:=p_hasta_actual;
 desde_anterior date:=p_desde_anterior; hasta_anterior date:=p_hasta_anterior;
 mon text:=CASE WHEN p_moneda IS NULL THEN NULL ELSE upper(btrim(p_moneda)) END;
 v_por_moneda jsonb; v_formato jsonb;
BEGIN
 IF p_entidad IS NULL OR p_entidad NOT IN ('gastos','ordenes_compra','caja_chica') THEN RAISE EXCEPTION 'Entidad no válida'; END IF;
 IF mon IS NOT NULL AND mon NOT IN ('PEN','USD') THEN RAISE EXCEPTION 'Moneda no válida'; END IF;
 IF desde_actual IS NULL OR hasta_actual IS NULL OR desde_anterior IS NULL OR hasta_anterior IS NULL THEN RAISE EXCEPTION 'Debe indicar ambos rangos'; END IF;
 IF hasta_actual<desde_actual OR (hasta_actual-desde_actual)>365 OR hasta_anterior<desde_anterior OR (hasta_anterior-desde_anterior)>365 THEN RAISE EXCEPTION 'Rango inválido: máximo 366 días'; END IF;

 IF p_entidad='gastos' THEN a:=public.asistente_autorizar(p_empresa_id,'compras_gastos',p_sociedad_id,true);
 ELSIF p_entidad='ordenes_compra' THEN a:=public.asistente_autorizar(p_empresa_id,'ordenes_compra',p_sociedad_id,true);
 ELSE a:=public.asistente_autorizar(p_empresa_id,'caja',p_sociedad_id,true); END IF;
 p:=public.asistente_permisos_especiales(p_empresa_id);
 permiso:=CASE WHEN p_entidad='ordenes_compra' THEN coalesce((p->>'ver_costos')::boolean,false) ELSE coalesce((p->>'ver_finanzas')::boolean,false) END;
 IF NOT permiso THEN omitidos:=ARRAY['total','variacion_total','variacion_pct']::text[]; END IF;

 WITH rangos(periodo,desde,hasta) AS (
  VALUES ('actual'::text,desde_actual,hasta_actual),('anterior'::text,desde_anterior,hasta_anterior)
 ), base AS (
  SELECT r.periodo,upper(coalesce(nullif(g.moneda,''),'PEN')) moneda,g.monto::numeric importe
   FROM rangos r CROSS JOIN public.compras_gastos g
   WHERE p_entidad='gastos' AND g.empresa_id=p_empresa_id AND (a IS NULL OR g.sociedad_id=ANY(a))
    AND g.fecha::date BETWEEN r.desde AND r.hasta AND (mon IS NULL OR upper(coalesce(nullif(g.moneda,''),'PEN'))=mon)
    AND lower(coalesce(g.estado,'')) NOT IN ('anulado','anulada')
  UNION ALL
  SELECT r.periodo,upper(coalesce(nullif(oc.moneda,''),'PEN')),oc.total::numeric
   FROM rangos r CROSS JOIN public.ordenes_compra oc
   WHERE p_entidad='ordenes_compra' AND oc.empresa_id=p_empresa_id AND (a IS NULL OR oc.sociedad_id=ANY(a))
    AND oc.fecha_emision::date BETWEEN r.desde AND r.hasta AND (mon IS NULL OR upper(coalesce(nullif(oc.moneda,''),'PEN'))=mon)
    AND lower(coalesce(oc.estado,'')) NOT IN ('anulada','cancelada')
  UNION ALL
  SELECT r.periodo,upper(coalesce(nullif(c.moneda,''),'PEN')),c.monto::numeric
   FROM rangos r CROSS JOIN public.caja_chica c
   LEFT JOIN public.caja_chica_fondos f ON f.id=c.fondo_id
   LEFT JOIN public.cuentas_bancarias cbf ON cbf.id=f.cuenta_bancaria_id
   WHERE p_entidad='caja_chica' AND c.empresa_id=p_empresa_id
    AND (a IS NULL OR coalesce(c.sociedad_id,f.sociedad_id,cbf.sociedad_id)=ANY(a))
    AND c.fecha::date BETWEEN r.desde AND r.hasta AND (mon IS NULL OR upper(coalesce(nullif(c.moneda,''),'PEN'))=mon)
    AND lower(coalesce(c.estado,'')) NOT IN ('anulado','anulada')
 ), sumas AS (
  SELECT periodo,moneda,count(*)::integer cantidad,round(sum(importe),2) total
  FROM base GROUP BY periodo,moneda
 ), monedas AS (SELECT DISTINCT moneda FROM base), pares AS (
  SELECT m.moneda,
   coalesce(ac.cantidad,0)::integer actual_cantidad,coalesce(an.cantidad,0)::integer anterior_cantidad,
   coalesce(ac.total,0)::numeric actual_total,coalesce(an.total,0)::numeric anterior_total
  FROM monedas m LEFT JOIN sumas ac ON ac.moneda=m.moneda AND ac.periodo='actual'
   LEFT JOIN sumas an ON an.moneda=m.moneda AND an.periodo='anterior'
 )
 SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
   'moneda',moneda,
   'actual',jsonb_strip_nulls(jsonb_build_object('cantidad',actual_cantidad,'total',CASE WHEN permiso THEN actual_total END)),
   'anterior',jsonb_strip_nulls(jsonb_build_object('cantidad',anterior_cantidad,'total',CASE WHEN permiso THEN anterior_total END)),
   'variacion_cantidad',actual_cantidad-anterior_cantidad,
   'variacion_cantidad_pct',CASE WHEN anterior_cantidad>0 THEN round((actual_cantidad-anterior_cantidad)::numeric/anterior_cantidad*100,1) END,
   'variacion_total',CASE WHEN permiso THEN round(actual_total-anterior_total,2) END,
   'variacion_pct',CASE WHEN permiso AND anterior_total>0 THEN round((actual_total-anterior_total)/anterior_total*100,1) END,
   'sin_base',CASE WHEN permiso THEN anterior_total=0 ELSE anterior_cantidad=0 END
  )) ORDER BY moneda),'[]'::jsonb)
 INTO v_por_moneda FROM pares;
 v_formato:=public.asistente_formato_listado(coalesce(v_por_moneda,'[]'::jsonb),100,omitidos);

 RETURN jsonb_build_object(
  'entidad',p_entidad,
  'periodo_actual',jsonb_build_object('desde',desde_actual,'hasta',hasta_actual),
  'periodo_anterior',jsonb_build_object('desde',desde_anterior,'hasta',hasta_anterior),
  'por_moneda',coalesce(v_formato->'filas','[]'::jsonb),
  'sin_datos',jsonb_array_length(coalesce(v_formato->'filas','[]'::jsonb))=0,
  'campos_omitidos_por_permiso',coalesce(v_formato->'campos_omitidos_por_permiso','[]'::jsonb)
 ) || CASE WHEN permiso THEN '{}'::jsonb ELSE jsonb_build_object('aviso','No tienes permiso financiero para ver importes; se muestran solo cantidades de cada periodo.') END;
END $$;
REVOKE ALL ON FUNCTION public.asistente_comparar_periodos(text,uuid,text,date,date,date,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.asistente_comparar_periodos(text,uuid,text,date,date,date,date,text) TO authenticated;

-- Verificación de comparación por moneda, autorización y rangos; ejecutar en una sesión de prueba autorizada.
-- SELECT public.asistente_comparar_periodos('emp_ejemplo',NULL,'gastos','2026-10-01','2026-10-11','2026-09-01','2026-09-11',NULL);
-- SELECT public.asistente_comparar_periodos('emp_ejemplo',NULL,'ordenes_compra','2026-01-01','2026-10-11','2025-01-01','2025-10-11','PEN');
-- SELECT p.oid::regprocedure,has_function_privilege('authenticated',p.oid,'EXECUTE') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='asistente_comparar_periodos';

COMMIT;
