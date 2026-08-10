-- Fase 1.4: invariante societaria bidireccional entre CECO y CEBE padre.
-- Idempotente. El vinculo cebe_id continua siendo opcional.

SET ROLE postgres;

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '5min';

LOCK TABLE public.centros_costo, public.centros_beneficio IN SHARE ROW EXCLUSIVE MODE;

DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.centros_costo cc
    JOIN public.centros_beneficio cb ON cb.id = cc.cebe_id
    WHERE cc.cebe_id IS NOT NULL
      AND (
        cc.empresa_id IS DISTINCT FROM cb.empresa_id
        OR cc.sociedad_id IS DISTINCT FROM cb.sociedad_id
      )
  ) THEN
    RAISE EXCEPTION
      'CECO_CEBE_SOCIEDAD: existen relaciones historicas CECO/CEBE incoherentes; no se instalan triggers.';
  END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION public.validar_coherencia_societaria_ceco_cebe()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $funcion$
DECLARE
  v_empresa_cebe text;
  v_sociedad_cebe uuid;
BEGIN
  IF TG_TABLE_NAME = 'centros_costo' THEN
    IF NEW.cebe_id IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT empresa_id, sociedad_id
    INTO v_empresa_cebe, v_sociedad_cebe
    FROM public.centros_beneficio
    WHERE id = NEW.cebe_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'CECO_CEBE_SOCIEDAD: el CEBE padre % no existe.', NEW.cebe_id
        USING ERRCODE = '23503';
    END IF;

    IF NEW.empresa_id IS DISTINCT FROM v_empresa_cebe
       OR NEW.sociedad_id IS DISTINCT FROM v_sociedad_cebe THEN
      RAISE EXCEPTION
        'CECO_CEBE_SOCIEDAD: CECO y CEBE padre deben pertenecer a la misma empresa y sociedad.'
        USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'centros_beneficio' THEN
    IF EXISTS (
      SELECT 1
      FROM public.centros_costo cc
      WHERE cc.cebe_id = NEW.id
        AND (
          cc.empresa_id IS DISTINCT FROM NEW.empresa_id
          OR cc.sociedad_id IS DISTINCT FROM NEW.sociedad_id
        )
    ) THEN
      RAISE EXCEPTION
        'CECO_CEBE_SOCIEDAD: no se puede cambiar empresa o sociedad del CEBE porque dejaria CECOs hijos incoherentes.'
        USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'CECO_CEBE_SOCIEDAD: tabla de trigger no soportada: %.', TG_TABLE_NAME;
END
$funcion$;

DROP TRIGGER IF EXISTS aa_centros_costo_validar_cebe_sociedad ON public.centros_costo;
CREATE TRIGGER aa_centros_costo_validar_cebe_sociedad
BEFORE INSERT OR UPDATE OF cebe_id, empresa_id, sociedad_id
ON public.centros_costo
FOR EACH ROW EXECUTE FUNCTION public.validar_coherencia_societaria_ceco_cebe();

DROP TRIGGER IF EXISTS aa_centros_beneficio_validar_hijos_sociedad ON public.centros_beneficio;
CREATE TRIGGER aa_centros_beneficio_validar_hijos_sociedad
BEFORE UPDATE OF empresa_id, sociedad_id
ON public.centros_beneficio
FOR EACH ROW EXECUTE FUNCTION public.validar_coherencia_societaria_ceco_cebe();

COMMIT;
