-- Conteo acotado de referencias para decidir si un CECO o CEBE puede eliminarse.
-- No elimina ni modifica datos. Debe aplicarse antes de habilitar la acción en la UI.

SET ROLE postgres;

BEGIN;

CREATE OR REPLACE FUNCTION public.contar_referencias_centro(
  p_catalogo text,
  p_centro_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $funcion$
DECLARE
  v_empresa_id text;
  v_sociedad_id uuid;
  v_codigo text;
  v_nombre text;
  v_alcance uuid[];
  v_referencias jsonb;
  v_total integer;
  v_hijos integer := 0;
BEGIN
  IF p_catalogo = 'centro_costo' THEN
    SELECT empresa_id, sociedad_id, codigo, nombre
      INTO v_empresa_id, v_sociedad_id, v_codigo, v_nombre
    FROM public.centros_costo
    WHERE id = p_centro_id;
  ELSIF p_catalogo = 'centro_beneficio' THEN
    SELECT empresa_id, sociedad_id, codigo, nombre
      INTO v_empresa_id, v_sociedad_id, v_codigo, v_nombre
    FROM public.centros_beneficio
    WHERE id = p_centro_id;
  ELSE
    RAISE EXCEPTION 'Catalogo de centro no soportado.' USING ERRCODE = '22023';
  END IF;

  IF NOT FOUND
     OR NOT public.usuario_tiene_empresa(v_empresa_id) THEN
    RAISE EXCEPTION 'Centro no disponible para el usuario actual.' USING ERRCODE = '42501';
  END IF;

  v_alcance := public.usuario_alcance_sociedades(v_empresa_id);
  IF v_alcance IS NOT NULL AND NOT (v_sociedad_id = ANY(v_alcance)) THEN
    RAISE EXCEPTION 'Centro no disponible para el usuario actual.' USING ERRCODE = '42501';
  END IF;

  IF p_catalogo = 'centro_costo' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('modulo', modulo, 'cantidad', cantidad) ORDER BY modulo), '[]'::jsonb),
           coalesce(sum(cantidad), 0)::integer
      INTO v_referencias, v_total
    FROM (
      SELECT 'Activos fijos'::text AS modulo, count(*)::integer AS cantidad FROM public.activos WHERE empresa_id = v_empresa_id AND centro_costo_id = p_centro_id
      UNION ALL SELECT 'Caja chica', count(*)::integer FROM public.caja_chica WHERE empresa_id = v_empresa_id AND ceco_id = p_centro_id
      UNION ALL SELECT 'Compras y gastos', count(*)::integer FROM public.compras_gastos WHERE empresa_id = v_empresa_id AND centro_costo_id = p_centro_id
      UNION ALL SELECT 'Cuentas por pagar', count(*)::integer FROM public.cxp WHERE empresa_id = v_empresa_id AND centro_costo_id = p_centro_id
      UNION ALL SELECT 'Nómina', count(*)::integer FROM public.detalle_nomina WHERE empresa_id = v_empresa_id AND centro_costo_id = p_centro_id
      UNION ALL SELECT 'Órdenes de compra', count(*)::integer FROM public.ordenes_compra WHERE empresa_id = v_empresa_id AND centro_costo_id = p_centro_id
      UNION ALL SELECT 'Órdenes de servicio internas', count(*)::integer FROM public.ordenes_servicio_interna WHERE empresa_id = v_empresa_id AND centro_costo_id = p_centro_id
      UNION ALL SELECT 'Órdenes de trabajo', count(*)::integer FROM public.ordenes_trabajo WHERE empresa_id = v_empresa_id AND centro_costo_id = p_centro_id
      UNION ALL SELECT 'Personal administrativo', count(*)::integer FROM public.personal_administrativo WHERE empresa_id = v_empresa_id AND centro_costo_id = p_centro_id
      UNION ALL SELECT 'Personal operativo', count(*)::integer FROM public.personal_operativo WHERE empresa_id = v_empresa_id AND centro_costo_id = p_centro_id
      UNION ALL SELECT 'Presupuestos', count(*)::integer FROM public.presupuestos WHERE empresa_id = v_empresa_id AND centro_costo_id = p_centro_id
      UNION ALL SELECT 'Solicitudes internas', count(*)::integer FROM public.solpe_interna WHERE empresa_id = v_empresa_id AND centro_costo_id = p_centro_id
      UNION ALL SELECT 'Tareos administrativos', count(*)::integer FROM public.tareos_admin WHERE empresa_id = v_empresa_id AND ceco_id = p_centro_id
      UNION ALL SELECT 'Unidades organizacionales', count(*)::integer FROM public.unidades_organizacionales WHERE empresa_id = v_empresa_id AND ceco_id = p_centro_id
      UNION ALL SELECT 'Backlog', count(*)::integer FROM public.backlog WHERE empresa_id = v_empresa_id AND centro_costo IN (p_centro_id, v_codigo, v_nombre)
      UNION ALL SELECT 'Financiamientos', count(*)::integer FROM public.financiamientos WHERE empresa_id = v_empresa_id AND centro_costo IN (p_centro_id, v_codigo, v_nombre)
    ) conteos
    WHERE cantidad > 0;
  ELSE
    SELECT count(*)::integer INTO v_hijos
    FROM public.centros_costo
    WHERE empresa_id = v_empresa_id AND cebe_id = p_centro_id;

    SELECT coalesce(jsonb_agg(jsonb_build_object('modulo', modulo, 'cantidad', cantidad) ORDER BY modulo), '[]'::jsonb),
           coalesce(sum(cantidad), 0)::integer
      INTO v_referencias, v_total
    FROM (
      SELECT 'Cotizaciones'::text AS modulo, count(*)::integer AS cantidad FROM public.cotizaciones WHERE empresa_id = v_empresa_id AND centro_beneficio_id = p_centro_id
      UNION ALL SELECT 'Facturas', count(*)::integer FROM public.facturas WHERE empresa_id = v_empresa_id AND centro_beneficio_id = p_centro_id
      UNION ALL SELECT 'Órdenes de trabajo', count(*)::integer FROM public.ordenes_trabajo WHERE empresa_id = v_empresa_id AND centro_beneficio_id = p_centro_id
      UNION ALL SELECT 'Órdenes de servicio de cliente', count(*)::integer FROM public.os_clientes WHERE empresa_id = v_empresa_id AND centro_beneficio_id = p_centro_id
      UNION ALL SELECT 'Presupuestos', count(*)::integer FROM public.presupuestos WHERE empresa_id = v_empresa_id AND cebe_id = p_centro_id
    ) conteos
    WHERE cantidad > 0;
  END IF;

  RETURN jsonb_build_object(
    'catalogo', p_catalogo,
    'referencias', coalesce(v_referencias, '[]'::jsonb),
    'total_referencias', coalesce(v_total, 0),
    'cecos_hijos', v_hijos
  );
END;
$funcion$;

REVOKE ALL ON FUNCTION public.contar_referencias_centro(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.contar_referencias_centro(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.contar_referencias_centro(text, text) TO authenticated;

COMMIT;
