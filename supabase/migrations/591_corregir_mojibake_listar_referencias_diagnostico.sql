-- 591_corregir_mojibake_listar_referencias_diagnostico.sql
-- Corrige exclusivamente el separador y el mensaje de error mojibake de
-- listar_referencias_diagnostico.
-- No modifica resolver_referencias_diagnostico ni otras funciones.

BEGIN;

CREATE TEMP TABLE _591_before ON COMMIT DROP AS
SELECT
  p.oid,
  md5(pg_get_functiondef(p.oid)) AS body_md5,
  p.proacl,
  p.proowner::regrole::text AS proowner,
  p.prosecdef,
  p.proconfig,
  p.provolatile
FROM pg_proc p
WHERE p.oid = 'public.listar_referencias_diagnostico(text,text,text)'::regprocedure;

DO $$
DECLARE
  v_body_md5 text;
BEGIN
  SELECT body_md5 INTO v_body_md5 FROM _591_before;
  ASSERT v_body_md5 = '9fb853397728ae6240828845df59a319',
    format('PRECONDITION_FAILED: md5 actual=%s esperado=9fb853397728ae6240828845df59a319', v_body_md5);
END;
$$;

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
        U&' \00B7 ',
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

  RAISE EXCEPTION USING
    MESSAGE = format(U&'Tipo de referencia no v\00E1lido: %s', p_tipo),
    ERRCODE = '22023';
END;
$function$;

DO $$
DECLARE
  v_before _591_before%ROWTYPE;
  v_after record;
BEGIN
  SELECT * INTO v_before FROM _591_before;
  SELECT
    p.proacl,
    p.proowner::regrole::text AS proowner,
    p.prosecdef,
    p.proconfig,
    p.provolatile
  INTO v_after
  FROM pg_proc p
  WHERE p.oid = v_before.oid;

  ASSERT v_after.proacl IS NOT DISTINCT FROM v_before.proacl,
    'ATTRIBUTE_CHANGED: proacl';
  ASSERT v_after.proowner IS NOT DISTINCT FROM v_before.proowner,
    'ATTRIBUTE_CHANGED: proowner';
  ASSERT v_after.prosecdef IS NOT DISTINCT FROM v_before.prosecdef,
    'ATTRIBUTE_CHANGED: prosecdef';
  ASSERT v_after.proconfig IS NOT DISTINCT FROM v_before.proconfig,
    'ATTRIBUTE_CHANGED: proconfig';
  ASSERT v_after.provolatile IS NOT DISTINCT FROM v_before.provolatile,
    'ATTRIBUTE_CHANGED: provolatile';
END;
$$;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"30bc196b-808f-4f4b-a3ec-9bfe6b8f7837","role":"authenticated"}',
  true
);

DO $$
DECLARE
  v_output text;
BEGIN
  SELECT coalesce(string_agg(coalesce(activo, ''), E'\n'), '')
    INTO v_output
  FROM public.listar_referencias_diagnostico(
    'emp_2000000000',
    'mantenimiento',
    NULL
  );

  ASSERT position(U&'\00C2' IN v_output) = 0,
    'POSTCONDITION_FAILED: la salida contiene U+00C2';
  ASSERT position(U&'\00C3' IN v_output) = 0,
    'POSTCONDITION_FAILED: la salida contiene U+00C3';
END;
$$;

COMMIT;
