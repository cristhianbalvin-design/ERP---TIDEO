BEGIN;
SET LOCAL ROLE postgres;

CREATE TEMP TABLE dry_before AS
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
  SELECT body_md5 INTO v_body_md5 FROM dry_before;
  ASSERT v_body_md5 = '9fb853397728ae6240828845df59a319',
    format('PRECONDITION_FAILED: md5 actual=%s esperado=9fb853397728ae6240828845df59a319', v_body_md5);
END;
$$;

-- supabase db query --linked no interpreta metacomandos psql como \ir.
-- Este es el mismo CREATE OR REPLACE de
-- migrations/591_corregir_mojibake_listar_referencias_diagnostico.sql,
-- ejecutado literalmente dentro de esta misma transaccion.
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

  RAISE EXCEPTION 'Tipo de referencia no válido: %', p_tipo
    USING errcode = '22023';
END;
$function$;

DO $$
DECLARE
  v_before dry_before%ROWTYPE;
  v_after record;
BEGIN
  SELECT * INTO v_before FROM dry_before;
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

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"30bc196b-808f-4f4b-a3ec-9bfe6b8f7837","role":"authenticated"}',
  true
);

DO $$
DECLARE
  v_count bigint;
  v_output text;
BEGIN
  SELECT count(*), coalesce(string_agg(coalesce(activo, ''), E'\n'), '')
    INTO v_count, v_output
  FROM public.listar_referencias_diagnostico(
    'emp_2000000000',
    'mantenimiento',
    NULL
  );

  ASSERT v_count > 0,
    format('BEHAVIOR_FAILED: PRUEBA no devolvio referencias de mantenimiento; filas=%s', v_count);
  ASSERT position(U&'\00C2' IN v_output) = 0,
    'BEHAVIOR_FAILED: la salida contiene U+00C2';
  ASSERT position(U&'\00B7' IN v_output) > 0,
    'BEHAVIOR_FAILED: la salida no contiene U+00B7';

  RAISE NOTICE 'BEHAVIOR_OK: filas=%; contiene_mojibake=%; contiene_separador=%',
    v_count,
    position(U&'\00C2' IN v_output) > 0,
    position(U&'\00B7' IN v_output) > 0;
END;
$$;

ROLLBACK;

SELECT
  md5(pg_get_functiondef(p.oid)) AS body_md5_after_rollback,
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
  SELECT md5(pg_get_functiondef(p.oid))
    INTO v_body_md5
  FROM pg_proc p
  WHERE p.oid = 'public.listar_referencias_diagnostico(text,text,text)'::regprocedure;

  ASSERT v_body_md5 = '9fb853397728ae6240828845df59a319',
    format('POST_ROLLBACK_FAILED: md5=%s esperado=9fb853397728ae6240828845df59a319', v_body_md5);
  RAISE NOTICE 'POST_ROLLBACK_OK: md5=%', v_body_md5;
END;
$$;
