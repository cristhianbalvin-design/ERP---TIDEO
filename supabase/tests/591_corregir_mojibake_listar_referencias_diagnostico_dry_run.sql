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

CREATE TEMP TABLE dry_visible_results (
  result text,
  row_count bigint,
  contains_mojibake boolean,
  contains_separator boolean,
  output text,
  sqlstate text,
  message text,
  body_md5 text
);
GRANT INSERT, SELECT ON dry_visible_results TO authenticated;

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

  RAISE EXCEPTION USING
    MESSAGE = format(U&'Tipo de referencia no v\00E1lido: %s', p_tipo),
    ERRCODE = '22023';
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

WITH behavior AS (
  SELECT
    count(*) AS row_count,
    coalesce(string_agg(coalesce(activo, ''), E'\n'), '') AS output
  FROM public.listar_referencias_diagnostico(
    'emp_2000000000',
    'mantenimiento',
    NULL
  )
)
INSERT INTO dry_visible_results (
  result,
  row_count,
  contains_mojibake,
  contains_separator,
  output
)
SELECT
  'BEHAVIOR_VISIBLE' AS result,
  row_count,
  position(U&'\00C2' IN output) > 0 AS contains_mojibake,
  position(U&'\00B7' IN output) > 0 AS contains_separator,
  output
FROM behavior;

DO $$
DECLARE
  v_sqlstate text;
  v_message text;
BEGIN
  BEGIN
    PERFORM 1
    FROM public.listar_referencias_diagnostico(
      'emp_2000000000',
      'tipo_invalido_para_prueba',
      NULL
    );
    ASSERT false,
      'INVALID_TYPE_FAILED: no se produjo SQLSTATE 22023';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    GET STACKED DIAGNOSTICS
      v_sqlstate = RETURNED_SQLSTATE,
      v_message = MESSAGE_TEXT;
  END;

  ASSERT v_sqlstate = '22023',
    format('INVALID_TYPE_FAILED: sqlstate=%s', v_sqlstate);
  ASSERT position(U&'v\00E1lido' IN v_message) > 0,
    format('INVALID_TYPE_FAILED: mensaje no contiene válido: %s', v_message);
  ASSERT position(U&'\00C3' IN v_message) = 0,
    format('INVALID_TYPE_FAILED: mensaje contiene U+00C3: %s', v_message);
  ASSERT position(U&'\00C2' IN v_message) = 0,
    format('INVALID_TYPE_FAILED: mensaje contiene U+00C2: %s', v_message);

  INSERT INTO dry_visible_results (result, sqlstate, message)
  VALUES ('INVALID_TYPE_VISIBLE', v_sqlstate, v_message);
END;
$$;

SET LOCAL ROLE postgres;

