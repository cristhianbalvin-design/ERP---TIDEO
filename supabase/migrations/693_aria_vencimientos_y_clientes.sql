-- Aria: datos para jefes y gerentes.
--  asistente_vencimientos: contratos de alquiler, certificaciones de flota y documentos del personal vencidos o por vencer.
--  asistente_clientes_facturacion: clientes que más facturan en un periodo y clientes que dejaron de comprar.
-- Aditiva. Ambas corren con los permisos del usuario (invoker) y respetan su alcance de sociedades.

CREATE OR REPLACE FUNCTION public.asistente_vencimientos(p_empresa_id text, p_dias integer DEFAULT 30, p_sociedad_id uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_hoy date := (now() AT TIME ZONE 'America/Lima')::date;
  v_dias integer := least(greatest(coalesce(p_dias, 30), 1), 180);
  v_limite date;
  v_alcance uuid[];
  v_res jsonb;
  v_sec jsonb;
  v_omitidos text[] := ARRAY[]::text[];
  v_adm boolean; v_ope boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sesión no autenticada'; END IF;
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN RAISE EXCEPTION 'Empresa no autorizada'; END IF;
  v_limite := v_hoy + v_dias;
  v_res := jsonb_build_object('hoy', v_hoy, 'dias', v_dias, 'nota', 'dias_restantes negativo significa que ya venció.');

  IF public.usuario_puede(p_empresa_id, 'contratos_alquiler', 'ver') THEN
    v_alcance := public.asistente_autorizar(p_empresa_id, 'contratos_alquiler', p_sociedad_id, true);
    SELECT jsonb_build_object('total', count(*), 'vencidos', count(*) FILTER (WHERE x.fecha_fin < v_hoy),
      'lista', coalesce(jsonb_agg(jsonb_build_object('numero', x.numero, 'cliente', x.cliente, 'fecha_fin', x.fecha_fin, 'dias_restantes', x.fecha_fin - v_hoy) ORDER BY x.fecha_fin) FILTER (WHERE x.orden <= 50), '[]'::jsonb))
    INTO v_sec
    FROM (SELECT c.numero, coalesce(nullif(cu.razon_social, ''), cu.nombre_comercial) AS cliente, c.fecha_fin, row_number() OVER (ORDER BY c.fecha_fin) AS orden
            FROM public.contratos_alquiler c LEFT JOIN public.cuentas cu ON cu.id = c.cuenta_id AND cu.empresa_id = c.empresa_id
           WHERE c.empresa_id = p_empresa_id AND c.estado = 'vigente' AND c.fecha_fin IS NOT NULL AND c.fecha_fin <= v_limite
             AND (v_alcance IS NULL OR c.sociedad_id = ANY(v_alcance))) x;
    v_res := v_res || jsonb_build_object('contratos_alquiler', v_sec);
  ELSE v_omitidos := array_append(v_omitidos, 'contratos_alquiler');
  END IF;

  IF public.usuario_puede(p_empresa_id, 'certificaciones_activo', 'ver') THEN
    SELECT jsonb_build_object('total', count(*), 'vencidos', count(*) FILTER (WHERE x.fecha_vencimiento < v_hoy),
      'lista', coalesce(jsonb_agg(jsonb_build_object('equipo', x.equipo, 'documento', x.documento, 'obligatoria', x.obligatoria, 'fecha_vencimiento', x.fecha_vencimiento, 'dias_restantes', x.fecha_vencimiento - v_hoy) ORDER BY x.fecha_vencimiento) FILTER (WHERE x.orden <= 50), '[]'::jsonb))
    INTO v_sec
    FROM (SELECT concat_ws(' · ', a.codigo, a.nombre) AS equipo, t.nombre AS documento, ac.obligatoria, ac.fecha_vencimiento, row_number() OVER (ORDER BY ac.fecha_vencimiento) AS orden
            FROM public.activo_certificaciones ac
            JOIN public.activos a ON a.id = ac.activo_id AND a.empresa_id = ac.empresa_id
            LEFT JOIN public.flota_certificacion_tipos t ON t.id = ac.tipo_id
           WHERE ac.empresa_id = p_empresa_id AND ac.estado = 'activa' AND ac.fecha_vencimiento IS NOT NULL AND ac.fecha_vencimiento <= v_limite) x;
    v_res := v_res || jsonb_build_object('certificaciones_flota', v_sec);
  ELSE v_omitidos := array_append(v_omitidos, 'certificaciones_flota');
  END IF;

  v_adm := public.usuario_puede(p_empresa_id, 'rrhh_admin', 'ver');
  v_ope := public.usuario_puede(p_empresa_id, 'rrhh_operativo', 'ver');
  IF v_adm OR v_ope THEN
    SELECT jsonb_build_object('total', count(*), 'vencidos', count(*) FILTER (WHERE x.dias_restantes < 0),
      'contratos', count(*) FILTER (WHERE x.categoria = 'Contractual'),
      'lista', coalesce(jsonb_agg(jsonb_build_object('persona', x.persona, 'tipo_personal', x.personal_tipo, 'documento', x.tipo_doc_nombre, 'categoria', x.categoria, 'fecha_vencimiento', x.fecha_vencimiento, 'dias_restantes', x.dias_restantes) ORDER BY x.fecha_vencimiento) FILTER (WHERE x.orden <= 50), '[]'::jsonb))
    INTO v_sec
    FROM (SELECT h.personal_tipo, h.tipo_doc_nombre, h.categoria, h.fecha_vencimiento, h.dias_restantes,
                 coalesce((SELECT po.nombre FROM public.personal_operativo po WHERE po.id::text = h.personal_id AND po.empresa_id = p_empresa_id),
                          (SELECT pa.nombre FROM public.personal_administrativo pa WHERE pa.id::text = h.personal_id AND pa.empresa_id = p_empresa_id)) AS persona,
                 row_number() OVER (ORDER BY h.fecha_vencimiento) AS orden
            FROM public.calcular_habilitaciones_personal(p_empresa_id) h
           WHERE h.fecha_vencimiento IS NOT NULL AND h.fecha_vencimiento <= v_limite
             AND ((h.personal_tipo = 'operativo' AND v_ope) OR (h.personal_tipo = 'administrativo' AND v_adm))) x;
    v_res := v_res || jsonb_build_object('documentos_personal', v_sec);
  ELSE v_omitidos := array_append(v_omitidos, 'documentos_personal');
  END IF;

  RETURN v_res || jsonb_build_object('sin_permiso', to_jsonb(v_omitidos));
END; $function$;

CREATE OR REPLACE FUNCTION public.asistente_clientes_facturacion(p_empresa_id text, p_desde date DEFAULT NULL, p_hasta date DEFAULT NULL, p_dias_sin_compra integer DEFAULT 90, p_limite integer DEFAULT 10, p_sociedad_id uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_hoy date := (now() AT TIME ZONE 'America/Lima')::date;
  v_hasta date := coalesce(p_hasta, v_hoy);
  v_desde date := coalesce(p_desde, date_trunc('year', v_hoy)::date);
  v_dias integer := least(greatest(coalesce(p_dias_sin_compra, 90), 15), 730);
  v_limite integer := least(greatest(coalesce(p_limite, 10), 1), 50);
  v_alcance uuid[]; v_fin boolean; v_top jsonb; v_inactivos jsonb; v_total_inactivos integer;
BEGIN
  IF v_hasta < v_desde OR v_hasta - v_desde > 1100 THEN RAISE EXCEPTION 'Rango inválido: máximo 36 meses'; END IF;
  v_alcance := public.asistente_autorizar(p_empresa_id, 'facturacion', p_sociedad_id, true);
  v_fin := coalesce((public.asistente_permisos_especiales(p_empresa_id)->>'ver_finanzas')::boolean, false);

  SELECT coalesce(jsonb_agg(to_jsonb(t) - 'orden' ORDER BY t.moneda, t.orden), '[]'::jsonb) INTO v_top
  FROM (
    SELECT q.moneda, q.cliente, q.documentos,
           CASE WHEN v_fin THEN q.facturado_bruto END AS facturado_bruto,
           CASE WHEN v_fin THEN q.notas_credito END AS notas_credito,
           CASE WHEN v_fin THEN round(q.facturado_bruto - q.notas_credito, 2) END AS neto,
           row_number() OVER (PARTITION BY q.moneda ORDER BY q.facturado_bruto DESC, q.cliente) AS orden
    FROM (
      SELECT upper(coalesce(nullif(f.moneda, ''), 'PEN')) AS moneda, coalesce(nullif(cu.razon_social, ''), cu.nombre_comercial, 'Sin cliente') AS cliente,
             count(*) FILTER (WHERE lower(f.tipo_documento) IN ('factura', 'boleta'))::integer AS documentos,
             round(coalesce(sum(f.total) FILTER (WHERE lower(f.tipo_documento) IN ('factura', 'boleta')), 0), 2) AS facturado_bruto,
             round(coalesce(sum(abs(f.total)) FILTER (WHERE lower(f.tipo_documento) = 'nota_credito'), 0), 2) AS notas_credito
        FROM public.facturas f LEFT JOIN public.cuentas cu ON cu.id = f.cuenta_id AND cu.empresa_id = f.empresa_id
       WHERE f.empresa_id = p_empresa_id AND (v_alcance IS NULL OR f.sociedad_id = ANY(v_alcance))
         AND f.fecha_emision BETWEEN v_desde AND v_hasta AND lower(coalesce(f.estado, '')) <> 'anulada'
       GROUP BY 1, 2
    ) q WHERE q.documentos > 0
  ) t WHERE t.orden <= v_limite;

  WITH ult AS (
    SELECT f.cuenta_id, max(f.fecha_emision) AS ultima, count(*)::integer AS documentos
      FROM public.facturas f
     WHERE f.empresa_id = p_empresa_id AND (v_alcance IS NULL OR f.sociedad_id = ANY(v_alcance))
       AND lower(f.tipo_documento) IN ('factura', 'boleta') AND lower(coalesce(f.estado, '')) <> 'anulada' AND f.cuenta_id IS NOT NULL
     GROUP BY f.cuenta_id
  ), ina AS (
    SELECT coalesce(nullif(cu.razon_social, ''), cu.nombre_comercial) AS cliente, u.ultima, v_hoy - u.ultima AS dias_sin_facturar, u.documentos,
           row_number() OVER (ORDER BY u.ultima DESC) AS orden
      FROM ult u JOIN public.cuentas cu ON cu.id = u.cuenta_id AND cu.empresa_id = p_empresa_id
     WHERE u.ultima < v_hoy - v_dias
  )
  SELECT count(*)::integer, coalesce(jsonb_agg(jsonb_build_object('cliente', i.cliente, 'ultima_factura', i.ultima, 'dias_sin_facturar', i.dias_sin_facturar, 'documentos_historicos', i.documentos) ORDER BY i.orden) FILTER (WHERE i.orden <= v_limite), '[]'::jsonb)
    INTO v_total_inactivos, v_inactivos FROM ina i;

  RETURN jsonb_build_object('desde', v_desde, 'hasta', v_hasta,
    'top_clientes_por_moneda', v_top,
    'dias_sin_compra', v_dias, 'clientes_sin_compra_total', v_total_inactivos, 'clientes_sin_compra', v_inactivos,
    'campos_omitidos_por_permiso', CASE WHEN v_fin THEN '[]'::jsonb ELSE '["facturado_bruto","notas_credito","neto"]'::jsonb END,
    'nota', 'Importes son totales de comprobantes emitidos (no saldo por cobrar); no mezclar monedas. Sin compra = sin factura ni boleta emitida en ese número de días.');
END; $function$;

REVOKE ALL ON FUNCTION public.asistente_vencimientos(text, integer, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.asistente_clientes_facturacion(text, date, date, integer, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.asistente_vencimientos(text, integer, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.asistente_clientes_facturacion(text, date, date, integer, integer, uuid) TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.asistente_vencimientos(text, integer, uuid)') IS NULL
     OR to_regprocedure('public.asistente_clientes_facturacion(text, date, date, integer, integer, uuid)') IS NULL THEN
    RAISE EXCEPTION 'Funciones de Aria no creadas';
  END IF;
END $$;
