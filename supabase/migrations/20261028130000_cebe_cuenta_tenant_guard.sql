-- Normaliza la cuenta vinculada de los CEBEs y evita referencias cruzadas
-- entre tenants. La regla se aplica también a importaciones y escrituras que
-- no pasan por el formulario web.

BEGIN;

CREATE OR REPLACE FUNCTION public.normalizar_cuenta_centro_beneficio()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  -- Solo un CEBE de tipo cliente puede tener cliente vinculado.
  IF NEW.tipo IS DISTINCT FROM 'cliente' THEN
    NEW.cuenta_id := NULL;
    RETURN NEW;
  END IF;

  -- La vinculación es opcional para conservar compatibilidad histórica, pero
  -- cuando existe debe pertenecer al mismo tenant del CEBE.
  IF NEW.cuenta_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.cuentas c
    WHERE c.id = NEW.cuenta_id
      AND c.empresa_id = NEW.empresa_id
  ) THEN
    RAISE EXCEPTION
      'CEBE_CUENTA_TENANT: el cliente vinculado no existe o no pertenece al tenant actual.'
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS aa_centros_beneficio_normalizar_cuenta
  ON public.centros_beneficio;

CREATE TRIGGER aa_centros_beneficio_normalizar_cuenta
BEFORE INSERT OR UPDATE OF tipo, cuenta_id, empresa_id
ON public.centros_beneficio
FOR EACH ROW
EXECUTE FUNCTION public.normalizar_cuenta_centro_beneficio();

COMMIT;