create or replace function public.listar_referencias_diagnostico(
  p_empresa_id text,
  p_tipo text,
  p_busqueda text default null
)
returns table (
  id text,
  numero text,
  cliente text,
  activo text,
  sociedad_id uuid
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_sociedades uuid[];
  v_busqueda text := nullif(btrim(p_busqueda), '');
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    return;
  end if;

  if not public.usuario_puede(
    p_empresa_id,
    'diagnostico_tecnico',
    'ver'
  ) then
    return;
  end if;

  v_sociedades := public.usuario_alcance_sociedades(p_empresa_id);

  if p_tipo = 'mantenimiento' then
    return query
    select
      r.id,
      r.numero,
      coalesce(
        nullif(btrim(c.razon_social), ''),
        nullif(btrim(c.nombre_comercial), ''),
        c.id
      ) as cliente,
      concat_ws(
        ' Â· ',
        a.codigo,
        a.nombre,
        a.marca,
        a.modelo,
        a.placa_serie
      ) as activo,
      r.sociedad_id
    from public.recepciones_activos_cliente r
    join public.activos a
      on a.id = r.activo_id
     and a.empresa_id = r.empresa_id
    left join public.cuentas c
      on c.id = a.cliente_propietario_id
     and c.empresa_id = r.empresa_id
    where r.empresa_id = p_empresa_id
      and (
        v_sociedades is null
        or (
          r.sociedad_id is not null
          and r.sociedad_id = any(v_sociedades)
        )
      )
      and (
        v_busqueda is null
        or r.numero ilike '%' || v_busqueda || '%'
        or coalesce(c.razon_social, '') ilike '%' || v_busqueda || '%'
        or coalesce(c.nombre_comercial, '') ilike '%' || v_busqueda || '%'
        or concat_ws(
          ' ',
          a.codigo,
          a.nombre,
          a.marca,
          a.modelo,
          a.placa_serie
        ) ilike '%' || v_busqueda || '%'
      )
    order by r.numero;

    return;
  end if;

  if p_tipo = 'fabricacion' then
    return query
    select
      o.id,
      o.nombre,
      coalesce(
        nullif(btrim(c.razon_social), ''),
        nullif(btrim(c.nombre_comercial), ''),
        c.id
      ) as cliente,
      null::text as activo,
      null::uuid as sociedad_id
    from public.oportunidades o
    left join public.cuentas c
      on c.id = o.cuenta_id
     and c.empresa_id = o.empresa_id
    where o.empresa_id = p_empresa_id
      and o.estado = 'abierta'
      and (
        v_busqueda is null
        or o.nombre ilike '%' || v_busqueda || '%'
        or coalesce(c.razon_social, '') ilike '%' || v_busqueda || '%'
        or coalesce(c.nombre_comercial, '') ilike '%' || v_busqueda || '%'
      )
    order by o.nombre, o.id;

    return;
  end if;

  raise exception 'Tipo de referencia no vÃ¡lido: %', p_tipo
    using errcode = '22023';
end;
$function$;

DO $$
DECLARE
  v_body_md5 text;
BEGIN
  SELECT md5(pg_get_functiondef(p.oid))
    INTO v_body_md5
  FROM pg_proc p
  WHERE p.oid = 'public.listar_referencias_diagnostico(text,text,text)'::regprocedure;

  ASSERT v_body_md5 = '9fb853397728ae6240828845df59a319',
    format('REVERT_FAILED: md5=%s esperado=9fb853397728ae6240828845df59a319', v_body_md5);

  INSERT INTO dry_visible_results (result, body_md5)
  VALUES ('REVERT_MD5_VISIBLE', v_body_md5);
END;
$$;

SELECT *
FROM dry_visible_results
ORDER BY result;

ROLLBACK;

DO $$
DECLARE
  v_body_md5 text;
  v_proacl aclitem[];
  v_proowner text;
  v_prosecdef boolean;
  v_proconfig text[];
  v_provolatile "char";
BEGIN
  SELECT
    md5(pg_get_functiondef(p.oid)),
    p.proacl,
    p.proowner::regrole::text,
    p.prosecdef,
    p.proconfig,
    p.provolatile
    INTO
      v_body_md5,
      v_proacl,
      v_proowner,
      v_prosecdef,
      v_proconfig,
      v_provolatile
  FROM pg_proc p
  WHERE p.oid = 'public.listar_referencias_diagnostico(text,text,text)'::regprocedure;

  ASSERT v_body_md5 = '9fb853397728ae6240828845df59a319',
    format('POST_ROLLBACK_FAILED: md5=%s esperado=9fb853397728ae6240828845df59a319', v_body_md5);
  ASSERT v_proacl IS NOT DISTINCT FROM '{postgres=X/postgres,authenticated=X/postgres}'::aclitem[],
    'POST_ROLLBACK_FAILED: proacl';
  ASSERT v_proowner = 'postgres',
    format('POST_ROLLBACK_FAILED: proowner=%s', v_proowner);
  ASSERT v_prosecdef IS TRUE,
    'POST_ROLLBACK_FAILED: prosecdef';
  ASSERT v_proconfig IS NOT DISTINCT FROM ARRAY['search_path=public, pg_temp']::text[],
    'POST_ROLLBACK_FAILED: proconfig';
  ASSERT v_provolatile = 's',
    format('POST_ROLLBACK_FAILED: provolatile=%s', v_provolatile);
  RAISE NOTICE 'POST_ROLLBACK_OK: md5=%; proacl=%; proowner=%; prosecdef=%; proconfig=%; provolatile=%',
    v_body_md5, v_proacl, v_proowner, v_prosecdef, v_proconfig, v_provolatile;
END;
$$;
