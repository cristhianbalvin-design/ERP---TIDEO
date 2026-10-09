-- 614_asistente_erp_caja_chica_sociedad_efectiva.sql
-- Ajuste de 612: la sociedad de un fondo es la del fondo o, si no tiene, la de su cuenta bancaria (igual que la pantalla de Caja Chica).
-- Con alcance/sociedad, un fondo sin ninguna de las dos queda fuera (la pantalla lo oculta). El gasto usa su sociedad o la del fondo.
-- CREATE OR REPLACE, misma firma, sin DROP.

CREATE OR REPLACE FUNCTION public.asistente_resumen_caja_chica(p_empresa_id text,p_sociedad_id uuid DEFAULT NULL,p_texto text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE a uuid[]; p jsonb; m boolean; t text; v jsonb; g jsonb;
BEGIN
 a:=public.asistente_autorizar(p_empresa_id,'caja',p_sociedad_id,true); p:=public.asistente_permisos_especiales(p_empresa_id); m:=(p->>'ver_finanzas')::boolean;
 t:=replace(replace(replace(coalesce(p_texto,''),'\','\\'),'%','\%'),'_','\_');
 WITH b AS (
  SELECT f.id, f.nombre, upper(coalesce(nullif(f.moneda,''),'PEN')) AS mon, u.nombre AS resp, f.sociedad_id, f.monto_asignado, f.monto_minimo,
   round(coalesce(f.monto_asignado,0)
    + coalesce((SELECT sum(x.monto) FROM public.caja_chica_aportes x WHERE x.fondo_id=f.id AND lower(coalesce(x.estado,'')) NOT IN ('anulado','anulada')),0)
    + coalesce((SELECT sum(r.monto_aprobado) FROM public.caja_chica_rendiciones r WHERE r.fondo_id=f.id AND lower(coalesce(r.estado,'')) IN ('aprobada','repuesta')),0)
    - coalesce((SELECT sum(c.monto) FROM public.caja_chica c WHERE c.fondo_id=f.id AND lower(coalesce(c.estado,'')) NOT IN ('anulado','anulada')),0)
    - coalesce((SELECT sum(tr.monto) FROM public.caja_chica_transferencias tr WHERE tr.fondo_origen_id=f.id AND tr.estado='registrado'),0)
    + coalesce((SELECT sum(tr.monto) FROM public.caja_chica_transferencias tr WHERE tr.fondo_destino_id=f.id AND tr.estado='registrado'),0)
    - coalesce(f.monto_devuelto,0),2) AS saldo
    FROM public.caja_chica_fondos f LEFT JOIN public.usuarios u ON u.id=f.responsable_id LEFT JOIN public.cuentas_bancarias cbf ON cbf.id=f.cuenta_bancaria_id
   WHERE f.empresa_id=p_empresa_id AND (a IS NULL OR coalesce(f.sociedad_id,cbf.sociedad_id)=ANY(a)) AND lower(coalesce(f.estado,''))='activo'
     AND (p_texto IS NULL OR f.nombre ILIKE '%'||t||'%' ESCAPE '\' OR u.nombre ILIKE '%'||t||'%' ESCAPE '\')
 )
 SELECT (SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',z.id,'nombre',z.nombre,'moneda',z.mon,'responsable',z.resp,'sociedad_id',z.sociedad_id,
          'monto_asignado',CASE WHEN m THEN z.monto_asignado END,'saldo_disponible',CASE WHEN m THEN z.saldo END,'monto_minimo',CASE WHEN m THEN z.monto_minimo END,
          'requiere_reposicion',CASE WHEN m THEN z.saldo<=coalesce(z.monto_minimo,0) END)) ORDER BY z.nombre),'[]'::jsonb) FROM (SELECT * FROM b ORDER BY nombre LIMIT 50) z),
        (SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('moneda',q.mon,'fondos_activos',q.n,
          'saldo_total',CASE WHEN m THEN round(q.s,2) END,'fondos_a_reponer',CASE WHEN m THEN q.r END)) ORDER BY q.mon),'[]'::jsonb)
           FROM (SELECT mon,count(*) n,sum(saldo) s,count(*) FILTER (WHERE saldo<=coalesce(monto_minimo,0)) r FROM b GROUP BY mon) q)
  INTO v,g;
 RETURN jsonb_build_object('fondos',v,'por_moneda',g,
  'campos_omitidos_por_permiso',jsonb_build_array(VARIADIC (CASE WHEN NOT m THEN ARRAY['montos']::text[] ELSE ARRAY[]::text[] END)));
