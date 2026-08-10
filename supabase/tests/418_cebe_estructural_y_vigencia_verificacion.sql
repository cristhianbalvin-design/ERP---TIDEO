-- Fase 1.1, version de verificacion. Revierte todos los cambios.

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
    RAISE EXCEPTION 'CEBE_ESTRUCTURAL: tipos historicos fuera del conjunto vigente.';
  END IF;
END
$preflight$;

ALTER TABLE public.centros_beneficio DROP CONSTRAINT IF EXISTS centros_beneficio_tipo_check;
ALTER TABLE public.centros_beneficio ADD CONSTRAINT centros_beneficio_tipo_check
  CHECK (tipo IN ('linea_servicio', 'cliente', 'proyecto', 'producto', 'temporal', 'estructural'));

CREATE OR REPLACE FUNCTION public.validar_reglas_tipo_centro_beneficio()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $funcion$
BEGIN
  IF NEW.tipo = 'estructural' THEN
    IF NEW.cargo_financiero_dbs IS NOT NULL THEN
      RAISE EXCEPTION 'CEBE_ESTRUCTURAL: cargo_financiero_dbs debe ser NULL para un CEBE estructural.' USING ERRCODE = '23514';
    END IF;
    IF NEW.es_facturable IS TRUE THEN
      RAISE EXCEPTION 'CEBE_ESTRUCTURAL: es_facturable debe ser false para un CEBE estructural.' USING ERRCODE = '23514';
    END IF;
    NEW.meta_ingresos := 0;
  END IF;
  IF NEW.tipo IN ('proyecto', 'temporal')
     AND (TG_OP = 'INSERT' OR NEW.tipo IS DISTINCT FROM OLD.tipo OR NEW.fecha_fin IS DISTINCT FROM OLD.fecha_fin)
     AND NEW.fecha_fin IS NULL THEN
    RAISE EXCEPTION 'CEBE_VIGENCIA: fecha_fin es obligatoria para tipo %.', NEW.tipo USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$funcion$;

DROP TRIGGER IF EXISTS aa_centros_beneficio_validar_tipo ON public.centros_beneficio;
CREATE TRIGGER aa_centros_beneficio_validar_tipo
BEFORE INSERT OR UPDATE OF tipo, cargo_financiero_dbs, es_facturable, meta_ingresos, fecha_fin
ON public.centros_beneficio FOR EACH ROW EXECUTE FUNCTION public.validar_reglas_tipo_centro_beneficio();

CREATE OR REPLACE FUNCTION public.derivar_facturabilidad_centro_beneficio()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $funcion$
BEGIN
  IF NEW.tipo = 'estructural' THEN
    NEW.es_facturable := false;
    RETURN NEW;
  END IF;
  NEW.es_facturable := CASE NEW.cargo_financiero_dbs
    WHEN 'Cliente_Contrato' THEN true
    WHEN 'Interno_Empresa' THEN false
    WHEN 'Garantia_Fabrica' THEN false
    WHEN 'Reclamo_Rework' THEN false
    WHEN 'Capital_Propio' THEN false
    ELSE true
  END;
  RETURN NEW;
END;
$funcion$;

ALTER TABLE public.centros_beneficio DROP CONSTRAINT IF EXISTS centros_beneficio_estructural_check;
ALTER TABLE public.centros_beneficio ADD CONSTRAINT centros_beneficio_estructural_check
  CHECK (tipo <> 'estructural' OR (cargo_financiero_dbs IS NULL AND es_facturable IS FALSE AND meta_ingresos = 0));

CREATE TEMP TABLE verificar_cebe_418 (
  id integer generated always as identity primary key,
  tipo text not null,
  cargo_financiero_dbs text,
  es_facturable boolean not null default true,
  meta_ingresos numeric,
  fecha_fin date,
  descripcion text
) ON COMMIT DROP;

-- Fila historica simulada: no se invalida por actualizar un campo ajeno.
INSERT INTO verificar_cebe_418 (tipo, cargo_financiero_dbs, es_facturable, fecha_fin, descripcion)
VALUES ('proyecto', 'Cliente_Contrato', true, NULL, 'legado');

CREATE TRIGGER aa_verificar_cebe_418_validar
BEFORE INSERT OR UPDATE OF tipo, cargo_financiero_dbs, es_facturable, meta_ingresos, fecha_fin
ON verificar_cebe_418 FOR EACH ROW EXECUTE FUNCTION public.validar_reglas_tipo_centro_beneficio();
CREATE TRIGGER trg_verificar_cebe_418_derivar
BEFORE INSERT OR UPDATE OF cargo_financiero_dbs, es_facturable
ON verificar_cebe_418 FOR EACH ROW EXECUTE FUNCTION public.derivar_facturabilidad_centro_beneficio();

UPDATE verificar_cebe_418 SET descripcion = 'legado actualizado' WHERE id = 1;

INSERT INTO verificar_cebe_418 (tipo, cargo_financiero_dbs, es_facturable, meta_ingresos, fecha_fin)
VALUES
  ('linea_servicio', 'Cliente_Contrato', false, NULL, NULL),
  ('linea_servicio', 'Interno_Empresa', true, NULL, NULL),
  ('linea_servicio', 'Garantia_Fabrica', true, NULL, NULL),
  ('linea_servicio', 'Reclamo_Rework', true, NULL, NULL),
  ('linea_servicio', 'Capital_Propio', true, NULL, NULL),
  ('linea_servicio', NULL, false, NULL, NULL);

DO $comportamiento_existente$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('Cliente_Contrato'::text, true),
      ('Interno_Empresa'::text, false),
      ('Garantia_Fabrica'::text, false),
      ('Reclamo_Rework'::text, false),
      ('Capital_Propio'::text, false),
      (NULL::text, true)
    ) esperado(cargo, facturable)
    LEFT JOIN verificar_cebe_418 actual
      ON actual.id > 1
     AND actual.cargo_financiero_dbs IS NOT DISTINCT FROM esperado.cargo
     AND actual.es_facturable IS NOT DISTINCT FROM esperado.facturable
    WHERE actual.id IS NULL
  ) THEN
    RAISE EXCEPTION 'CEBE_ESTRUCTURAL: cambio no autorizado en la derivacion existente.';
  END IF;
END
$comportamiento_existente$;

INSERT INTO verificar_cebe_418 (tipo, cargo_financiero_dbs, es_facturable, meta_ingresos)
VALUES ('estructural', NULL, false, 999);

DO $estructural$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM verificar_cebe_418
    WHERE tipo = 'estructural'
      AND cargo_financiero_dbs IS NULL
      AND es_facturable IS FALSE
      AND meta_ingresos = 0
  ) THEN
    RAISE EXCEPTION 'CEBE_ESTRUCTURAL: no se forzaron los valores estructurales.';
  END IF;

  BEGIN
    INSERT INTO verificar_cebe_418 (tipo, cargo_financiero_dbs, es_facturable)
    VALUES ('estructural', NULL, true);
    RAISE EXCEPTION 'CEBE_ESTRUCTURAL: acepto es_facturable=true.';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO verificar_cebe_418 (tipo, cargo_financiero_dbs, es_facturable)
    VALUES ('estructural', 'Interno_Empresa', false);
    RAISE EXCEPTION 'CEBE_ESTRUCTURAL: acepto cargo financiero no nulo.';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO verificar_cebe_418 (tipo, cargo_financiero_dbs, es_facturable)
    VALUES ('proyecto', 'Cliente_Contrato', true);
    RAISE EXCEPTION 'CEBE_VIGENCIA: acepto proyecto sin fecha_fin.';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END
$estructural$;

ROLLBACK;
