-- APLICADA EN PRODUCCIÓN el 2026-10-09 desde el SQL Editor (no vía db push):
-- registrar con `supabase migration repair --status applied 20261010100000`; NO reejecutar.
-- WMS Fase 1 · B2b-0: tipo 'piso', posición directa en zona y campo 'uso' en public.ubicaciones.
-- Sin cambios de RLS ni de las protecciones de general/stock. Tabla con solo las 11 ubicaciones generales al aplicar.

-- 1) Tipo 'piso'
ALTER TABLE public.ubicaciones DROP CONSTRAINT ubicaciones_tipo_check;
ALTER TABLE public.ubicaciones ADD CONSTRAINT ubicaciones_tipo_check
  CHECK (tipo IN ('general', 'zona', 'rack', 'posicion', 'piso'));

-- 2) Uso de la ubicación (informativo en esta fase; no altera disponibilidad)
ALTER TABLE public.ubicaciones ADD COLUMN uso text NOT NULL DEFAULT 'almacenaje';
ALTER TABLE public.ubicaciones ADD CONSTRAINT ubicaciones_uso_check
  CHECK (uso IN ('almacenaje', 'recepcion', 'cuarentena', 'despacho', 'merma'));
ALTER TABLE public.ubicaciones ADD CONSTRAINT ubicaciones_general_uso_ck
  CHECK (NOT es_general OR uso = 'almacenaje');
COMMENT ON COLUMN public.ubicaciones.uso IS
  'Función de la ubicación: almacenaje (por defecto), recepcion, cuarentena, despacho o merma. Informativo en Fase 1.';

-- 3) Jerarquía: zona > rack > posición; posición también directa en zona; piso en zona.
--    Base: pg_get_functiondef remoto del 2026-10-09.
CREATE OR REPLACE FUNCTION public.validar_ubicacion_jerarquia()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tipo_padre text;
BEGIN
  IF NEW.tipo = 'general' THEN
    IF NEW.padre_id IS NOT NULL OR NOT NEW.es_general THEN
      RAISE EXCEPTION 'La ubicación general debe ser raíz y tener es_general=true.';
    END IF;
  ELSIF NEW.es_general THEN
    RAISE EXCEPTION 'Solo una ubicación tipo general puede tener es_general=true.';
  END IF;

  IF NEW.tipo = 'zona' AND NEW.padre_id IS NOT NULL THEN
    RAISE EXCEPTION 'Una zona debe ser raíz.';
  ELSIF NEW.tipo = 'rack' AND NEW.padre_id IS NULL THEN
    RAISE EXCEPTION 'Un rack debe pertenecer a una zona.';
  ELSIF NEW.tipo = 'posicion' AND NEW.padre_id IS NULL THEN
    RAISE EXCEPTION 'Una posición debe pertenecer a un rack o a una zona.';
  ELSIF NEW.tipo = 'piso' AND NEW.padre_id IS NULL THEN
    RAISE EXCEPTION 'Un piso debe pertenecer a una zona.';
  END IF;

  IF NEW.padre_id IS NOT NULL THEN
    SELECT u.tipo INTO v_tipo_padre FROM public.ubicaciones u
    WHERE u.id = NEW.padre_id AND u.almacen_id = NEW.almacen_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La ubicación padre no existe en el mismo almacén.';
    END IF;
    IF (NEW.tipo = 'rack' AND v_tipo_padre <> 'zona')
       OR (NEW.tipo = 'posicion' AND v_tipo_padre NOT IN ('rack', 'zona'))
       OR (NEW.tipo = 'piso' AND v_tipo_padre <> 'zona') THEN
      RAISE EXCEPTION 'La jerarquía debe ser zona > rack > posición; la posición también puede ir directo en una zona y el piso va en una zona.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
