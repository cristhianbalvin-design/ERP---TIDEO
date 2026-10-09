-- 612_asistente_erp_caja_tesoreria_cuadre.sql
-- Cuadre con la pantalla (correccion de 611): CREATE OR REPLACE, misma firma, sin DROP.
--  * Caja chica: los fondos/gastos sin sociedad (sociedad_id NULL) tambien cuentan cuando el chat envia sociedad (igual que la RLS y la pantalla).
--  * Tesoreria: si el movimiento esta en otra moneda y no tiene monto_en_moneda_cuenta, se convierte con el tipo de cambio historico
--    (fecha exacta o la ultima anterior), igual que la pantalla; antes se contaba como 0.
--  * Movimientos sin cuenta asignada: neto por moneda del mes y total historico (la pantalla los muestra aparte); entran tambien con alcance.

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
    FROM public.caja_chica_fondos f LEFT JOIN public.usuarios u ON u.id=f.responsable_id
   WHERE f.empresa_id=p_empresa_id AND (a IS NULL OR f.sociedad_id IS NULL OR f.sociedad_id=ANY(a)) AND lower(coalesce(f.estado,''))='activo'
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
    FROM public.caja_chica c LEFT JOIN public.caja_chica_fondos f ON f.id=c.fondo_id
   WHERE c.empresa_id=p_empresa_id AND (a IS NULL OR c.sociedad_id IS NULL OR c.sociedad_id=ANY(a))
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

