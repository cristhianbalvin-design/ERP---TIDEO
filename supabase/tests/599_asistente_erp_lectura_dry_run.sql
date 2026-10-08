-- ENSAYO de la migracion 599 (BEGIN..ROLLBACK): mismo contenido, revertido al final. No se aplica nada.
-- 599_asistente_erp_lectura.sql
-- Asistente de IA del ERP: infraestructura de solo lectura.
--   * public.asistente_historial: auditoria propia (cada usuario lee las suyas; solo administradores
--     de empresa leen las de su empresa). Escritura unicamente via asistente_registrar_historial
--     (identidad derivada del JWT). Cuota diaria unica en asistente_verificar_cuota (50/usuario/dia).
--   * Purga de 180 dias: asistente_purgar_historial(), invocable solo por service_role (manual).
--   * Helpers: asistente_autorizar, asistente_permisos_especiales, asistente_formato_listado.
--   * 25 herramientas de lectura SECURITY INVOKER (Comercial 9, Compras 8, Logistica 8),
--     validadas por ensayo transaccional revertido contra produccion: 1a 13/0/1, 1b 23/0/2, 1c 21/0/5
--     (PASO/FALLO/OMITIDA).
-- Notas de diseno aceptadas:
--   * Proveedores, SOLPE y procesos de compra no tienen sociedad: alcance tenant-wide con permiso de pantalla.
--   * El servidor no replica el bypass superadmin del cliente; los permisos especiales (ver_precios,
--     ver_costos, ver_finanzas) tambien se exigen a superadmin.
--   * Registros sin sociedad (stock, kardex, ordenes de venta) solo los ve quien no tiene alcance restringido.
--   * Nunca se devuelven datos bancarios, URLs de archivos, tokens ni datos personales de transporte.
-- No contiene objetos de prueba. Sin sentencias destructivas. Todo EXECUTE solo para authenticated (purga: service_role).

BEGIN;

-- A) Historial privado: la escritura directa queda cerrada para clientes.
CREATE TABLE public.asistente_historial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  empresa_id text NOT NULL,
  sociedad_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  pregunta text NOT NULL CHECK (char_length(pregunta) <= 2000),
  contexto_modulo text,
  contexto_tipo text,
  contexto_id text,
  herramientas jsonb NOT NULL DEFAULT '[]'::jsonb,
  resultado_resumen text,
  tokens_entrada integer,
  tokens_salida integer,
  duracion_ms integer,
  estado text NOT NULL DEFAULT 'completado',
  error_code text,
  modelo text
);

ALTER TABLE public.asistente_historial ENABLE ROW LEVEL SECURITY;
CREATE POLICY asistente_historial_select ON public.asistente_historial
  FOR SELECT TO authenticated
  USING (
    (user_id = auth.uid() AND public.usuario_tiene_empresa(empresa_id))
    OR public.usuario_es_admin_empresa(empresa_id)
  );
REVOKE ALL ON TABLE public.asistente_historial FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.asistente_historial TO authenticated;
CREATE INDEX asistente_historial_usuario_fecha_idx
  ON public.asistente_historial (user_id, created_at DESC);
CREATE INDEX asistente_historial_empresa_fecha_idx
  ON public.asistente_historial (empresa_id, created_at DESC);

-- B) Registro: identidad siempre derivada del JWT y pregunta acotada.
CREATE OR REPLACE FUNCTION public.asistente_registrar_historial(
  p_empresa_id text,
  p_pregunta text,
  p_sociedad_id uuid DEFAULT NULL,
  p_contexto_modulo text DEFAULT NULL,
  p_contexto_tipo text DEFAULT NULL,
  p_contexto_id text DEFAULT NULL,
  p_herramientas jsonb DEFAULT '[]'::jsonb,
  p_resultado_resumen text DEFAULT NULL,
  p_tokens_entrada integer DEFAULT NULL,
  p_tokens_salida integer DEFAULT NULL,
  p_duracion_ms integer DEFAULT NULL,
  p_estado text DEFAULT 'completado',
  p_error_code text DEFAULT NULL,
  p_modelo text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
  v_estado text;
  v_herramientas jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sesión no autenticada'; END IF;
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'El usuario no pertenece a la empresa';
  END IF;
  IF p_sociedad_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.sociedades s WHERE s.id=p_sociedad_id AND s.empresa_id=p_empresa_id) THEN
      RAISE EXCEPTION 'La sociedad no pertenece a la empresa';
    END IF;
    IF public.usuario_alcance_sociedades(p_empresa_id) IS NOT NULL
       AND NOT (p_sociedad_id=ANY(public.usuario_alcance_sociedades(p_empresa_id))) THEN
      RAISE EXCEPTION 'Sociedad fuera del alcance del usuario';
    END IF;
  END IF;
  v_estado := CASE WHEN p_estado IN ('completado','error','cuota_excedida','rechazado') THEN p_estado ELSE 'error' END;
  v_herramientas := coalesce(p_herramientas,'[]'::jsonb);
  IF octet_length(v_herramientas::text)>20000 THEN
    v_herramientas := jsonb_build_object('truncado',true,'motivo','limite_20000_bytes');
  END IF;
  INSERT INTO public.asistente_historial
    (user_id, empresa_id, sociedad_id, pregunta, contexto_modulo, contexto_tipo,
     contexto_id, herramientas, resultado_resumen, tokens_entrada, tokens_salida,
     duracion_ms, estado, error_code, modelo)
  VALUES
    (auth.uid(), p_empresa_id, p_sociedad_id, left(coalesce(p_pregunta, ''), 2000),
     left(p_contexto_modulo, 100), left(p_contexto_tipo, 100), left(p_contexto_id, 200),
     v_herramientas, left(p_resultado_resumen, 2000),
     p_tokens_entrada, p_tokens_salida, p_duracion_ms, v_estado,
     left(p_error_code, 100), left(p_modelo, 100))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.asistente_registrar_historial(text,text,uuid,text,text,text,jsonb,text,integer,integer,integer,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.asistente_registrar_historial(text,text,uuid,text,text,text,jsonb,text,integer,integer,integer,text,text,text) TO authenticated;

-- C) Un único valor gobierna el límite diario.
CREATE OR REPLACE FUNCTION public.asistente_verificar_cuota(p_empresa_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_conteo integer; v_limite CONSTANT integer := 50; v_inicio timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sesión no autenticada'; END IF;
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN RAISE EXCEPTION 'El usuario no pertenece a la empresa'; END IF;
  v_inicio := date_trunc('day', now() AT TIME ZONE 'America/Lima') AT TIME ZONE 'America/Lima';
  SELECT count(*)::integer INTO v_conteo FROM public.asistente_historial h
   WHERE h.user_id = auth.uid() AND h.empresa_id = p_empresa_id AND h.created_at >= v_inicio;
  RETURN jsonb_build_object('conteo', v_conteo, 'limite', v_limite, 'puede_continuar', v_conteo < v_limite);
END;
$$;
REVOKE ALL ON FUNCTION public.asistente_verificar_cuota(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.asistente_verificar_cuota(text) TO authenticated;

-- D) La purga es manual y solo service_role puede invocarla.
CREATE OR REPLACE FUNCTION public.asistente_purgar_historial()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_borradas bigint;
BEGIN
  DELETE FROM public.asistente_historial WHERE created_at < now() - interval '180 days';
  GET DIAGNOSTICS v_borradas = ROW_COUNT;
  RETURN v_borradas;
END;
$$;
REVOKE ALL ON FUNCTION public.asistente_purgar_historial() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.asistente_purgar_historial() TO service_role;

-- E) Guardia común. Para tablas societarias, NULL usa el alcance completo
-- asignado; una sociedad explícita debe ser de la empresa y estar autorizada.
CREATE OR REPLACE FUNCTION public.asistente_autorizar(
  p_empresa_id text, p_pantalla text, p_sociedad_id uuid DEFAULT NULL,
  p_tabla_societaria boolean DEFAULT false
) RETURNS uuid[]
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $$
DECLARE v_alcance uuid[];
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sesión no autenticada'; END IF;
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN RAISE EXCEPTION 'Empresa no autorizada'; END IF;
  IF NOT public.usuario_puede(p_empresa_id, p_pantalla, 'ver') THEN RAISE EXCEPTION 'Falta permiso de lectura para %', p_pantalla; END IF;
  IF NOT p_tabla_societaria THEN RETURN NULL; END IF;
  v_alcance := public.usuario_alcance_sociedades(p_empresa_id);
  IF p_sociedad_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.sociedades s WHERE s.id = p_sociedad_id AND s.empresa_id = p_empresa_id) THEN
      RAISE EXCEPTION 'La sociedad no pertenece a la empresa';
    END IF;
    IF v_alcance IS NOT NULL AND NOT (p_sociedad_id = ANY(v_alcance)) THEN
      RAISE EXCEPTION 'Sociedad fuera del alcance del usuario';
    END IF;
    RETURN ARRAY[p_sociedad_id];
  END IF;
  RETURN v_alcance;
