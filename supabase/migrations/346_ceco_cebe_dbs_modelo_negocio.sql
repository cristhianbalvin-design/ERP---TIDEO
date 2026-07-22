-- CECO/CEBE: modelo DBS, clasificacion comercial y relaciones maestras.
-- Los datos de validacion y la reclasificacion historica se ejecutan por separado.

BEGIN;

ALTER TABLE public.centros_beneficio
  ADD COLUMN cargo_financiero_dbs text NULL DEFAULT NULL,
  ADD COLUMN es_facturable boolean NOT NULL DEFAULT true,
  ADD COLUMN modelo_negocio text NULL DEFAULT NULL;

ALTER TABLE public.centros_beneficio
  ADD CONSTRAINT centros_beneficio_cargo_financiero_dbs_check
  CHECK (
    cargo_financiero_dbs IS NULL
    OR cargo_financiero_dbs IN (
      'Cliente_Contrato',
      'Interno_DIFESMAQ',
      'Garantia_Fabrica',
      'Reclamo_Rework'
    )
  ),
  ADD CONSTRAINT centros_beneficio_modelo_negocio_check
  CHECK (
    modelo_negocio IS NULL
    OR modelo_negocio IN (
      'Alquiler de equipo',
      'Servicios con equipo propio',
      'Mixto (alquiler + mantenimiento)',
      'Fabricacion, reparacion y mantenimiento',
      'Operacion y Mantenimiento (O&M)',
      'Tarifa por hora / componente',
      'Remanufactura / intercambio de componentes',
      'Venta de repuestos',
      'Monitoreo por suscripcion (IoT)',
      'Tercerizacion de personal (staffing)'
    )
  ),
  ADD CONSTRAINT centros_beneficio_facturabilidad_coherente_check
  CHECK (
    (cargo_financiero_dbs IS NULL AND es_facturable = true)
    OR (cargo_financiero_dbs = 'Cliente_Contrato' AND es_facturable = true)
    OR (
      cargo_financiero_dbs IN (
        'Interno_DIFESMAQ',
        'Garantia_Fabrica',
        'Reclamo_Rework'
      )
      AND es_facturable = false
    )
  ),
  ADD CONSTRAINT centros_beneficio_cuenta_id_fkey
  FOREIGN KEY (cuenta_id)
  REFERENCES public.cuentas(id);

CREATE FUNCTION public.derivar_facturabilidad_centro_beneficio()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.es_facturable :=
    CASE NEW.cargo_financiero_dbs
      WHEN 'Cliente_Contrato' THEN true
      WHEN 'Interno_DIFESMAQ' THEN false
      WHEN 'Garantia_Fabrica' THEN false
      WHEN 'Reclamo_Rework' THEN false
      ELSE true
    END;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_centros_beneficio_derivar_facturabilidad
BEFORE INSERT OR UPDATE OF cargo_financiero_dbs, es_facturable
ON public.centros_beneficio
FOR EACH ROW
EXECUTE FUNCTION public.derivar_facturabilidad_centro_beneficio();

ALTER TABLE public.centros_costo
  ADD COLUMN especialidad text NULL DEFAULT NULL,
  ADD COLUMN sede_padre text NULL DEFAULT NULL;

ALTER TABLE public.centros_costo
  ADD CONSTRAINT centros_costo_especialidad_fkey
  FOREIGN KEY (especialidad)
  REFERENCES public.especialidades_tecnicas(id),
  ADD CONSTRAINT centros_costo_sede_padre_fkey
  FOREIGN KEY (sede_padre)
  REFERENCES public.sedes(id);

COMMIT;
