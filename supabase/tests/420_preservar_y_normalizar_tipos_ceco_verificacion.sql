-- Fase 1.3, version de verificacion. Revierte todos los cambios.
-- No aplicar junto con la migracion de aplicacion.

SET ROLE postgres;

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '5min';

LOCK TABLE public.centros_costo IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.centros_costo ADD COLUMN IF NOT EXISTS tipo_original text;

DO $preflight$
DECLARE
BEGIN
  IF EXISTS (SELECT 1 FROM public.centros_costo WHERE tipo_original IS NOT NULL) THEN
    RAISE EXCEPTION 'CECO_TIPO_NORMALIZACION: tipo_original ya contiene valores.';
  END IF;
END
$preflight$;

UPDATE public.centros_costo SET tipo_original = tipo;

DO $cobertura_mapeo$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.centros_costo
    WHERE tipo_original NOT IN (
      'area_funcional', 'areas', 'componente', 'equipo',
      'fabricacion', 'cliente', 'proyecto', 'temporal'
    )
  ) THEN
    RAISE EXCEPTION 'CECO_TIPO_NORMALIZACION: tipo original fuera del mapeo aprobado.';
  END IF;
END
$cobertura_mapeo$;

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

ALTER TABLE public.centros_costo DROP CONSTRAINT IF EXISTS centros_costo_tipo_check;
ALTER TABLE public.centros_costo ADD CONSTRAINT centros_costo_tipo_check
  CHECK (tipo IN ('area_funcional', 'proyecto', 'temporal'));

CREATE OR REPLACE FUNCTION public.proteger_tipo_original_centro_costo()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $funcion$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.tipo_original IS NOT NULL THEN
    RAISE EXCEPTION 'CECO_TIPO_ORIGINAL: tipo_original es historico y no admite valores en nuevas filas.' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.tipo_original IS DISTINCT FROM OLD.tipo_original THEN
    RAISE EXCEPTION 'CECO_TIPO_ORIGINAL: tipo_original es append-only y no puede modificarse.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$funcion$;

DROP TRIGGER IF EXISTS aa_centros_costo_proteger_tipo_original ON public.centros_costo;
CREATE TRIGGER aa_centros_costo_proteger_tipo_original
BEFORE INSERT OR UPDATE OF tipo_original
ON public.centros_costo FOR EACH ROW EXECUTE FUNCTION public.proteger_tipo_original_centro_costo();

CREATE TEMP TABLE verificar_tipo_original_420 (
  tipo_original text
) ON COMMIT DROP;

CREATE TRIGGER aa_verificar_tipo_original_420
BEFORE INSERT OR UPDATE OF tipo_original
ON verificar_tipo_original_420
FOR EACH ROW EXECUTE FUNCTION public.proteger_tipo_original_centro_costo();

INSERT INTO verificar_tipo_original_420 (tipo_original) VALUES (NULL);

DO $append_only$
BEGIN
  BEGIN
    INSERT INTO verificar_tipo_original_420 (tipo_original) VALUES ('equipo');
    RAISE EXCEPTION 'CECO_TIPO_ORIGINAL: se permitio valor original en una fila nueva.';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    UPDATE verificar_tipo_original_420 SET tipo_original = 'equipo';
    RAISE EXCEPTION 'CECO_TIPO_ORIGINAL: se permitio modificar tipo_original.';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END
$append_only$;

DO $verificar$
BEGIN
  IF EXISTS (SELECT 1 FROM public.centros_costo WHERE tipo_original IS NULL) THEN
    RAISE EXCEPTION 'CECO_TIPO_NORMALIZACION: no se preservaron todos los tipos originales.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.centros_costo WHERE tipo NOT IN ('area_funcional', 'proyecto', 'temporal')) THEN
    RAISE EXCEPTION 'CECO_TIPO_NORMALIZACION: quedo un tipo fuera del conjunto normalizado.';
  END IF;
END
$verificar$;

ROLLBACK;