CREATE OR REPLACE FUNCTION public.asistente_resumen_tesoreria(p_empresa_id text,p_sociedad_id uuid DEFAULT NULL,p_texto text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE a uuid[]; p jsonb; m boolean; t text; v jsonb; g jsonb; mes jsonb; sc jsonb; mes_ini date:=date_trunc('month',(now() AT TIME ZONE 'America/Lima'))::date;
BEGIN
 a:=public.asistente_autorizar(p_empresa_id,'tesoreria',p_sociedad_id,true); p:=public.asistente_permisos_especiales(p_empresa_id); m:=(p->>'ver_finanzas')::boolean;
 t:=replace(replace(replace(coalesce(p_texto,''),'\','\\'),'%','\%'),'_','\_');
 WITH ct AS (
  SELECT c.id, c.nombre, c.banco, upper(coalesce(nullif(c.moneda,''),'PEN')) AS mon, c.sociedad_id, coalesce(c.es_cuenta_detracciones,false) AS det,
   round(coalesce(c.saldo_inicial,0) + coalesce((
     SELECT sum(CASE WHEN lower(mv.tipo) IN ('ingreso','credito','crédito') THEN 1 WHEN lower(mv.tipo) IN ('egreso','debito','débito') THEN -1 ELSE 0 END
                * CASE WHEN upper(coalesce(nullif(mv.moneda,''),'PEN'))=upper(coalesce(nullif(c.moneda,''),'PEN')) THEN coalesce(mv.monto,0)
                       WHEN mv.monto_en_moneda_cuenta IS NOT NULL THEN mv.monto_en_moneda_cuenta
                       ELSE round(CASE WHEN upper(coalesce(nullif(mv.moneda,''),'PEN'))='PEN' AND upper(coalesce(nullif(c.moneda,''),'PEN'))='USD' AND tc.usd>0 THEN coalesce(mv.monto,0)*tc.usd
                                       WHEN upper(coalesce(nullif(mv.moneda,''),'PEN'))='USD' AND upper(coalesce(nullif(c.moneda,''),'PEN'))='PEN' AND tc.usd>0 THEN coalesce(mv.monto,0)/tc.usd
                                       WHEN upper(coalesce(nullif(mv.moneda,''),'PEN'))='PEN' AND upper(coalesce(nullif(c.moneda,''),'PEN'))='EUR' AND tc.eur>0 THEN coalesce(mv.monto,0)*tc.eur
                                       WHEN upper(coalesce(nullif(mv.moneda,''),'PEN'))='EUR' AND upper(coalesce(nullif(c.moneda,''),'PEN'))='PEN' AND tc.eur>0 THEN coalesce(mv.monto,0)/tc.eur
                                       ELSE coalesce(mv.monto,0) END,2) END)
       FROM public.movimientos_tesoreria mv
       LEFT JOIN LATERAL (SELECT h.usd,h.eur FROM public.tipo_cambio_historico h WHERE h.moneda_base='PEN' AND h.fecha<=mv.fecha ORDER BY h.fecha DESC LIMIT 1) tc ON true
      WHERE mv.cuenta_bancaria_id=c.id AND mv.empresa_id=c.empresa_id AND mv.estado IS DISTINCT FROM 'anulado'),0),2) AS saldo,
   (SELECT count(*) FROM public.movimientos_tesoreria mv WHERE mv.cuenta_bancaria_id=c.id AND mv.empresa_id=c.empresa_id AND mv.estado IS DISTINCT FROM 'anulado'
      AND upper(coalesce(nullif(mv.moneda,''),'PEN'))<>upper(coalesce(nullif(c.moneda,''),'PEN')) AND mv.monto_en_moneda_cuenta IS NULL) AS sin_equiv
    FROM public.cuentas_bancarias c
   WHERE c.empresa_id=p_empresa_id AND (a IS NULL OR c.sociedad_id=ANY(a)) AND lower(coalesce(c.estado,''))='activo'
     AND (p_texto IS NULL OR c.nombre ILIKE '%'||t||'%' ESCAPE '\' OR c.banco ILIKE '%'||t||'%' ESCAPE '\')
 )
 SELECT (SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',z.id,'nombre',z.nombre,'banco',z.banco,'moneda',z.mon,'sociedad_id',z.sociedad_id,
          'es_cuenta_detracciones',CASE WHEN z.det THEN true END,'saldo',CASE WHEN m THEN z.saldo END,
          'movimientos_convertidos_con_tc_historico',CASE WHEN m AND z.sin_equiv>0 THEN z.sin_equiv END)) ORDER BY z.mon,z.nombre),'[]'::jsonb) FROM (SELECT * FROM ct ORDER BY mon,nombre LIMIT 50) z),
        (SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('moneda',q.mon,'cuentas_activas',q.n,
          'saldo_total',CASE WHEN m THEN round(q.s,2) END,'saldo_en_cuentas_de_detracciones',CASE WHEN m THEN round(q.sd,2) END)) ORDER BY q.mon),'[]'::jsonb)
           FROM (SELECT mon,count(*) n,sum(saldo) s,coalesce(sum(saldo) FILTER (WHERE det),0) sd FROM ct GROUP BY mon) q),
        (SELECT coalesce(jsonb_agg(jsonb_build_object('moneda',w.mon,'ingresos',round(w.i,2),'egresos',round(w.e,2)) ORDER BY w.mon),'[]'::jsonb)
           FROM (SELECT upper(coalesce(nullif(mv.moneda,''),'PEN')) mon,
                   coalesce(sum(mv.monto) FILTER (WHERE lower(mv.tipo) IN ('ingreso','credito','crédito')),0) i,
                   coalesce(sum(mv.monto) FILTER (WHERE lower(mv.tipo) IN ('egreso','debito','débito')),0) e
                   FROM public.movimientos_tesoreria mv LEFT JOIN public.cuentas_bancarias cb ON cb.id=mv.cuenta_bancaria_id
                  WHERE mv.empresa_id=p_empresa_id AND mv.estado IS DISTINCT FROM 'anulado' AND mv.fecha>=mes_ini AND (a IS NULL OR mv.cuenta_bancaria_id IS NULL OR cb.sociedad_id=ANY(a))
                  GROUP BY 1) w),
        (SELECT coalesce(jsonb_agg(jsonb_build_object('moneda',w.mon,'neto_mes',round(w.nm,2),'neto_historico',round(w.nh,2),'movimientos',w.n) ORDER BY w.mon),'[]'::jsonb)
           FROM (SELECT upper(coalesce(nullif(mv.moneda,''),'PEN')) mon, count(*) n,
                   sum(CASE WHEN lower(mv.tipo) IN ('ingreso','credito','crédito') THEN mv.monto WHEN lower(mv.tipo) IN ('egreso','debito','débito') THEN -mv.monto ELSE 0 END) nh,
                   coalesce(sum(CASE WHEN lower(mv.tipo) IN ('ingreso','credito','crédito') THEN mv.monto WHEN lower(mv.tipo) IN ('egreso','debito','débito') THEN -mv.monto ELSE 0 END) FILTER (WHERE mv.fecha>=mes_ini),0) nm
                   FROM public.movimientos_tesoreria mv
                  WHERE mv.empresa_id=p_empresa_id AND mv.cuenta_bancaria_id IS NULL AND mv.estado IS DISTINCT FROM 'anulado' GROUP BY 1) w)
  INTO v,g,mes,sc;
 RETURN jsonb_build_object('cuentas',v,'por_moneda',g,'movimientos_del_mes',CASE WHEN m THEN mes END,'mes_desde',mes_ini,
  'movimientos_sin_cuenta_asignada',CASE WHEN m THEN sc END,
  'campos_omitidos_por_permiso',jsonb_build_array(VARIADIC (CASE WHEN NOT m THEN ARRAY['montos']::text[] ELSE ARRAY[]::text[] END)));
