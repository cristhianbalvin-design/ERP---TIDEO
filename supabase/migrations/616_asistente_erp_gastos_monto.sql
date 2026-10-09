-- 616_asistente_erp_gastos_monto.sql
-- Búsqueda de Compras/Gastos y filtros por importe para las consultas de Aria.
-- Cambios: nueva asistente_buscar_gastos; monto exacto/rango en CxP, CxC,
-- Órdenes de compra, caja chica, tesorería y cotizaciones; acceso financiero protegido.
-- Los seis cuerpos modificados parten de las últimas definiciones vigentes indicadas abajo.
-- Tabla de cambios (RPC | cambio):
-- asistente_buscar_gastos | nueva búsqueda de gastos y compras con permisos de monto.
-- Seis RPC financieras | importe exacto y rango inclusivo; denegación sin ver_finanzas.
-- Definiciones base (archivo: línea): CxP 609:33, CxC 609:6, OC 599:551,
-- caja chica 614:36, tesorería 612:114, cotizaciones 605:201.

BEGIN;

CREATE OR REPLACE FUNCTION public.asistente_monto_coincide(valor numeric,p_monto numeric,p_min numeric,p_max numeric)
RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT CASE
   WHEN p_monto IS NOT NULL THEN valor IS NOT NULL AND round(valor,2)=round(p_monto,2)
   ELSE (p_min IS NULL OR valor>=p_min) AND (p_max IS NULL OR valor<=p_max)
 END;