END;
$$;
REVOKE ALL ON FUNCTION public.asistente_autorizar(text,text,uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.asistente_autorizar(text,text,uuid,boolean) TO authenticated;

-- Permisos especiales: ver_precios desde permisos_extra.puede_ver_precios;
-- los otros dos desde sus columnas de permisos_roles, tal como roleAccess.js.
CREATE OR REPLACE FUNCTION public.asistente_permisos_especiales(p_empresa_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $$
DECLARE v_filas jsonb; v_precios boolean; v_costos boolean; v_finanzas boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT public.usuario_tiene_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Sesión o empresa no autorizada';
  END IF;
  v_filas := public.get_mis_permisos_efectivos(p_empresa_id)->'permisos';
  SELECT coalesce(bool_or(coalesce((x->'permisos_extra'->>'puede_ver_precios')::boolean, false)), false),
         coalesce(bool_or(coalesce((x->>'puede_ver_costos')::boolean, false)), false),
         coalesce(bool_or(coalesce((x->>'puede_ver_finanzas')::boolean, false)), false)
    INTO v_precios, v_costos, v_finanzas
    FROM jsonb_array_elements(coalesce(v_filas, '[]'::jsonb)) x;
  RETURN jsonb_build_object('ver_precios', coalesce(v_precios,false),
    'ver_costos', coalesce(v_costos,false), 'ver_finanzas', coalesce(v_finanzas,false));
END;
$$;
REVOKE ALL ON FUNCTION public.asistente_permisos_especiales(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.asistente_permisos_especiales(text) TO authenticated;

-- F) RPC de lectura. Los campos sensibles se agregan condicionalmente; jamás
-- se serializa una fila completa. Toda función usa invocador y search_path fijo.
CREATE OR REPLACE FUNCTION public.asistente_formato_listado(p_filas jsonb,p_limite integer,p_omitidos text[])
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE v_limite integer:=least(greatest(coalesce(p_limite,20),1),100); v_total integer; v_filas jsonb;
BEGIN
 v_total:=jsonb_array_length(coalesce(p_filas,'[]'::jsonb));
 SELECT coalesce(jsonb_agg(x ORDER BY n),'[]'::jsonb) INTO v_filas
 FROM jsonb_array_elements(coalesce(p_filas,'[]'::jsonb)) WITH ORDINALITY e(x,n) WHERE n<=v_limite;
 RETURN jsonb_build_object('filas',v_filas,'cantidad_devuelta',least(v_total,v_limite),'limite_aplicado',v_limite,
   'truncado',v_total>v_limite,'campos_omitidos_por_permiso',jsonb_build_array(VARIADIC coalesce(p_omitidos,ARRAY[]::text[])));
END $$;
REVOKE ALL ON FUNCTION public.asistente_formato_listado(jsonb,integer,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.asistente_formato_listado(jsonb,integer,text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.asistente_buscar_cuentas(
 p_empresa_id text, p_busqueda text DEFAULT NULL, p_limite integer DEFAULT 20
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE v jsonb; p jsonb; o text[];
BEGIN
 PERFORM public.asistente_autorizar(p_empresa_id,'cuentas'); p:=public.asistente_permisos_especiales(p_empresa_id);
 o:=array_remove(ARRAY[CASE WHEN NOT (p->>'ver_finanzas')::boolean THEN 'limite_credito' END,CASE WHEN NOT (p->>'ver_finanzas')::boolean THEN 'saldo_cxc' END,CASE WHEN NOT (p->>'ver_finanzas')::boolean THEN 'riesgo_financiero' END,CASE WHEN NOT (p->>'ver_costos')::boolean THEN 'margen_acumulado' END],NULL);
 SELECT coalesce(jsonb_agg(x),'[]'::jsonb) INTO v FROM (
  SELECT jsonb_strip_nulls(jsonb_build_object('id',c.id,'nombre_comercial',c.nombre_comercial,'razon_social',c.razon_social,
   'ruc',c.ruc,'tipo',c.tipo,'industria',c.industria,'estado',c.estado,'responsable_comercial',c.responsable_comercial,
   'moneda',c.moneda,'fecha_ultima_compra',c.fecha_ultima_compra,
   'limite_credito',CASE WHEN (p->>'ver_finanzas')::boolean THEN c.limite_credito END,
   'saldo_cxc',CASE WHEN (p->>'ver_finanzas')::boolean THEN c.saldo_cxc END,
   'riesgo_financiero',CASE WHEN (p->>'ver_finanzas')::boolean THEN c.riesgo_financiero END,
   'margen_acumulado',CASE WHEN (p->>'ver_costos')::boolean THEN c.margen_acumulado END)) AS x
  FROM public.cuentas c WHERE c.empresa_id=p_empresa_id
   AND (p_busqueda IS NULL OR c.nombre_comercial ILIKE '%'||p_busqueda||'%' OR c.razon_social ILIKE '%'||p_busqueda||'%' OR c.ruc=p_busqueda)
  ORDER BY c.nombre_comercial LIMIT least(greatest(coalesce(p_limite,20),1),100)+1
 ) q; RETURN public.asistente_formato_listado(v,p_limite,o);
END $$;

CREATE OR REPLACE FUNCTION public.asistente_detalle_cuenta(p_empresa_id text,p_cuenta_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE v jsonb; p jsonb;
BEGIN
 PERFORM public.asistente_autorizar(p_empresa_id,'cuentas'); p:=public.asistente_permisos_especiales(p_empresa_id);
 SELECT jsonb_strip_nulls(jsonb_build_object('id',c.id,'nombre_comercial',c.nombre_comercial,'razon_social',c.razon_social,
  'ruc',c.ruc,'tipo',c.tipo,'industria',c.industria,'responsable_comercial',c.responsable_comercial,'estado',c.estado,
  'condicion_pago',c.condicion_pago,'moneda',c.moneda,'clasificacion_interna',c.clasificacion_interna,
  'contactos',coalesce((SELECT jsonb_agg(jsonb_build_object('nombre',z.nombre,'cargo',z.cargo,'es_principal',z.es_principal))
    FROM (SELECT ct.nombre,ct.cargo,ct.es_principal FROM public.contactos ct WHERE ct.empresa_id=p_empresa_id AND ct.cuenta_id=c.id ORDER BY ct.es_principal DESC,ct.nombre LIMIT 20) z),'[]'::jsonb),
  'limite_credito',CASE WHEN (p->>'ver_finanzas')::boolean THEN c.limite_credito END,
  'saldo_cxc',CASE WHEN (p->>'ver_finanzas')::boolean THEN c.saldo_cxc END,
  'riesgo_financiero',CASE WHEN (p->>'ver_finanzas')::boolean THEN c.riesgo_financiero END,
  'margen_acumulado',CASE WHEN (p->>'ver_costos')::boolean THEN c.margen_acumulado END,
  'campos_omitidos_por_permiso',jsonb_build_array(VARIADIC array_remove(ARRAY[CASE WHEN NOT (p->>'ver_finanzas')::boolean THEN 'limite_credito' END,CASE WHEN NOT (p->>'ver_finanzas')::boolean THEN 'saldo_cxc' END,CASE WHEN NOT (p->>'ver_finanzas')::boolean THEN 'riesgo_financiero' END,CASE WHEN NOT (p->>'ver_costos')::boolean THEN 'margen_acumulado' END],NULL))))
 INTO v FROM public.cuentas c WHERE c.empresa_id=p_empresa_id AND c.id=p_cuenta_id;
 IF v IS NULL THEN RETURN jsonb_build_object('encontrado',false,'campos_omitidos_por_permiso','[]'::jsonb); END IF;
 RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.asistente_buscar_leads(p_empresa_id text,p_busqueda text DEFAULT NULL,p_limite integer DEFAULT 20,p_desde date DEFAULT NULL,p_hasta date DEFAULT NULL,p_estado text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE v jsonb; p jsonb; d date; h date; o text[];
BEGIN
 PERFORM public.asistente_autorizar(p_empresa_id,'leads'); p:=public.asistente_permisos_especiales(p_empresa_id);
 o:=CASE WHEN NOT (p->>'ver_precios')::boolean THEN ARRAY['presupuesto_estimado']::text[] ELSE ARRAY[]::text[] END;
 d:=p_desde; h:=p_hasta;
 IF d IS NULL AND h IS NOT NULL THEN d:=(h-interval '12 months')::date; ELSIF h IS NULL AND d IS NOT NULL THEN h:=(d+interval '12 months')::date; END IF;
 IF d IS NOT NULL AND (h<d OR h>(d+interval '12 months')::date) THEN RAISE EXCEPTION 'Rango inválido: máximo 12 meses'; END IF;
 SELECT coalesce(jsonb_agg(x),'[]'::jsonb) INTO v FROM (SELECT jsonb_strip_nulls(jsonb_build_object('id',l.id,'nombre_contacto',l.nombre_contacto,'empresa_nombre',l.empresa_nombre,'razon_social',l.razon_social,
  'industria',l.industria,'fuente',l.fuente,'necesidad',left(l.necesidad,500),'estado',l.estado,'convertido',l.convertido,'urgencia',l.urgencia,'fecha_creacion',l.fecha_creacion,
  'presupuesto_estimado',CASE WHEN (p->>'ver_precios')::boolean THEN l.presupuesto_estimado END)) x
  FROM public.leads l WHERE l.empresa_id=p_empresa_id AND (d IS NULL OR l.fecha_creacion::date BETWEEN d AND h) AND (p_estado IS NULL OR l.estado=p_estado) AND
   (p_busqueda IS NULL OR l.nombre_contacto ILIKE '%'||p_busqueda||'%' OR l.empresa_nombre ILIKE '%'||p_busqueda||'%' OR l.numero_documento=p_busqueda)
  ORDER BY l.fecha_creacion DESC LIMIT least(greatest(coalesce(p_limite,20),1),100)+1) q; RETURN public.asistente_formato_listado(v,p_limite,o);
END $$;

CREATE OR REPLACE FUNCTION public.asistente_detalle_lead(p_empresa_id text,p_lead_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE v jsonb; p jsonb;
BEGIN
 PERFORM public.asistente_autorizar(p_empresa_id,'leads'); p:=public.asistente_permisos_especiales(p_empresa_id);
 SELECT jsonb_strip_nulls(jsonb_build_object('id',l.id,'nombre_contacto',l.nombre_contacto,'empresa_nombre',l.empresa_nombre,'razon_social',l.razon_social,
  'industria',l.industria,'fuente',l.fuente,'necesidad',left(l.necesidad,500),'estado',l.estado,'urgencia',l.urgencia,'cargo',l.cargo,'fecha_creacion',l.fecha_creacion,
  'presupuesto_estimado',CASE WHEN (p->>'ver_precios')::boolean THEN l.presupuesto_estimado END,
  'campos_omitidos_por_permiso',jsonb_build_array(VARIADIC (CASE WHEN NOT (p->>'ver_precios')::boolean THEN ARRAY['presupuesto_estimado']::text[] ELSE ARRAY[]::text[] END)))) INTO v
 FROM public.leads l WHERE l.empresa_id=p_empresa_id AND l.id=p_lead_id;
 IF v IS NULL THEN RETURN jsonb_build_object('encontrado',false,'campos_omitidos_por_permiso','[]'::jsonb); END IF;
 RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.asistente_listar_oportunidades(p_empresa_id text,p_busqueda text DEFAULT NULL,p_limite integer DEFAULT 20,p_desde date DEFAULT NULL,p_hasta date DEFAULT NULL,p_estado text DEFAULT NULL,p_etapa text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE v jsonb; p jsonb; d date; h date; o text[];
BEGIN
 PERFORM public.asistente_autorizar(p_empresa_id,'pipeline'); p:=public.asistente_permisos_especiales(p_empresa_id); d:=p_desde; h:=p_hasta;
 o:=CASE WHEN NOT (p->>'ver_precios')::boolean THEN ARRAY['monto_estimado','forecast_ponderado']::text[] ELSE ARRAY[]::text[] END;
 IF d IS NULL AND h IS NOT NULL THEN d:=(h-interval '12 months')::date; ELSIF h IS NULL AND d IS NOT NULL THEN h:=(d+interval '12 months')::date; END IF;
 IF d IS NOT NULL AND (h<d OR h>(d+interval '12 months')::date) THEN RAISE EXCEPTION 'Rango inválido: máximo 12 meses'; END IF;
 SELECT coalesce(jsonb_agg(x),'[]'::jsonb) INTO v FROM (SELECT jsonb_strip_nulls(jsonb_build_object('id',opp.id,'cuenta_id',opp.cuenta_id,'lead_id',opp.lead_id,'nombre',opp.nombre,'etapa',opp.etapa,
  'probabilidad',opp.probabilidad,'moneda',opp.moneda,'fecha_cierre_estimada',opp.fecha_cierre_estimada,'estado',opp.estado,'servicio_interes',opp.servicio_interes,
  'monto_estimado',CASE WHEN (p->>'ver_precios')::boolean THEN opp.monto_estimado END,'forecast_ponderado',CASE WHEN (p->>'ver_precios')::boolean THEN opp.forecast_ponderado END)) x
 FROM public.oportunidades opp WHERE opp.empresa_id=p_empresa_id AND (d IS NULL OR opp.fecha_cierre_estimada BETWEEN d AND h) AND
  (p_estado IS NULL OR opp.estado=p_estado) AND (p_etapa IS NULL OR opp.etapa=p_etapa) AND (p_busqueda IS NULL OR opp.nombre ILIKE '%'||p_busqueda||'%')
 ORDER BY opp.fecha_cierre_estimada NULLS LAST LIMIT least(greatest(coalesce(p_limite,20),1),100)+1) q; RETURN public.asistente_formato_listado(v,p_limite,o);
END $$;

CREATE OR REPLACE FUNCTION public.asistente_resumen_pipeline(p_empresa_id text,p_desde date DEFAULT NULL,p_hasta date DEFAULT NULL,p_estado text DEFAULT NULL,p_etapa text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE v jsonb; p jsonb; d date; h date;
BEGIN
 PERFORM public.asistente_autorizar(p_empresa_id,'pipeline'); p:=public.asistente_permisos_especiales(p_empresa_id); d:=p_desde; h:=p_hasta;
 IF d IS NULL AND h IS NOT NULL THEN d:=(h-interval '12 months')::date; ELSIF h IS NULL AND d IS NOT NULL THEN h:=(d+interval '12 months')::date; END IF;
 IF d IS NOT NULL AND (h<d OR h>(d+interval '12 months')::date) THEN RAISE EXCEPTION 'Rango inválido: máximo 12 meses'; END IF;
 SELECT jsonb_build_object('oportunidades',coalesce(sum(cantidad),0),'por_etapa',coalesce(jsonb_object_agg(coalesce(etapa,'sin_etapa'),cantidad),'{}'::jsonb),
  'monto_estimado',CASE WHEN (p->>'ver_precios')::boolean THEN sum(monto_estimado) END,
  'forecast_ponderado',CASE WHEN (p->>'ver_precios')::boolean THEN sum(forecast_ponderado) END,
  'campos_omitidos_por_permiso',jsonb_build_array(VARIADIC (CASE WHEN NOT (p->>'ver_precios')::boolean THEN ARRAY['monto_estimado','forecast_ponderado']::text[] ELSE ARRAY[]::text[] END)))
 INTO v FROM (SELECT o.etapa,count(*) cantidad,sum(o.monto_estimado) monto_estimado,sum(o.forecast_ponderado) forecast_ponderado FROM public.oportunidades o
  WHERE o.empresa_id=p_empresa_id AND (d IS NULL OR o.fecha_cierre_estimada BETWEEN d AND h)
    AND (p_estado IS NULL OR o.estado=p_estado) AND (p_etapa IS NULL OR o.etapa=p_etapa) GROUP BY o.etapa) s; RETURN coalesce(v,'{}'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.asistente_buscar_cotizaciones(p_empresa_id text,p_sociedad_id uuid DEFAULT NULL,p_busqueda text DEFAULT NULL,p_limite integer DEFAULT 20,p_desde date DEFAULT NULL,p_hasta date DEFAULT NULL,p_estado text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE v jsonb; p jsonb; a uuid[]; d date; h date; o text[];
BEGIN
 a:=public.asistente_autorizar(p_empresa_id,'cotizaciones',p_sociedad_id,true); p:=public.asistente_permisos_especiales(p_empresa_id); d:=p_desde; h:=p_hasta;
 o:=CASE WHEN NOT (p->>'ver_precios')::boolean THEN ARRAY['subtotal','descuento_global_pct','descuento_global','igv','total','items.precios','hitos_pago']::text[] ELSE ARRAY[]::text[] END;
 IF d IS NULL AND h IS NOT NULL THEN d:=(h-interval '12 months')::date; ELSIF h IS NULL AND d IS NOT NULL THEN h:=(d+interval '12 months')::date; END IF;
 IF d IS NOT NULL AND (h<d OR h>(d+interval '12 months')::date) THEN RAISE EXCEPTION 'Rango inválido: máximo 12 meses'; END IF;
 SELECT coalesce(jsonb_agg(x),'[]'::jsonb) INTO v FROM (SELECT jsonb_strip_nulls(jsonb_build_object('id',c.id,'oportunidad_id',c.oportunidad_id,'cuenta_id',c.cuenta_id,'numero',c.numero,'version',c.version,'estado',c.estado,'fecha',c.fecha,'moneda',c.moneda,'sociedad_id',c.sociedad_id,
  'subtotal',CASE WHEN (p->>'ver_precios')::boolean THEN c.subtotal END,'descuento_global_pct',CASE WHEN (p->>'ver_precios')::boolean THEN c.descuento_global_pct END,'descuento_global',CASE WHEN (p->>'ver_precios')::boolean THEN c.descuento_global END,
  'igv',CASE WHEN (p->>'ver_precios')::boolean THEN c.igv END,'total',CASE WHEN (p->>'ver_precios')::boolean THEN c.total END)) x
 FROM public.cotizaciones c WHERE c.empresa_id=p_empresa_id AND (d IS NULL OR c.fecha::date BETWEEN d AND h) AND (p_estado IS NULL OR c.estado=p_estado) AND (a IS NULL OR c.sociedad_id=ANY(a)) AND
 (p_busqueda IS NULL OR c.numero ILIKE '%'||p_busqueda||'%' OR c.estado ILIKE '%'||p_busqueda||'%') ORDER BY c.fecha DESC LIMIT least(greatest(coalesce(p_limite,20),1),100)+1) q; RETURN public.asistente_formato_listado(v,p_limite,o);
END $$;

CREATE OR REPLACE FUNCTION public.asistente_detalle_cotizacion(p_empresa_id text,p_cotizacion_id text,p_sociedad_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE v jsonb; p jsonb; a uuid[]; v_items jsonb; c public.cotizaciones%ROWTYPE;
BEGIN
 a:=public.asistente_autorizar(p_empresa_id,'cotizaciones',p_sociedad_id,true); p:=public.asistente_permisos_especiales(p_empresa_id);
 SELECT x.* INTO c FROM public.cotizaciones x WHERE x.empresa_id=p_empresa_id AND x.id=p_cotizacion_id AND (a IS NULL OR x.sociedad_id=ANY(a));
 IF NOT FOUND THEN RETURN jsonb_build_object('encontrado',false,'campos_omitidos_por_permiso','[]'::jsonb); END IF;
 SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
   'descripcion',left(coalesce(e.value->>'descripcion',e.value->>'nombre',''),500),
   'cantidad',coalesce(e.value->>'cantidad',e.value->>'detalle_cantidad'),
   'unidad',coalesce(e.value->>'unidad',e.value->>'unidad_medida'),
   'precio_unitario',CASE WHEN (p->>'ver_precios')::boolean AND jsonb_typeof(e.value->'precio_unitario')='number' THEN e.value->'precio_unitario' END,
   'subtotal',CASE WHEN (p->>'ver_precios')::boolean AND jsonb_typeof(e.value->'subtotal')='number' THEN e.value->'subtotal' END,
   'total',CASE WHEN (p->>'ver_precios')::boolean AND jsonb_typeof(e.value->'total')='number' THEN e.value->'total' END,
   'descuento',CASE WHEN (p->>'ver_precios')::boolean AND jsonb_typeof(e.value->'descuento')='number' THEN e.value->'descuento' END,
   'igv',CASE WHEN (p->>'ver_precios')::boolean AND jsonb_typeof(e.value->'igv')='number' THEN e.value->'igv' END,
   'costo_hora',CASE WHEN (p->>'ver_precios')::boolean AND jsonb_typeof(e.value->'costo_hora')='number' THEN e.value->'costo_hora' END,
   'costo_hora_adicional',CASE WHEN (p->>'ver_precios')::boolean AND jsonb_typeof(e.value->'costo_hora_adicional')='number' THEN e.value->'costo_hora_adicional' END,
   'costo_mes',CASE WHEN (p->>'ver_precios')::boolean AND jsonb_typeof(e.value->'costo_mes')='number' THEN e.value->'costo_mes' END,
   'costo_periodo',CASE WHEN (p->>'ver_precios')::boolean AND jsonb_typeof(e.value->'costo_periodo')='number' THEN e.value->'costo_periodo' END))) ,'[]'::jsonb)
 INTO v_items FROM jsonb_array_elements(coalesce(c.items,'[]'::jsonb)) WITH ORDINALITY e(value,n) WHERE e.n<=50;
 SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
   'id',h.value->>'id','concepto',h.value->>'concepto','porcentaje',CASE WHEN jsonb_typeof(h.value->'porcentaje')='number' THEN h.value->'porcentaje' END,
   'condicion',h.value->>'condicion','monto',CASE WHEN (p->>'ver_precios')::boolean AND jsonb_typeof(h.value->'monto')='number' THEN h.value->'monto' END
 ))) ,'[]'::jsonb) INTO v FROM jsonb_array_elements(coalesce(c.hitos_pago,'[]'::jsonb)) h(value);
 v:=jsonb_strip_nulls(jsonb_build_object('id',c.id,'numero',c.numero,'version',c.version,'estado',c.estado,'fecha',c.fecha,'moneda',c.moneda,
  'descripcion_general',left(c.descripcion_general,500),'items',v_items,'hitos_pago',CASE WHEN (p->>'ver_precios')::boolean THEN v END,
  'subtotal',CASE WHEN (p->>'ver_precios')::boolean THEN c.subtotal END,'descuento_global_pct',CASE WHEN (p->>'ver_precios')::boolean THEN c.descuento_global_pct END,
  'descuento_global',CASE WHEN (p->>'ver_precios')::boolean THEN c.descuento_global END,'base_imponible',CASE WHEN (p->>'ver_precios')::boolean THEN c.base_imponible END,
  'igv',CASE WHEN (p->>'ver_precios')::boolean THEN c.igv END,'total',CASE WHEN (p->>'ver_precios')::boolean THEN c.total END,
  'campos_omitidos_por_permiso',jsonb_build_array(VARIADIC (CASE WHEN NOT (p->>'ver_precios')::boolean THEN ARRAY['precio_unitario','subtotal','total','descuento','igv','costo_hora','costo_hora_adicional','costo_mes','costo_periodo','hitos_pago.monto','descuento_global_pct','descuento_global','base_imponible']::text[] ELSE ARRAY[]::text[] END))));
 RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.asistente_detalle_os_cliente(p_empresa_id text,p_os_cliente_id text,p_sociedad_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE v jsonb; p jsonb; a uuid[];
BEGIN
 a:=public.asistente_autorizar(p_empresa_id,'os_cliente',p_sociedad_id,true); p:=public.asistente_permisos_especiales(p_empresa_id);
 SELECT jsonb_strip_nulls(jsonb_build_object('id',o.id,'cuenta_id',o.cuenta_id,'cotizacion_id',o.cotizacion_id,'oportunidad_id',o.oportunidad_id,'numero',o.numero,
  'moneda',o.moneda,'condicion_pago',o.condicion_pago,'fecha_emision',o.fecha_emision,'fecha_inicio',o.fecha_inicio,'fecha_fin',o.fecha_fin,'sla',left(o.sla,500),
  'estado',o.estado,'estado_produccion',o.estado_produccion,'observaciones',left(o.observaciones,500),'numero_caso',o.numero_caso,
  'monto_aprobado',CASE WHEN (p->>'ver_precios')::boolean THEN o.monto_aprobado END,
  'presupuesto_estimado',CASE WHEN (p->>'ver_costos')::boolean THEN o.presupuesto_estimado END,
  'overhead_estimado_monto',CASE WHEN (p->>'ver_costos')::boolean THEN o.overhead_estimado_monto END,
  'overhead_estimado_pct',CASE WHEN (p->>'ver_costos')::boolean THEN o.overhead_estimado_pct END,
  'saldo_por_ejecutar',CASE WHEN (p->>'ver_finanzas')::boolean THEN o.saldo_por_ejecutar END,'saldo_por_valorizar',CASE WHEN (p->>'ver_finanzas')::boolean THEN o.saldo_por_valorizar END,
  'saldo_por_facturar',CASE WHEN (p->>'ver_finanzas')::boolean THEN o.saldo_por_facturar END,'anticipo_recibido',CASE WHEN (p->>'ver_finanzas')::boolean THEN o.anticipo_recibido END,
  'monto_facturado',CASE WHEN (p->>'ver_finanzas')::boolean THEN o.monto_facturado END,'monto_cobrado',CASE WHEN (p->>'ver_finanzas')::boolean THEN o.monto_cobrado END,
  'campos_omitidos_por_permiso',jsonb_build_array(VARIADIC array_remove(ARRAY[CASE WHEN NOT (p->>'ver_precios')::boolean THEN 'monto_aprobado' END,
   CASE WHEN NOT (p->>'ver_costos')::boolean THEN 'presupuesto_estimado' END,CASE WHEN NOT (p->>'ver_costos')::boolean THEN 'overhead_estimado_monto' END,CASE WHEN NOT (p->>'ver_costos')::boolean THEN 'overhead_estimado_pct' END,
   CASE WHEN NOT (p->>'ver_finanzas')::boolean THEN 'saldo_por_ejecutar' END,CASE WHEN NOT (p->>'ver_finanzas')::boolean THEN 'saldo_por_valorizar' END,CASE WHEN NOT (p->>'ver_finanzas')::boolean THEN 'saldo_por_facturar' END,CASE WHEN NOT (p->>'ver_finanzas')::boolean THEN 'anticipo_recibido' END,CASE WHEN NOT (p->>'ver_finanzas')::boolean THEN 'monto_facturado' END,CASE WHEN NOT (p->>'ver_finanzas')::boolean THEN 'monto_cobrado' END],NULL))))
 INTO v FROM public.os_clientes o WHERE o.empresa_id=p_empresa_id AND o.id=p_os_cliente_id AND (a IS NULL OR o.sociedad_id=ANY(a));
 IF v IS NULL THEN RETURN jsonb_build_object('encontrado',false,'campos_omitidos_por_permiso','[]'::jsonb); END IF;
 RETURN v;
END $$;

-- Privilegios homogéneos para las nueve herramientas públicas.
REVOKE ALL ON FUNCTION public.asistente_buscar_cuentas(text,text,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.asistente_buscar_cuentas(text,text,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.asistente_detalle_cuenta(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.asistente_detalle_cuenta(text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.asistente_buscar_leads(text,text,integer,date,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.asistente_buscar_leads(text,text,integer,date,date,text) TO authenticated;
REVOKE ALL ON FUNCTION public.asistente_detalle_lead(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.asistente_detalle_lead(text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.asistente_listar_oportunidades(text,text,integer,date,date,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.asistente_listar_oportunidades(text,text,integer,date,date,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.asistente_resumen_pipeline(text,date,date,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.asistente_resumen_pipeline(text,date,date,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.asistente_buscar_cotizaciones(text,uuid,text,integer,date,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.asistente_buscar_cotizaciones(text,uuid,text,integer,date,date,text) TO authenticated;
REVOKE ALL ON FUNCTION public.asistente_detalle_cotizacion(text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.asistente_detalle_cotizacion(text,text,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.asistente_detalle_os_cliente(text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.asistente_detalle_os_cliente(text,text,uuid) TO authenticated;

-- H) Herramientas de Compras (etapa 1b).
CREATE OR REPLACE FUNCTION public.asistente_buscar_proveedores(
 p_empresa_id text,p_texto text DEFAULT NULL,p_estado text DEFAULT NULL,p_limite integer DEFAULT 20
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE v jsonb; p jsonb; o text[]; t text;
BEGIN
 PERFORM public.asistente_autorizar(p_empresa_id,'proveedores'); p:=public.asistente_permisos_especiales(p_empresa_id);
 o:=array_remove(ARRAY[CASE WHEN NOT (p->>'ver_costos')::boolean THEN 'monto_total_comprado' END,
   CASE WHEN NOT (p->>'ver_finanzas')::boolean THEN 'condicion_pago' END,
   CASE WHEN NOT (p->>'ver_finanzas')::boolean THEN 'sujeto_retencion' END,
   CASE WHEN NOT (p->>'ver_finanzas')::boolean THEN 'pct_retencion' END,
   CASE WHEN NOT (p->>'ver_finanzas')::boolean THEN 'limite_gasto_mensual' END],NULL);
 t:=replace(replace(replace(coalesce(p_texto,''),'\','\\'),'%','\%'),'_','\_');
 SELECT coalesce(jsonb_agg(x),'[]'::jsonb) INTO v FROM (
  SELECT jsonb_strip_nulls(jsonb_build_object('id',q.id,'codigo',q.codigo,'razon_social',q.razon_social,'nombre_comercial',q.nombre_comercial,
   'ruc',q.ruc,'tipo',q.tipo,'estado',q.estado,'rubro',q.rubro,'categoria',q.categoria,'servicios',q.servicios,'pais',q.pais,
   'telefono',q.telefono,'email',q.email,'web',q.web,'direccion',q.direccion,'contacto_nombre',q.contacto_nombre,'contacto_cargo',q.contacto_cargo,
   'calificacion_promedio',q.calificacion_promedio,'total_evaluaciones',q.total_evaluaciones,'total_ocs',q.total_ocs,
   'fecha_ultima_oc',q.fecha_ultima_oc,'fecha_homologacion',q.fecha_homologacion,'homologado_at',q.homologado_at,
   'bloqueado_motivo',q.bloqueado_motivo,'moneda',q.moneda,'created_at',q.created_at,'updated_at',q.updated_at,
   'condicion_pago',CASE WHEN (p->>'ver_finanzas')::boolean THEN q.condicion_pago END,
   'sujeto_retencion',CASE WHEN (p->>'ver_finanzas')::boolean THEN q.sujeto_retencion END,
   'pct_retencion',CASE WHEN (p->>'ver_finanzas')::boolean THEN q.pct_retencion END,
   'limite_gasto_mensual',CASE WHEN (p->>'ver_finanzas')::boolean THEN q.limite_gasto_mensual END,
   'monto_total_comprado',CASE WHEN (p->>'ver_costos')::boolean THEN q.monto_total_comprado END)) x
  FROM public.proveedores q WHERE q.empresa_id=p_empresa_id AND (p_estado IS NULL OR q.estado=p_estado)
   AND (p_texto IS NULL OR q.razon_social ILIKE '%'||t||'%' ESCAPE '\' OR q.nombre_comercial ILIKE '%'||t||'%' ESCAPE '\'
     OR q.codigo ILIKE '%'||t||'%' ESCAPE '\' OR q.ruc=p_texto)
  ORDER BY q.razon_social,q.id LIMIT least(greatest(coalesce(p_limite,20),1),100)+1
 ) s;
 RETURN public.asistente_formato_listado(v,p_limite,o);
END $$;

CREATE OR REPLACE FUNCTION public.asistente_detalle_proveedor(p_empresa_id text,p_proveedor_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE v jsonb; p jsonb; o text[]; ult jsonb;
BEGIN
 PERFORM public.asistente_autorizar(p_empresa_id,'proveedores'); p:=public.asistente_permisos_especiales(p_empresa_id);
 o:=array_remove(ARRAY[CASE WHEN NOT (p->>'ver_costos')::boolean THEN 'monto_total_comprado' END,
   CASE WHEN NOT (p->>'ver_finanzas')::boolean THEN 'condicion_pago' END,
   CASE WHEN NOT (p->>'ver_finanzas')::boolean THEN 'sujeto_retencion' END,
   CASE WHEN NOT (p->>'ver_finanzas')::boolean THEN 'pct_retencion' END,
   CASE WHEN NOT (p->>'ver_finanzas')::boolean THEN 'limite_gasto_mensual' END],NULL);
 IF public.usuario_puede(p_empresa_id,'ordenes_compra','ver') THEN
  SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id',z.id,'codigo',z.codigo,'estado',z.estado,
    'fecha_emision',z.fecha_emision,'moneda',z.moneda,'total',CASE WHEN (p->>'ver_costos')::boolean THEN z.total END)) ORDER BY z.fecha_emision DESC),'[]'::jsonb)
   INTO ult FROM (SELECT oc.id,oc.codigo,oc.estado,oc.fecha_emision,oc.moneda,oc.total FROM public.ordenes_compra oc
    WHERE oc.empresa_id=p_empresa_id AND oc.proveedor_id=p_proveedor_id
      AND (public.usuario_alcance_sociedades(p_empresa_id) IS NULL OR oc.sociedad_id=ANY(public.usuario_alcance_sociedades(p_empresa_id)))
    ORDER BY oc.fecha_emision DESC NULLS LAST LIMIT 10) z;
 ELSE o:=array_append(o,'ultimas_oc'); END IF;
 SELECT jsonb_strip_nulls(jsonb_build_object('id',q.id,'codigo',q.codigo,'razon_social',q.razon_social,'nombre_comercial',q.nombre_comercial,
  'ruc',q.ruc,'tipo',q.tipo,'estado',q.estado,'rubro',q.rubro,'categoria',q.categoria,'servicios',q.servicios,'pais',q.pais,
  'telefono',q.telefono,'email',q.email,'web',q.web,'direccion',q.direccion,'contacto_nombre',q.contacto_nombre,'contacto_cargo',q.contacto_cargo,
  'calificacion_promedio',q.calificacion_promedio,'total_evaluaciones',q.total_evaluaciones,'total_ocs',q.total_ocs,
  'fecha_ultima_oc',q.fecha_ultima_oc,'fecha_homologacion',q.fecha_homologacion,'homologado_at',q.homologado_at,
  'bloqueado_motivo',q.bloqueado_motivo,'moneda',q.moneda,'created_at',q.created_at,'updated_at',q.updated_at,
  'condicion_pago',CASE WHEN (p->>'ver_finanzas')::boolean THEN q.condicion_pago END,
  'sujeto_retencion',CASE WHEN (p->>'ver_finanzas')::boolean THEN q.sujeto_retencion END,
  'pct_retencion',CASE WHEN (p->>'ver_finanzas')::boolean THEN q.pct_retencion END,
  'limite_gasto_mensual',CASE WHEN (p->>'ver_finanzas')::boolean THEN q.limite_gasto_mensual END,
  'monto_total_comprado',CASE WHEN (p->>'ver_costos')::boolean THEN q.monto_total_comprado END,
  'ultimas_oc',CASE WHEN public.usuario_puede(p_empresa_id,'ordenes_compra','ver') THEN coalesce(ult,'[]'::jsonb) END,
  'campos_omitidos_por_permiso',jsonb_build_array(VARIADIC o))) INTO v
 FROM public.proveedores q WHERE q.empresa_id=p_empresa_id AND q.id=p_proveedor_id;
 IF v IS NULL THEN RETURN jsonb_build_object('encontrado',false,'campos_omitidos_por_permiso','[]'::jsonb); END IF;
 RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.asistente_buscar_solpe(
 p_empresa_id text,p_texto text DEFAULT NULL,p_estado text DEFAULT NULL,p_desde date DEFAULT NULL,p_hasta date DEFAULT NULL,p_limite integer DEFAULT 20
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE v jsonb; p jsonb; d date; h date; t text; o text[];
BEGIN
 PERFORM public.asistente_autorizar(p_empresa_id,'solpe'); p:=public.asistente_permisos_especiales(p_empresa_id);
 o:=CASE WHEN NOT (p->>'ver_costos')::boolean THEN ARRAY['items.precio_unitario']::text[] ELSE ARRAY[]::text[] END;
 d:=p_desde; h:=p_hasta;
 IF d IS NULL AND h IS NOT NULL THEN d:=(h-interval '12 months')::date; ELSIF h IS NULL AND d IS NOT NULL THEN h:=(d+interval '12 months')::date; END IF;
 IF d IS NOT NULL AND (h<d OR h>(d+interval '12 months')::date) THEN RAISE EXCEPTION 'Rango inválido: máximo 12 meses'; END IF;
 t:=replace(replace(replace(coalesce(p_texto,''),'\','\\'),'%','\%'),'_','\_');
 SELECT coalesce(jsonb_agg(x),'[]'::jsonb) INTO v FROM (SELECT jsonb_strip_nulls(jsonb_build_object('id',s.id,'codigo',s.codigo,'descripcion',left(s.descripcion,500),
  'tipo',s.tipo,'prioridad',s.prioridad,'urgencia',s.urgencia,'estado',s.estado,'fecha',s.fecha,'fecha_requerida',s.fecha_requerida,
  'origen',s.origen,'origen_tipo',s.origen_tipo,'origen_id',s.origen_id,'solicitante',s.solicitante,'centro_costo',s.centro_costo,
  'centro_costo_id',s.centro_costo_id,'ot_id',s.ot_id,'aprobada_at',s.aprobada_at,'created_at',s.created_at,'updated_at',s.updated_at,
  'material_id',s.material_id,'cantidad_solicitada',s.cantidad_solicitada,'cantidad_lineas',CASE WHEN jsonb_typeof(s.items)='array' THEN jsonb_array_length(s.items) ELSE 0 END)) x
  FROM public.solpe_interna s WHERE s.empresa_id=p_empresa_id AND (p_estado IS NULL OR s.estado=p_estado)
   AND (d IS NULL OR s.fecha::date BETWEEN d AND h)
   AND (p_texto IS NULL OR s.codigo ILIKE '%'||t||'%' ESCAPE '\' OR s.descripcion ILIKE '%'||t||'%' ESCAPE '\' OR s.solicitante ILIKE '%'||t||'%' ESCAPE '\')
  ORDER BY s.fecha DESC NULLS LAST,s.id LIMIT least(greatest(coalesce(p_limite,20),1),100)+1) q;
 RETURN public.asistente_formato_listado(v,p_limite,o);
END $$;

CREATE OR REPLACE FUNCTION public.asistente_detalle_solpe(p_empresa_id text,p_solpe_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE v jsonb; p jsonb; s public.solpe_interna%ROWTYPE; li jsonb; n integer; o text[];
BEGIN
 PERFORM public.asistente_autorizar(p_empresa_id,'solpe'); p:=public.asistente_permisos_especiales(p_empresa_id);
 o:=CASE WHEN NOT (p->>'ver_costos')::boolean THEN ARRAY['items.precio_unitario']::text[] ELSE ARRAY[]::text[] END;
 SELECT x.* INTO s FROM public.solpe_interna x WHERE x.empresa_id=p_empresa_id AND x.id=p_solpe_id;
 IF NOT FOUND THEN RETURN jsonb_build_object('encontrado',false,'campos_omitidos_por_permiso','[]'::jsonb); END IF;
 SELECT coalesce(jsonb_agg(z ORDER BY ord),'[]'::jsonb),count(*)::integer INTO li,n FROM (
  SELECT jsonb_strip_nulls(jsonb_build_object('id',a.value->>'id','material_id',a.value->>'material_id','material_codigo',a.value->>'material_codigo',
   'codigo',a.value->>'codigo','nombre',left(a.value->>'nombre',300),'descripcion',left(a.value->>'descripcion',500),
   'cantidad',a.value->'cantidad','unidad',a.value->>'unidad','ceco_id',a.value->>'ceco_id','observacion',left(a.value->>'observacion',500),
   'proveedor_asignado_id',a.value->>'proveedor_asignado_id','oc_id',a.value->>'oc_id','cantidad_liberada',a.value->'cantidad_liberada',
   'motivo_liberacion',left(a.value->>'motivo_liberacion',300),'liberado_de_oc_id',a.value->>'liberado_de_oc_id',
   'precio_unitario',CASE WHEN (p->>'ver_costos')::boolean THEN a.value->'precio_unitario' END)) z,a.ordinality ord
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(s.items)='array' THEN s.items ELSE '[]'::jsonb END) WITH ORDINALITY a(value,ordinality)
  WHERE a.ordinality<=50) q;
 v:=jsonb_strip_nulls(jsonb_build_object('encontrado',true,'id',s.id,'codigo',s.codigo,'descripcion',left(s.descripcion,500),'tipo',s.tipo,
  'prioridad',s.prioridad,'urgencia',s.urgencia,'estado',s.estado,'fecha',s.fecha,'fecha_requerida',s.fecha_requerida,'origen',s.origen,
  'origen_tipo',s.origen_tipo,'origen_id',s.origen_id,'solicitante',s.solicitante,'centro_costo',s.centro_costo,'centro_costo_id',s.centro_costo_id,
  'ot_id',s.ot_id,'aprobada_at',s.aprobada_at,'created_at',s.created_at,'updated_at',s.updated_at,'material_id',s.material_id,
  'cantidad_solicitada',s.cantidad_solicitada,'items',li,'cantidad_lineas',CASE WHEN jsonb_typeof(s.items)='array' THEN jsonb_array_length(s.items) ELSE 0 END,
  'truncado',CASE WHEN jsonb_typeof(s.items)='array' THEN jsonb_array_length(s.items)>50 ELSE false END,
  'campos_omitidos_por_permiso',jsonb_build_array(VARIADIC o)));
 RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.asistente_buscar_procesos_compra(
 p_empresa_id text,p_texto text DEFAULT NULL,p_estado text DEFAULT NULL,p_desde date DEFAULT NULL,p_hasta date DEFAULT NULL,p_limite integer DEFAULT 20
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE v jsonb; p jsonb; d date; h date; t text; o text[];
BEGIN
 PERFORM public.asistente_autorizar(p_empresa_id,'cot_compras'); p:=public.asistente_permisos_especiales(p_empresa_id);
 o:=array_remove(ARRAY[CASE WHEN NOT (p->>'ver_costos')::boolean THEN 'monto_referencial' END,CASE WHEN NOT (p->>'ver_costos')::boolean THEN 'monto_seleccionado' END],NULL);
 d:=p_desde; h:=p_hasta;
 IF d IS NULL AND h IS NOT NULL THEN d:=(h-interval '12 months')::date; ELSIF h IS NULL AND d IS NOT NULL THEN h:=(d+interval '12 months')::date; END IF;
 IF d IS NOT NULL AND (h<d OR h>(d+interval '12 months')::date) THEN RAISE EXCEPTION 'Rango inválido: máximo 12 meses'; END IF;
 t:=replace(replace(replace(coalesce(p_texto,''),'\','\\'),'%','\%'),'_','\_');
 SELECT coalesce(jsonb_agg(x),'[]'::jsonb) INTO v FROM (SELECT jsonb_strip_nulls(jsonb_build_object('id',c.id,'codigo',c.codigo,'solpe_id',c.solpe_id,
  'descripcion',left(c.descripcion,500),'tipo',c.tipo,'fecha_limite',c.fecha_limite,
  'cantidad_proveedores_consultados',CASE WHEN jsonb_typeof(c.proveedores_consultados)='array' THEN jsonb_array_length(c.proveedores_consultados) ELSE NULL END,
  'proveedor_ganador',c.proveedor_ganador,'monto_referencial',CASE WHEN (p->>'ver_costos')::boolean THEN c.monto_referencial END,
  'monto_seleccionado',CASE WHEN (p->>'ver_costos')::boolean THEN c.monto_seleccionado END,'moneda',c.moneda,'estado',c.estado,'created_at',c.created_at,'updated_at',c.updated_at)) x
  FROM public.procesos_compra c WHERE c.empresa_id=p_empresa_id AND (p_estado IS NULL OR c.estado=p_estado)
   AND (d IS NULL OR c.fecha_limite::date BETWEEN d AND h)
   AND (p_texto IS NULL OR c.codigo ILIKE '%'||t||'%' ESCAPE '\' OR c.descripcion ILIKE '%'||t||'%' ESCAPE '\' OR c.proveedor_ganador ILIKE '%'||t||'%' ESCAPE '\')
  ORDER BY c.created_at DESC,c.id LIMIT least(greatest(coalesce(p_limite,20),1),100)+1) q;
 RETURN public.asistente_formato_listado(v,p_limite,o);
END $$;

CREATE OR REPLACE FUNCTION public.asistente_buscar_ordenes_compra(
 p_empresa_id text,p_sociedad_id uuid DEFAULT NULL,p_texto text DEFAULT NULL,p_estado text DEFAULT NULL,p_proveedor_id text DEFAULT NULL,
 p_desde date DEFAULT NULL,p_hasta date DEFAULT NULL,p_limite integer DEFAULT 20
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE v jsonb; p jsonb; a uuid[]; d date; h date; t text; o text[];
BEGIN
 a:=public.asistente_autorizar(p_empresa_id,'ordenes_compra',p_sociedad_id,true); p:=public.asistente_permisos_especiales(p_empresa_id);
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
  ORDER BY oc.fecha_emision DESC NULLS LAST,oc.id LIMIT least(greatest(coalesce(p_limite,20),1),100)+1) q;
 RETURN public.asistente_formato_listado(v,p_limite,o);
END $$;

CREATE OR REPLACE FUNCTION public.asistente_detalle_orden_compra(p_empresa_id text,p_oc_id text,p_sociedad_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE v jsonb; p jsonb; a uuid[]; oc public.ordenes_compra%ROWTYPE; li jsonb; rec jsonb; n integer; o text[];
BEGIN
 a:=public.asistente_autorizar(p_empresa_id,'ordenes_compra',p_sociedad_id,true); p:=public.asistente_permisos_especiales(p_empresa_id);
 o:=array_remove(ARRAY[CASE WHEN NOT (p->>'ver_costos')::boolean THEN 'items.precio_unitario' END,
  CASE WHEN NOT (p->>'ver_costos')::boolean THEN 'items.subtotal' END,CASE WHEN NOT (p->>'ver_costos')::boolean THEN 'subtotal' END,
  CASE WHEN NOT (p->>'ver_costos')::boolean THEN 'igv' END,CASE WHEN NOT (p->>'ver_costos')::boolean THEN 'total' END,
  CASE WHEN NOT (p->>'ver_finanzas')::boolean THEN 'condicion_pago' END,
  CASE WHEN NOT public.usuario_puede(p_empresa_id,'recepciones','ver') THEN 'recepciones' END],NULL);
 SELECT x.* INTO oc FROM public.ordenes_compra x WHERE x.empresa_id=p_empresa_id AND x.id=p_oc_id AND (a IS NULL OR x.sociedad_id=ANY(a));
 IF NOT FOUND THEN RETURN jsonb_build_object('encontrado',false,'campos_omitidos_por_permiso','[]'::jsonb); END IF;
 SELECT coalesce(jsonb_agg(z ORDER BY ord),'[]'::jsonb),count(*)::integer INTO li,n FROM (
  SELECT jsonb_strip_nulls(jsonb_build_object('item_id',i.value->>'item_id','solpe_item_id',i.value->>'solpe_item_id','solpe_id',i.value->>'solpe_id',
   'material_id',i.value->>'material_id','codigo',i.value->>'codigo','descripcion',left(i.value->>'descripcion',500),'cantidad',i.value->'cantidad',
   'unidad',i.value->>'unidad','ceco_id',i.value->>'ceco_id','precio_unitario',CASE WHEN (p->>'ver_costos')::boolean THEN i.value->'precio_unitario' END,
   'subtotal',CASE WHEN (p->>'ver_costos')::boolean THEN i.value->'subtotal' END)) z,i.ordinality ord
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(oc.items)='array' THEN oc.items ELSE '[]'::jsonb END) WITH ORDINALITY i(value,ordinality)
  WHERE i.ordinality<=50) q;
 IF public.usuario_puede(p_empresa_id,'recepciones','ver') THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'fecha',r.fecha,'tipo',r.tipo,'estado',r.estado,
   'precio_diferente',r.precio_diferente,'cantidad_diferente',r.cantidad_diferente) ORDER BY r.fecha DESC),'[]'::jsonb)
   INTO rec FROM (SELECT x.id,x.fecha,x.tipo,x.estado,x.precio_diferente,x.cantidad_diferente FROM public.recepciones x
    WHERE x.empresa_id=p_empresa_id AND x.orden_compra_id=oc.id AND (a IS NULL OR x.sociedad_id=ANY(a))
    ORDER BY x.fecha DESC NULLS LAST LIMIT 20) r;
 END IF;
 RETURN jsonb_strip_nulls(jsonb_build_object('encontrado',true,'id',oc.id,'sociedad_id',oc.sociedad_id,'codigo',oc.codigo,
  'proceso_compra_id',oc.proceso_compra_id,'proveedor_id',oc.proveedor_id,'descripcion',left(oc.descripcion,500),
  'subtotal',CASE WHEN (p->>'ver_costos')::boolean THEN oc.subtotal END,'igv',CASE WHEN (p->>'ver_costos')::boolean THEN oc.igv END,
  'total',CASE WHEN (p->>'ver_costos')::boolean THEN oc.total END,'moneda',oc.moneda,
  'condicion_pago',CASE WHEN (p->>'ver_finanzas')::boolean THEN oc.condicion_pago END,'fecha_emision',oc.fecha_emision,
  'fecha_entrega_esperada',oc.fecha_entrega_esperada,'fecha_confirmada',oc.fecha_confirmada,'fecha_en_transito',oc.fecha_en_transito,
  'fecha_recepcion_real',oc.fecha_recepcion_real,'lead_time_dias',oc.lead_time_dias,'estado',oc.estado,'porcentaje_recibido',oc.porcentaje_recibido,
  'centro_costo_id',oc.centro_costo_id,'ot_id',oc.ot_id,'solpe_id',oc.solpe_id,'solpe_codigo',oc.solpe_codigo,'origen_tipo',oc.origen_tipo,
  'created_at',oc.created_at,'updated_at',oc.updated_at,'items',li,'cantidad_lineas',CASE WHEN jsonb_typeof(oc.items)='array' THEN jsonb_array_length(oc.items) ELSE 0 END,
  'truncado',CASE WHEN jsonb_typeof(oc.items)='array' THEN jsonb_array_length(oc.items)>50 ELSE false END,
  'recepciones',CASE WHEN public.usuario_puede(p_empresa_id,'recepciones','ver') THEN coalesce(rec,'[]'::jsonb) END,
  'campos_omitidos_por_permiso',jsonb_build_array(VARIADIC o)));
END $$;

CREATE OR REPLACE FUNCTION public.asistente_buscar_recepciones(
 p_empresa_id text,p_sociedad_id uuid DEFAULT NULL,p_orden_compra_id text DEFAULT NULL,p_desde date DEFAULT NULL,p_hasta date DEFAULT NULL,p_limite integer DEFAULT 20
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE v jsonb; p jsonb; a uuid[]; d date; h date; o text[];
BEGIN
 a:=public.asistente_autorizar(p_empresa_id,'recepciones',p_sociedad_id,true); p:=public.asistente_permisos_especiales(p_empresa_id);
 o:=CASE WHEN NOT (p->>'ver_costos')::boolean THEN ARRAY['factura_proveedor_monto','items_recibidos.precio_unitario','items_recibidos.precio_unitario_oc']::text[] ELSE ARRAY[]::text[] END;
 d:=p_desde; h:=p_hasta;
 IF d IS NULL AND h IS NOT NULL THEN d:=(h-interval '12 months')::date; ELSIF h IS NULL AND d IS NOT NULL THEN h:=(d+interval '12 months')::date; END IF;
 IF d IS NOT NULL AND (h<d OR h>(d+interval '12 months')::date) THEN RAISE EXCEPTION 'Rango inválido: máximo 12 meses'; END IF;
 SELECT coalesce(jsonb_agg(x),'[]'::jsonb) INTO v FROM (SELECT jsonb_strip_nulls(jsonb_build_object('id',r.id,'sociedad_id',r.sociedad_id,
  'orden_compra_id',r.orden_compra_id,'orden_servicio_id',r.orden_servicio_id,'tipo',r.tipo,'fecha',r.fecha,'estado',r.estado,
  'observaciones',left(r.observaciones,500),'factura_proveedor_numero',r.factura_proveedor_numero,'factura_proveedor_fecha',r.factura_proveedor_fecha,
  'factura_proveedor_monto',CASE WHEN (p->>'ver_costos')::boolean THEN r.factura_proveedor_monto END,
  'precio_diferente',r.precio_diferente,'cantidad_diferente',r.cantidad_diferente,'created_at',r.created_at,
  'cantidad_lineas',CASE WHEN jsonb_typeof(r.items_recibidos)='array' THEN jsonb_array_length(r.items_recibidos) ELSE 0 END,
  'lineas_resumen',(SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('item_id',z.value->>'item_id','material_id',z.value->>'material_id',
    'codigo',z.value->>'codigo','descripcion',left(z.value->>'descripcion',300),'unidad',z.value->>'unidad','pedido',z.value->'pedido',
    'recibido',z.value->'recibido','conforme',z.value->'conforme',
    'precio_unitario',CASE WHEN (p->>'ver_costos')::boolean THEN z.value->'precio_unitario' END,
    'precio_unitario_oc',CASE WHEN (p->>'ver_costos')::boolean THEN z.value->'precio_unitario_oc' END)) ORDER BY z.ordinality),'[]'::jsonb)
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(r.items_recibidos)='array' THEN r.items_recibidos ELSE '[]'::jsonb END) WITH ORDINALITY z(value,ordinality) WHERE z.ordinality<=20))) x
  FROM public.recepciones r WHERE r.empresa_id=p_empresa_id AND (a IS NULL OR r.sociedad_id=ANY(a))
   AND (p_orden_compra_id IS NULL OR r.orden_compra_id=p_orden_compra_id) AND (d IS NULL OR r.fecha::date BETWEEN d AND h)
  ORDER BY r.fecha DESC NULLS LAST,r.id LIMIT least(greatest(coalesce(p_limite,20),1),100)+1) q;
 RETURN public.asistente_formato_listado(v,p_limite,o);
END $$;

-- Privilegios homogéneos de las ocho RPC: sin PUBLIC/anon, solo authenticated.
REVOKE ALL ON FUNCTION public.asistente_buscar_proveedores(text,text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.asistente_buscar_proveedores(text,text,text,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.asistente_detalle_proveedor(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.asistente_detalle_proveedor(text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.asistente_buscar_solpe(text,text,text,date,date,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.asistente_buscar_solpe(text,text,text,date,date,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.asistente_detalle_solpe(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.asistente_detalle_solpe(text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.asistente_buscar_procesos_compra(text,text,text,date,date,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.asistente_buscar_procesos_compra(text,text,text,date,date,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.asistente_buscar_ordenes_compra(text,uuid,text,text,text,date,date,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.asistente_buscar_ordenes_compra(text,uuid,text,text,text,date,date,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.asistente_detalle_orden_compra(text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.asistente_detalle_orden_compra(text,text,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.asistente_buscar_recepciones(text,uuid,text,date,date,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.asistente_buscar_recepciones(text,uuid,text,date,date,integer) TO authenticated;

-- COPIA DE 1a: helpers temporales del arnés.

-- I) Herramientas de Logistica (etapa 1c).
CREATE OR REPLACE FUNCTION public.asistente_buscar_materiales(
 p_empresa_id text,p_texto text DEFAULT NULL,p_familia text DEFAULT NULL,p_estado text DEFAULT NULL,p_limite integer DEFAULT 20
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE v jsonb; p jsonb; o text[]; t text;
BEGIN
 PERFORM public.asistente_autorizar(p_empresa_id,'inventario'); p:=public.asistente_permisos_especiales(p_empresa_id);
 o:=array_remove(ARRAY[CASE WHEN NOT (p->>'ver_costos')::boolean THEN 'costo_promedio' END,CASE WHEN NOT (p->>'ver_costos')::boolean THEN 'costo_promedio_usd' END,CASE WHEN NOT (p->>'ver_costos')::boolean THEN 'precio_unitario' END],NULL);
 IF p_estado IS NOT NULL AND (length(p_estado)>80 OR p_estado !~ '^[[:alnum:] _.-]+$') THEN RAISE EXCEPTION 'Estado inválido'; END IF;
 t:=replace(replace(replace(coalesce(p_texto,''),'\','\\'),'%','\%'),'_','\_');
 SELECT coalesce(jsonb_agg(row_json),'[]'::jsonb) INTO v FROM (
  SELECT jsonb_strip_nulls(jsonb_build_object('id',mat.id,'codigo',mat.codigo,'descripcion',left(mat.descripcion,500),'unidad',mat.unidad,'familia',mat.familia,'codigo_barras',mat.codigo_barras,
   'costo_promedio',CASE WHEN (p->>'ver_costos')::boolean THEN mat.costo_promedio END,'moneda',CASE WHEN (p->>'ver_costos')::boolean THEN mat.moneda END,
   'stock_minimo',mat.stock_minimo,'estado',mat.estado,'grupo_id',mat.grupo_id,'familia_id',mat.familia_id,'subfamilia_id',mat.subfamilia_id,'nro_parte',mat.nro_parte,
   'unidades_contenidas',mat.unidades_contenidas,'almacen_id',mat.almacen_id,'ubicacion',mat.ubicacion,'precio_unitario',CASE WHEN (p->>'ver_costos')::boolean THEN mat.precio_unitario END,
   'tipo_control',mat.tipo_control,'stock_maximo',mat.stock_maximo,'punto_reorden',mat.punto_reorden,'costo_promedio_usd',CASE WHEN (p->>'ver_costos')::boolean THEN mat.costo_promedio_usd END,
   'stock_seguridad',mat.stock_seguridad,'clave_importacion',mat.clave_importacion,'created_at',mat.created_at,'updated_at',mat.updated_at)) AS row_json
   FROM public.materiales mat WHERE mat.empresa_id=p_empresa_id AND (p_estado IS NULL OR mat.estado=p_estado) AND (p_familia IS NULL OR mat.familia=p_familia)
    AND (p_texto IS NULL OR mat.codigo ILIKE '%'||t||'%' ESCAPE '\' OR mat.descripcion ILIKE '%'||t||'%' ESCAPE '\' OR mat.nro_parte ILIKE '%'||t||'%' ESCAPE '\' OR mat.codigo_barras ILIKE '%'||t||'%' ESCAPE '\')
   ORDER BY mat.codigo,mat.id LIMIT least(greatest(coalesce(p_limite,20),1),100)+1
 ) found_rows;
 RETURN public.asistente_formato_listado(v,p_limite,o);
END $$;

CREATE OR REPLACE FUNCTION public.asistente_buscar_almacenes(p_empresa_id text,p_texto text DEFAULT NULL,p_estado text DEFAULT NULL,p_limite integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE v jsonb; t text;
BEGIN
 PERFORM public.asistente_autorizar(p_empresa_id,'inventario');
 IF p_estado IS NOT NULL AND (length(p_estado)>80 OR p_estado !~ '^[[:alnum:] _.-]+$') THEN RAISE EXCEPTION 'Estado inválido'; END IF;
 t:=replace(replace(replace(coalesce(p_texto,''),'\','\\'),'%','\%'),'_','\_');
 SELECT coalesce(jsonb_agg(row_json),'[]'::jsonb) INTO v FROM (
  SELECT jsonb_strip_nulls(jsonb_build_object('id',alm.id,'codigo',alm.codigo,'nombre',alm.nombre,'tipo',alm.tipo,'ubicacion',alm.ubicacion,'estado',alm.estado)) AS row_json
  FROM public.almacenes alm WHERE alm.empresa_id=p_empresa_id AND (p_estado IS NULL OR alm.estado=p_estado)
   AND (p_texto IS NULL OR alm.codigo ILIKE '%'||t||'%' ESCAPE '\' OR alm.nombre ILIKE '%'||t||'%' ESCAPE '\' OR alm.ubicacion ILIKE '%'||t||'%' ESCAPE '\')
  ORDER BY alm.codigo,alm.id LIMIT least(greatest(coalesce(p_limite,20),1),100)+1
 ) found_rows;
 RETURN public.asistente_formato_listado(v,p_limite,ARRAY[]::text[]);
END $$;

CREATE OR REPLACE FUNCTION public.asistente_consultar_stock(p_empresa_id text,p_material_id text,p_almacen_id text,p_sociedad_id uuid,p_texto text,p_solo_con_stock boolean,p_limite integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE v jsonb; a uuid[]; t text;
BEGIN
 a:=public.asistente_autorizar(p_empresa_id,'inventario',p_sociedad_id,true);
 t:=replace(replace(replace(coalesce(p_texto,''),'\','\\'),'%','\%'),'_','\_');
 SELECT coalesce(jsonb_agg(row_json),'[]'::jsonb) INTO v FROM (
  SELECT jsonb_strip_nulls(jsonb_build_object('id',stk.id,'material_id',stk.material_id,'almacen_id',stk.almacen_id,'sociedad_id',stk.sociedad_id,'disponible',stk.disponible,'reservado',stk.reservado,'fisico',stk.fisico,
    'lote',stk.lote,'serie',stk.serie,'vencimiento',stk.vencimiento,'updated_at',stk.updated_at,'material',jsonb_strip_nulls(jsonb_build_object('codigo',mat.codigo,'descripcion',left(mat.descripcion,400),'unidad',mat.unidad)),
    'almacen',jsonb_strip_nulls(jsonb_build_object('codigo',alm.codigo,'nombre',alm.nombre)))) AS row_json
  FROM public.stock stk JOIN public.materiales mat ON mat.id=stk.material_id AND mat.empresa_id=stk.empresa_id
   JOIN public.almacenes alm ON alm.id=stk.almacen_id AND alm.empresa_id=stk.empresa_id
  WHERE stk.empresa_id=p_empresa_id AND (p_material_id IS NULL OR stk.material_id=p_material_id) AND (p_almacen_id IS NULL OR stk.almacen_id=p_almacen_id)
   AND (a IS NULL OR stk.sociedad_id=ANY(a)) AND (NOT coalesce(p_solo_con_stock,false) OR coalesce(stk.disponible,0)>0)
   AND (p_texto IS NULL OR mat.codigo ILIKE '%'||t||'%' ESCAPE '\' OR mat.descripcion ILIKE '%'||t||'%' ESCAPE '\' OR alm.codigo ILIKE '%'||t||'%' ESCAPE '\' OR alm.nombre ILIKE '%'||t||'%' ESCAPE '\')
  ORDER BY mat.codigo,alm.codigo,stk.lote,stk.id LIMIT least(greatest(coalesce(p_limite,20),1),100)+1
 ) found_rows;
 RETURN public.asistente_formato_listado(v,p_limite,ARRAY[]::text[]);
END $$;

CREATE OR REPLACE FUNCTION public.asistente_consultar_kardex(p_empresa_id text,p_material_id text,p_almacen_id text,p_sociedad_id uuid,p_tipo text,p_desde date,p_hasta date,p_limite integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE v jsonb; p jsonb; o text[]; a uuid[]; d date; h date;
BEGIN
 a:=public.asistente_autorizar(p_empresa_id,'inventario',p_sociedad_id,true); p:=public.asistente_permisos_especiales(p_empresa_id);
 IF p_material_id IS NULL AND p_almacen_id IS NULL AND p_desde IS NULL AND p_hasta IS NULL THEN RAISE EXCEPTION 'Indique material, almacén o rango de fechas'; END IF;
 d:=p_desde; h:=p_hasta; IF d IS NULL AND h IS NULL AND p_material_id IS NOT NULL THEN h:=current_date; d:=(h-interval '12 months')::date; ELSIF d IS NULL AND h IS NOT NULL THEN d:=(h-interval '12 months')::date; ELSIF h IS NULL AND d IS NOT NULL THEN h:=(d+interval '12 months')::date; END IF;
 IF d IS NOT NULL AND (h<d OR h>(d+interval '12 months')::date) THEN RAISE EXCEPTION 'Rango inválido: máximo 12 meses'; END IF;
 o:=array_remove(ARRAY[CASE WHEN NOT (p->>'ver_costos')::boolean THEN 'costo_unitario' END,CASE WHEN NOT (p->>'ver_costos')::boolean THEN 'costo_total' END,CASE WHEN NOT (p->>'ver_costos')::boolean THEN 'costo_unitario_usd' END,CASE WHEN NOT (p->>'ver_costos')::boolean THEN 'costo_total_usd' END,CASE WHEN NOT (p->>'ver_costos')::boolean THEN 'precio_unitario_provisional' END,CASE WHEN NOT (p->>'ver_costos')::boolean THEN 'precio_unitario_real' END,CASE WHEN NOT (p->>'ver_costos')::boolean THEN 'tipo_cambio_aplicado' END,CASE WHEN NOT (p->>'ver_costos')::boolean THEN 'fecha_tipo_cambio' END,CASE WHEN NOT (p->>'ver_costos')::boolean THEN 'fuente_tipo_cambio' END,CASE WHEN NOT (p->>'ver_costos')::boolean THEN 'valorizado_at' END,CASE WHEN NOT (p->>'ver_costos')::boolean THEN 'valorizacion_estado' END,CASE WHEN NOT (p->>'ver_costos')::boolean THEN 'moneda' END],NULL);
 SELECT coalesce(jsonb_agg(row_json),'[]'::jsonb) INTO v FROM (
  SELECT jsonb_strip_nulls(jsonb_build_object('id',kx.id,'fecha',kx.fecha,'tipo',kx.tipo,'motivo',kx.motivo,'cantidad',kx.cantidad,'saldo_cantidad',kx.saldo_cantidad,'lote',kx.lote,'serie',kx.serie,'vencimiento',kx.vencimiento,
   'referencia_tipo',kx.referencia_tipo,'referencia_id',kx.referencia_id,'nro_documento',kx.nro_documento,'proveedor_id',kx.proveedor_id,'orden_compra_id',kx.orden_compra_id,'recepcion_id',kx.recepcion_id,'anulado',kx.anulado,'sociedad_id',kx.sociedad_id,
   'costo_unitario',CASE WHEN (p->>'ver_costos')::boolean THEN kx.costo_unitario END,'costo_total',CASE WHEN (p->>'ver_costos')::boolean THEN kx.costo_total END,'costo_unitario_usd',CASE WHEN (p->>'ver_costos')::boolean THEN kx.costo_unitario_usd END,'costo_total_usd',CASE WHEN (p->>'ver_costos')::boolean THEN kx.costo_total_usd END,
   'precio_unitario_provisional',CASE WHEN (p->>'ver_costos')::boolean THEN kx.precio_unitario_provisional END,'precio_unitario_real',CASE WHEN (p->>'ver_costos')::boolean THEN kx.precio_unitario_real END,'moneda',CASE WHEN (p->>'ver_costos')::boolean THEN kx.moneda END,'tipo_cambio_aplicado',CASE WHEN (p->>'ver_costos')::boolean THEN kx.tipo_cambio_aplicado END,'fecha_tipo_cambio',CASE WHEN (p->>'ver_costos')::boolean THEN kx.fecha_tipo_cambio END,'fuente_tipo_cambio',CASE WHEN (p->>'ver_costos')::boolean THEN kx.fuente_tipo_cambio END,'valorizado_at',CASE WHEN (p->>'ver_costos')::boolean THEN kx.valorizado_at END,'valorizacion_estado',CASE WHEN (p->>'ver_costos')::boolean THEN kx.valorizacion_estado END,
   'material',jsonb_strip_nulls(jsonb_build_object('codigo',mat.codigo,'descripcion',left(mat.descripcion,400),'unidad',mat.unidad)),'almacen',jsonb_strip_nulls(jsonb_build_object('codigo',alm.codigo,'nombre',alm.nombre)))) AS row_json
  FROM public.kardex kx JOIN public.materiales mat ON mat.id=kx.material_id AND mat.empresa_id=kx.empresa_id JOIN public.almacenes alm ON alm.id=kx.almacen_id AND alm.empresa_id=kx.empresa_id
  WHERE kx.empresa_id=p_empresa_id AND (p_material_id IS NULL OR kx.material_id=p_material_id) AND (p_almacen_id IS NULL OR kx.almacen_id=p_almacen_id) AND (a IS NULL OR kx.sociedad_id=ANY(a))
   AND (p_tipo IS NULL OR kx.tipo=p_tipo) AND (d IS NULL OR kx.fecha::date BETWEEN d AND h)
  ORDER BY kx.fecha DESC,kx.id LIMIT least(greatest(coalesce(p_limite,20),1),100)+1
 ) found_rows;
 RETURN public.asistente_formato_listado(v,p_limite,o);
END $$;

CREATE OR REPLACE FUNCTION public.asistente_buscar_guias_remision(p_empresa_id text,p_sociedad_id uuid,p_texto text,p_estado text,p_desde date,p_hasta date,p_limite integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE v jsonb; p jsonb; a uuid[]; o text[]; d date; h date; t text;
BEGIN
 a:=public.asistente_autorizar(p_empresa_id,'remision',p_sociedad_id,true); p:=public.asistente_permisos_especiales(p_empresa_id);
 IF p_estado IS NOT NULL AND (length(p_estado)>80 OR p_estado !~ '^[[:alnum:] _.-]+$') THEN RAISE EXCEPTION 'Estado inválido'; END IF;
 d:=p_desde; h:=p_hasta; IF d IS NULL AND h IS NOT NULL THEN d:=(h-interval '12 months')::date; ELSIF h IS NULL AND d IS NOT NULL THEN h:=(d+interval '12 months')::date; END IF;
 IF d IS NOT NULL AND (h<d OR h>(d+interval '12 months')::date) THEN RAISE EXCEPTION 'Rango inválido: máximo 12 meses'; END IF;
 t:=replace(replace(replace(coalesce(p_texto,''),'\','\\'),'%','\%'),'_','\_');
 o:=array_remove(ARRAY[CASE WHEN a IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.guias_remision gx WHERE gx.empresa_id=p_empresa_id AND gx.sociedad_origen_id IS NOT NULL AND gx.sociedad_origen_id=ANY(a)) THEN 'sociedad_origen_id' END,CASE WHEN a IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.guias_remision gy WHERE gy.empresa_id=p_empresa_id AND gy.sociedad_destino_id IS NOT NULL AND gy.sociedad_destino_id=ANY(a)) THEN 'sociedad_destino_id' END],NULL);
 SELECT coalesce(jsonb_agg(row_json),'[]'::jsonb) INTO v FROM (
  SELECT jsonb_strip_nulls(jsonb_build_object('id',gr.id,'numero_completo',gr.numero_completo,'fecha_emision',gr.fecha_emision,'fecha_inicio_traslado',gr.fecha_inicio_traslado,
   'tipo_origen',gr.tipo_origen,'motivo_traslado',gr.motivo_traslado,'modalidad',gr.modalidad,'estado',gr.estado,'anulado',gr.anulado,'orden_venta_id',gr.orden_venta_id,'ot_id',gr.ot_id,
   'almacen_origen',jsonb_strip_nulls(jsonb_build_object('id',alm.id,'codigo',alm.codigo,'nombre',alm.nombre)),'peso_bruto_total',gr.peso_bruto_total,'unidad_peso',gr.unidad_peso,'destinatario_razon_social',gr.destinatario_razon_social,
   'sociedad_origen_id',CASE WHEN a IS NULL OR gr.sociedad_origen_id=ANY(a) THEN gr.sociedad_origen_id END,'sociedad_destino_id',CASE WHEN a IS NULL OR gr.sociedad_destino_id=ANY(a) THEN gr.sociedad_destino_id END)) AS row_json
  FROM public.guias_remision gr LEFT JOIN public.almacenes alm ON alm.id=gr.almacen_origen_id AND alm.empresa_id=gr.empresa_id
  WHERE gr.empresa_id=p_empresa_id AND (p_estado IS NULL OR gr.estado=p_estado) AND (d IS NULL OR gr.fecha_emision BETWEEN d AND h)
   AND (a IS NULL OR gr.sociedad_origen_id=ANY(a) OR gr.sociedad_destino_id=ANY(a))
   AND (p_texto IS NULL OR gr.numero_completo ILIKE '%'||t||'%' ESCAPE '\' OR gr.motivo_traslado ILIKE '%'||t||'%' ESCAPE '\' OR gr.destinatario_razon_social ILIKE '%'||t||'%' ESCAPE '\')
  ORDER BY gr.fecha_emision DESC,gr.numero_completo,gr.id LIMIT least(greatest(coalesce(p_limite,20),1),100)+1
 ) found_rows;
 RETURN public.asistente_formato_listado(v,p_limite,o);
END $$;

CREATE OR REPLACE FUNCTION public.asistente_detalle_guia_remision(p_empresa_id text,p_guia_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE v jsonb; p jsonb; a uuid[]; o text[]; hdr record; li jsonb; n integer;
BEGIN
 a:=public.asistente_autorizar(p_empresa_id,'remision',NULL,true); p:=public.asistente_permisos_especiales(p_empresa_id);
 SELECT gr.id,gr.numero_completo,gr.fecha_emision,gr.fecha_inicio_traslado,gr.tipo_origen,gr.motivo_traslado,gr.modalidad,gr.estado,gr.anulado,gr.orden_venta_id,gr.ot_id,gr.peso_bruto_total,gr.unidad_peso,gr.destinatario_razon_social,gr.sociedad_origen_id,gr.sociedad_destino_id,alm.id AS almacen_id,alm.codigo AS almacen_codigo,alm.nombre AS almacen_nombre
 INTO hdr FROM public.guias_remision gr LEFT JOIN public.almacenes alm ON alm.id=gr.almacen_origen_id AND alm.empresa_id=gr.empresa_id
 WHERE gr.empresa_id=p_empresa_id AND gr.id=p_guia_id AND (a IS NULL OR gr.sociedad_origen_id=ANY(a) OR gr.sociedad_destino_id=ANY(a));
 IF NOT FOUND THEN RETURN jsonb_build_object('encontrado',false,'campos_omitidos_por_permiso','[]'::jsonb); END IF;
 o:=array_remove(ARRAY[CASE WHEN NOT (p->>'ver_costos')::boolean THEN 'lineas.precio_unitario' END,CASE WHEN NOT (p->>'ver_costos')::boolean THEN 'lineas.valor_total' END,CASE WHEN NOT (p->>'ver_costos')::boolean THEN 'lineas.moneda' END,
  CASE WHEN a IS NOT NULL AND NOT (hdr.sociedad_origen_id=ANY(a)) THEN 'sociedad_origen_id' END,CASE WHEN a IS NOT NULL AND NOT (hdr.sociedad_destino_id=ANY(a)) THEN 'sociedad_destino_id' END],NULL);
 SELECT coalesce(jsonb_agg(line_json ORDER BY line_ord),'[]'::jsonb),count(*)::integer INTO li,n FROM (
  SELECT jsonb_strip_nulls(jsonb_build_object('material_id',gl.material_id,'codigo',gl.codigo,'descripcion',left(gl.descripcion,400),'unidad',gl.unidad,'cantidad',gl.cantidad,'peso_total',gl.peso_total,'lote',gl.lote,'serie',gl.serie,'orden',gl.orden,
   'precio_unitario',CASE WHEN (p->>'ver_costos')::boolean THEN gl.precio_unitario END,'valor_total',CASE WHEN (p->>'ver_costos')::boolean THEN gl.valor_total END,'moneda',CASE WHEN (p->>'ver_costos')::boolean THEN gl.moneda END)) AS line_json,gl.orden AS line_ord
  FROM public.guias_remision_lineas gl WHERE gl.empresa_id=p_empresa_id AND gl.guia_id=hdr.id ORDER BY gl.orden,gl.id LIMIT 101
 ) line_rows;
 v:=jsonb_strip_nulls(jsonb_build_object('encontrado',true,'id',hdr.id,'numero_completo',hdr.numero_completo,'fecha_emision',hdr.fecha_emision,'fecha_inicio_traslado',hdr.fecha_inicio_traslado,'tipo_origen',hdr.tipo_origen,'motivo_traslado',hdr.motivo_traslado,'modalidad',hdr.modalidad,'estado',hdr.estado,'anulado',hdr.anulado,'orden_venta_id',hdr.orden_venta_id,'ot_id',hdr.ot_id,
  'almacen_origen',jsonb_strip_nulls(jsonb_build_object('id',hdr.almacen_id,'codigo',hdr.almacen_codigo,'nombre',hdr.almacen_nombre)),'peso_bruto_total',hdr.peso_bruto_total,'unidad_peso',hdr.unidad_peso,'destinatario_razon_social',hdr.destinatario_razon_social,
  'sociedad_origen_id',CASE WHEN a IS NULL OR hdr.sociedad_origen_id=ANY(a) THEN hdr.sociedad_origen_id END,'sociedad_destino_id',CASE WHEN a IS NULL OR hdr.sociedad_destino_id=ANY(a) THEN hdr.sociedad_destino_id END,'lineas',li,'cantidad_lineas_devuelta',least(n,100),'truncado',n>100,'campos_omitidos_por_permiso',jsonb_build_array(VARIADIC coalesce(o,ARRAY[]::text[]))));
 RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.asistente_buscar_ordenes_venta(p_empresa_id text,p_sociedad_id uuid,p_texto text,p_estado text,p_desde date,p_hasta date,p_limite integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE v jsonb; p jsonb; a uuid[]; o text[]; d date; h date; t text;
BEGIN
 a:=public.asistente_autorizar(p_empresa_id,'remision',p_sociedad_id,true); p:=public.asistente_permisos_especiales(p_empresa_id);
 IF p_estado IS NOT NULL AND (length(p_estado)>80 OR p_estado !~ '^[[:alnum:] _.-]+$') THEN RAISE EXCEPTION 'Estado inválido'; END IF;
 d:=p_desde; h:=p_hasta; IF d IS NULL AND h IS NOT NULL THEN d:=(h-interval '12 months')::date; ELSIF h IS NULL AND d IS NOT NULL THEN h:=(d+interval '12 months')::date; END IF;
 IF d IS NOT NULL AND (h<d OR h>(d+interval '12 months')::date) THEN RAISE EXCEPTION 'Rango inválido: máximo 12 meses'; END IF;
 t:=replace(replace(replace(coalesce(p_texto,''),'\','\\'),'%','\%'),'_','\_');
 o:=array_remove(ARRAY[CASE WHEN NOT (p->>'ver_finanzas')::boolean THEN 'subtotal' END,CASE WHEN NOT (p->>'ver_finanzas')::boolean THEN 'igv' END,CASE WHEN NOT (p->>'ver_finanzas')::boolean THEN 'total' END,CASE WHEN NOT (p->>'ver_finanzas')::boolean THEN 'subtotal_usd' END,CASE WHEN NOT (p->>'ver_finanzas')::boolean THEN 'total_usd' END,CASE WHEN NOT (p->>'ver_finanzas')::boolean THEN 'condicion_pago' END],NULL);
 SELECT coalesce(jsonb_agg(row_json),'[]'::jsonb) INTO v FROM (
  SELECT jsonb_strip_nulls(jsonb_build_object('id',ov.id,'numero',ov.numero,'cliente_nombre',ov.cliente_nombre,'cuenta_id',ov.cuenta_id,'fecha_emision',ov.fecha_emision,'fecha_entrega',ov.fecha_entrega,
   'almacen_despacho',jsonb_strip_nulls(jsonb_build_object('id',alm.id,'codigo',alm.codigo,'nombre',alm.nombre)),'estado',ov.estado,'anulado',ov.anulado,'moneda',ov.moneda,'sociedad_id',ov.sociedad_id,
   'subtotal',CASE WHEN (p->>'ver_finanzas')::boolean THEN ov.subtotal END,'igv',CASE WHEN (p->>'ver_finanzas')::boolean THEN ov.igv END,'total',CASE WHEN (p->>'ver_finanzas')::boolean THEN ov.total END,'subtotal_usd',CASE WHEN (p->>'ver_finanzas')::boolean THEN ov.subtotal_usd END,'total_usd',CASE WHEN (p->>'ver_finanzas')::boolean THEN ov.total_usd END,'condicion_pago',CASE WHEN (p->>'ver_finanzas')::boolean THEN ov.condicion_pago END)) AS row_json
  FROM public.ordenes_venta ov LEFT JOIN public.almacenes alm ON alm.id=ov.almacen_despacho_id AND alm.empresa_id=ov.empresa_id
  WHERE ov.empresa_id=p_empresa_id AND (a IS NULL OR ov.sociedad_id=ANY(a)) AND (p_estado IS NULL OR ov.estado=p_estado) AND (d IS NULL OR ov.fecha_emision BETWEEN d AND h)
   AND (p_texto IS NULL OR ov.numero ILIKE '%'||t||'%' ESCAPE '\' OR ov.cliente_nombre ILIKE '%'||t||'%' ESCAPE '\')
  ORDER BY ov.fecha_emision DESC,ov.numero,ov.id LIMIT least(greatest(coalesce(p_limite,20),1),100)+1
 ) found_rows;
 RETURN public.asistente_formato_listado(v,p_limite,o);
END $$;

CREATE OR REPLACE FUNCTION public.asistente_detalle_orden_venta(p_empresa_id text,p_orden_id text,p_sociedad_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE v jsonb; p jsonb; a uuid[]; o text[]; hdr record; li jsonb; n integer;
BEGIN
 a:=public.asistente_autorizar(p_empresa_id,'remision',p_sociedad_id,true); p:=public.asistente_permisos_especiales(p_empresa_id);
 SELECT ov.id,ov.numero,ov.cliente_nombre,ov.cuenta_id,ov.fecha_emision,ov.fecha_entrega,ov.moneda,ov.estado,ov.anulado,ov.sociedad_id,ov.subtotal,ov.igv,ov.total,ov.subtotal_usd,ov.total_usd,ov.condicion_pago,alm.id AS almacen_id,alm.codigo AS almacen_codigo,alm.nombre AS almacen_nombre
 INTO hdr FROM public.ordenes_venta ov LEFT JOIN public.almacenes alm ON alm.id=ov.almacen_despacho_id AND alm.empresa_id=ov.empresa_id
 WHERE ov.empresa_id=p_empresa_id AND ov.id=p_orden_id AND (a IS NULL OR ov.sociedad_id=ANY(a));
 IF NOT FOUND THEN RETURN jsonb_build_object('encontrado',false,'campos_omitidos_por_permiso','[]'::jsonb); END IF;
 o:=array_remove(ARRAY[CASE WHEN NOT (p->>'ver_precios')::boolean THEN 'lineas.precio_unitario' END,CASE WHEN NOT (p->>'ver_precios')::boolean THEN 'lineas.precio_unitario_usd' END,CASE WHEN NOT (p->>'ver_precios')::boolean THEN 'lineas.descuento_pct' END,CASE WHEN NOT (p->>'ver_precios')::boolean THEN 'lineas.precio_neto' END,CASE WHEN NOT (p->>'ver_precios')::boolean THEN 'lineas.subtotal' END,CASE WHEN NOT (p->>'ver_finanzas')::boolean THEN 'subtotal' END,CASE WHEN NOT (p->>'ver_finanzas')::boolean THEN 'igv' END,CASE WHEN NOT (p->>'ver_finanzas')::boolean THEN 'total' END,CASE WHEN NOT (p->>'ver_finanzas')::boolean THEN 'subtotal_usd' END,CASE WHEN NOT (p->>'ver_finanzas')::boolean THEN 'total_usd' END,CASE WHEN NOT (p->>'ver_finanzas')::boolean THEN 'condicion_pago' END],NULL);
 SELECT coalesce(jsonb_agg(line_json ORDER BY line_ord),'[]'::jsonb),count(*)::integer INTO li,n FROM (
  SELECT jsonb_strip_nulls(jsonb_build_object('material_id',ol.material_id,'codigo',ol.codigo,'descripcion',left(ol.descripcion,400),'unidad',ol.unidad,'cantidad',ol.cantidad,'cantidad_despachada',ol.cantidad_despachada,'lote',ol.lote,'serie',ol.serie,'orden',ol.orden,
   'precio_unitario',CASE WHEN (p->>'ver_precios')::boolean THEN ol.precio_unitario END,'precio_unitario_usd',CASE WHEN (p->>'ver_precios')::boolean THEN ol.precio_unitario_usd END,'descuento_pct',CASE WHEN (p->>'ver_precios')::boolean THEN ol.descuento_pct END,'precio_neto',CASE WHEN (p->>'ver_precios')::boolean THEN ol.precio_neto END,'subtotal',CASE WHEN (p->>'ver_precios')::boolean THEN ol.subtotal END)) AS line_json,ol.orden AS line_ord
  FROM public.ordenes_venta_lineas ol WHERE ol.empresa_id=p_empresa_id AND ol.orden_venta_id=hdr.id ORDER BY ol.orden,ol.id LIMIT 101
 ) line_rows;
 v:=jsonb_strip_nulls(jsonb_build_object('encontrado',true,'id',hdr.id,'numero',hdr.numero,'cliente_nombre',hdr.cliente_nombre,'cuenta_id',hdr.cuenta_id,'fecha_emision',hdr.fecha_emision,'fecha_entrega',hdr.fecha_entrega,'almacen_despacho',jsonb_strip_nulls(jsonb_build_object('id',hdr.almacen_id,'codigo',hdr.almacen_codigo,'nombre',hdr.almacen_nombre)),
  'estado',hdr.estado,'anulado',hdr.anulado,'moneda',hdr.moneda,'sociedad_id',hdr.sociedad_id,'subtotal',CASE WHEN (p->>'ver_finanzas')::boolean THEN hdr.subtotal END,'igv',CASE WHEN (p->>'ver_finanzas')::boolean THEN hdr.igv END,'total',CASE WHEN (p->>'ver_finanzas')::boolean THEN hdr.total END,'subtotal_usd',CASE WHEN (p->>'ver_finanzas')::boolean THEN hdr.subtotal_usd END,'total_usd',CASE WHEN (p->>'ver_finanzas')::boolean THEN hdr.total_usd END,'condicion_pago',CASE WHEN (p->>'ver_finanzas')::boolean THEN hdr.condicion_pago END,
  'lineas',li,'cantidad_lineas_devuelta',least(n,100),'truncado',n>100,'campos_omitidos_por_permiso',jsonb_build_array(VARIADIC coalesce(o,ARRAY[]::text[]))));
 RETURN v;
END $$;

REVOKE ALL ON FUNCTION public.asistente_buscar_materiales(text,text,text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.asistente_buscar_materiales(text,text,text,text,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.asistente_buscar_almacenes(text,text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.asistente_buscar_almacenes(text,text,text,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.asistente_consultar_stock(text,text,text,uuid,text,boolean,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.asistente_consultar_stock(text,text,text,uuid,text,boolean,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.asistente_consultar_kardex(text,text,text,uuid,text,date,date,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.asistente_consultar_kardex(text,text,text,uuid,text,date,date,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.asistente_buscar_guias_remision(text,uuid,text,text,date,date,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.asistente_buscar_guias_remision(text,uuid,text,text,date,date,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.asistente_detalle_guia_remision(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.asistente_detalle_guia_remision(text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.asistente_buscar_ordenes_venta(text,uuid,text,text,date,date,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.asistente_buscar_ordenes_venta(text,uuid,text,text,date,date,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.asistente_detalle_orden_venta(text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.asistente_detalle_orden_venta(text,text,uuid) TO authenticated;

-- Verificacion previa a la reversion (tabla de resultados que imprime el runner).
SELECT 'funciones asistente_* (esperado 31)' AS comprobacion, count(*)::text AS valor
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'asistente\_%'
UNION ALL SELECT 'SECURITY DEFINER (esperado 5)', count(*)::text
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'asistente\_%' AND p.prosecdef
UNION ALL SELECT 'EXECUTE para anon (esperado 0)', count(*)::text
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'asistente\_%' AND has_function_privilege('anon',p.oid,'EXECUTE')
UNION ALL SELECT 'EXECUTE para PUBLIC (esperado 0)', count(*)::text
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'asistente\_%'
 AND EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) ax WHERE ax.grantee=0 AND ax.privilege_type='EXECUTE')
UNION ALL SELECT 'EXECUTE authenticated (esperado 30)', count(*)::text
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'asistente\_%' AND has_function_privilege('authenticated',p.oid,'EXECUTE')
UNION ALL SELECT 'purga solo service_role (esperado true/false)', has_function_privilege('service_role','public.asistente_purgar_historial()','EXECUTE')::text||'/'||has_function_privilege('authenticated','public.asistente_purgar_historial()','EXECUTE')::text
UNION ALL SELECT 'RLS asistente_historial (esperado true)', relrowsecurity::text FROM pg_class WHERE oid='public.asistente_historial'::regclass
UNION ALL SELECT 'authenticated INSERT/UPDATE/DELETE historial (esperado false/false/false)', has_table_privilege('authenticated','public.asistente_historial','INSERT')::text||'/'||has_table_privilege('authenticated','public.asistente_historial','UPDATE')::text||'/'||has_table_privilege('authenticated','public.asistente_historial','DELETE')::text
UNION ALL SELECT 'anon SELECT historial (esperado false)', has_table_privilege('anon','public.asistente_historial','SELECT')::text;

ROLLBACK;