END $$;

CREATE OR REPLACE FUNCTION public.asistente_buscar_movimientos_tesoreria(p_empresa_id text,p_sociedad_id uuid DEFAULT NULL,p_texto text DEFAULT NULL,p_tipo text DEFAULT NULL,p_desde date DEFAULT NULL,p_hasta date DEFAULT NULL,p_limite integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE a uuid[]; p jsonb; m boolean; t text; v jsonb; tot jsonb; o text[]; lim int:=least(greatest(coalesce(p_limite,20),1),100);
BEGIN
 a:=public.asistente_autorizar(p_empresa_id,'tesoreria',p_sociedad_id,true); p:=public.asistente_permisos_especiales(p_empresa_id); m:=(p->>'ver_finanzas')::boolean;
 o:=CASE WHEN NOT m THEN ARRAY['monto']::text[] ELSE ARRAY[]::text[] END;
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
 )
 SELECT (SELECT coalesce(jsonb_agg(z.x ORDER BY z.fecha DESC NULLS LAST,z.id DESC),'[]'::jsonb) FROM (SELECT x,fecha,id FROM b ORDER BY fecha DESC NULLS LAST,id DESC LIMIT lim+1) z),
        (SELECT coalesce(jsonb_agg(jsonb_build_object('moneda',q.mon,'tipo',q.tp,'cantidad',q.n,'total',round(q.s,2)) ORDER BY q.mon,q.tp),'[]'::jsonb) FROM (SELECT mon,tp,count(*) n,sum(monto) s FROM b GROUP BY mon,tp) q)
  INTO v,tot;
 RETURN public.asistente_formato_listado(v,lim,o) || CASE WHEN m THEN jsonb_build_object('total_filtrado_por_moneda_y_tipo',tot) ELSE '{}'::jsonb END;
END $$;

REVOKE ALL ON FUNCTION public.asistente_resumen_caja_chica(text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.asistente_resumen_caja_chica(text,uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.asistente_buscar_caja_chica(text,uuid,text,text,date,date,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.asistente_buscar_caja_chica(text,uuid,text,text,date,date,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.asistente_resumen_tesoreria(text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.asistente_resumen_tesoreria(text,uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.asistente_buscar_movimientos_tesoreria(text,uuid,text,text,date,date,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.asistente_buscar_movimientos_tesoreria(text,uuid,text,text,date,date,integer) TO authenticated;
