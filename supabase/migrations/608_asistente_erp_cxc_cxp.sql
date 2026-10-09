-- 608_asistente_erp_cxc_cxp.sql
-- Finanzas para el asistente: resumen y listado de Cuentas por Cobrar (cxc) y Cuentas por Pagar (cxp).
-- Solo lectura, SECURITY INVOKER (RLS y alcance societario del usuario), permiso de pantalla cxc/cxp.
-- Los montos exigen ver_finanzas; sin ese permiso se devuelven solo cantidades y se declara el omitido.
-- Criterios iguales a la pantalla: CxC abierta = estado distinto de cobrada/pagada/anulada/cancelada y saldo
-- neto de retencion > 0; CxP abierta = estado distinto de pagada/anulada/cancelada y saldo > 0.
-- Mora = dias desde el vencimiento (fecha Lima); antiguedad en tramos 0-30, 31-60, 61-90, +90 de mora.
-- Funciones nuevas: sin DROP, EXECUTE solo para authenticated.

CREATE OR REPLACE FUNCTION public.asistente_resumen_cxc(p_empresa_id text,p_sociedad_id uuid DEFAULT NULL,p_texto text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE a uuid[]; p jsonb; m boolean; t text; v jsonb; hoy date:=(now() AT TIME ZONE 'America/Lima')::date;
BEGIN
 a:=public.asistente_autorizar(p_empresa_id,'cxc',p_sociedad_id,true); p:=public.asistente_permisos_especiales(p_empresa_id); m:=(p->>'ver_finanzas')::boolean;
 t:=replace(replace(replace(coalesce(p_texto,''),'\','\\'),'%','\%'),'_','\_');
 WITH b AS (
  SELECT coalesce(nullif(c.moneda,''),'PEN') AS mon, greatest(coalesce(c.saldo,0)-coalesce(c.monto_retencion,0),0) AS sn,
         greatest(hoy-c.fecha_vencimiento,0) AS mora, coalesce(ct.nombre_comercial,ct.razon_social,'(sin cliente)') AS cli
    FROM public.cxc c LEFT JOIN public.cuentas ct ON ct.empresa_id=c.empresa_id AND ct.id=c.cuenta_id
   WHERE c.empresa_id=p_empresa_id AND (a IS NULL OR c.sociedad_id=ANY(a))
     AND lower(coalesce(c.estado,'')) NOT IN ('cobrada','pagada','anulada','cancelada')
     AND greatest(coalesce(c.saldo,0)-coalesce(c.monto_retencion,0),0)>0
     AND (p_texto IS NULL OR ct.nombre_comercial ILIKE '%'||t||'%' ESCAPE '\' OR ct.razon_social ILIKE '%'||t||'%' ESCAPE '\')
 ), g AS (
  SELECT mon,count(*) n,sum(sn) total,count(*) FILTER (WHERE mora>0) nv,coalesce(sum(sn) FILTER (WHERE mora>0),0) venc,
   count(*) FILTER (WHERE mora BETWEEN 0 AND 30) n1,coalesce(sum(sn) FILTER (WHERE mora BETWEEN 0 AND 30),0) s1,
   count(*) FILTER (WHERE mora BETWEEN 31 AND 60) n2,coalesce(sum(sn) FILTER (WHERE mora BETWEEN 31 AND 60),0) s2,
   count(*) FILTER (WHERE mora BETWEEN 61 AND 90) n3,coalesce(sum(sn) FILTER (WHERE mora BETWEEN 61 AND 90),0) s3,
   count(*) FILTER (WHERE mora>=91) n4,coalesce(sum(sn) FILTER (WHERE mora>=91),0) s4
    FROM b GROUP BY mon)
 SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('moneda',g.mon,'cantidad',g.n,'cantidad_vencida',g.nv,
   'total_por_cobrar',CASE WHEN m THEN round(g.total,2) END,'vencido',CASE WHEN m THEN round(g.venc,2) END,
   'antiguedad_dias_mora',jsonb_build_object(
     '0-30',jsonb_build_object('cantidad',g.n1,'monto',CASE WHEN m THEN round(g.s1,2) END),
     '31-60',jsonb_build_object('cantidad',g.n2,'monto',CASE WHEN m THEN round(g.s2,2) END),
     '61-90',jsonb_build_object('cantidad',g.n3,'monto',CASE WHEN m THEN round(g.s3,2) END),
     'mas_de_90',jsonb_build_object('cantidad',g.n4,'monto',CASE WHEN m THEN round(g.s4,2) END)),
   'principales_clientes',CASE WHEN m THEN (SELECT jsonb_agg(jsonb_build_object('cliente',z.cli,'saldo',round(z.s,2),'facturas',z.k)) FROM (SELECT b2.cli,sum(b2.sn) s,count(*) k FROM b b2 WHERE b2.mon=g.mon GROUP BY b2.cli ORDER BY sum(b2.sn) DESC LIMIT 5) z) END)) ORDER BY g.mon),'[]'::jsonb)
  INTO v FROM g;
 RETURN jsonb_build_object('fecha_corte',hoy,'por_moneda',v,
  'campos_omitidos_por_permiso',jsonb_build_array(VARIADIC (CASE WHEN NOT m THEN ARRAY['montos','principales_clientes']::text[] ELSE ARRAY[]::text[] END)));
END $$;

CREATE OR REPLACE FUNCTION public.asistente_buscar_cxc(p_empresa_id text,p_sociedad_id uuid DEFAULT NULL,p_texto text DEFAULT NULL,p_estado text DEFAULT NULL,p_solo_vencidas boolean DEFAULT false,p_limite integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE a uuid[]; p jsonb; m boolean; t text; v jsonb; o text[]; hoy date:=(now() AT TIME ZONE 'America/Lima')::date;
BEGIN
 a:=public.asistente_autorizar(p_empresa_id,'cxc',p_sociedad_id,true); p:=public.asistente_permisos_especiales(p_empresa_id); m:=(p->>'ver_finanzas')::boolean;
 o:=CASE WHEN NOT m THEN ARRAY['monto_total','monto_cobrado','saldo']::text[] ELSE ARRAY[]::text[] END;
 t:=replace(replace(replace(coalesce(p_texto,''),'\','\\'),'%','\%'),'_','\_');
 SELECT coalesce(jsonb_agg(q.x ORDER BY q.venc NULLS LAST,q.id),'[]'::jsonb) INTO v FROM (
  SELECT c.id,c.fecha_vencimiento AS venc,jsonb_strip_nulls(jsonb_build_object('id',c.id,'cliente',coalesce(ct.nombre_comercial,ct.razon_social),'factura',f.numero,
    'concepto',left(coalesce(c.concepto,c.glosa),120),'estado',c.estado,'moneda',coalesce(nullif(c.moneda,''),'PEN'),'fecha_emision',c.fecha_emision,'fecha_vencimiento',c.fecha_vencimiento,
    'dias_mora',CASE WHEN lower(coalesce(c.estado,'')) NOT IN ('cobrada','pagada','anulada','cancelada') THEN greatest(hoy-c.fecha_vencimiento,0) END,
    'sociedad_id',c.sociedad_id,
    'monto_total',CASE WHEN m THEN c.monto_total END,'monto_cobrado',CASE WHEN m THEN c.monto_pagado END,
    'saldo',CASE WHEN m THEN greatest(coalesce(c.saldo,0)-coalesce(c.monto_retencion,0),0) END)) AS x
    FROM public.cxc c LEFT JOIN public.cuentas ct ON ct.empresa_id=c.empresa_id AND ct.id=c.cuenta_id
    LEFT JOIN public.facturas f ON f.empresa_id=c.empresa_id AND f.id=c.factura_id
   WHERE c.empresa_id=p_empresa_id AND (a IS NULL OR c.sociedad_id=ANY(a))
     AND ((p_estado IS NOT NULL AND lower(c.estado)=lower(p_estado))
       OR (p_estado IS NULL AND lower(coalesce(c.estado,'')) NOT IN ('cobrada','pagada','anulada','cancelada') AND greatest(coalesce(c.saldo,0)-coalesce(c.monto_retencion,0),0)>0))
     AND (NOT coalesce(p_solo_vencidas,false) OR c.fecha_vencimiento<hoy)
     AND (p_texto IS NULL OR ct.nombre_comercial ILIKE '%'||t||'%' ESCAPE '\' OR ct.razon_social ILIKE '%'||t||'%' ESCAPE '\' OR f.numero ILIKE '%'||t||'%' ESCAPE '\')
   ORDER BY c.fecha_vencimiento NULLS LAST,c.id LIMIT least(greatest(coalesce(p_limite,20),1),100)+1) q;
 RETURN public.asistente_formato_listado(v,p_limite,o);
END $$;

CREATE OR REPLACE FUNCTION public.asistente_resumen_cxp(p_empresa_id text,p_sociedad_id uuid DEFAULT NULL,p_texto text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE a uuid[]; p jsonb; m boolean; t text; v jsonb; hoy date:=(now() AT TIME ZONE 'America/Lima')::date;
BEGIN
 a:=public.asistente_autorizar(p_empresa_id,'cxp',p_sociedad_id,true); p:=public.asistente_permisos_especiales(p_empresa_id); m:=(p->>'ver_finanzas')::boolean;
 t:=replace(replace(replace(coalesce(p_texto,''),'\','\\'),'%','\%'),'_','\_');
 WITH b AS (
  SELECT coalesce(nullif(c.moneda,''),'PEN') AS mon, greatest(coalesce(c.saldo,0),0) AS sn,
         greatest(hoy-c.fecha_vencimiento,0) AS mora, coalesce(pr.nombre_comercial,pr.razon_social,c.nombre_emisor,'(sin proveedor)') AS prov
    FROM public.cxp c LEFT JOIN public.proveedores pr ON pr.empresa_id=c.empresa_id AND pr.id=c.proveedor_id
   WHERE c.empresa_id=p_empresa_id AND (a IS NULL OR c.sociedad_id=ANY(a))
     AND lower(coalesce(c.estado,'')) NOT IN ('pagada','anulada','cancelada')
     AND greatest(coalesce(c.saldo,0),0)>0
     AND (p_texto IS NULL OR pr.nombre_comercial ILIKE '%'||t||'%' ESCAPE '\' OR pr.razon_social ILIKE '%'||t||'%' ESCAPE '\' OR c.nombre_emisor ILIKE '%'||t||'%' ESCAPE '\')
 ), g AS (
  SELECT mon,count(*) n,sum(sn) total,count(*) FILTER (WHERE mora>0) nv,coalesce(sum(sn) FILTER (WHERE mora>0),0) venc,
   count(*) FILTER (WHERE mora BETWEEN 0 AND 30) n1,coalesce(sum(sn) FILTER (WHERE mora BETWEEN 0 AND 30),0) s1,
   count(*) FILTER (WHERE mora BETWEEN 31 AND 60) n2,coalesce(sum(sn) FILTER (WHERE mora BETWEEN 31 AND 60),0) s2,
   count(*) FILTER (WHERE mora BETWEEN 61 AND 90) n3,coalesce(sum(sn) FILTER (WHERE mora BETWEEN 61 AND 90),0) s3,
   count(*) FILTER (WHERE mora>=91) n4,coalesce(sum(sn) FILTER (WHERE mora>=91),0) s4
    FROM b GROUP BY mon)
 SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('moneda',g.mon,'cantidad',g.n,'cantidad_vencida',g.nv,
   'total_por_pagar',CASE WHEN m THEN round(g.total,2) END,'vencido',CASE WHEN m THEN round(g.venc,2) END,
   'antiguedad_dias_mora',jsonb_build_object(
     '0-30',jsonb_build_object('cantidad',g.n1,'monto',CASE WHEN m THEN round(g.s1,2) END),
     '31-60',jsonb_build_object('cantidad',g.n2,'monto',CASE WHEN m THEN round(g.s2,2) END),
     '61-90',jsonb_build_object('cantidad',g.n3,'monto',CASE WHEN m THEN round(g.s3,2) END),
     'mas_de_90',jsonb_build_object('cantidad',g.n4,'monto',CASE WHEN m THEN round(g.s4,2) END)),
   'principales_proveedores',CASE WHEN m THEN (SELECT jsonb_agg(jsonb_build_object('proveedor',z.prov,'saldo',round(z.s,2),'documentos',z.k)) FROM (SELECT b2.prov,sum(b2.sn) s,count(*) k FROM b b2 WHERE b2.mon=g.mon GROUP BY b2.prov ORDER BY sum(b2.sn) DESC LIMIT 5) z) END)) ORDER BY g.mon),'[]'::jsonb)
  INTO v FROM g;
 RETURN jsonb_build_object('fecha_corte',hoy,'por_moneda',v,
  'campos_omitidos_por_permiso',jsonb_build_array(VARIADIC (CASE WHEN NOT m THEN ARRAY['montos','principales_proveedores']::text[] ELSE ARRAY[]::text[] END)));
END $$;

CREATE OR REPLACE FUNCTION public.asistente_buscar_cxp(p_empresa_id text,p_sociedad_id uuid DEFAULT NULL,p_texto text DEFAULT NULL,p_estado text DEFAULT NULL,p_solo_vencidas boolean DEFAULT false,p_limite integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE a uuid[]; p jsonb; m boolean; t text; v jsonb; o text[]; hoy date:=(now() AT TIME ZONE 'America/Lima')::date;
BEGIN
 a:=public.asistente_autorizar(p_empresa_id,'cxp',p_sociedad_id,true); p:=public.asistente_permisos_especiales(p_empresa_id); m:=(p->>'ver_finanzas')::boolean;
 o:=CASE WHEN NOT m THEN ARRAY['monto_total','monto_pagado','saldo']::text[] ELSE ARRAY[]::text[] END;
 t:=replace(replace(replace(coalesce(p_texto,''),'\','\\'),'%','\%'),'_','\_');
 SELECT coalesce(jsonb_agg(q.x ORDER BY q.venc NULLS LAST,q.id),'[]'::jsonb) INTO v FROM (
  SELECT c.id,c.fecha_vencimiento AS venc,jsonb_strip_nulls(jsonb_build_object('id',c.id,'proveedor',coalesce(pr.nombre_comercial,pr.razon_social,c.nombre_emisor),'documento',c.factura_numero,
    'concepto',left(c.concepto,120),'origen',c.origen,'prioridad_pago',c.prioridad_pago,'estado',c.estado,'moneda',coalesce(nullif(c.moneda,''),'PEN'),'fecha_emision',c.fecha_emision,'fecha_vencimiento',c.fecha_vencimiento,
    'dias_mora',CASE WHEN lower(coalesce(c.estado,'')) NOT IN ('pagada','anulada','cancelada') THEN greatest(hoy-c.fecha_vencimiento,0) END,
    'sociedad_id',c.sociedad_id,
    'monto_total',CASE WHEN m THEN c.monto_total END,'monto_pagado',CASE WHEN m THEN c.monto_pagado END,'saldo',CASE WHEN m THEN c.saldo END)) AS x
    FROM public.cxp c LEFT JOIN public.proveedores pr ON pr.empresa_id=c.empresa_id AND pr.id=c.proveedor_id
   WHERE c.empresa_id=p_empresa_id AND (a IS NULL OR c.sociedad_id=ANY(a))
     AND ((p_estado IS NOT NULL AND lower(c.estado)=lower(p_estado))
       OR (p_estado IS NULL AND lower(coalesce(c.estado,'')) NOT IN ('pagada','anulada','cancelada') AND greatest(coalesce(c.saldo,0),0)>0))
     AND (NOT coalesce(p_solo_vencidas,false) OR c.fecha_vencimiento<hoy)
     AND (p_texto IS NULL OR pr.nombre_comercial ILIKE '%'||t||'%' ESCAPE '\' OR pr.razon_social ILIKE '%'||t||'%' ESCAPE '\' OR c.nombre_emisor ILIKE '%'||t||'%' ESCAPE '\' OR c.factura_numero ILIKE '%'||t||'%' ESCAPE '\' OR c.concepto ILIKE '%'||t||'%' ESCAPE '\')
   ORDER BY c.fecha_vencimiento NULLS LAST,c.id LIMIT least(greatest(coalesce(p_limite,20),1),100)+1) q;
 RETURN public.asistente_formato_listado(v,p_limite,o);
END $$;

REVOKE ALL ON FUNCTION public.asistente_resumen_cxc(text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.asistente_resumen_cxc(text,uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.asistente_buscar_cxc(text,uuid,text,text,boolean,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.asistente_buscar_cxc(text,uuid,text,text,boolean,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.asistente_resumen_cxp(text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.asistente_resumen_cxp(text,uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.asistente_buscar_cxp(text,uuid,text,text,boolean,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.asistente_buscar_cxp(text,uuid,text,text,boolean,integer) TO authenticated;
