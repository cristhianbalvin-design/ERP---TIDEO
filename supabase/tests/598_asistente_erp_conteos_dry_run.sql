-- Ensayo en seco de 598_asistente_erp_conteos.sql; todo se revierte al final.
-- Este script NO deja cambios: termina en ROLLBACK.
-- Simula JWT y rol authenticated con el patrón empleado en los diagnósticos del asistente.
-- No contiene COMMIT ni aplica cambios persistentes.

BEGIN;

-- 598_asistente_erp_conteos.sql
-- Conteos exactos para el asistente ERP. Reutiliza autorización, filtros y RLS de 597.
-- La función no devuelve filas ni datos personales y no aplica límite de resultados.

CREATE OR REPLACE FUNCTION public.asistente_contar_registros(
  p_empresa_id text,
  p_entidad text,
  p_sociedad_id uuid DEFAULT NULL,
  p_estado text DEFAULT NULL,
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL,
  p_texto text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public
AS $$
DECLARE
  v_total bigint := 0;
  v_por_estado jsonb;
  v_filtros jsonb := '{}'::jsonb;
  v_alcance uuid[];
  v_desde date;
  v_hasta date;
  v_texto text;
BEGIN
  IF p_entidad IS NULL OR p_entidad NOT IN (
    'cuentas','leads','oportunidades','cotizaciones','proveedores','solpe',
    'procesos_compra','ordenes_compra','recepciones','materiales','almacenes',
    'guias_remision','ordenes_venta'
  ) THEN
    RAISE EXCEPTION 'Entidad no permitida para conteo: %', coalesce(p_entidad, 'NULL');
  END IF;

  -- Cada llamada y módulo coincide con la RPC de búsqueda de 597.
  CASE p_entidad
    WHEN 'cuentas' THEN PERFORM public.asistente_autorizar(p_empresa_id,'cuentas');
    WHEN 'leads' THEN PERFORM public.asistente_autorizar(p_empresa_id,'leads');
    WHEN 'oportunidades' THEN PERFORM public.asistente_autorizar(p_empresa_id,'pipeline');
    WHEN 'cotizaciones' THEN v_alcance:=public.asistente_autorizar(p_empresa_id,'cotizaciones',p_sociedad_id,true);
    WHEN 'proveedores' THEN PERFORM public.asistente_autorizar(p_empresa_id,'proveedores');
    WHEN 'solpe' THEN PERFORM public.asistente_autorizar(p_empresa_id,'solpe');
    WHEN 'procesos_compra' THEN PERFORM public.asistente_autorizar(p_empresa_id,'cot_compras');
    WHEN 'ordenes_compra' THEN v_alcance:=public.asistente_autorizar(p_empresa_id,'ordenes_compra',p_sociedad_id,true);
    WHEN 'recepciones' THEN v_alcance:=public.asistente_autorizar(p_empresa_id,'recepciones',p_sociedad_id,true);
    WHEN 'materiales' THEN PERFORM public.asistente_autorizar(p_empresa_id,'inventario');
    WHEN 'almacenes' THEN PERFORM public.asistente_autorizar(p_empresa_id,'inventario');
    WHEN 'guias_remision' THEN v_alcance:=public.asistente_autorizar(p_empresa_id,'remision',p_sociedad_id,true);
    WHEN 'ordenes_venta' THEN v_alcance:=public.asistente_autorizar(p_empresa_id,'remision',p_sociedad_id,true);
  END CASE;

  -- Las búsquedas de 597 validan rangos de hasta 12 meses en estas entidades.
  v_desde:=p_desde;
  v_hasta:=p_hasta;
  IF p_entidad IN ('leads','oportunidades','cotizaciones','solpe','procesos_compra',
                    'ordenes_compra','recepciones','guias_remision','ordenes_venta') THEN
    IF v_desde IS NULL AND v_hasta IS NOT NULL THEN
      v_desde:=(v_hasta-interval '12 months')::date;
    ELSIF v_hasta IS NULL AND v_desde IS NOT NULL THEN
      v_hasta:=(v_desde+interval '12 months')::date;
    END IF;
    IF v_desde IS NOT NULL AND (v_hasta<v_desde OR v_hasta>(v_desde+interval '12 months')::date) THEN
      RAISE EXCEPTION 'Rango inválido: máximo 12 meses';
    END IF;
  END IF;
  v_texto:=replace(replace(replace(coalesce(p_texto,''),'\','\\'),'%','\%'),'_','\_');

  CASE p_entidad
    WHEN 'cuentas' THEN
      v_filtros:=jsonb_strip_nulls(jsonb_build_object('texto',p_texto));
      SELECT count(*) INTO v_total FROM public.cuentas c
       WHERE c.empresa_id=p_empresa_id
         AND (p_texto IS NULL OR c.nombre_comercial ILIKE '%'||p_texto||'%' OR c.razon_social ILIKE '%'||p_texto||'%' OR c.ruc=p_texto);
      SELECT coalesce(jsonb_object_agg(coalesce(c.estado::text,'sin_estado'),c.cantidad),'{}'::jsonb) INTO v_por_estado
       FROM (SELECT c.estado,count(*)::bigint AS cantidad FROM public.cuentas c WHERE c.empresa_id=p_empresa_id
         AND (p_texto IS NULL OR c.nombre_comercial ILIKE '%'||p_texto||'%' OR c.razon_social ILIKE '%'||p_texto||'%' OR c.ruc=p_texto) GROUP BY c.estado) c;

    WHEN 'leads' THEN
      v_filtros:=jsonb_strip_nulls(jsonb_build_object('texto',p_texto,'estado',p_estado,'desde',v_desde,'hasta',v_hasta));
      SELECT coalesce(sum(q.cantidad),0),coalesce(jsonb_object_agg(coalesce(q.estado::text,'sin_estado'),q.cantidad),'{}'::jsonb)
        INTO v_total,v_por_estado FROM (SELECT l.estado,count(*)::bigint cantidad FROM public.leads l WHERE l.empresa_id=p_empresa_id
         AND (v_desde IS NULL OR l.fecha_creacion::date BETWEEN v_desde AND v_hasta) AND (p_estado IS NULL OR l.estado=p_estado)
         AND (p_texto IS NULL OR l.nombre_contacto ILIKE '%'||p_texto||'%' OR l.empresa_nombre ILIKE '%'||p_texto||'%' OR l.numero_documento=p_texto) GROUP BY l.estado) q;

    WHEN 'oportunidades' THEN
      v_filtros:=jsonb_strip_nulls(jsonb_build_object('texto',p_texto,'estado',p_estado,'desde',v_desde,'hasta',v_hasta));
      SELECT coalesce(sum(q.cantidad),0),coalesce(jsonb_object_agg(coalesce(q.estado::text,'sin_estado'),q.cantidad),'{}'::jsonb)
        INTO v_total,v_por_estado FROM (SELECT o.estado,count(*)::bigint cantidad FROM public.oportunidades o WHERE o.empresa_id=p_empresa_id
         AND (v_desde IS NULL OR o.fecha_cierre_estimada BETWEEN v_desde AND v_hasta) AND (p_estado IS NULL OR o.estado=p_estado)
         AND (p_texto IS NULL OR o.nombre ILIKE '%'||p_texto||'%') GROUP BY o.estado) q;

    WHEN 'cotizaciones' THEN
      v_filtros:=jsonb_strip_nulls(jsonb_build_object('texto',p_texto,'estado',p_estado,'desde',v_desde,'hasta',v_hasta,'sociedad_id',p_sociedad_id,'alcance_sociedades',v_alcance));
      SELECT coalesce(sum(q.cantidad),0),coalesce(jsonb_object_agg(coalesce(q.estado::text,'sin_estado'),q.cantidad),'{}'::jsonb)
        INTO v_total,v_por_estado FROM (SELECT c.estado,count(*)::bigint cantidad FROM public.cotizaciones c WHERE c.empresa_id=p_empresa_id
         AND (v_desde IS NULL OR c.fecha::date BETWEEN v_desde AND v_hasta) AND (p_estado IS NULL OR c.estado=p_estado)
         AND (v_alcance IS NULL OR c.sociedad_id=ANY(v_alcance))
         AND (p_texto IS NULL OR c.numero ILIKE '%'||p_texto||'%' OR c.estado ILIKE '%'||p_texto||'%') GROUP BY c.estado) q;

    WHEN 'proveedores' THEN
      v_filtros:=jsonb_strip_nulls(jsonb_build_object('texto',p_texto,'estado',p_estado));
      SELECT coalesce(sum(q.cantidad),0),coalesce(jsonb_object_agg(coalesce(q.estado::text,'sin_estado'),q.cantidad),'{}'::jsonb)
        INTO v_total,v_por_estado FROM (SELECT p.estado,count(*)::bigint cantidad FROM public.proveedores p WHERE p.empresa_id=p_empresa_id
         AND (p_estado IS NULL OR p.estado=p_estado)
         AND (p_texto IS NULL OR p.razon_social ILIKE '%'||v_texto||'%' ESCAPE '\' OR p.nombre_comercial ILIKE '%'||v_texto||'%' ESCAPE '\'
          OR p.codigo ILIKE '%'||v_texto||'%' ESCAPE '\' OR p.ruc=p_texto) GROUP BY p.estado) q;

    WHEN 'solpe' THEN
      v_filtros:=jsonb_strip_nulls(jsonb_build_object('texto',p_texto,'estado',p_estado,'desde',v_desde,'hasta',v_hasta));
      SELECT coalesce(sum(q.cantidad),0),coalesce(jsonb_object_agg(coalesce(q.estado::text,'sin_estado'),q.cantidad),'{}'::jsonb)
        INTO v_total,v_por_estado FROM (SELECT s.estado,count(*)::bigint cantidad FROM public.solpe_interna s WHERE s.empresa_id=p_empresa_id
         AND (p_estado IS NULL OR s.estado=p_estado) AND (v_desde IS NULL OR s.fecha::date BETWEEN v_desde AND v_hasta)
         AND (p_texto IS NULL OR s.codigo ILIKE '%'||v_texto||'%' ESCAPE '\' OR s.descripcion ILIKE '%'||v_texto||'%' ESCAPE '\' OR s.solicitante ILIKE '%'||v_texto||'%' ESCAPE '\') GROUP BY s.estado) q;

    WHEN 'procesos_compra' THEN
      v_filtros:=jsonb_strip_nulls(jsonb_build_object('texto',p_texto,'estado',p_estado,'desde',v_desde,'hasta',v_hasta));
      SELECT coalesce(sum(q.cantidad),0),coalesce(jsonb_object_agg(coalesce(q.estado::text,'sin_estado'),q.cantidad),'{}'::jsonb)
        INTO v_total,v_por_estado FROM (SELECT c.estado,count(*)::bigint cantidad FROM public.procesos_compra c WHERE c.empresa_id=p_empresa_id
         AND (p_estado IS NULL OR c.estado=p_estado) AND (v_desde IS NULL OR c.fecha_limite::date BETWEEN v_desde AND v_hasta)
         AND (p_texto IS NULL OR c.codigo ILIKE '%'||v_texto||'%' ESCAPE '\' OR c.descripcion ILIKE '%'||v_texto||'%' ESCAPE '\' OR c.proveedor_ganador ILIKE '%'||v_texto||'%' ESCAPE '\') GROUP BY c.estado) q;

    WHEN 'ordenes_compra' THEN
      v_filtros:=jsonb_strip_nulls(jsonb_build_object('texto',p_texto,'estado',p_estado,'desde',v_desde,'hasta',v_hasta,'sociedad_id',p_sociedad_id,'alcance_sociedades',v_alcance));
      SELECT coalesce(sum(q.cantidad),0),coalesce(jsonb_object_agg(coalesce(q.estado::text,'sin_estado'),q.cantidad),'{}'::jsonb)
        INTO v_total,v_por_estado FROM (SELECT oc.estado,count(*)::bigint cantidad FROM public.ordenes_compra oc WHERE oc.empresa_id=p_empresa_id
         AND (v_alcance IS NULL OR oc.sociedad_id=ANY(v_alcance)) AND (p_estado IS NULL OR oc.estado=p_estado)
         AND (v_desde IS NULL OR oc.fecha_emision::date BETWEEN v_desde AND v_hasta)
         AND (p_texto IS NULL OR oc.codigo ILIKE '%'||v_texto||'%' ESCAPE '\' OR oc.descripcion ILIKE '%'||v_texto||'%' ESCAPE '\' OR oc.solpe_codigo ILIKE '%'||v_texto||'%' ESCAPE '\') GROUP BY oc.estado) q;

    WHEN 'recepciones' THEN
      v_filtros:=jsonb_strip_nulls(jsonb_build_object('desde',v_desde,'hasta',v_hasta,'sociedad_id',p_sociedad_id,'alcance_sociedades',v_alcance));
      SELECT coalesce(sum(q.cantidad),0),coalesce(jsonb_object_agg(coalesce(q.estado::text,'sin_estado'),q.cantidad),'{}'::jsonb)
        INTO v_total,v_por_estado FROM (SELECT r.estado,count(*)::bigint cantidad FROM public.recepciones r WHERE r.empresa_id=p_empresa_id
         AND (v_alcance IS NULL OR r.sociedad_id=ANY(v_alcance)) AND (v_desde IS NULL OR r.fecha::date BETWEEN v_desde AND v_hasta) GROUP BY r.estado) q;

    WHEN 'materiales' THEN
      IF p_estado IS NOT NULL AND (length(p_estado)>80 OR p_estado !~ '^[[:alnum:] _.-]+$') THEN RAISE EXCEPTION 'Estado inválido'; END IF;
      v_filtros:=jsonb_strip_nulls(jsonb_build_object('texto',p_texto,'estado',p_estado));
      SELECT coalesce(sum(q.cantidad),0),coalesce(jsonb_object_agg(coalesce(q.estado::text,'sin_estado'),q.cantidad),'{}'::jsonb)
        INTO v_total,v_por_estado FROM (SELECT m.estado,count(*)::bigint cantidad FROM public.materiales m WHERE m.empresa_id=p_empresa_id
         AND (p_estado IS NULL OR m.estado=p_estado)
         AND (p_texto IS NULL OR m.codigo ILIKE '%'||v_texto||'%' ESCAPE '\' OR m.descripcion ILIKE '%'||v_texto||'%' ESCAPE '\' OR m.nro_parte ILIKE '%'||v_texto||'%' ESCAPE '\' OR m.codigo_barras ILIKE '%'||v_texto||'%' ESCAPE '\') GROUP BY m.estado) q;

    WHEN 'almacenes' THEN
      IF p_estado IS NOT NULL AND (length(p_estado)>80 OR p_estado !~ '^[[:alnum:] _.-]+$') THEN RAISE EXCEPTION 'Estado inválido'; END IF;
      v_filtros:=jsonb_strip_nulls(jsonb_build_object('texto',p_texto,'estado',p_estado));
      SELECT coalesce(sum(q.cantidad),0),coalesce(jsonb_object_agg(coalesce(q.estado::text,'sin_estado'),q.cantidad),'{}'::jsonb)
        INTO v_total,v_por_estado FROM (SELECT a.estado,count(*)::bigint cantidad FROM public.almacenes a WHERE a.empresa_id=p_empresa_id
         AND (p_estado IS NULL OR a.estado=p_estado)
         AND (p_texto IS NULL OR a.codigo ILIKE '%'||v_texto||'%' ESCAPE '\' OR a.nombre ILIKE '%'||v_texto||'%' ESCAPE '\' OR a.ubicacion ILIKE '%'||v_texto||'%' ESCAPE '\') GROUP BY a.estado) q;

    WHEN 'guias_remision' THEN
      IF p_estado IS NOT NULL AND (length(p_estado)>80 OR p_estado !~ '^[[:alnum:] _.-]+$') THEN RAISE EXCEPTION 'Estado inválido'; END IF;
      v_filtros:=jsonb_strip_nulls(jsonb_build_object('texto',p_texto,'estado',p_estado,'desde',v_desde,'hasta',v_hasta,'sociedad_id',p_sociedad_id,'alcance_sociedades',v_alcance));
      SELECT coalesce(sum(q.cantidad),0),coalesce(jsonb_object_agg(coalesce(q.estado::text,'sin_estado'),q.cantidad),'{}'::jsonb)
        INTO v_total,v_por_estado FROM (SELECT g.estado,count(*)::bigint cantidad FROM public.guias_remision g WHERE g.empresa_id=p_empresa_id
         AND (p_estado IS NULL OR g.estado=p_estado) AND (v_desde IS NULL OR g.fecha_emision BETWEEN v_desde AND v_hasta)
         AND (v_alcance IS NULL OR g.sociedad_origen_id=ANY(v_alcance) OR g.sociedad_destino_id=ANY(v_alcance))
         AND (p_texto IS NULL OR g.numero_completo ILIKE '%'||v_texto||'%' ESCAPE '\' OR g.motivo_traslado ILIKE '%'||v_texto||'%' ESCAPE '\' OR g.destinatario_razon_social ILIKE '%'||v_texto||'%' ESCAPE '\') GROUP BY g.estado) q;

    WHEN 'ordenes_venta' THEN
      IF p_estado IS NOT NULL AND (length(p_estado)>80 OR p_estado !~ '^[[:alnum:] _.-]+$') THEN RAISE EXCEPTION 'Estado inválido'; END IF;
      v_filtros:=jsonb_strip_nulls(jsonb_build_object('texto',p_texto,'estado',p_estado,'desde',v_desde,'hasta',v_hasta,'sociedad_id',p_sociedad_id,'alcance_sociedades',v_alcance));
      SELECT coalesce(sum(q.cantidad),0),coalesce(jsonb_object_agg(coalesce(q.estado::text,'sin_estado'),q.cantidad),'{}'::jsonb)
        INTO v_total,v_por_estado FROM (SELECT o.estado,count(*)::bigint cantidad FROM public.ordenes_venta o WHERE o.empresa_id=p_empresa_id
         AND (v_alcance IS NULL OR o.sociedad_id=ANY(v_alcance)) AND (p_estado IS NULL OR o.estado=p_estado)
         AND (v_desde IS NULL OR o.fecha_emision BETWEEN v_desde AND v_hasta)
         AND (p_texto IS NULL OR o.numero ILIKE '%'||v_texto||'%' ESCAPE '\' OR o.cliente_nombre ILIKE '%'||v_texto||'%' ESCAPE '\') GROUP BY o.estado) q;
  END CASE;

  IF v_por_estado IS NULL THEN
    RETURN jsonb_build_object('entidad',p_entidad,'total',v_total,'filtros_aplicados',v_filtros);
  END IF;
  RETURN jsonb_build_object('entidad',p_entidad,'total',v_total,'por_estado',v_por_estado,'filtros_aplicados',v_filtros);
END;
$$;

REVOKE ALL ON FUNCTION public.asistente_contar_registros(text,text,uuid,text,date,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.asistente_contar_registros(text,text,uuid,text,date,date,text) TO authenticated;
COMMENT ON FUNCTION public.asistente_contar_registros(text,text,uuid,text,date,date,text) IS
  'Devuelve conteos exactos de entidades ERP autorizadas, sin filas ni datos personales, con filtros compatibles con las búsquedas de la migración 597.';

DO $$
DECLARE
  v_funcion regprocedure := to_regprocedure('public.asistente_contar_registros(text,text,uuid,text,date,date,text)');
  v_usuario text;
  v_empresa text;
  v_empresa_ajena text;
  v_entidad text;
  v_modulo text;
  v_resultado jsonb;
  v_busqueda jsonb;
  v_total numeric;
  v_suma numeric;
  v_error boolean;
  v_entidades text[] := ARRAY[
    'cuentas','leads','oportunidades','cotizaciones','proveedores','solpe',
    'procesos_compra','ordenes_compra','recepciones','materiales','almacenes',
    'guias_remision','ordenes_venta'
  ];
  v_modulos text[] := ARRAY[
    'cuentas','leads','pipeline','cotizaciones','proveedores','solpe',
    'cot_compras','ordenes_compra','recepciones','inventario','remision'
  ];
BEGIN
  IF v_funcion IS NULL THEN RAISE EXCEPTION 'No existe asistente_contar_registros con la firma esperada'; END IF;
  IF NOT has_function_privilege('authenticated',v_funcion,'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated no tiene EXECUTE sobre asistente_contar_registros';
  END IF;
  IF has_function_privilege('anon',v_funcion,'EXECUTE') OR EXISTS (
    SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
     WHERE p.oid=v_funcion AND a.grantee=0 AND a.privilege_type='EXECUTE'
  ) THEN RAISE EXCEPTION 'La función concede EXECUTE a anon o PUBLIC'; END IF;
  IF (SELECT prosecdef FROM pg_proc WHERE oid=v_funcion) THEN
    RAISE EXCEPTION 'La función debe ser SECURITY INVOKER';
  END IF;
  IF (SELECT provolatile FROM pg_proc WHERE oid=v_funcion) <> 's' THEN
    RAISE EXCEPTION 'La función debe ser STABLE';
  END IF;

  -- Selecciona una membresía activa que tenga lectura en todos los módulos del conjunto.
  FOR v_usuario,v_empresa IN
    SELECT ue.user_id::text,ue.empresa_id FROM public.usuarios_empresas ue WHERE ue.estado='activo'
  LOOP
    PERFORM set_config('request.jwt.claims',json_build_object('sub',v_usuario,'role','authenticated')::text,true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_error:=false;
    FOREACH v_modulo IN ARRAY v_modulos LOOP
      IF NOT public.usuario_puede(v_empresa,v_modulo,'ver') THEN v_error:=true; EXIT; END IF;
    END LOOP;
    RESET ROLE;
    EXIT WHEN NOT v_error;
  END LOOP;
  IF v_usuario IS NULL THEN
    RAISE EXCEPTION 'No se puede ejecutar la validación: no se encontró usuario simulado con lectura en los 11 módulos requeridos';
  END IF;

  -- Se identifica una empresa sin membresía para comprobar el rechazo de tenant ajeno.
  SELECT e.id INTO v_empresa_ajena FROM public.empresas e
   WHERE e.id::text<>v_empresa AND NOT EXISTS (
     SELECT 1 FROM public.usuarios_empresas ue WHERE ue.user_id::text=v_usuario
       AND ue.empresa_id=e.id::text AND ue.estado='activo'
   ) LIMIT 1;
  IF v_empresa_ajena IS NULL THEN RAISE EXCEPTION 'No se encontró una empresa ajena para el ensayo'; END IF;

  PERFORM set_config('request.jwt.claims',json_build_object('sub',v_usuario,'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  FOREACH v_entidad IN ARRAY v_entidades LOOP
    v_resultado:=public.asistente_contar_registros(v_empresa,v_entidad);
    IF v_resultado->>'entidad'<>v_entidad OR jsonb_typeof(v_resultado->'total')<>'number' THEN
      RAISE EXCEPTION 'Respuesta inválida para entidad %: %',v_entidad,v_resultado;
    END IF;
    v_total:=(v_resultado->>'total')::numeric;
    IF v_total<0 OR v_total<>trunc(v_total) THEN RAISE EXCEPTION 'Total no entero/no negativo para %',v_entidad; END IF;
    IF NOT (v_resultado ? 'por_estado') THEN RAISE EXCEPTION 'Falta por_estado para entidad con estado: %',v_entidad; END IF;
    SELECT coalesce(sum(value::numeric),0) INTO v_suma FROM jsonb_each_text(v_resultado->'por_estado');
    IF v_suma<>v_total THEN RAISE EXCEPTION 'Suma por_estado distinta de total para %: % <> %',v_entidad,v_suma,v_total; END IF;
  END LOOP;

  -- Una entidad fuera de la lista blanca debe producir una excepción.
  v_error:=false;
  BEGIN
    PERFORM public.asistente_contar_registros(v_empresa,'entidad_invalida');
  EXCEPTION WHEN OTHERS THEN
    v_error:=position('Entidad no permitida' IN SQLERRM)>0;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'No se rechazó claramente una entidad inválida'; END IF;

  -- Una empresa ajena debe ser rechazada por el mismo autorizador de 597.
  v_error:=false;
  BEGIN
    PERFORM public.asistente_contar_registros(v_empresa_ajena,'cuentas');
  EXCEPTION WHEN OTHERS THEN
    v_error:=position('Empresa no autorizada' IN SQLERRM)>0 OR position('Falta permiso de lectura' IN SQLERRM)>0;
  END;
  IF NOT v_error THEN RAISE EXCEPTION 'No se rechazó la empresa ajena'; END IF;

  -- En cotizaciones y cuentas el total exacto debe cubrir las filas del buscador limitado a 100.
  -- La clave 'filas' la devuelve asistente_formato_listado en 597_asistente_erp_lectura.sql:207.
  v_resultado:=public.asistente_contar_registros(v_empresa,'cotizaciones');
  v_busqueda:=public.asistente_buscar_cotizaciones(v_empresa,NULL,NULL,100,NULL,NULL,NULL);
  IF (v_resultado->>'total')::numeric < jsonb_array_length(coalesce(v_busqueda->'filas','[]'::jsonb)) THEN
    RAISE EXCEPTION 'Total de cotizaciones menor que filas de búsqueda';
  END IF;
  v_resultado:=public.asistente_contar_registros(v_empresa,'cuentas');
  v_busqueda:=public.asistente_buscar_cuentas(v_empresa,NULL,100);
  IF (v_resultado->>'total')::numeric < jsonb_array_length(coalesce(v_busqueda->'filas','[]'::jsonb)) THEN
    RAISE EXCEPTION 'Total de cuentas menor que filas de búsqueda';
  END IF;

  RAISE NOTICE 'Ensayo 598 completado: 13 entidades, ACL, denegaciones y cotejos de límite 100 correctos';
  RESET ROLE;
END;
$$;

ROLLBACK;
