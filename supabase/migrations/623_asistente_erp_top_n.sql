BEGIN;

CREATE OR REPLACE FUNCTION public.asistente_top_n(
 p_empresa_id text,p_ranking text,p_sociedad_id uuid DEFAULT NULL,p_n integer DEFAULT 10,
 p_periodo text DEFAULT NULL,p_ultimos_meses integer DEFAULT NULL,p_desde date DEFAULT NULL,p_hasta date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE
 a uuid[]; p jsonb; ver_finanzas boolean; ver_costos boolean; permiso boolean;
 d date:=p_desde; h date:=p_hasta; hoy date:=(now() AT TIME ZONE 'America/Lima')::date;
 meses integer; v_por_moneda jsonb; omitidos text[]:=ARRAY[]::text[];
BEGIN
 IF p_ranking IS NULL OR p_ranking NOT IN ('proveedores_gasto','categorias_gasto','clientes_cxc','materiales_stock') THEN RAISE EXCEPTION 'Ranking no válido'; END IF;
 IF p_n IS NULL OR p_n<1 OR p_n>40 THEN RAISE EXCEPTION 'N debe estar entre 1 y 40'; END IF;
 IF p_ranking IN ('proveedores_gasto','categorias_gasto') THEN
  a:=public.asistente_autorizar(p_empresa_id,'compras_gastos',p_sociedad_id,true);
 ELSIF p_ranking='clientes_cxc' THEN
  a:=public.asistente_autorizar(p_empresa_id,'cxc',p_sociedad_id,true);
 ELSE
  a:=public.asistente_autorizar(p_empresa_id,'inventario',p_sociedad_id,true);
 END IF;
 p:=public.asistente_permisos_especiales(p_empresa_id);
 ver_finanzas:=coalesce((p->>'ver_finanzas')::boolean,false);
 ver_costos:=coalesce((p->>'ver_costos')::boolean,false);
 permiso:=CASE WHEN p_ranking='materiales_stock' THEN ver_costos ELSE ver_finanzas END;
 IF p_ranking IN ('proveedores_gasto','categorias_gasto') THEN
  IF d IS NULL AND h IS NULL THEN
   IF p_ultimos_meses IS NOT NULL AND (p_ultimos_meses<1 OR p_ultimos_meses>36) THEN RAISE EXCEPTION 'Últimos meses debe estar entre 1 y 36'; END IF;
   IF p_periodo IS NOT NULL AND p_periodo NOT IN ('mes_actual','mes_anterior','trimestre_actual','anio_actual','ultimos_meses') THEN RAISE EXCEPTION 'Periodo no válido'; END IF;
   IF p_periodo='mes_anterior' THEN d:=date_trunc('month',hoy-interval '1 month')::date; h:=(date_trunc('month',hoy)-interval '1 day')::date;
   ELSIF p_periodo='trimestre_actual' THEN d:=date_trunc('quarter',hoy)::date; h:=hoy;
   ELSIF p_periodo='anio_actual' THEN d:=date_trunc('year',hoy)::date; h:=hoy;
   ELSE meses:=coalesce(p_ultimos_meses,CASE WHEN p_periodo='mes_actual' THEN 1 ELSE 6 END); d:=date_trunc('month',hoy-(meses-1)*interval '1 month')::date; h:=hoy;
   END IF;
  END IF;
  IF (d IS NULL)<>(h IS NULL) THEN RAISE EXCEPTION 'Debe indicar desde y hasta'; END IF;
  IF h<d OR (extract(year FROM h)::integer*12+extract(month FROM h)::integer)-(extract(year FROM d)::integer*12+extract(month FROM d)::integer)>=36 THEN RAISE EXCEPTION 'Rango inválido: máximo 36 meses'; END IF;
  IF p_periodo IS NOT NULL AND (p_desde IS NOT NULL OR p_hasta IS NOT NULL) THEN RAISE EXCEPTION 'Usa periodo o fechas explícitas'; END IF;
 ELSE
  IF p_periodo IS NOT NULL OR p_ultimos_meses IS NOT NULL OR p_desde IS NOT NULL OR p_hasta IS NOT NULL THEN RAISE EXCEPTION 'CxC y stock son cortes actuales'; END IF;
 END IF;
 IF NOT permiso THEN
  omitidos:=CASE WHEN p_ranking='materiales_stock' THEN ARRAY['valor','participacion_pct','total_moneda']::text[] ELSE ARRAY['importe','participacion_pct','total_moneda']::text[] END;
 END IF;

 WITH src AS (
  SELECT coalesce(nullif(regexp_replace(coalesce(g.ruc_proveedor,''),'[^0-9]','','g'),''),
           CASE WHEN nullif(btrim(g.proveedor_referencia),'') IS NULL THEN '__sin_proveedor__' ELSE lower(regexp_replace(btrim(g.proveedor_referencia),'\s+',' ','g')) END) clave,
         coalesce(nullif(btrim(g.proveedor_referencia),''),'Sin proveedor') nombre,
         upper(coalesce(nullif(g.moneda,''),'PEN')) moneda,g.monto::numeric importe,0::numeric unidades
   FROM public.compras_gastos g
   WHERE p_ranking='proveedores_gasto' AND g.empresa_id=p_empresa_id AND (a IS NULL OR g.sociedad_id=ANY(a))
    AND g.fecha::date BETWEEN d AND h AND lower(coalesce(g.estado,'')) NOT IN ('anulado','anulada')
  UNION ALL
  SELECT regexp_replace(lower(btrim(regexp_replace(replace(coalesce(g.categoria,''),'-','_'),'\s+','_','g'))),'_+','_','g'),
         initcap(replace(regexp_replace(lower(btrim(regexp_replace(replace(coalesce(g.categoria,''),'-','_'),'\s+','_','g'))),'_+','_','g'),'_',' ')),
         upper(coalesce(nullif(g.moneda,''),'PEN')),g.monto::numeric,0::numeric
   FROM public.compras_gastos g
   WHERE p_ranking='categorias_gasto' AND g.empresa_id=p_empresa_id AND (a IS NULL OR g.sociedad_id=ANY(a))
    AND g.fecha::date BETWEEN d AND h AND lower(coalesce(g.estado,'')) NOT IN ('anulado','anulada')
  UNION ALL
  SELECT c.cuenta_id::text,coalesce(ct.nombre_comercial,ct.razon_social,'(sin cliente)'),upper(coalesce(nullif(c.moneda,''),'PEN')),
         greatest(coalesce(c.saldo,0)-coalesce(c.monto_retencion,0),0)::numeric,0::numeric
   FROM public.cxc c JOIN public.facturas f ON f.empresa_id=c.empresa_id AND f.id=c.factura_id
   LEFT JOIN public.cuentas ct ON ct.empresa_id=c.empresa_id AND ct.id=c.cuenta_id
   WHERE p_ranking='clientes_cxc' AND c.empresa_id=p_empresa_id AND (a IS NULL OR c.sociedad_id=ANY(a))
    AND lower(coalesce(c.estado,'')) IN ('por_cobrar','cobro_parcial')
    AND lower(coalesce(f.tipo_documento,'')) IN ('factura','boleta')
    AND greatest(coalesce(c.saldo,0)-coalesce(c.monto_retencion,0),0)>0
  UNION ALL
  SELECT m.id::text,m.codigo||' - '||left(m.descripcion,120),upper(coalesce(nullif(m.moneda,''),'PEN')),
         (coalesce(st.fisico,st.disponible,0)*coalesce(m.costo_promedio,0))::numeric,coalesce(st.fisico,st.disponible,0)::numeric
   FROM public.stock st JOIN public.materiales m ON m.id=st.material_id AND m.empresa_id=st.empresa_id
   WHERE p_ranking='materiales_stock' AND st.empresa_id=p_empresa_id AND (a IS NULL OR st.sociedad_id=ANY(a))
    AND coalesce(st.fisico,st.disponible,0)>0
 ), agrupado AS (
  SELECT clave,max(nombre) nombre,moneda,round(sum(importe),2) importe,round(sum(unidades),2) unidades
  FROM src GROUP BY clave,moneda
 ), ordenado AS (
  SELECT g.*,sum(g.importe) OVER(PARTITION BY g.moneda) total_moneda,
   row_number() OVER(PARTITION BY g.moneda ORDER BY
    CASE WHEN p_ranking='materiales_stock' AND NOT permiso THEN g.unidades ELSE g.importe END DESC,g.nombre) rn,
   count(*) OVER(PARTITION BY g.moneda) total_items
  FROM agrupado g
 ), por_moneda AS (
  SELECT o.moneda,max(o.total_moneda) total_moneda,max(o.total_items) total_items,
   coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'nombre',o.nombre,'importe',CASE WHEN permiso AND p_ranking<>'materiales_stock' THEN o.importe END,
    'valor',CASE WHEN permiso AND p_ranking='materiales_stock' THEN o.importe END,
    'unidades',CASE WHEN p_ranking='materiales_stock' THEN o.unidades END,
    'participacion_pct',CASE WHEN permiso AND o.total_moneda<>0 THEN round(o.importe/o.total_moneda*100,2) END
   )) ORDER BY o.rn) FILTER (WHERE o.rn<=p_n),'[]'::jsonb) items
  FROM ordenado o GROUP BY o.moneda
 )
 SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
  'moneda',m.moneda,
  'total_moneda',CASE WHEN permiso THEN m.total_moneda END,
  'items_fuera',greatest(m.total_items-p_n,0),
  'filas',public.asistente_formato_listado(m.items,p_n,omitidos)->'filas',
  'campos_omitidos_por_permiso',to_jsonb(omitidos)
 )) ORDER BY m.moneda),'[]'::jsonb)
 INTO v_por_moneda
 FROM por_moneda m;

 RETURN jsonb_build_object('ranking',p_ranking,'desde',CASE WHEN p_ranking IN ('proveedores_gasto','categorias_gasto') THEN d END,
  'hasta',CASE WHEN p_ranking IN ('proveedores_gasto','categorias_gasto') THEN h END,'fecha_corte',CASE WHEN p_ranking IN ('clientes_cxc','materiales_stock') THEN hoy END,
  'por_moneda',coalesce(v_por_moneda,'[]'::jsonb),'campos_omitidos_por_permiso',to_jsonb(omitidos));
END $$;
REVOKE ALL ON FUNCTION public.asistente_top_n(text,text,uuid,integer,text,integer,date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.asistente_top_n(text,text,uuid,integer,text,integer,date,date) TO authenticated;

COMMIT;
