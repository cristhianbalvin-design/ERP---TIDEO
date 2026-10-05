-- TIDEO ERP - Reversion de 591_corregir_mojibake_listar_referencias_diagnostico.sql
-- Ejecutar unicamente de forma explicita y controlada.
-- Esta reversion restaura el separador U+00C2 U+00B7 y el mensaje de error
-- anterior en
-- public.listar_referencias_diagnostico(text, text, text).
-- No es una migracion y no debe copiarse al directorio supabase/migrations.

CREATE OR REPLACE FUNCTION public.listar_referencias_diagnostico(
  p_empresa_id text,
  p_tipo text,
  p_busqueda text default null
)
RETURNS TABLE (
  id text,
  numero text,
  cliente text,
  activo text,
  sociedad_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_sociedades uuid[];
  v_busqueda text := nullif(btrim(p_busqueda), '');
BEGIN
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN
    RETURN;
  END IF;

  IF NOT public.usuario_puede(
    p_empresa_id,
    'diagnostico_tecnico',
    'ver'
  ) THEN
    RETURN;
  END IF;

  v_sociedades := public.usuario_alcance_sociedades(p_empresa_id);

  IF p_tipo = 'mantenimiento' THEN
    RETURN QUERY
    SELECT
      r.id,
      r.numero,
      coalesce(
        nullif(btrim(c.razon_social), ''),
        nullif(btrim(c.nombre_comercial), ''),
        c.id
      ) AS cliente,
      concat_ws(
        U&' \00C2\00B7 ',
        a.codigo,
        a.nombre,
        a.marca,
        a.modelo,
        a.placa_serie
      ) AS activo,
      r.sociedad_id
    FROM public.recepciones_activos_cliente r
    JOIN public.activos a
      ON a.id = r.activo_id
     AND a.empresa_id = r.empresa_id
    LEFT JOIN public.cuentas c
      ON c.id = a.cliente_propietario_id
     AND c.empresa_id = r.empresa_id
    WHERE r.empresa_id = p_empresa_id
      AND (
        v_sociedades IS NULL
        OR (
          r.sociedad_id IS NOT NULL
          AND r.sociedad_id = ANY(v_sociedades)
        )
      )
      AND (
        v_busqueda IS NULL
        OR r.numero ILIKE '%' || v_busqueda || '%'
        OR coalesce(c.razon_social, '') ILIKE '%' || v_busqueda || '%'
        OR coalesce(c.nombre_comercial, '') ILIKE '%' || v_busqueda || '%'
        OR concat_ws(
          ' ',
          a.codigo,
          a.nombre,
          a.marca,
          a.modelo,
          a.placa_serie
        ) ILIKE '%' || v_busqueda || '%'
      )
    ORDER BY r.numero;

    RETURN;
  END IF;

  IF p_tipo = 'fabricacion' THEN
    RETURN QUERY
    SELECT
      o.id,
      o.nombre,
      coalesce(
        nullif(btrim(c.razon_social), ''),
        nullif(btrim(c.nombre_comercial), ''),
        c.id
      ) AS cliente,
      null::text AS activo,
      null::uuid AS sociedad_id
    FROM public.oportunidades o
    LEFT JOIN public.cuentas c
      ON c.id = o.cuenta_id
     AND c.empresa_id = o.empresa_id
    WHERE o.empresa_id = p_empresa_id
      AND o.estado = 'abierta'
      AND (
        v_busqueda IS NULL
        OR o.nombre ILIKE '%' || v_busqueda || '%'
        OR coalesce(c.razon_social, '') ILIKE '%' || v_busqueda || '%'
        OR coalesce(c.nombre_comercial, '') ILIKE '%' || v_busqueda || '%'
      )
    ORDER BY o.nombre, o.id;

    RETURN;
  END IF;

  RAISE EXCEPTION 'Tipo de referencia no vÃ¡lido: %', p_tipo
    USING errcode = '22023';
END;
$function$;
