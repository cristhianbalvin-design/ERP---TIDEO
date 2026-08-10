-- Fase 1.3: preserva el tipo historico y normaliza el eje operativo de CECO.
-- No idempotente por diseno: es un backfill historico de una sola vez.
-- Preserva todas las filas existentes y aborta si aparece un tipo no mapeado.

SET ROLE postgres;

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '5min';

LOCK TABLE public.centros_costo IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.centros_costo
  ADD COLUMN IF NOT EXISTS tipo_original text;

DO $preflight$
DECLARE
  v_con_tipo_original bigint;
BEGIN
  SELECT count(*) FILTER (WHERE tipo_original IS NOT NULL)
  INTO v_con_tipo_original
  FROM public.centros_costo;

  IF v_con_tipo_original <> 0 THEN
    RAISE EXCEPTION
      'CECO_TIPO_NORMALIZACION: tipo_original ya contiene % filas; este backfill historico no se puede reaplicar.',
      v_con_tipo_original;
  END IF;

END
$preflight$;

-- Preservacion append-only del valor previo a la consolidacion.
UPDATE public.centros_costo
SET tipo_original = tipo;

DO $cobertura_mapeo$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.centros_costo
    WHERE tipo_original NOT IN (
      'area_funcional', 'areas', 'componente', 'equipo',
      'fabricacion', 'cliente', 'proyecto', 'temporal'
    )
  ) THEN
    RAISE EXCEPTION
      'CECO_TIPO_NORMALIZACION: tipo_original contiene un valor fuera del mapeo aprobado; se revierte la transaccion.';
  END IF;
END
$cobertura_mapeo$;

DO $copia_completa$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.centros_costo
    WHERE tipo_original IS NULL
  ) THEN
    RAISE EXCEPTION 'CECO_TIPO_NORMALIZACION: la copia de tipo_original quedo incompleta.';
  END IF;
END
$copia_completa$;

-- Solo despues de preservar todo el valor original se consolida el tipo activo.
UPDATE public.centros_costo
SET tipo = CASE tipo
  WHEN 'areas' THEN 'area_funcional'
  WHEN 'componente' THEN 'area_funcional'
  WHEN 'equipo' THEN 'area_funcional'
  WHEN 'fabricacion' THEN 'area_funcional'
  WHEN 'cliente' THEN 'area_funcional'
  ELSE tipo
END
WHERE tipo IN ('areas', 'componente', 'equipo', 'fabricacion', 'cliente');

DO $reporte$
DECLARE
  v_copiadas bigint;
  v_consolidadas bigint;
BEGIN
  SELECT count(*) INTO v_copiadas
  FROM public.centros_costo
  WHERE tipo_original IS NOT NULL;

  SELECT count(*) INTO v_consolidadas
  FROM public.centros_costo
  WHERE tipo_original IN ('areas', 'componente', 'equipo', 'fabricacion', 'cliente')
    AND tipo = 'area_funcional';

  RAISE NOTICE
    'CECO_TIPO_NORMALIZACION: filas_copiadas=%, filas_consolidadas=%',
    v_copiadas, v_consolidadas;
END
$reporte$;

ALTER TABLE public.centros_costo
  DROP CONSTRAINT IF EXISTS centros_costo_tipo_check;

ALTER TABLE public.centros_costo
  ADD CONSTRAINT centros_costo_tipo_check
  CHECK (tipo IN ('area_funcional', 'proyecto', 'temporal'));

CREATE OR REPLACE FUNCTION public.proteger_tipo_original_centro_costo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $funcion$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.tipo_original IS NOT NULL THEN
    RAISE EXCEPTION
      'CECO_TIPO_ORIGINAL: tipo_original es historico y no admite valores en nuevas filas.'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.tipo_original IS DISTINCT FROM OLD.tipo_original THEN
    RAISE EXCEPTION
      'CECO_TIPO_ORIGINAL: tipo_original es append-only y no puede modificarse.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$funcion$;

DROP TRIGGER IF EXISTS aa_centros_costo_proteger_tipo_original ON public.centros_costo;
CREATE TRIGGER aa_centros_costo_proteger_tipo_original
BEFORE INSERT OR UPDATE OF tipo_original
ON public.centros_costo
FOR EACH ROW EXECUTE FUNCTION public.proteger_tipo_original_centro_costo();

COMMIT;
