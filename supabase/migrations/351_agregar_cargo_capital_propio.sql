-- Agrega Capital_Propio al catalogo DBS y lo clasifica como no facturable.

BEGIN;

ALTER TABLE public.centros_beneficio
  DROP CONSTRAINT centros_beneficio_cargo_financiero_dbs_check;

ALTER TABLE public.centros_beneficio
  ADD CONSTRAINT centros_beneficio_cargo_financiero_dbs_check
  CHECK (
    cargo_financiero_dbs IS NULL
    OR cargo_financiero_dbs = ANY (ARRAY[
      'Cliente_Contrato'::text,
      'Interno_Empresa'::text,
      'Garantia_Fabrica'::text,
      'Reclamo_Rework'::text,
      'Capital_Propio'::text
    ])
  );

ALTER TABLE public.centros_beneficio
  DROP CONSTRAINT centros_beneficio_facturabilidad_coherente_check;

ALTER TABLE public.centros_beneficio
  ADD CONSTRAINT centros_beneficio_facturabilidad_coherente_check
  CHECK (
    (cargo_financiero_dbs IS NULL AND es_facturable = true)
    OR (cargo_financiero_dbs = 'Cliente_Contrato' AND es_facturable = true)
    OR (
      cargo_financiero_dbs = ANY (ARRAY[
        'Interno_Empresa'::text,
        'Garantia_Fabrica'::text,
        'Reclamo_Rework'::text,
        'Capital_Propio'::text
      ])
      AND es_facturable = false
    )
  );

CREATE OR REPLACE FUNCTION public.derivar_facturabilidad_centro_beneficio()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
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
$function$;

COMMIT;
