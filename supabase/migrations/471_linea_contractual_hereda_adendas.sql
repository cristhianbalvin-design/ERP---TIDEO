-- Las adendas pertenecen a la línea contractual de una persona y sociedad,
-- incluso cuando se crea un nuevo período/renovación. La referencia directa
-- al contrato original se conserva como respaldo documental.

ALTER TABLE public.personal_documentos
  ADD COLUMN IF NOT EXISTS contrato_periodo_predecesor_id text;

COMMENT ON COLUMN public.personal_documentos.contrato_periodo_predecesor_id IS
  'Período contractual inmediatamente anterior. Solo se llena en el contrato raíz de una renovación.';

CREATE INDEX IF NOT EXISTS idx_personal_documentos_linea_contractual
  ON public.personal_documentos (
    empresa_id,
    sociedad_id,
    personal_id,
    contrato_periodo_id,
    contrato_periodo_predecesor_id
  );

-- Backfill de renovaciones ya existentes. No toma adendas (tienen contrato de
-- referencia); enlaza solamente los contratos raíz por orden de vigencia.
WITH contratos_ordenados AS (
  SELECT
    id,
    lag(contrato_periodo_id) OVER (
      PARTITION BY empresa_id, sociedad_id, personal_id
      ORDER BY COALESCE(periodo_fecha_inicio, fecha_emision, creado_en::date), creado_en, id
    ) AS periodo_predecesor
  FROM public.personal_documentos
  WHERE contrato_periodo_id IS NOT NULL
    AND contrato_referencia_id IS NULL
)
UPDATE public.personal_documentos documento
SET contrato_periodo_predecesor_id = contratos_ordenados.periodo_predecesor
FROM contratos_ordenados
WHERE documento.id = contratos_ordenados.id
  AND documento.contrato_periodo_predecesor_id IS NULL
  AND contratos_ordenados.periodo_predecesor IS NOT NULL;

CREATE OR REPLACE FUNCTION public.asignar_predecesor_linea_contractual()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.contrato_periodo_id IS NULL
     OR NEW.contrato_referencia_id IS NOT NULL
     OR NEW.contrato_periodo_predecesor_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT previo.contrato_periodo_id
  INTO NEW.contrato_periodo_predecesor_id
  FROM public.personal_documentos previo
  WHERE previo.empresa_id = NEW.empresa_id
    AND previo.sociedad_id IS NOT DISTINCT FROM NEW.sociedad_id
    AND previo.personal_id = NEW.personal_id
    AND previo.contrato_periodo_id IS NOT NULL
    AND previo.contrato_referencia_id IS NULL
    AND previo.contrato_periodo_id <> NEW.contrato_periodo_id
    AND COALESCE(previo.periodo_fecha_inicio, previo.fecha_emision, previo.creado_en::date)
        <= COALESCE(NEW.periodo_fecha_inicio, NEW.fecha_emision, CURRENT_DATE)
  ORDER BY COALESCE(previo.periodo_fecha_inicio, previo.fecha_emision, previo.creado_en::date) DESC,
           previo.creado_en DESC,
           previo.id DESC
  LIMIT 1;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_asignar_predecesor_linea_contractual ON public.personal_documentos;
CREATE TRIGGER trg_asignar_predecesor_linea_contractual
BEFORE INSERT ON public.personal_documentos
FOR EACH ROW
EXECUTE FUNCTION public.asignar_predecesor_linea_contractual();
