-- Fase 1.1: tipo estructural de CEBE, facturabilidad y vigencia.
-- Idempotente. No reclasifica ni modifica CEBEs existentes.

SET ROLE postgres;

BEGIN;

SET LOCAL lock_timeout = '15s';
SET LOCAL statement_timeout = '5min';

LOCK TABLE public.centros_beneficio IN SHARE ROW EXCLUSIVE MODE;

DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.centros_beneficio
    WHERE tipo NOT IN ('linea_servicio', 'cliente', 'proyecto', 'producto', 'temporal')
  ) THEN
    RAISE EXCEPTION 'CEBE_ESTRUCTURAL: existen tipos historicos fuera del conjunto vigente; no se altera el check.';
  END IF;
END
$preflight$;

ALTER TABLE public.centros_beneficio
  DROP CONSTRAINT IF EXISTS centros_beneficio_tipo_check;

ALTER TABLE public.centros_beneficio
  ADD CONSTRAINT centros_beneficio_tipo_check
  CHECK (tipo IN ('linea_servicio', 'cliente', 'proyecto', 'producto', 'temporal', 'estructural'));

CREATE OR REPLACE FUNCTION public.validar_reglas_tipo_centro_beneficio()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $funcion$
BEGIN
  IF NEW.tipo = 'estructural' THEN
    IF NEW.cargo_financiero_dbs IS NOT NULL THEN
      RAISE EXCEPTION
        'CEBE_ESTRUCTURAL: cargo_financiero_dbs debe ser NULL para un CEBE estructural.'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.es_facturable IS TRUE THEN
      RAISE EXCEPTION
        'CEBE_ESTRUCTURAL: es_facturable debe ser false para un CEBE estructural.'
        USING ERRCODE = '23514';
    END IF;

    NEW.meta_ingresos := 0;
  END IF;

  IF NEW.tipo IN ('proyecto', 'temporal')
     AND (
       TG_OP = 'INSERT'
       OR NEW.tipo IS DISTINCT FROM OLD.tipo
       OR NEW.fecha_fin IS DISTINCT FROM OLD.fecha_fin
     )
     AND NEW.fecha_fin IS NULL THEN
    RAISE EXCEPTION
      'CEBE_VIGENCIA: fecha_fin es obligatoria para tipo %.', NEW.tipo
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$funcion$;

-- El orden alfabetico de triggers BEFORE garantiza que esta validacion corre
-- antes de la derivacion de facturabilidad existente.
DROP TRIGGER IF EXISTS aa_centros_beneficio_validar_tipo ON public.centros_beneficio;
CREATE TRIGGER aa_centros_beneficio_validar_tipo
BEFORE INSERT OR UPDATE OF tipo, cargo_financiero_dbs, es_facturable, meta_ingresos, fecha_fin
ON public.centros_beneficio
FOR EACH ROW EXECUTE FUNCTION public.validar_reglas_tipo_centro_beneficio();

CREATE OR REPLACE FUNCTION public.derivar_facturabilidad_centro_beneficio()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $funcion$
BEGIN
  IF NEW.tipo = 'estructural' THEN
    NEW.es_facturable := false;
    RETURN NEW;
  END IF;

  NEW.es_facturable :=
    CASE NEW.cargo_financiero_dbs
      WHEN 'Cliente_Contrato' THEN true
      WHEN 'Interno_Empresa'  THEN false
      WHEN 'Garantia_Fabrica' THEN false
      WHEN 'Reclamo_Rework'   THEN false
      WHEN 'Capital_Propio'   THEN false
      ELSE true
    END;
  RETURN NEW;
END;
$funcion$;

ALTER TABLE public.centros_beneficio
  DROP CONSTRAINT IF EXISTS centros_beneficio_estructural_check;

ALTER TABLE public.centros_beneficio
  ADD CONSTRAINT centros_beneficio_estructural_check
  CHECK (
    tipo <> 'estructural'
    OR (
      cargo_financiero_dbs IS NULL
      AND es_facturable IS FALSE
      AND meta_ingresos = 0
    )
  );

COMMIT;