END $$;

CREATE OR REPLACE FUNCTION public.asistente_buscar_caja_chica(p_empresa_id text,p_sociedad_id uuid DEFAULT NULL,p_texto text DEFAULT NULL,p_estado text DEFAULT NULL,p_desde date DEFAULT NULL,p_hasta date DEFAULT NULL,p_limite integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE a uuid[]; p jsonb; m boolean; t text; v jsonb; tot jsonb; o text[]; lim int:=least(greatest(coalesce(p_limite,20),1),100);
BEGIN
 a:=public.asistente_autorizar(p_empresa_id,'caja',p_sociedad_id,true); p:=public.asistente_permisos_especiales(p_empresa_id); m:=(p->>'ver_finanzas')::boolean;
 o:=CASE WHEN NOT m THEN ARRAY['monto']::text[] ELSE ARRAY[]::text[] END;
 t:=replace(replace(replace(coalesce(p_texto,''),'\','\\'),'%','\%'),'_','\_');
 WITH b AS (
  SELECT c.id, c.fecha, upper(coalesce(nullif(c.moneda,''),'PEN')) AS mon, c.monto,
   jsonb_strip_nulls(jsonb_build_object('id',c.id,'fecha',c.fecha,'concepto',left(c.concepto,120),'fondo',f.nombre,'responsable',c.responsable_nombre,
    'categoria',c.categoria,'comprobante',c.num_comprobante,'estado',c.estado,'moneda',upper(coalesce(nullif(c.moneda,''),'PEN')),'sociedad_id',c.sociedad_id,
    'monto',CASE WHEN m THEN c.monto END)) AS x
    FROM public.caja_chica c LEFT JOIN public.caja_chica_fondos f ON f.id=c.fondo_id LEFT JOIN public.cuentas_bancarias cbf ON cbf.id=f.cuenta_bancaria_id
   WHERE c.empresa_id=p_empresa_id AND (a IS NULL OR coalesce(c.sociedad_id,f.sociedad_id,cbf.sociedad_id)=ANY(a))
     AND ((p_estado IS NOT NULL AND lower(c.estado)=lower(p_estado)) OR (p_estado IS NULL AND lower(coalesce(c.estado,'')) NOT IN ('anulado','anulada')))
     AND (p_desde IS NULL OR c.fecha>=p_desde) AND (p_hasta IS NULL OR c.fecha<=p_hasta)
     AND (p_texto IS NULL OR c.concepto ILIKE '%'||t||'%' ESCAPE '\' OR c.responsable_nombre ILIKE '%'||t||'%' ESCAPE '\' OR c.categoria ILIKE '%'||t||'%' ESCAPE '\'
          OR c.num_comprobante ILIKE '%'||t||'%' ESCAPE '\' OR f.nombre ILIKE '%'||t||'%' ESCAPE '\')
 )
 SELECT (SELECT coalesce(jsonb_agg(z.x ORDER BY z.fecha DESC NULLS LAST,z.id DESC),'[]'::jsonb) FROM (SELECT x,fecha,id FROM b ORDER BY fecha DESC NULLS LAST,id DESC LIMIT lim+1) z),
        (SELECT coalesce(jsonb_agg(jsonb_build_object('moneda',q.mon,'cantidad',q.n,'total',round(q.s,2)) ORDER BY q.mon),'[]'::jsonb) FROM (SELECT mon,count(*) n,sum(monto) s FROM b GROUP BY mon) q)
  INTO v,tot;
 RETURN public.asistente_formato_listado(v,lim,o) || CASE WHEN m THEN jsonb_build_object('total_filtrado_por_moneda',tot) ELSE '{}'::jsonb END;
END $$;

REVOKE ALL ON FUNCTION public.asistente_resumen_caja_chica(text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.asistente_resumen_caja_chica(text,uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.asistente_buscar_caja_chica(text,uuid,text,text,date,date,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.asistente_buscar_caja_chica(text,uuid,text,text,date,date,integer) TO authenticated;
