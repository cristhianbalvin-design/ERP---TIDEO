-- 609_asistente_erp_cxc_cxp_ajustes.sql
-- Ajustes a las busquedas de CxC y CxP del asistente (migracion 606), sin cambiar firmas ni grants:
--  1) estado "vencida/vencido(s)" (no es un estado real) se interpreta como solo_vencidas.
--  2) En CxP, texto tambien coincide con prioridad_pago exacta (alta, media, baja).

CREATE OR REPLACE FUNCTION public.asistente_buscar_cxc(p_empresa_id text,p_sociedad_id uuid DEFAULT NULL,p_texto text DEFAULT NULL,p_estado text DEFAULT NULL,p_solo_vencidas boolean DEFAULT false,p_limite integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE a uuid[]; p jsonb; m boolean; t text; v jsonb; o text[]; hoy date:=(now() AT TIME ZONE 'America/Lima')::date;
 sv boolean:=coalesce(p_solo_vencidas,false) OR lower(coalesce(p_estado,'')) IN ('vencida','vencido','vencidas','vencidos');
 es text:=CASE WHEN lower(coalesce(p_estado,'')) IN ('vencida','vencido','vencidas','vencidos') THEN NULL ELSE p_estado END;
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
     AND ((es IS NOT NULL AND lower(c.estado)=lower(es))
       OR (es IS NULL AND lower(coalesce(c.estado,'')) NOT IN ('cobrada','pagada','anulada','cancelada') AND greatest(coalesce(c.saldo,0)-coalesce(c.monto_retencion,0),0)>0))
     AND (NOT sv OR c.fecha_vencimiento<hoy)
     AND (p_texto IS NULL OR ct.nombre_comercial ILIKE '%'||t||'%' ESCAPE '\' OR ct.razon_social ILIKE '%'||t||'%' ESCAPE '\' OR f.numero ILIKE '%'||t||'%' ESCAPE '\')
   ORDER BY c.fecha_vencimiento NULLS LAST,c.id LIMIT least(greatest(coalesce(p_limite,20),1),100)+1) q;
 RETURN public.asistente_formato_listado(v,p_limite,o);
END $$;

CREATE OR REPLACE FUNCTION public.asistente_buscar_cxp(p_empresa_id text,p_sociedad_id uuid DEFAULT NULL,p_texto text DEFAULT NULL,p_estado text DEFAULT NULL,p_solo_vencidas boolean DEFAULT false,p_limite integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE a uuid[]; p jsonb; m boolean; t text; v jsonb; o text[]; hoy date:=(now() AT TIME ZONE 'America/Lima')::date;
 sv boolean:=coalesce(p_solo_vencidas,false) OR lower(coalesce(p_estado,'')) IN ('vencida','vencido','vencidas','vencidos');
 es text:=CASE WHEN lower(coalesce(p_estado,'')) IN ('vencida','vencido','vencidas','vencidos') THEN NULL ELSE p_estado END;
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
     AND ((es IS NOT NULL AND lower(c.estado)=lower(es))
       OR (es IS NULL AND lower(coalesce(c.estado,'')) NOT IN ('pagada','anulada','cancelada') AND greatest(coalesce(c.saldo,0),0)>0))
     AND (NOT sv OR c.fecha_vencimiento<hoy)
     AND (p_texto IS NULL OR lower(c.prioridad_pago)=lower(p_texto) OR pr.nombre_comercial ILIKE '%'||t||'%' ESCAPE '\' OR pr.razon_social ILIKE '%'||t||'%' ESCAPE '\' OR c.nombre_emisor ILIKE '%'||t||'%' ESCAPE '\' OR c.factura_numero ILIKE '%'||t||'%' ESCAPE '\' OR c.concepto ILIKE '%'||t||'%' ESCAPE '\')
   ORDER BY c.fecha_vencimiento NULLS LAST,c.id LIMIT least(greatest(coalesce(p_limite,20),1),100)+1) q;
 RETURN public.asistente_formato_listado(v,p_limite,o);
END $$;