$$;
REVOKE ALL ON FUNCTION public.asistente_monto_coincide(numeric,numeric,numeric,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.asistente_monto_coincide(numeric,numeric,numeric,numeric) TO authenticated;


-- Definicion base: supabase/migrations/609_asistente_erp_cxc_cxp_ajustes.sql:33.
DROP FUNCTION IF EXISTS public.asistente_buscar_cxp(text,uuid,text,text,boolean,integer);
CREATE FUNCTION public.asistente_buscar_cxp(p_empresa_id text,p_sociedad_id uuid DEFAULT NULL,p_texto text DEFAULT NULL,p_estado text DEFAULT NULL,p_solo_vencidas boolean DEFAULT false,p_limite integer DEFAULT 20, p_monto numeric DEFAULT NULL, p_monto_min numeric DEFAULT NULL, p_monto_max numeric DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE a uuid[]; p jsonb; m boolean; t text; v jsonb; o text[]; hoy date:=(now() AT TIME ZONE 'America/Lima')::date;
 sv boolean:=coalesce(p_solo_vencidas,false) OR lower(coalesce(p_estado,'')) IN ('vencida','vencido','vencidas','vencidos');
 es text:=CASE WHEN lower(coalesce(p_estado,'')) IN ('vencida','vencido','vencidas','vencidos') THEN NULL ELSE p_estado END;
BEGIN
 IF p_monto_min IS NOT NULL AND p_monto_max IS NOT NULL AND p_monto_min>p_monto_max THEN RAISE EXCEPTION 'Rango de monto inválido'; END IF;
 a:=public.asistente_autorizar(p_empresa_id,'cxp',p_sociedad_id,true); p:=public.asistente_permisos_especiales(p_empresa_id); m:=coalesce((p->>'ver_finanzas')::boolean,false);
 o:=CASE WHEN NOT m THEN ARRAY['monto_total','monto_pagado','saldo']::text[] ELSE ARRAY[]::text[] END;
 IF (p_monto IS NOT NULL OR p_monto_min IS NOT NULL OR p_monto_max IS NOT NULL) AND NOT m THEN
  RETURN public.asistente_formato_listado('[]'::jsonb,p_limite,ARRAY['monto_total','monto_pagado','saldo']::text[]) || jsonb_build_object('aviso','El filtro por monto no está disponible con tus permisos');
 END IF;
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
     AND (p_monto IS NULL AND p_monto_min IS NULL AND p_monto_max IS NULL OR (public.asistente_monto_coincide(c.monto_total,p_monto,p_monto_min,p_monto_max) OR public.asistente_monto_coincide(c.saldo,p_monto,p_monto_min,p_monto_max)))
   ORDER BY c.fecha_vencimiento NULLS LAST,c.id LIMIT least(greatest(coalesce(p_limite,20),1),100)+1) q;
 RETURN public.asistente_formato_listado(v,p_limite,o);
END $$;
REVOKE ALL ON FUNCTION public.asistente_buscar_cxp(text,uuid,text,text,boolean,integer,numeric,numeric,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.asistente_buscar_cxp(text,uuid,text,text,boolean,integer,numeric,numeric,numeric) TO authenticated;

-- Definicion base: supabase/migrations/609_asistente_erp_cxc_cxp_ajustes.sql:6.
DROP FUNCTION IF EXISTS public.asistente_buscar_cxc(text,uuid,text,text,boolean,integer);
CREATE FUNCTION public.asistente_buscar_cxc(p_empresa_id text,p_sociedad_id uuid DEFAULT NULL,p_texto text DEFAULT NULL,p_estado text DEFAULT NULL,p_solo_vencidas boolean DEFAULT false,p_limite integer DEFAULT 20, p_monto numeric DEFAULT NULL, p_monto_min numeric DEFAULT NULL, p_monto_max numeric DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE a uuid[]; p jsonb; m boolean; t text; v jsonb; o text[]; hoy date:=(now() AT TIME ZONE 'America/Lima')::date;
 sv boolean:=coalesce(p_solo_vencidas,false) OR lower(coalesce(p_estado,'')) IN ('vencida','vencido','vencidas','vencidos');
 es text:=CASE WHEN lower(coalesce(p_estado,'')) IN ('vencida','vencido','vencidas','vencidos') THEN NULL ELSE p_estado END;
BEGIN
 IF p_monto_min IS NOT NULL AND p_monto_max IS NOT NULL AND p_monto_min>p_monto_max THEN RAISE EXCEPTION 'Rango de monto inválido'; END IF;
 a:=public.asistente_autorizar(p_empresa_id,'cxc',p_sociedad_id,true); p:=public.asistente_permisos_especiales(p_empresa_id); m:=coalesce((p->>'ver_finanzas')::boolean,false);
 o:=CASE WHEN NOT m THEN ARRAY['monto_total','monto_cobrado','saldo']::text[] ELSE ARRAY[]::text[] END;
 IF (p_monto IS NOT NULL OR p_monto_min IS NOT NULL OR p_monto_max IS NOT NULL) AND NOT m THEN
  RETURN public.asistente_formato_listado('[]'::jsonb,p_limite,ARRAY['monto_total','monto_cobrado','saldo']::text[]) || jsonb_build_object('aviso','El filtro por monto no está disponible con tus permisos');
 END IF;
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
     AND (p_monto IS NULL AND p_monto_min IS NULL AND p_monto_max IS NULL OR (public.asistente_monto_coincide(c.monto_total,p_monto,p_monto_min,p_monto_max) OR public.asistente_monto_coincide(greatest(coalesce(c.saldo,0)-coalesce(c.monto_retencion,0),0),p_monto,p_monto_min,p_monto_max)))
   ORDER BY c.fecha_vencimiento NULLS LAST,c.id LIMIT least(greatest(coalesce(p_limite,20),1),100)+1) q;
 RETURN public.asistente_formato_listado(v,p_limite,o);
END $$;
REVOKE ALL ON FUNCTION public.asistente_buscar_cxc(text,uuid,text,text,boolean,integer,numeric,numeric,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.asistente_buscar_cxc(text,uuid,text,text,boolean,integer,numeric,numeric,numeric) TO authenticated;

-- Definicion base: supabase/migrations/599_asistente_erp_lectura.sql:551.
DROP FUNCTION IF EXISTS public.asistente_buscar_ordenes_compra(text,uuid,text,text,text,date,date,integer);
CREATE FUNCTION public.asistente_buscar_ordenes_compra(
 p_empresa_id text,p_sociedad_id uuid DEFAULT NULL,p_texto text DEFAULT NULL,p_estado text DEFAULT NULL,p_proveedor_id text DEFAULT NULL,
 p_desde date DEFAULT NULL,p_hasta date DEFAULT NULL,p_limite integer DEFAULT 20, p_monto numeric DEFAULT NULL, p_monto_min numeric DEFAULT NULL, p_monto_max numeric DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE v jsonb; p jsonb; a uuid[]; d date; h date; t text; o text[];
BEGIN
a:=public.asistente_autorizar(p_empresa_id,'ordenes_compra',p_sociedad_id,true); p:=public.asistente_permisos_especiales(p_empresa_id);
 IF p_monto_min IS NOT NULL AND p_monto_max IS NOT NULL AND p_monto_min>p_monto_max THEN RAISE EXCEPTION 'Rango de monto inválido'; END IF;
 IF (p_monto IS NOT NULL OR p_monto_min IS NOT NULL OR p_monto_max IS NOT NULL) AND NOT coalesce((p->>'ver_costos')::boolean,false) THEN
  RETURN public.asistente_formato_listado('[]'::jsonb,p_limite,ARRAY['subtotal','igv','total']::text[]) || jsonb_build_object('aviso','El filtro por monto no está disponible con tus permisos');
 END IF;
 o:=array_remove(ARRAY[CASE WHEN NOT (p->>'ver_costos')::boolean THEN 'subtotal' END,CASE WHEN NOT (p->>'ver_costos')::boolean THEN 'igv' END,
  CASE WHEN NOT (p->>'ver_costos')::boolean THEN 'total' END,CASE WHEN NOT (p->>'ver_finanzas')::boolean THEN 'condicion_pago' END],NULL);
 d:=p_desde; h:=p_hasta;
 IF d IS NULL AND h IS NOT NULL THEN d:=(h-interval '12 months')::date; ELSIF h IS NULL AND d IS NOT NULL THEN h:=(d+interval '12 months')::date; END IF;
 IF d IS NOT NULL AND (h<d OR h>(d+interval '12 months')::date) THEN RAISE EXCEPTION 'Rango inválido: máximo 12 meses'; END IF;
 t:=replace(replace(replace(coalesce(p_texto,''),'\','\\'),'%','\%'),'_','\_');
 SELECT coalesce(jsonb_agg(x),'[]'::jsonb) INTO v FROM (SELECT jsonb_strip_nulls(jsonb_build_object('id',oc.id,'codigo',oc.codigo,'proceso_compra_id',oc.proceso_compra_id,
  'sociedad_id',oc.sociedad_id,'proveedor_id',oc.proveedor_id,'proveedor_razon_social',pr.razon_social,'descripcion',left(oc.descripcion,500),'subtotal',CASE WHEN (p->>'ver_costos')::boolean THEN oc.subtotal END,
  'igv',CASE WHEN (p->>'ver_costos')::boolean THEN oc.igv END,'total',CASE WHEN (p->>'ver_costos')::boolean THEN oc.total END,'moneda',oc.moneda,
  'condicion_pago',CASE WHEN (p->>'ver_finanzas')::boolean THEN oc.condicion_pago END,'fecha_emision',oc.fecha_emision,
  'fecha_entrega_esperada',oc.fecha_entrega_esperada,'fecha_confirmada',oc.fecha_confirmada,'fecha_en_transito',oc.fecha_en_transito,
  'fecha_recepcion_real',oc.fecha_recepcion_real,'lead_time_dias',oc.lead_time_dias,'estado',oc.estado,'porcentaje_recibido',oc.porcentaje_recibido,
  'centro_costo_id',oc.centro_costo_id,'ot_id',oc.ot_id,'solpe_id',oc.solpe_id,'solpe_codigo',oc.solpe_codigo,'origen_tipo',oc.origen_tipo,
  'created_at',oc.created_at,'updated_at',oc.updated_at,'cantidad_lineas',CASE WHEN jsonb_typeof(oc.items)='array' THEN jsonb_array_length(oc.items) ELSE 0 END)) x
  FROM public.ordenes_compra oc LEFT JOIN public.proveedores pr ON pr.id=oc.proveedor_id AND pr.empresa_id=oc.empresa_id
  WHERE oc.empresa_id=p_empresa_id AND (a IS NULL OR oc.sociedad_id=ANY(a)) AND (p_estado IS NULL OR oc.estado=p_estado)
   AND (p_proveedor_id IS NULL OR oc.proveedor_id=p_proveedor_id) AND (d IS NULL OR oc.fecha_emision::date BETWEEN d AND h)
   AND (p_texto IS NULL OR oc.codigo ILIKE '%'||t||'%' ESCAPE '\' OR oc.descripcion ILIKE '%'||t||'%' ESCAPE '\' OR oc.solpe_codigo ILIKE '%'||t||'%' ESCAPE '\')
   AND (p_monto IS NULL AND p_monto_min IS NULL AND p_monto_max IS NULL OR public.asistente_monto_coincide(oc.total,p_monto,p_monto_min,p_monto_max))
  ORDER BY oc.fecha_emision DESC NULLS LAST,oc.id LIMIT least(greatest(coalesce(p_limite,20),1),100)+1) q;
 RETURN public.asistente_formato_listado(v,p_limite,o);
END $$;
REVOKE ALL ON FUNCTION public.asistente_buscar_ordenes_compra(text,uuid,text,text,text,date,date,integer,numeric,numeric,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.asistente_buscar_ordenes_compra(text,uuid,text,text,text,date,date,integer,numeric,numeric,numeric) TO authenticated;

-- Definicion base: supabase/migrations/614_asistente_erp_caja_chica_sociedad_efectiva.sql:36.
DROP FUNCTION IF EXISTS public.asistente_buscar_caja_chica(text,uuid,text,text,date,date,integer);
CREATE FUNCTION public.asistente_buscar_caja_chica(p_empresa_id text,p_sociedad_id uuid DEFAULT NULL,p_texto text DEFAULT NULL,p_estado text DEFAULT NULL,p_desde date DEFAULT NULL,p_hasta date DEFAULT NULL,p_limite integer DEFAULT 20, p_monto numeric DEFAULT NULL, p_monto_min numeric DEFAULT NULL, p_monto_max numeric DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE a uuid[]; p jsonb; m boolean; t text; v jsonb; tot jsonb; o text[]; lim int:=least(greatest(coalesce(p_limite,20),1),100);
BEGIN
 IF p_monto_min IS NOT NULL AND p_monto_max IS NOT NULL AND p_monto_min>p_monto_max THEN RAISE EXCEPTION 'Rango de monto inválido'; END IF;
 a:=public.asistente_autorizar(p_empresa_id,'caja',p_sociedad_id,true); p:=public.asistente_permisos_especiales(p_empresa_id); m:=coalesce((p->>'ver_finanzas')::boolean,false);
 o:=CASE WHEN NOT m THEN ARRAY['monto']::text[] ELSE ARRAY[]::text[] END;
 IF (p_monto IS NOT NULL OR p_monto_min IS NOT NULL OR p_monto_max IS NOT NULL) AND NOT m THEN
  RETURN public.asistente_formato_listado('[]'::jsonb,p_limite,ARRAY['monto']::text[]) || jsonb_build_object('aviso','El filtro por monto no está disponible con tus permisos');
 END IF;
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
     AND (p_monto IS NULL AND p_monto_min IS NULL AND p_monto_max IS NULL OR public.asistente_monto_coincide(c.monto,p_monto,p_monto_min,p_monto_max))
 )
 SELECT (SELECT coalesce(jsonb_agg(z.x ORDER BY z.fecha DESC NULLS LAST,z.id DESC),'[]'::jsonb) FROM (SELECT x,fecha,id FROM b ORDER BY fecha DESC NULLS LAST,id DESC LIMIT lim+1) z),
        (SELECT coalesce(jsonb_agg(jsonb_build_object('moneda',q.mon,'cantidad',q.n,'total',round(q.s,2)) ORDER BY q.mon),'[]'::jsonb) FROM (SELECT mon,count(*) n,sum(monto) s FROM b GROUP BY mon) q)
  INTO v,tot;
 RETURN public.asistente_formato_listado(v,lim,o) || CASE WHEN m THEN jsonb_build_object('total_filtrado_por_moneda',tot) ELSE '{}'::jsonb END;
END $$;
REVOKE ALL ON FUNCTION public.asistente_buscar_caja_chica(text,uuid,text,text,date,date,integer,numeric,numeric,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.asistente_buscar_caja_chica(text,uuid,text,text,date,date,integer,numeric,numeric,numeric) TO authenticated;

-- Definicion base: supabase/migrations/612_asistente_erp_caja_tesoreria_cuadre.sql:114.
DROP FUNCTION IF EXISTS public.asistente_buscar_movimientos_tesoreria(text,uuid,text,text,date,date,integer);
CREATE FUNCTION public.asistente_buscar_movimientos_tesoreria(p_empresa_id text,p_sociedad_id uuid DEFAULT NULL,p_texto text DEFAULT NULL,p_tipo text DEFAULT NULL,p_desde date DEFAULT NULL,p_hasta date DEFAULT NULL,p_limite integer DEFAULT 20, p_monto numeric DEFAULT NULL, p_monto_min numeric DEFAULT NULL, p_monto_max numeric DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE a uuid[]; p jsonb; m boolean; t text; v jsonb; tot jsonb; o text[]; lim int:=least(greatest(coalesce(p_limite,20),1),100);
BEGIN
 IF p_monto_min IS NOT NULL AND p_monto_max IS NOT NULL AND p_monto_min>p_monto_max THEN RAISE EXCEPTION 'Rango de monto inválido'; END IF;
 a:=public.asistente_autorizar(p_empresa_id,'tesoreria',p_sociedad_id,true); p:=public.asistente_permisos_especiales(p_empresa_id); m:=coalesce((p->>'ver_finanzas')::boolean,false);
 o:=CASE WHEN NOT m THEN ARRAY['monto']::text[] ELSE ARRAY[]::text[] END;
 IF (p_monto IS NOT NULL OR p_monto_min IS NOT NULL OR p_monto_max IS NOT NULL) AND NOT m THEN
  RETURN public.asistente_formato_listado('[]'::jsonb,p_limite,ARRAY['monto']::text[]) || jsonb_build_object('aviso','El filtro por monto no está disponible con tus permisos');
 END IF;
 t:=replace(replace(replace(coalesce(p_texto,''),'\','\\'),'%','\%'),'_','\_');
 WITH b AS (
  SELECT mv.id, mv.fecha, upper(coalesce(nullif(mv.moneda,''),'PEN')) AS mon,
   CASE WHEN lower(mv.tipo) IN ('ingreso','credito','crédito') THEN 'ingreso' WHEN lower(mv.tipo) IN ('egreso','debito','débito') THEN 'egreso' ELSE lower(mv.tipo) END AS tp, mv.monto,
   jsonb_strip_nulls(jsonb_build_object('id',mv.id,'fecha',mv.fecha,'tipo',mv.tipo,'descripcion',left(mv.descripcion,120),'categoria',mv.categoria,'referencia',mv.referencia,
    'cuenta',cb.nombre,'estado',mv.estado,'moneda',upper(coalesce(nullif(mv.moneda,''),'PEN')),'monto',CASE WHEN m THEN mv.monto END)) AS x
    FROM public.movimientos_tesoreria mv LEFT JOIN public.cuentas_bancarias cb ON cb.id=mv.cuenta_bancaria_id
   WHERE mv.empresa_id=p_empresa_id AND (a IS NULL OR mv.cuenta_bancaria_id IS NULL OR cb.sociedad_id=ANY(a)) AND mv.estado IS DISTINCT FROM 'anulado'
     AND (p_tipo IS NULL OR (lower(p_tipo)='ingreso' AND lower(mv.tipo) IN ('ingreso','credito','crédito')) OR (lower(p_tipo)='egreso' AND lower(mv.tipo) IN ('egreso','debito','débito')))
     AND (p_desde IS NULL OR mv.fecha>=p_desde) AND (p_hasta IS NULL OR mv.fecha<=p_hasta)
     AND (p_texto IS NULL OR mv.descripcion ILIKE '%'||t||'%' ESCAPE '\' OR mv.referencia ILIKE '%'||t||'%' ESCAPE '\' OR mv.categoria ILIKE '%'||t||'%' ESCAPE '\' OR cb.nombre ILIKE '%'||t||'%' ESCAPE '\')
     AND (p_monto IS NULL AND p_monto_min IS NULL AND p_monto_max IS NULL OR public.asistente_monto_coincide(mv.monto,p_monto,p_monto_min,p_monto_max))
 )
 SELECT (SELECT coalesce(jsonb_agg(z.x ORDER BY z.fecha DESC NULLS LAST,z.id DESC),'[]'::jsonb) FROM (SELECT x,fecha,id FROM b ORDER BY fecha DESC NULLS LAST,id DESC LIMIT lim+1) z),
        (SELECT coalesce(jsonb_agg(jsonb_build_object('moneda',q.mon,'tipo',q.tp,'cantidad',q.n,'total',round(q.s,2)) ORDER BY q.mon,q.tp),'[]'::jsonb) FROM (SELECT mon,tp,count(*) n,sum(monto) s FROM b GROUP BY mon,tp) q)
  INTO v,tot;
 RETURN public.asistente_formato_listado(v,lim,o) || CASE WHEN m THEN jsonb_build_object('total_filtrado_por_moneda_y_tipo',tot) ELSE '{}'::jsonb END;
END $$;
REVOKE ALL ON FUNCTION public.asistente_buscar_movimientos_tesoreria(text,uuid,text,text,date,date,integer,numeric,numeric,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.asistente_buscar_movimientos_tesoreria(text,uuid,text,text,date,date,integer,numeric,numeric,numeric) TO authenticated;

-- Definicion base: supabase/migrations/605_asistente_erp_cotizaciones_especiales.sql:201.
DROP FUNCTION IF EXISTS public.asistente_buscar_cotizaciones(text,uuid,text,integer,date,date,text);
CREATE FUNCTION public.asistente_buscar_cotizaciones(p_empresa_id text,p_sociedad_id uuid DEFAULT NULL,p_busqueda text DEFAULT NULL,p_limite integer DEFAULT 20,p_desde date DEFAULT NULL,p_hasta date DEFAULT NULL,p_estado text DEFAULT NULL, p_monto numeric DEFAULT NULL, p_monto_min numeric DEFAULT NULL, p_monto_max numeric DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE v jsonb; p jsonb; a uuid[]; d date; h date; o text[];
BEGIN
a:=public.asistente_autorizar(p_empresa_id,'cotizaciones',p_sociedad_id,true); p:=public.asistente_permisos_especiales(p_empresa_id); d:=p_desde; h:=p_hasta;
 IF p_monto_min IS NOT NULL AND p_monto_max IS NOT NULL AND p_monto_min>p_monto_max THEN RAISE EXCEPTION 'Rango de monto inválido'; END IF;
 IF (p_monto IS NOT NULL OR p_monto_min IS NOT NULL OR p_monto_max IS NOT NULL) AND NOT coalesce((p->>'ver_precios')::boolean,false) THEN
  RETURN public.asistente_formato_listado('[]'::jsonb,p_limite,ARRAY['subtotal','igv','total']::text[]) || jsonb_build_object('aviso','El filtro por monto no está disponible con tus permisos');
 END IF;
 o:=CASE WHEN NOT (p->>'ver_precios')::boolean THEN ARRAY['subtotal','descuento_global_pct','descuento_global','igv','total','items.precios','hitos_pago']::text[] ELSE ARRAY[]::text[] END;
 IF d IS NULL AND h IS NOT NULL THEN d:=(h-interval '12 months')::date; ELSIF h IS NULL AND d IS NOT NULL THEN h:=(d+interval '12 months')::date; END IF;
 IF d IS NOT NULL AND (h<d OR h>(d+interval '12 months')::date) THEN RAISE EXCEPTION 'Rango inválido: máximo 12 meses'; END IF;
 SELECT coalesce(jsonb_agg(q.x ORDER BY q.f DESC,q.n),'[]'::jsonb) INTO v FROM (SELECT * FROM (
 SELECT c.fecha::date AS f,c.numero AS n,jsonb_strip_nulls(jsonb_build_object('id',c.id,'origen','estandar','oportunidad_id',c.oportunidad_id,'cuenta_id',c.cuenta_id,'numero',c.numero,'version',c.version,'estado',c.estado,'fecha',c.fecha,'moneda',c.moneda,'sociedad_id',c.sociedad_id,
  'cliente',(SELECT coalesce(ct.nombre_comercial,ct.razon_social) FROM public.cuentas ct WHERE ct.empresa_id=p_empresa_id AND ct.id=c.cuenta_id),
  'oportunidad',(SELECT op.nombre FROM public.oportunidades op WHERE op.empresa_id=p_empresa_id AND op.id=c.oportunidad_id),
  'descripcion',left(c.descripcion_general,300),'linea_negocio',c.linea_negocio,'numero_caso',c.numero_caso,
  'glosa',left(c.glosa_factura,200),
  'servicios_principales',(SELECT string_agg(z.d,'; ' ORDER BY z.ord) FROM (SELECT left(coalesce(e.value->>'descripcion',e.value->>'nombre'),120) AS d,e.ord FROM jsonb_array_elements(CASE WHEN jsonb_typeof(c.items)='array' THEN c.items ELSE '[]'::jsonb END) WITH ORDINALITY AS e(value,ord) WHERE coalesce(e.value->>'descripcion',e.value->>'nombre','')<>'' ORDER BY e.ord LIMIT 3) z),
  'subtotal',CASE WHEN (p->>'ver_precios')::boolean THEN c.subtotal END,'descuento_global_pct',CASE WHEN (p->>'ver_precios')::boolean THEN c.descuento_global_pct END,'descuento_global',CASE WHEN (p->>'ver_precios')::boolean THEN c.descuento_global END,
  'igv',CASE WHEN (p->>'ver_precios')::boolean THEN c.igv END,'total',CASE WHEN (p->>'ver_precios')::boolean THEN c.total END)) AS x
 FROM (SELECT DISTINCT ON (c0.numero) c0.* FROM public.cotizaciones c0 WHERE c0.empresa_id=p_empresa_id AND (a IS NULL OR c0.sociedad_id=ANY(a)) ORDER BY c0.numero,c0.version DESC) c
 WHERE (d IS NULL OR c.fecha::date BETWEEN d AND h) AND (p_estado IS NULL OR lower(c.estado)=lower(p_estado)) AND (p_busqueda IS NULL OR c.numero ILIKE '%'||p_busqueda||'%' OR c.estado ILIKE '%'||p_busqueda||'%') AND (p_monto IS NULL AND p_monto_min IS NULL AND p_monto_max IS NULL OR public.asistente_monto_coincide(c.total,p_monto,p_monto_min,p_monto_max))
 UNION ALL
 SELECT coalesce(s.emitida_at,s.created_at)::date,s.numero,jsonb_strip_nulls(jsonb_build_object('id',s.id,'origen','especial','oportunidad_id',s.oportunidad_id,'cuenta_id',s.cuenta_id,'numero',s.numero,'estado',s.estado,'fecha',coalesce(s.emitida_at,s.created_at)::date,'moneda',s.moneda,'sociedad_id',s.sociedad_id,
  'cliente',(SELECT coalesce(ct.nombre_comercial,ct.razon_social) FROM public.cuentas ct WHERE ct.empresa_id=p_empresa_id AND ct.id=s.cuenta_id),
  'oportunidad',(SELECT op.nombre FROM public.oportunidades op WHERE op.empresa_id=p_empresa_id AND op.id=s.oportunidad_id),
  'linea_negocio',s.linea_negocio,'numero_caso',s.numero_caso,
  'servicios_principales',(SELECT string_agg(z.d,'; ' ORDER BY z.ord) FROM (SELECT left(coalesce(e.value->>'descripcion',e.value->>'nombre'),120) AS d,e.ord FROM jsonb_array_elements(CASE WHEN jsonb_typeof(s.items)='array' THEN s.items ELSE '[]'::jsonb END) WITH ORDINALITY AS e(value,ord) WHERE coalesce(e.value->>'descripcion',e.value->>'nombre','')<>'' ORDER BY e.ord LIMIT 3) z),
  'subtotal',CASE WHEN (p->>'ver_precios')::boolean THEN s.subtotal END,'igv',CASE WHEN (p->>'ver_precios')::boolean THEN s.igv END,'total',CASE WHEN (p->>'ver_precios')::boolean THEN s.total END))
 FROM public.cotizaciones_especiales s WHERE s.empresa_id=p_empresa_id AND (a IS NULL OR s.sociedad_id=ANY(a)) AND (d IS NULL OR coalesce(s.emitida_at,s.created_at)::date BETWEEN d AND h) AND (p_estado IS NULL OR lower(s.estado)=lower(p_estado)) AND (p_busqueda IS NULL OR s.numero ILIKE '%'||p_busqueda||'%' OR s.estado ILIKE '%'||p_busqueda||'%') AND (p_monto IS NULL AND p_monto_min IS NULL AND p_monto_max IS NULL OR public.asistente_monto_coincide(s.total,p_monto,p_monto_min,p_monto_max))
 ) u ORDER BY u.f DESC,u.n LIMIT least(greatest(coalesce(p_limite,20),1),100)+1) q; RETURN public.asistente_formato_listado(v,p_limite,o);
END $$;
REVOKE ALL ON FUNCTION public.asistente_buscar_cotizaciones(text,uuid,text,integer,date,date,text,numeric,numeric,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.asistente_buscar_cotizaciones(text,uuid,text,integer,date,date,text,numeric,numeric,numeric) TO authenticated;

-- Compras/Gastos refleja la colección completa mostrada por la pestaña Todos.
-- Incluye activos fijos, nómina, caja chica y egresos vinculados; como en la pantalla,
-- Campo = origen_registro 'campo' y todo otro origen se presenta como Backoffice.
-- Pendientes revisión es estado='pendiente_revision'; esas filas siguen visibles en Todos.
CREATE OR REPLACE FUNCTION public.asistente_buscar_gastos(
 p_empresa_id text,p_sociedad_id uuid DEFAULT NULL,p_texto text DEFAULT NULL,
 p_monto numeric DEFAULT NULL,p_monto_min numeric DEFAULT NULL,p_monto_max numeric DEFAULT NULL,
 p_moneda text DEFAULT NULL,p_estado_pago text DEFAULT NULL,p_origen text DEFAULT NULL,
 p_ceco text DEFAULT NULL,p_proveedor text DEFAULT NULL,p_desde date DEFAULT NULL,
 p_hasta date DEFAULT NULL,p_limite integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE a uuid[]; p jsonb; m boolean; t text; tc text; tp text; v jsonb; tot jsonb; o text[];
 lim integer:=least(greatest(coalesce(p_limite,20),1),100);
 mon text:=CASE
  WHEN nullif(btrim(p_moneda),'') IS NULL THEN NULL
  WHEN upper(btrim(p_moneda)) IN ('SOLES','SOL','S/','PEN') THEN 'PEN'
  WHEN upper(btrim(p_moneda)) IN ('DOLARES','DÓLARES','USD','US$') THEN 'USD'
  ELSE upper(btrim(p_moneda))
 END;
BEGIN
 a:=public.asistente_autorizar(p_empresa_id,'compras_gastos',p_sociedad_id,true);
 p:=public.asistente_permisos_especiales(p_empresa_id); m:=coalesce((p->>'ver_finanzas')::boolean,false);
 IF p_monto_min IS NOT NULL AND p_monto_max IS NOT NULL AND p_monto_min>p_monto_max THEN RAISE EXCEPTION 'Rango de monto inválido'; END IF;
 o:=CASE WHEN NOT m THEN ARRAY['monto']::text[] ELSE ARRAY[]::text[] END;
 IF (p_monto IS NOT NULL OR p_monto_min IS NOT NULL OR p_monto_max IS NOT NULL) AND NOT m THEN
  RETURN public.asistente_formato_listado('[]'::jsonb,lim,ARRAY['monto']::text[]) || jsonb_build_object('aviso','El filtro por monto no está disponible con tus permisos');
 END IF;
 t:=replace(replace(replace(coalesce(p_texto,''),'\','\\'),'%','\%'),'_','\_');
 tc:=replace(replace(replace(coalesce(p_ceco,''),'\','\\'),'%','\%'),'_','\_');
 tp:=replace(replace(replace(coalesce(p_proveedor,''),'\','\\'),'%','\%'),'_','\_');
 WITH b AS (
  SELECT g.id,g.fecha,upper(coalesce(nullif(g.moneda,''),'PEN')) AS moneda,g.monto,
   CASE WHEN lower(coalesce(g.origen_registro,''))='campo' THEN 'campo' ELSE 'backoffice' END AS origen,
   jsonb_strip_nulls(jsonb_build_object(
    'id',g.id,'fecha',g.fecha,'tipo',g.tipo,'concepto',left(coalesce(g.descripcion,''),120),
    'categoria',g.categoria,'subcategoria',g.subcategoria,'proveedor',g.proveedor_referencia,
    'ruc',g.ruc_proveedor,'comprobante',g.num_comprobante,
    'ceco',nullif(concat_ws(' · ',nullif(cc.codigo,''),nullif(cc.nombre,'')),''),
    'origen',CASE WHEN lower(coalesce(g.origen_registro,''))='campo' THEN 'campo' ELSE 'backoffice' END,
    'estado',g.estado,'estado_pago',g.estado_pago,'moneda',upper(coalesce(nullif(g.moneda,''),'PEN')),
    'sociedad_id',g.sociedad_id,'orden_compra_id',g.orden_compra_id,'cxp_id',g.cxp_id,
    'monto',CASE WHEN m THEN g.monto END)) AS x
   FROM public.compras_gastos g
   LEFT JOIN public.centros_costo cc ON cc.empresa_id=g.empresa_id AND cc.id=g.centro_costo_id
   WHERE g.empresa_id=p_empresa_id AND (a IS NULL OR g.sociedad_id=ANY(a))
    AND (NULLIF(btrim(p_estado_pago),'') IS NULL OR lower(coalesce(g.estado_pago,''))=lower(btrim(p_estado_pago)))
    AND (NULLIF(btrim(p_origen),'') IS NULL OR CASE WHEN lower(coalesce(g.origen_registro,''))='campo' THEN 'campo' ELSE 'backoffice' END=lower(btrim(p_origen)))
    AND (p_desde IS NULL OR g.fecha>=p_desde) AND (p_hasta IS NULL OR g.fecha<=p_hasta)
    AND (mon IS NULL OR upper(coalesce(nullif(g.moneda,''),'PEN'))=mon)
    AND ((NULLIF(btrim(p_texto),'') IS NULL OR g.descripcion ILIKE '%'||t||'%' ESCAPE '\' OR g.categoria ILIKE '%'||t||'%' ESCAPE '\'
      OR g.subcategoria ILIKE '%'||t||'%' ESCAPE '\' OR g.proveedor_referencia ILIKE '%'||t||'%' ESCAPE '\'
      OR g.ruc_proveedor ILIKE '%'||t||'%' ESCAPE '\' OR g.num_comprobante ILIKE '%'||t||'%' ESCAPE '\'
      OR cc.nombre ILIKE '%'||t||'%' ESCAPE '\' OR cc.codigo ILIKE '%'||t||'%' ESCAPE '\' OR g.estado ILIKE '%'||t||'%' ESCAPE '\'))
    AND (NULLIF(btrim(p_ceco),'') IS NULL OR cc.codigo ILIKE '%'||tc||'%' ESCAPE '\' OR cc.nombre ILIKE '%'||tc||'%' ESCAPE '\')
    AND (NULLIF(btrim(p_proveedor),'') IS NULL OR g.proveedor_referencia ILIKE '%'||tp||'%' ESCAPE '\' OR g.ruc_proveedor ILIKE '%'||tp||'%' ESCAPE '\')
    AND (lower(coalesce(g.estado,'')) NOT IN ('anulado','anulada') OR lower(coalesce(p_texto,'')) IN ('anulado','anulada','anulados','anuladas'))
    AND (p_monto IS NULL AND p_monto_min IS NULL AND p_monto_max IS NULL OR public.asistente_monto_coincide(g.monto,p_monto,p_monto_min,p_monto_max))
 )
 SELECT (SELECT coalesce(jsonb_agg(z.x ORDER BY z.fecha DESC NULLS LAST,z.id DESC),'[]'::jsonb)
         FROM (SELECT x,fecha,id FROM b ORDER BY fecha DESC NULLS LAST,id DESC LIMIT lim+1) z),
        (SELECT coalesce(jsonb_agg(jsonb_build_object('moneda',q.moneda,'cantidad',q.n,'total',round(q.total,2)) ORDER BY q.moneda),'[]'::jsonb)
         FROM (SELECT moneda,count(*) n,sum(monto) total FROM b GROUP BY moneda) q)
 INTO v,tot;
 RETURN public.asistente_formato_listado(v,lim,o) || CASE WHEN m THEN jsonb_build_object('total_filtrado_por_moneda',tot) ELSE '{}'::jsonb END;
END $$;
REVOKE ALL ON FUNCTION public.asistente_buscar_gastos(text,uuid,text,numeric,numeric,numeric,text,text,text,text,text,date,date,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.asistente_buscar_gastos(text,uuid,text,numeric,numeric,numeric,text,text,text,text,text,date,date,integer) TO authenticated;

-- Verificación de solo lectura, ejecutar tras cambiar ROLLBACK por COMMIT.
-- SELECT p.oid::regprocedure AS firma FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
-- WHERE n.nspname='public' AND p.proname IN ('asistente_buscar_gastos','asistente_buscar_cxp','asistente_buscar_cxc','asistente_buscar_ordenes_compra','asistente_buscar_caja_chica','asistente_buscar_movimientos_tesoreria','asistente_buscar_cotizaciones','asistente_monto_coincide') ORDER BY p.proname;
-- SELECT proname,count(*) AS sobrecargas FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('asistente_buscar_gastos','asistente_buscar_cxp','asistente_buscar_cxc','asistente_buscar_ordenes_compra','asistente_buscar_caja_chica','asistente_buscar_movimientos_tesoreria','asistente_buscar_cotizaciones') GROUP BY proname HAVING count(*)>1;
-- cambiar ROLLBACK por COMMIT tras revisión.
ROLLBACK;
