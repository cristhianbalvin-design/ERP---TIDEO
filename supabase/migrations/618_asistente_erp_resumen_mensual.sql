BEGIN;

CREATE OR REPLACE FUNCTION public.asistente_resumen_mensual(
 p_empresa_id text,p_sociedad_id uuid,p_entidad text,p_desde date DEFAULT NULL,p_hasta date DEFAULT NULL,p_moneda text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE a uuid[]; p jsonb; permiso boolean; d date:=p_desde; h date:=p_hasta; hoy date:=(now() AT TIME ZONE 'America/Lima')::date;
 meses integer; v_meses jsonb; v_resumen jsonb; con_datos jsonb; sin_datos jsonb; omitidos text[]:=ARRAY[]::text[];
 mon text:=CASE WHEN p_moneda IS NULL THEN NULL ELSE upper(btrim(p_moneda)) END;
BEGIN
 IF p_entidad NOT IN ('gastos','ordenes_compra','cxp','caja_chica') THEN RAISE EXCEPTION 'Entidad no válida'; END IF;
 IF mon IS NOT NULL AND mon NOT IN ('PEN','USD') THEN RAISE EXCEPTION 'Moneda no válida'; END IF;
 IF d IS NULL AND h IS NULL THEN d:=date_trunc('month',hoy-interval '5 months')::date; h:=hoy; END IF;
 IF (d IS NULL)<>(h IS NULL) THEN RAISE EXCEPTION 'Debe indicar desde y hasta'; END IF;
 IF h<d OR (extract(year FROM h)::integer*12+extract(month FROM h)::integer)-(extract(year FROM d)::integer*12+extract(month FROM d)::integer)>=36 THEN RAISE EXCEPTION 'Rango inválido: máximo 36 meses'; END IF;
 meses:=(extract(year FROM h)::integer*12+extract(month FROM h)::integer)-(extract(year FROM d)::integer*12+extract(month FROM d)::integer)+1;
 IF p_entidad='gastos' THEN a:=public.asistente_autorizar(p_empresa_id,'compras_gastos',p_sociedad_id,true);
 ELSIF p_entidad='ordenes_compra' THEN a:=public.asistente_autorizar(p_empresa_id,'ordenes_compra',p_sociedad_id,true);
 ELSIF p_entidad='cxp' THEN a:=public.asistente_autorizar(p_empresa_id,'cxp',p_sociedad_id,true);
 ELSE a:=public.asistente_autorizar(p_empresa_id,'caja',p_sociedad_id,true); END IF;
 p:=public.asistente_permisos_especiales(p_empresa_id);
 permiso:=CASE WHEN p_entidad='ordenes_compra' THEN coalesce((p->>'ver_costos')::boolean,false) ELSE coalesce((p->>'ver_finanzas')::boolean,false) END;
 IF NOT permiso THEN omitidos:=ARRAY['total','promedio_por_registro','promedio_mensual']::text[]; END IF;
 WITH base AS (
  SELECT g.fecha::date fecha,upper(coalesce(nullif(g.moneda,''),'PEN')) moneda,g.monto importe FROM public.compras_gastos g
   WHERE p_entidad='gastos' AND g.empresa_id=p_empresa_id AND (a IS NULL OR g.sociedad_id=ANY(a)) AND g.fecha::date BETWEEN d AND h
    AND (mon IS NULL OR upper(coalesce(nullif(g.moneda,''),'PEN'))=mon) AND lower(coalesce(g.estado,'')) NOT IN ('anulado','anulada')
  UNION ALL
  SELECT oc.fecha_emision::date,upper(coalesce(nullif(oc.moneda,''),'PEN')),oc.total::numeric FROM public.ordenes_compra oc
   WHERE p_entidad='ordenes_compra' AND oc.empresa_id=p_empresa_id AND (a IS NULL OR oc.sociedad_id=ANY(a)) AND oc.fecha_emision::date BETWEEN d AND h
    AND (mon IS NULL OR upper(coalesce(nullif(oc.moneda,''),'PEN'))=mon) AND lower(coalesce(oc.estado,'')) NOT IN ('anulada')
  UNION ALL
  SELECT c.fecha_vencimiento::date,upper(coalesce(nullif(c.moneda,''),'PEN')),c.monto_total::numeric FROM public.cxp c
   WHERE p_entidad='cxp' AND c.empresa_id=p_empresa_id AND (a IS NULL OR c.sociedad_id=ANY(a)) AND c.fecha_vencimiento::date BETWEEN d AND h
    AND (mon IS NULL OR upper(coalesce(nullif(c.moneda,''),'PEN'))=mon) AND lower(coalesce(c.estado,'')) NOT IN ('pagada','anulada','cancelada') AND greatest(coalesce(c.saldo,0),0)>0
  UNION ALL
  SELECT c.fecha::date,upper(coalesce(nullif(c.moneda,''),'PEN')),c.monto::numeric FROM public.caja_chica c LEFT JOIN public.caja_chica_fondos f ON f.id=c.fondo_id LEFT JOIN public.cuentas_bancarias cbf ON cbf.id=f.cuenta_bancaria_id
   WHERE p_entidad='caja_chica' AND c.empresa_id=p_empresa_id AND (a IS NULL OR coalesce(c.sociedad_id,f.sociedad_id,cbf.sociedad_id)=ANY(a)) AND c.fecha::date BETWEEN d AND h
    AND (mon IS NULL OR upper(coalesce(nullif(c.moneda,''),'PEN'))=mon) AND lower(coalesce(c.estado,'')) NOT IN ('anulado','anulada')
 ), por_mes AS (
  SELECT date_trunc('month',fecha)::date mes,moneda,count(*)::integer cantidad,round(sum(importe),2) total FROM base GROUP BY 1,2
 ), meses_rango AS (
  SELECT generate_series(date_trunc('month',d)::timestamp,date_trunc('month',h)::timestamp,interval '1 month')::date mes
 ), monedas AS (SELECT DISTINCT moneda FROM base), expandido AS (
  SELECT mr.mes,mo.moneda,coalesce(pm.cantidad,0)::integer cantidad,CASE WHEN permiso THEN coalesce(pm.total,0)::numeric END total
  FROM meses_rango mr CROSS JOIN monedas mo LEFT JOIN por_mes pm ON pm.mes=mr.mes AND pm.moneda=mo.moneda
 )
 SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('mes',to_char(e.mes,'YYYY-MM'),'moneda',e.moneda,'cantidad',e.cantidad,'total',e.total,'promedio_por_registro',CASE WHEN permiso AND e.cantidad>0 THEN round(e.total/e.cantidad,2) ELSE CASE WHEN permiso THEN 0 END END)) ORDER BY e.mes,e.moneda),'[]'::jsonb),
        coalesce((SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('moneda',z.moneda,'cantidad',z.cantidad,'total',z.total,'promedio_por_registro',CASE WHEN permiso AND z.cantidad>0 THEN round(z.total/z.cantidad,2) ELSE CASE WHEN permiso THEN 0 END END,'promedio_mensual',CASE WHEN permiso THEN round(z.total/meses,2) END)) ORDER BY z.moneda) FROM (SELECT e.moneda,sum(e.cantidad)::integer cantidad,CASE WHEN permiso THEN round(sum(e.total),2) END total FROM expandido e GROUP BY e.moneda) z),'[]'::jsonb),
        coalesce((SELECT jsonb_agg(to_char(mr.mes,'YYYY-MM') ORDER BY mr.mes) FROM meses_rango mr WHERE EXISTS(SELECT 1 FROM por_mes pm WHERE pm.mes=mr.mes AND pm.cantidad>0)),'[]'::jsonb),
        coalesce((SELECT jsonb_agg(to_char(mr.mes,'YYYY-MM') ORDER BY mr.mes) FROM meses_rango mr WHERE NOT EXISTS(SELECT 1 FROM por_mes pm WHERE pm.mes=mr.mes AND pm.cantidad>0)),'[]'::jsonb)
 INTO v_meses,v_resumen,con_datos,sin_datos FROM expandido e;
 RETURN public.asistente_formato_listado(coalesce(v_meses,'[]'::jsonb),100,omitidos)
  || jsonb_build_object('desde',d,'hasta',h,'meses_en_rango',meses,'cantidad_meses_con_datos',jsonb_array_length(con_datos),'meses_con_datos',con_datos,'cantidad_meses_sin_datos',jsonb_array_length(sin_datos),'meses_sin_datos',sin_datos,'resumen_por_moneda',v_resumen)
  || CASE WHEN permiso THEN '{}'::jsonb ELSE jsonb_build_object('aviso','No tienes permiso financiero para ver importes; se muestran solo cantidades por mes.') END;
END $$;
REVOKE ALL ON FUNCTION public.asistente_resumen_mensual(text,uuid,text,date,date,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.asistente_resumen_mensual(text,uuid,text,date,date,text) TO authenticated;

-- Verificación: para emp_2000000000, septiembre 2026 debe devolver 25 gastos PEN por 31908.62.
-- SELECT public.asistente_resumen_mensual('emp_2000000000',NULL,'gastos','2026-09-01','2026-09-30','PEN');
-- Verificación: para emp_2000000000, septiembre 2026 debe devolver 1 gasto USD por 1000.00.
-- SELECT public.asistente_resumen_mensual('emp_2000000000',NULL,'gastos','2026-09-01','2026-09-30','USD');
-- Verificación de firma instalada y permisos: debe listar la RPC mensual y EXECUTE para authenticated.
-- SELECT p.oid::regprocedure, has_function_privilege('authenticated',p.oid,'EXECUTE') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='asistente_resumen_mensual';

COMMIT;