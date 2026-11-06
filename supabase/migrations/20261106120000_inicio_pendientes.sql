-- Inicio: bandeja de pendientes del día, sin consumir la cuota de Aria.
-- Míos: solo lo asignado o por aprobar por el usuario. Mi área: área del usuario si
-- se reconoce; si no, todo lo que sus permisos le dejan ver. SOLPE y actividades no
-- guardan sociedad: se ocultan a usuarios con alcance societario limitado.
CREATE OR REPLACE FUNCTION public.inicio_mi_contexto(p_empresa_id text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_personal text[]; v_area text; v_nombre text; v_dominio text; n text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.usuario_tiene_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Sesión o empresa no autorizada' USING errcode='42501';
  END IF;
  SELECT array_agg(x.id), max(x.area) INTO v_personal, v_area FROM (
    SELECT po.id::text id, coalesce(ae.nombre, nullif(btrim(po.area),'')) area
    FROM public.personal_operativo po
    LEFT JOIN public.areas_empresa ae ON ae.id=po.area_id::text AND ae.empresa_id=po.empresa_id
    WHERE po.empresa_id=p_empresa_id AND po.auth_user_id=auth.uid()
    UNION ALL
    SELECT pa.id::text, coalesce(ae.nombre, nullif(btrim(pa.area),''))
    FROM public.personal_administrativo pa
    LEFT JOIN public.areas_empresa ae ON ae.id=pa.area_id::text AND ae.empresa_id=pa.empresa_id
    WHERE pa.empresa_id=p_empresa_id AND pa.auth_user_id=auth.uid()
  ) x;
  SELECT coalesce(v_area, nullif(btrim(u.area),'')), u.nombre INTO v_area, v_nombre
  FROM public.usuarios u WHERE u.id=auth.uid()::text LIMIT 1;
  n:=translate(lower(coalesce(v_area,'')),'áéíóú','aeiou');
  v_dominio:=CASE
    WHEN n ~ '(finanz|contab|tesorer|administraci)' THEN 'finanzas'
    WHEN n ~ '(talento|recursos humanos|rrhh)' THEN 'rrhh'
    WHEN n ~ '(logist|almacen|compras|abastec)' THEN 'compras'
    WHEN n ~ '(comercial|marketing|ventas)' THEN 'comercial'
    WHEN n ~ '(operac|operativ|produccion|mantenimiento|planeamiento|supervision|proyectos|ingenieria|calidad)' THEN 'operaciones'
    ELSE NULL END;
  RETURN jsonb_build_object('personal_ids',to_jsonb(coalesce(v_personal,ARRAY[]::text[])),
    'area',v_area,'dominio',v_dominio,'nombre',v_nombre);
END $function$;

CREATE OR REPLACE FUNCTION public.inicio_agrupar(p_filas jsonb, p_desde date, p_hasta date, p_ver_monto boolean)
RETURNS jsonb
LANGUAGE sql IMMUTABLE
AS $function$
  WITH f AS (
    SELECT x.value v, x.value->>'moneda' moneda, (x.value->>'saldo')::numeric saldo,
      coalesce((x.value->>'orden')::numeric,0) orden, coalesce((x.value->>'mio')::boolean,false) mio
    FROM jsonb_array_elements(coalesce(p_filas,'[]'::jsonb)) x
    WHERE (p_desde IS NULL OR (x.value->>'fecha')::date>=p_desde)
      AND (p_hasta IS NULL OR (x.value->>'fecha')::date<=p_hasta)
  ), m AS (
    SELECT moneda, count(*) c, sum(saldo) t FROM f WHERE moneda IS NOT NULL GROUP BY moneda
  ), l AS (
    SELECT CASE WHEN p_ver_monto THEN v-'mio'-'orden' ELSE v-'mio'-'orden'-'saldo' END r, mio,
      row_number() OVER (ORDER BY orden DESC) rn,
      row_number() OVER (PARTITION BY mio ORDER BY orden DESC) rm
    FROM f
  )
  SELECT jsonb_build_object(
    'cantidad',(SELECT count(*) FROM f),
    'cantidad_mia',(SELECT count(*) FROM f WHERE mio),
    'por_moneda',coalesce((SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('moneda',moneda,'cantidad',c,
      'total',CASE WHEN p_ver_monto THEN round(t,2) END)) ORDER BY moneda) FROM m),'[]'::jsonb),
    'mayor',(SELECT r FROM l WHERE rn=1),
    'mayor_mio',(SELECT r FROM l WHERE mio AND rm=1));
