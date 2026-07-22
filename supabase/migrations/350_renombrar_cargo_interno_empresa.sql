-- Renombra la clasificacion interna heredada a una denominacion neutral para todos los tenants.
-- La migracion historica 346 se conserva sin cambios.

BEGIN;

-- Ambos CHECK deben retirarse antes de migrar los datos: el valor anterior
-- dejaria de ser valido en cuanto se agregara la nueva definicion.
ALTER TABLE public.centros_beneficio
  DROP CONSTRAINT centros_beneficio_cargo_financiero_dbs_check;

ALTER TABLE public.centros_beneficio
  DROP CONSTRAINT centros_beneficio_facturabilidad_coherente_check;

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
      ELSE true
    END;
  RETURN NEW;
END;
$function$;

UPDATE public.centros_beneficio
SET cargo_financiero_dbs = 'Interno_Empresa'
WHERE id = 'cebe_efaec001f2ca489787a71e8183bd3b5c'
  AND empresa_id = 'emp_2000000000'
  AND codigo = 'CEBE-INT-001'
RETURNING id, codigo, cargo_financiero_dbs, es_facturable;

DELETE FROM public.centros_beneficio
WHERE id = 'cebe_e1274250ab6c41e38d'
  AND empresa_id = 'emp_2000000000'
  AND codigo = 'QA-IMP-20260722-INT'
RETURNING id, codigo;

ALTER TABLE public.centros_beneficio
  ADD CONSTRAINT centros_beneficio_cargo_financiero_dbs_check
  CHECK (
    cargo_financiero_dbs IS NULL
    OR cargo_financiero_dbs = ANY (ARRAY[
      'Cliente_Contrato'::text,
      'Interno_Empresa'::text,
      'Garantia_Fabrica'::text,
      'Reclamo_Rework'::text
    ])
  );

ALTER TABLE public.centros_beneficio
  ADD CONSTRAINT centros_beneficio_facturabilidad_coherente_check
  CHECK (
    (cargo_financiero_dbs IS NULL AND es_facturable = true)
    OR (cargo_financiero_dbs = 'Cliente_Contrato' AND es_facturable = true)
    OR (
      cargo_financiero_dbs = ANY (ARRAY[
        'Interno_Empresa'::text,
        'Garantia_Fabrica'::text,
        'Reclamo_Rework'::text
      ])
      AND es_facturable = false
    )
  );

COMMIT;
