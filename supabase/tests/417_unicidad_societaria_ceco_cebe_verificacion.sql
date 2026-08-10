-- Fase 0.1, version de verificacion. Ejecuta la misma transformacion y revierte todo.
-- No aplicar junto con la migracion de aplicacion.

SET ROLE postgres;

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '5min';

LOCK TABLE public.centros_costo, public.centros_beneficio IN SHARE ROW EXCLUSIVE MODE;

DO $preflight$
BEGIN
  IF current_setting('server_version_num')::integer < 150000 THEN
    RAISE EXCEPTION
      'CECO_CEBE_UNICIDAD: PostgreSQL 15+ es requerido para UNIQUE NULLS NOT DISTINCT; version actual=%.',
      current_setting('server_version_num');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.centros_costo
    GROUP BY empresa_id, sociedad_id, codigo HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'CECO_CEBE_UNICIDAD: existen colisiones en public.centros_costo.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.centros_beneficio
    GROUP BY empresa_id, sociedad_id, codigo HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'CECO_CEBE_UNICIDAD: existen colisiones en public.centros_beneficio.';
  END IF;
END
$preflight$;

DO $$ BEGIN
  RAISE NOTICE '417 preflight: PostgreSQL compatible y sin colisiones existentes.';
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_centros_costo_empresa_sociedad_codigo_unq
  ON public.centros_costo (empresa_id, sociedad_id, codigo) NULLS NOT DISTINCT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_centros_beneficio_empresa_sociedad_codigo_unq
  ON public.centros_beneficio (empresa_id, sociedad_id, codigo) NULLS NOT DISTINCT;

DO $$ BEGIN
  RAISE NOTICE '417 indices: creados o reutilizados con NULLS NOT DISTINCT.';
END $$;

DO $validar_indices$
DECLARE
  v_indice text;
BEGIN
  FOREACH v_indice IN ARRAY ARRAY[
    'idx_centros_costo_empresa_sociedad_codigo_unq',
    'idx_centros_beneficio_empresa_sociedad_codigo_unq'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_index i
      JOIN pg_class idx ON idx.oid = i.indexrelid
      JOIN pg_class tabla ON tabla.oid = i.indrelid
      JOIN pg_namespace n ON n.oid = tabla.relnamespace
      WHERE n.nspname = 'public'
        AND idx.relname = v_indice
        AND i.indisunique
        AND i.indnullsnotdistinct
        AND i.indpred IS NULL
        AND (
          SELECT array_agg(a.attname ORDER BY claves.ordinality)
          FROM unnest(i.indkey) WITH ORDINALITY AS claves(attnum, ordinality)
          JOIN pg_attribute a
            ON a.attrelid = tabla.oid
           AND a.attnum = claves.attnum
        ) = ARRAY['empresa_id', 'sociedad_id', 'codigo']::name[]
    ) THEN
      RAISE EXCEPTION
        'CECO_CEBE_UNICIDAD: el indice % no tiene la definicion esperada.',
        v_indice;
    END IF;
  END LOOP;
END
$validar_indices$;

DO $$ BEGIN
  RAISE NOTICE '417 indices: definicion validada.';
END $$;

ALTER TABLE public.centros_costo
  DROP CONSTRAINT IF EXISTS centros_costo_empresa_id_codigo_key;

ALTER TABLE public.centros_beneficio
  DROP CONSTRAINT IF EXISTS centros_beneficio_empresa_id_codigo_key;

CREATE TEMP TABLE verificar_nulls_not_distinct (
  empresa_id text NOT NULL,
  sociedad_id uuid NULL,
  codigo text NOT NULL,
  UNIQUE NULLS NOT DISTINCT (empresa_id, sociedad_id, codigo)
) ON COMMIT DROP;

INSERT INTO verificar_nulls_not_distinct (empresa_id, sociedad_id, codigo)
VALUES ('tenant_prueba_sin_multisociedad', NULL, 'CODIGO-001');

DO $prueba_sin_multisociedad$
BEGIN
  BEGIN
    INSERT INTO verificar_nulls_not_distinct (empresa_id, sociedad_id, codigo)
    VALUES ('tenant_prueba_sin_multisociedad', NULL, 'CODIGO-001');
    RAISE EXCEPTION 'CECO_CEBE_UNICIDAD: la prueba NULL no rechazo duplicado.';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END
$prueba_sin_multisociedad$;

DO $$ BEGIN
  RAISE NOTICE '417 caso sin multisociedad: duplicado (tenant, NULL, codigo) rechazado.';
END $$;

INSERT INTO verificar_nulls_not_distinct (empresa_id, sociedad_id, codigo)
VALUES
  ('tenant_prueba_multisociedad', '00000000-0000-0000-0000-000000000001', 'CODIGO-001'),
  ('tenant_prueba_multisociedad', '00000000-0000-0000-0000-000000000002', 'CODIGO-001');

DO $prueba_multisociedad$
BEGIN
  BEGIN
    INSERT INTO verificar_nulls_not_distinct (empresa_id, sociedad_id, codigo)
    VALUES ('tenant_prueba_multisociedad', '00000000-0000-0000-0000-000000000001', 'CODIGO-001');
    RAISE EXCEPTION 'CECO_CEBE_UNICIDAD: la prueba societaria no rechazo duplicado.';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END
$prueba_multisociedad$;

DO $$ BEGIN
  RAISE NOTICE '417 caso multisociedad: mismo codigo en dos sociedades distintas aceptado; duplicado dentro de una sociedad rechazado.';
END $$;

DO $$ BEGIN
  RAISE NOTICE '417 verificacion completa: se revierte toda la transaccion.';
END $$;

ROLLBACK;