$function$;

CREATE OR REPLACE FUNCTION public.inicio_pendientes(p_empresa_id text, p_sociedad_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid:=auth.uid(); hoy date:=(now() AT TIME ZONE 'America/Lima')::date;
  ctx jsonb; v_dom text; v_personal text[]; v_nombre text;
  v_alcance uuid[]; v_soc uuid[]; v_limitado boolean; v_perm jsonb;
  ver_fin boolean; ver_pre boolean; pcxp boolean; pcxc boolean;
  v_cxp jsonb:='[]'; v_cxc jsonb:='[]'; v_tmp jsonb; v_filas jsonb;
  g_cxp_hoy jsonb; g_cxp_ven jsonb; g_cxp_7 jsonb; g_cxc_ven jsonb;
  g_solpe jsonb; g_ot jsonb; g_rrhh jsonb; g_oc jsonb; g_src jsonb; g_cot jsonb;
  v_stock integer; v_agenda jsonb; v_atrasadas integer:=0; v_atrasada date;
  v_ver_agenda boolean:=false;
  v_errores text[]:=ARRAY[]::text[]; v_items jsonb:='[]'; e record; n_c int; n_m int; v_mias int:=0; v_area int:=0;
BEGIN
  ctx:=public.inicio_mi_contexto(p_empresa_id);
  v_dom:=ctx->>'dominio'; v_nombre:=ctx->>'nombre';
  v_personal:=ARRAY(SELECT jsonb_array_elements_text(ctx->'personal_ids'));
  v_alcance:=public.usuario_alcance_sociedades(p_empresa_id);
  v_limitado:=v_alcance IS NOT NULL;
  IF p_sociedad_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.sociedades s WHERE s.id=p_sociedad_id AND s.empresa_id=p_empresa_id)
       OR (v_limitado AND NOT p_sociedad_id=ANY(v_alcance)) THEN
      RAISE EXCEPTION 'Sociedad fuera del alcance del usuario' USING errcode='42501';
    END IF;
    v_soc:=ARRAY[p_sociedad_id];
  ELSE v_soc:=v_alcance; END IF;
  v_perm:=public.asistente_permisos_especiales(p_empresa_id);
  ver_fin:=coalesce((v_perm->>'ver_finanzas')::boolean,false);
  ver_pre:=coalesce((v_perm->>'ver_precios')::boolean,false) OR ver_fin;
  pcxp:=public.usuario_puede(p_empresa_id,'cxp','ver');
  pcxc:=public.usuario_puede(p_empresa_id,'cxc','ver');

  IF pcxp THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'moneda',coalesce(nullif(c.moneda,''),'PEN'),
      'saldo',greatest(coalesce(c.saldo,0),0),'orden',greatest(coalesce(c.saldo,0),0),'fecha',c.fecha_vencimiento,
      'tercero',coalesce(pr.nombre_comercial,pr.razon_social,c.nombre_emisor,'(sin proveedor)'),'documento',c.factura_numero)),'[]'::jsonb)
    INTO v_cxp
    FROM public.cxp c LEFT JOIN public.proveedores pr ON pr.empresa_id=c.empresa_id AND pr.id=c.proveedor_id
    WHERE c.empresa_id=p_empresa_id AND (v_soc IS NULL OR c.sociedad_id=ANY(v_soc))
      AND lower(coalesce(c.estado,'')) NOT IN ('pagada','anulada','cancelada')
      AND greatest(coalesce(c.saldo,0),0)>0 AND c.fecha_vencimiento<=hoy+7;
    g_cxp_hoy:=public.inicio_agrupar(v_cxp,hoy,hoy,ver_fin);
    g_cxp_ven:=public.inicio_agrupar(v_cxp,NULL,hoy-1,ver_fin);
    g_cxp_7:=public.inicio_agrupar(v_cxp,hoy,hoy+7,ver_fin);
  END IF;

  IF pcxc THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'moneda',coalesce(nullif(c.moneda,''),'PEN'),
      'saldo',greatest(coalesce(c.saldo,0)-coalesce(c.monto_retencion,0),0),
      'orden',greatest(coalesce(c.saldo,0)-coalesce(c.monto_retencion,0),0),'fecha',c.fecha_vencimiento,
      'tercero',coalesce(ct.nombre_comercial,ct.razon_social,'(sin cliente)'),'documento',coalesce(f.numero,c.factura_id),
      'mio',c.gestor_cobranza_id=v_uid::text OR c.gestor_cobranza_id=ANY(v_personal))),'[]'::jsonb)
    INTO v_cxc
    FROM public.cxc c
    LEFT JOIN public.cuentas ct ON ct.empresa_id=c.empresa_id AND ct.id=c.cuenta_id
    LEFT JOIN public.facturas f ON f.empresa_id=c.empresa_id AND f.id=c.factura_id
    WHERE c.empresa_id=p_empresa_id AND (v_soc IS NULL OR c.sociedad_id=ANY(v_soc))
      AND lower(coalesce(c.estado,'')) NOT IN ('cobrada','pagada','anulada','cancelada')
      AND greatest(coalesce(c.saldo,0)-coalesce(c.monto_retencion,0),0)>0 AND c.fecha_vencimiento<hoy;
    g_cxc_ven:=public.inicio_agrupar(v_cxc,NULL,NULL,ver_fin);
  END IF;

  IF NOT v_limitado AND public.usuario_puede(p_empresa_id,'solpe','ver') THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'documento',s.codigo,'tercero',s.descripcion,
      'prioridad',s.prioridad,'fecha',(s.created_at AT TIME ZONE 'America/Lima')::date,
      'orden',extract(epoch FROM now()-s.created_at))),'[]'::jsonb) INTO v_filas
    FROM public.solpe_interna s
    WHERE s.empresa_id=p_empresa_id
      AND lower(coalesce(s.estado,'')) IN ('solicitada','pendiente','pendiente_aprobacion')
      AND lower(coalesce(s.prioridad,'')) IN ('alta','urgente')
      AND s.created_at<now()-interval '1 day';
    g_solpe:=public.inicio_agrupar(v_filas,NULL,NULL,false);
  END IF;

  IF public.usuario_puede(p_empresa_id,'ot','ver') THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'documento',o.numero,
      'tercero',coalesce(ct.nombre_comercial,ct.razon_social),'avance',o.avance_pct,
      'fecha',coalesce(u.ultimo,o.fecha_programada),'ultimo_parte',u.ultimo,
      'orden',hoy-coalesce(u.ultimo,o.fecha_programada,hoy),
      'mio',o.tecnico_responsable_id=ANY(v_personal))),'[]'::jsonb) INTO v_filas
    FROM public.ordenes_trabajo o
    LEFT JOIN public.cuentas ct ON ct.empresa_id=o.empresa_id AND ct.id=o.cuenta_id
    LEFT JOIN LATERAL (SELECT max(pd.fecha) ultimo FROM public.partes_diarios pd
      WHERE pd.empresa_id=o.empresa_id AND pd.orden_trabajo_id=o.id) u ON true
    WHERE o.empresa_id=p_empresa_id AND (v_soc IS NULL OR o.sociedad_id=ANY(v_soc))
      AND lower(coalesce(o.estado,''))='ejecucion' AND (u.ultimo IS NULL OR u.ultimo<hoy-1);
    g_ot:=public.inicio_agrupar(v_filas,NULL,NULL,false);
  END IF;

  BEGIN
    v_tmp:=public.listar_solicitudes_rrhh_pendientes_aprobacion(p_empresa_id);
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.value->>'id','documento',s.value->>'tipo',
      'tercero',s.value->>'personal_nombre','estado','enviada','fecha',(s.value->>'creado_en')::date,
      'orden',hoy-(s.value->>'creado_en')::date,
      'mio',public.resolver_jefe_efectivo(p_empresa_id,s.value->>'personal_id',s.value->>'personal_tipo')=v_uid)),'[]'::jsonb)
    INTO v_filas FROM jsonb_array_elements(v_tmp->'solicitudes') s
    WHERE v_soc IS NULL OR (s.value->>'sociedad_id')::uuid=ANY(v_soc);
    IF public.usuario_puede(p_empresa_id,'solicitudes_rrhh','aprobar') THEN
      SELECT v_filas||coalesce(jsonb_agg(jsonb_build_object('id',r.id,'documento',r.tipo,'tercero',r.personal_nombre,
        'estado','aprobada_jefe','fecha',r.creado_en::date,'orden',hoy-r.creado_en::date)),'[]'::jsonb) INTO v_filas
      FROM public.solicitudes_rrhh r
      WHERE r.empresa_id=p_empresa_id AND r.estado='aprobada_jefe' AND (v_soc IS NULL OR r.sociedad_id=ANY(v_soc));
    END IF;
    g_rrhh:=public.inicio_agrupar(v_filas,NULL,NULL,false);
  EXCEPTION WHEN OTHERS THEN v_errores:=v_errores||'solicitudes_rrhh'; END;

  IF public.usuario_puede(p_empresa_id,'ordenes_compra','ver') THEN
    BEGIN
      v_tmp:=public.asistente_alertas(p_empresa_id,'ordenes_compra_pendientes_recepcion',p_sociedad_id,7,100);
      SELECT coalesce(jsonb_agg(jsonb_build_object('documento',x.value->>'codigo','tercero',x.value->>'proveedor',
        'fecha',x.value->>'fecha_entrega_esperada','dias_atraso',(x.value->>'dias_atraso')::int,
        'orden',(x.value->>'dias_atraso')::int)),'[]'::jsonb) INTO v_filas
      FROM jsonb_array_elements(v_tmp->'filas') x WHERE (x.value->>'dias_atraso')::int>0;
      g_oc:=public.inicio_agrupar(v_filas,NULL,NULL,false);
    EXCEPTION WHEN OTHERS THEN v_errores:=v_errores||'ordenes_compra'; END;
    IF NOT v_limitado THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'documento',s.codigo,'tercero',s.descripcion,
        'fecha',(s.created_at AT TIME ZONE 'America/Lima')::date,'orden',extract(epoch FROM now()-s.created_at),
        'mio',EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(s.items,'[]'::jsonb)) i
          WHERE nullif(btrim(i.value->>'oc_id'),'') IS NULL AND i.value->>'comprador_campo_id'=v_uid::text))),'[]'::jsonb)
      INTO v_filas FROM public.solpe_interna s
      WHERE s.empresa_id=p_empresa_id AND lower(trim(coalesce(s.estado,''))) IN ('aprobada','oc_parcial')
        AND EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(s.items,'[]'::jsonb)) i WHERE nullif(btrim(i.value->>'oc_id'),'') IS NULL);
      g_src:=public.inicio_agrupar(v_filas,NULL,NULL,false);
    END IF;
  END IF;

  IF public.usuario_puede(p_empresa_id,'cotizaciones','ver') THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',k.id,'documento',k.numero,
      'tercero',coalesce(ct.nombre_comercial,ct.razon_social),'moneda',coalesce(nullif(k.moneda,''),'PEN'),
      'saldo',k.total,'fecha',(k.fecha_envio AT TIME ZONE 'America/Lima')::date,
      'orden',extract(epoch FROM now()-k.fecha_envio),'mio',k.responsable_id=v_uid)),'[]'::jsonb) INTO v_filas
    FROM public.cotizaciones k LEFT JOIN public.cuentas ct ON ct.empresa_id=k.empresa_id AND ct.id=k.cuenta_id
    WHERE k.empresa_id=p_empresa_id AND (v_soc IS NULL OR k.sociedad_id=ANY(v_soc))
      AND lower(coalesce(k.estado,''))='enviada' AND k.fecha_envio<now()-interval '7 days';
    g_cot:=public.inicio_agrupar(v_filas,NULL,NULL,ver_pre);
  END IF;

  IF public.usuario_puede(p_empresa_id,'inventario','ver') THEN
    BEGIN
      v_stock:=(public.asistente_alertas(p_empresa_id,'stock_bajo',p_sociedad_id,7,1)->>'cantidad_total')::int;
    EXCEPTION WHEN OTHERS THEN v_errores:=v_errores||'inventario'; END;
  END IF;

  IF NOT v_limitado AND public.usuario_puede(p_empresa_id,'actividades','ver') THEN
    v_ver_agenda:=true;
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'tipo',x.tipo,'hora',x.hora,'descripcion',x.descripcion,
      'tercero',coalesce(ct.nombre_comercial,ct.razon_social),'mia',lower(btrim(x.responsable))=lower(btrim(v_nombre))) ORDER BY x.hora NULLS LAST),'[]'::jsonb)
    INTO v_agenda FROM public.actividades_comerciales x
    LEFT JOIN public.cuentas ct ON ct.empresa_id=x.empresa_id AND ct.id=x.cuenta_id
    WHERE x.empresa_id=p_empresa_id AND x.estado='pendiente' AND x.fecha=hoy;
    SELECT count(*),min(x.fecha) INTO v_atrasadas,v_atrasada FROM public.actividades_comerciales x
    WHERE x.empresa_id=p_empresa_id AND x.estado='pendiente' AND x.fecha<hoy;
  END IF;

  FOR e IN SELECT * FROM (VALUES
    ('cxp_hoy','Administración','finanzas','cxp',g_cxp_hoy,'Vence hoy'),
    ('solpe_urgente','Logística','compras','solpe',g_solpe,'Urgente'),
    ('cxp_vencida','Administración','finanzas','cxp',g_cxp_ven,'Vencida'),
    ('ot_sin_parte','Operaciones','operaciones','ot',g_ot,'Regla automática'),
    ('rrhh','RRHH','rrhh',CASE WHEN public.usuario_puede(p_empresa_id,'solicitudes_rrhh','ver') THEN 'solicitudes_rrhh' END,g_rrhh,'Regla automática'),
    ('cxc_vencida','Administración','finanzas','cxc',g_cxc_ven,'Vencida'),
    ('oc_atrasada','Compras','compras','ordenes_compra',g_oc,'Regla automática'),
    ('sourcing','Logística','compras','sourcing_bandeja',g_src,'Regla automática'),
    ('cot_sin_respuesta','Comercial','comercial','cotizaciones',g_cot,'Seguimiento')
  ) AS t(id,area,dom,pantalla,g,etiqueta) LOOP
    CONTINUE WHEN e.g IS NULL;
    n_m:=(e.g->>'cantidad_mia')::int;
    n_c:=CASE WHEN v_dom IS NULL OR v_dom=e.dom THEN (e.g->>'cantidad')::int ELSE n_m END;
    CONTINUE WHEN n_c=0;
    v_mias:=v_mias+CASE WHEN n_m>0 THEN 1 ELSE 0 END; v_area:=v_area+1;
    v_items:=v_items||jsonb_build_array(e.g||jsonb_build_object('id',e.id,'area',e.area,'pantalla',e.pantalla,'etiqueta',e.etiqueta,'cantidad',n_c));
  END LOOP;

  RETURN jsonb_build_object(
    'fecha',hoy,'area_usuario',ctx->>'area','area_reconocida',v_dom IS NOT NULL,
    'items',v_items,'filas_mias',v_mias,'filas_area',v_area,
    'ver_finanzas',ver_fin,
    'dinero',CASE WHEN ver_fin THEN jsonb_build_object(
      'cobrar_vencido',g_cxc_ven,'pagar_vencido',g_cxp_ven,'pagar_7d',g_cxp_7,'pagar_hoy',g_cxp_hoy) END,
    'alertas',jsonb_strip_nulls(jsonb_build_object('oc',g_oc->'mayor','ot',g_ot->'mayor','stock_bajo',v_stock)),
    'agenda',CASE WHEN v_ver_agenda THEN jsonb_build_object('hoy',v_agenda,'atrasadas',v_atrasadas,'atrasada_desde',v_atrasada) END,
    'fuentes_con_error',to_jsonb(v_errores));
END $function$;

REVOKE ALL ON FUNCTION public.inicio_mi_contexto(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inicio_agrupar(jsonb,date,date,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.inicio_pendientes(text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inicio_mi_contexto(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inicio_agrupar(jsonb,date,date,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inicio_pendientes(text,uuid) TO authenticated;

DO $check$
BEGIN
  IF to_regprocedure('public.inicio_pendientes(text,uuid)') IS NULL THEN RAISE EXCEPTION 'Falta inicio_pendientes'; END IF;
  IF has_function_privilege('anon','public.inicio_pendientes(text,uuid)','execute') THEN RAISE EXCEPTION 'anon no debe ejecutar inicio_pendientes'; END IF;
  IF has_function_privilege('anon','public.inicio_mi_contexto(text)','execute') THEN RAISE EXCEPTION 'anon no debe ejecutar inicio_mi_contexto'; END IF;
  IF NOT (public.inicio_agrupar('[{"moneda":"PEN","saldo":5,"orden":5,"fecha":"2026-01-01","mio":true}]'::jsonb,NULL,NULL,false)->>'cantidad_mia')::int=1 THEN
    RAISE EXCEPTION 'inicio_agrupar no cuenta lo propio';
  END IF;
END $check$;
