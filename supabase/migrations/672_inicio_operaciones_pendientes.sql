-- 672: Pendientes del Inicio de Operaciones (bandeja "Por resolver" con Míos / Mi área).
-- Mismo formato que inicio_pendientes (Administración) para reutilizar su pantalla; solo lectura,
-- SECURITY INVOKER (aplica RLS) y cada fuente exige el permiso de su pantalla.
CREATE OR REPLACE FUNCTION public.inicio_operaciones_pendientes(p_empresa_id text, p_sociedad_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid:=auth.uid(); hoy date:=(now() AT TIME ZONE 'America/Lima')::date;
  ctx jsonb; v_dom text; v_personal text[];
  v_alcance uuid[]; v_soc uuid[]; v_limitado boolean;
  v_filas jsonb; v_items jsonb:='[]'; v_errores text[]:=ARRAY[]::text[];
  g_partes jsonb; g_reservas jsonb; g_of jsonb; g_viajes jsonb; g_diag jsonb; g_solpe jsonb; g_cert jsonb; g_ot jsonb;
  k_ot int; k_partes int; k_reservas int; v_midia jsonb; v_ot_larga jsonb;
  e record; n_c int; n_m int; v_mias int:=0; v_area int:=0;
BEGIN
  ctx:=public.inicio_mi_contexto(p_empresa_id);
  v_dom:=ctx->>'dominio';
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

  -- Partes diarios en revisión
  IF public.usuario_puede(p_empresa_id,'partes','ver') THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'documento',p.numero,'tercero',p.tecnico_nombre,
      'fecha',p.fecha,'orden',hoy-p.fecha,'mio',p.tecnico_id::text=ANY(v_personal))),'[]'::jsonb), count(*)
    INTO v_filas, k_partes
    FROM public.partes_diarios p
    WHERE p.empresa_id=p_empresa_id AND (v_soc IS NULL OR p.sociedad_id=ANY(v_soc)) AND p.estado='en_revision';
    g_partes:=public.inicio_agrupar(v_filas,NULL,NULL,false);
  END IF;

  -- Reservas de repuestos por despachar
  IF public.usuario_puede(p_empresa_id,'inventario','ver') THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'documento',o.numero,'estado',r.estado,
      'fecha',(r.created_at AT TIME ZONE 'America/Lima')::date,'orden',extract(epoch FROM now()-r.created_at))),'[]'::jsonb), count(*)
    INTO v_filas, k_reservas
    FROM public.ot_segmento_repuestos r LEFT JOIN public.ordenes_trabajo o ON o.empresa_id=r.empresa_id AND o.id=r.ot_id
    WHERE r.empresa_id=p_empresa_id AND (v_soc IS NULL OR r.sociedad_id=ANY(v_soc))
      AND r.estado IN ('reservado','reservado_parcial_solpe');
    g_reservas:=public.inicio_agrupar(v_filas,NULL,NULL,false);
  END IF;

  -- Órdenes de fabricación con compromiso vencido
  IF public.usuario_puede(p_empresa_id,'of','ver') THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',f.id,'documento',f.numero,'tercero',f.descripcion,
      'fecha',f.fecha_compromiso,'dias_atraso',hoy-f.fecha_compromiso,'orden',hoy-f.fecha_compromiso,
      'mio',f.responsable_id::text=v_uid::text OR f.responsable_id::text=ANY(v_personal))),'[]'::jsonb)
    INTO v_filas
    FROM public.ordenes_fabricacion f
    WHERE f.empresa_id=p_empresa_id AND (v_soc IS NULL OR f.sociedad_id=ANY(v_soc))
      AND f.estado NOT IN ('entregada','cerrada','anulada') AND f.fecha_compromiso<hoy;
    g_of:=public.inicio_agrupar(v_filas,NULL,NULL,false);
  END IF;

  -- Viajes programados que ya debieron salir
  IF public.usuario_puede(p_empresa_id,'transporte_comercial','ver') THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',v.id,'documento',v.codigo,
      'tercero',v.origen_nombre||' → '||v.destino_nombre,'fecha',(v.fecha_programada AT TIME ZONE 'America/Lima')::date,
      'dias_atraso',hoy-(v.fecha_programada AT TIME ZONE 'America/Lima')::date,
      'orden',extract(epoch FROM now()-v.fecha_programada),'mio',v.created_by::text=v_uid::text)),'[]'::jsonb)
    INTO v_filas
    FROM public.transporte_viajes v
    WHERE v.empresa_id=p_empresa_id AND (v_soc IS NULL OR v.sociedad_id=ANY(v_soc))
      AND v.estado='programado' AND v.fecha_programada<now();
    g_viajes:=public.inicio_agrupar(v_filas,NULL,NULL,false);
  END IF;

  -- Diagnósticos técnicos en borrador (sin sociedad: se ocultan a usuarios limitados a una sociedad)
  IF NOT v_limitado AND public.usuario_puede(p_empresa_id,'diagnostico_tecnico','ver') THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'documento',d.referencia_cliente,'tercero',a.nombre,
      'fecha',d.fecha_inspeccion,'orden',extract(epoch FROM now()-d.created_at),
      'mio',d.tecnico_id::text=ANY(v_personal) OR d.tecnico_id::text=v_uid::text)),'[]'::jsonb)
    INTO v_filas
    FROM public.diagnosticos_tecnicos d LEFT JOIN public.activos a ON a.id=d.activo_id
    WHERE d.empresa_id=p_empresa_id AND d.estado='borrador';
    g_diag:=public.inicio_agrupar(v_filas,NULL,NULL,false);
  END IF;

  -- SOLPE por aprobar (sin sociedad)
  IF NOT v_limitado AND public.usuario_puede(p_empresa_id,'solpe','aprobar') THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'documento',s.codigo,'tercero',s.descripcion,
      'prioridad',s.prioridad,'fecha',(s.created_at AT TIME ZONE 'America/Lima')::date,
      'orden',extract(epoch FROM now()-s.created_at))),'[]'::jsonb)
    INTO v_filas
    FROM public.solpe_interna s
    WHERE s.empresa_id=p_empresa_id AND lower(coalesce(s.estado,'')) IN ('solicitada','pendiente','pendiente_aprobacion');
    g_solpe:=public.inicio_agrupar(v_filas,NULL,NULL,false);
  END IF;

  -- Certificaciones de equipos por vencer en 30 días (sin sociedad)
  IF NOT v_limitado AND public.usuario_puede(p_empresa_id,'certificaciones_activo','ver') THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'documento',c.numero,'tercero',coalesce(a.codigo,a.nombre),
      'fecha',c.fecha_vencimiento,'orden',-(c.fecha_vencimiento-hoy),'mio',c.created_by::text=v_uid::text)),'[]'::jsonb)
    INTO v_filas
    FROM public.activo_certificaciones c LEFT JOIN public.activos a ON a.id=c.activo_id
    WHERE c.empresa_id=p_empresa_id AND lower(coalesce(c.estado,''))='activa'
      AND c.fecha_vencimiento BETWEEN hoy AND hoy+30;
    g_cert:=public.inicio_agrupar(v_filas,NULL,NULL,false);
  END IF;

  -- OT en ejecución: sin parte desde ayer, indicador y "Mi día"
  IF public.usuario_puede(p_empresa_id,'ot','ver') THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'documento',o.numero,
      'tercero',coalesce(ct.nombre_comercial,ct.razon_social),'avance',o.avance_pct,
      'fecha',coalesce(u.ultimo,o.fecha_programada),'ultimo_parte',u.ultimo,
      'orden',hoy-coalesce(u.ultimo,o.fecha_programada,hoy),
      'mio',o.tecnico_responsable_id=ANY(v_personal))) FILTER (WHERE u.ultimo IS NULL OR u.ultimo<hoy-1),'[]'::jsonb),
      count(*),
      coalesce((SELECT jsonb_agg(x) FROM (SELECT jsonb_build_object('id',o2.id,'documento',o2.numero,'descripcion',o2.descripcion,
          'fecha',o2.fecha_programada,'estado',o2.estado) x
        FROM public.ordenes_trabajo o2
        WHERE o2.empresa_id=p_empresa_id AND (v_soc IS NULL OR o2.sociedad_id=ANY(v_soc))
          AND lower(coalesce(o2.estado,'')) IN ('ejecucion','programada')
        ORDER BY o2.fecha_programada DESC NULLS LAST LIMIT 5) t),'[]'::jsonb)
    INTO v_filas, k_ot, v_midia
    FROM public.ordenes_trabajo o
    LEFT JOIN public.cuentas ct ON ct.empresa_id=o.empresa_id AND ct.id=o.cuenta_id
    LEFT JOIN LATERAL (SELECT max(pd.fecha) ultimo FROM public.partes_diarios pd
      WHERE pd.empresa_id=o.empresa_id AND pd.orden_trabajo_id=o.id) u ON true
    WHERE o.empresa_id=p_empresa_id AND (v_soc IS NULL OR o.sociedad_id=ANY(v_soc))
      AND lower(coalesce(o.estado,''))='ejecucion';
    g_ot:=public.inicio_agrupar(v_filas,NULL,NULL,false);
    SELECT jsonb_build_object('documento',o.numero,'dias',hoy-o.fecha_programada) INTO v_ot_larga
    FROM public.ordenes_trabajo o
    WHERE o.empresa_id=p_empresa_id AND (v_soc IS NULL OR o.sociedad_id=ANY(v_soc))
      AND lower(coalesce(o.estado,''))='ejecucion' AND o.fecha_programada<hoy-30
    ORDER BY o.fecha_programada LIMIT 1;
  END IF;

  FOR e IN SELECT * FROM (VALUES
    ('ops_partes_revision','Taller','operaciones','partes-taller',g_partes,'Urgente'),
    ('ops_of_atrasada','Producción','operaciones','maestranza-of',g_of,'Vence hoy'),
    ('ops_viajes_atrasados','Transporte','operaciones','transporte-viajes',g_viajes,'Vence hoy'),
    ('ops_reservas_despacho','Almacén','compras','almacen-despachos',g_reservas,'Regla automática'),
    ('ops_diagnosticos_borrador','Taller','operaciones','diagnostico-tecnico',g_diag,'Sugerido por Aria'),
    ('ops_solpe_aprobar','Compras','compras','solicitudes',g_solpe,'Urgente'),
    ('ops_cert_por_vencer','Flota','operaciones','certificaciones-activo',g_cert,'Urgente'),
    ('ot_sin_parte','Taller','operaciones','ots',g_ot,'Regla automática')
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
    'ver_finanzas',false,
    'kpis',jsonb_strip_nulls(jsonb_build_object('ot_ejecucion',k_ot,'partes_revision',k_partes,'reservas_despacho',k_reservas)),
    'mi_dia',v_midia,
    'alertas',jsonb_strip_nulls(jsonb_build_object('cert',g_cert->'mayor','viajes',CASE WHEN (g_viajes->>'cantidad')::int>0 THEN jsonb_build_object('cantidad',(g_viajes->>'cantidad')::int) END,'ot_larga',v_ot_larga)),
    'fuentes_con_error',to_jsonb(v_errores));
END $function$;

REVOKE ALL ON FUNCTION public.inicio_operaciones_pendientes(text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inicio_operaciones_pendientes(text,uuid) TO authenticated;

DO $verificacion$
BEGIN
  IF to_regprocedure('public.inicio_operaciones_pendientes(text,uuid)') IS NULL THEN
    RAISE EXCEPTION '672: no se creó inicio_operaciones_pendientes';
  END IF;
  IF has_function_privilege('anon','public.inicio_operaciones_pendientes(text,uuid)','EXECUTE') THEN
    RAISE EXCEPTION '672: anon no debe ejecutar inicio_operaciones_pendientes';
  END IF;
END
$verificacion$;
