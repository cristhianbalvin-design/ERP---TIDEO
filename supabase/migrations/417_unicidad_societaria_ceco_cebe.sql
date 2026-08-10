-- Fase 0.1: unicidad de codigo por tenant, sociedad y catalogo.
-- Idempotente: valida la version, los datos y los indices existentes antes de alterar.
-- PostgreSQL 15+ es requerido por UNIQUE NULLS NOT DISTINCT.

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
    SELECT 1
    FROM public.centros_costo
    GROUP BY empresa_id, sociedad_id, codigo
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'CECO_CEBE_UNICIDAD: existen colisiones en public.centros_costo.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.centros_beneficio
    GROUP BY empresa_id, sociedad_id, codigo
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'CECO_CEBE_UNICIDAD: existen colisiones en public.centros_beneficio.';
  END IF;
END
$preflight$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_centros_costo_empresa_sociedad_codigo_unq
  ON public.centros_costo (empresa_id, sociedad_id, codigo) NULLS NOT DISTINCT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_centros_beneficio_empresa_sociedad_codigo_unq
  ON public.centros_beneficio (empresa_id, sociedad_id, codigo) NULLS NOT DISTINCT;

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

ALTER TABLE public.centros_costo
  DROP CONSTRAINT IF EXISTS centros_costo_empresa_id_codigo_key;

ALTER TABLE public.centros_beneficio
  DROP CONSTRAINT IF EXISTS centros_beneficio_empresa_id_codigo_key;

COMMIT;
