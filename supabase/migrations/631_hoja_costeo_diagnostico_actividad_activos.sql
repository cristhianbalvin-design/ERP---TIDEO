-- 631: Completa las referencias de las líneas que la Hoja de Costeo copia desde el Diagnóstico Técnico.
-- 607 dejó actividad_id en NULL cuando la línea tiene tarea; el wizard agrupa por actividad_receta_id (630),
-- así que la actividad del diagnóstico se perdía ("Sin actividad"). Además, las líneas de activos llegaban
-- sin linea_mano_obra_id. Se resuelve con triggers BEFORE INSERT (sin reescribir la RPC) y un backfill.

CREATE OR REPLACE FUNCTION public.hc_mo_completar_desde_diagnostico()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $fn$
BEGIN
  IF NEW.diagnostico_linea_id IS NOT NULL AND NEW.actividad_receta_id IS NULL AND NEW.tarea_id IS NOT NULL THEN
    SELECT l.actividad_id INTO NEW.actividad_receta_id
      FROM public.diagnostico_tecnico_lineas l
      WHERE l.id = NEW.diagnostico_linea_id;
  END IF;
  RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION public.hc_mo_completar_desde_diagnostico() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_hc_mo_completar_desde_diagnostico ON public.hoja_costeo_lineas_mano_obra;
CREATE TRIGGER trg_hc_mo_completar_desde_diagnostico
BEFORE INSERT ON public.hoja_costeo_lineas_mano_obra
FOR EACH ROW EXECUTE FUNCTION public.hc_mo_completar_desde_diagnostico();

CREATE OR REPLACE FUNCTION public.hc_activo_completar_desde_diagnostico()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $fn$
BEGIN
  IF NEW.diagnostico_linea_id IS NOT NULL AND NEW.linea_mano_obra_id IS NULL THEN
    SELECT mo.id INTO NEW.linea_mano_obra_id
      FROM public.hoja_costeo_lineas_mano_obra mo
      WHERE mo.hoja_costeo_id = NEW.hoja_costeo_id
        AND mo.diagnostico_linea_id = NEW.diagnostico_linea_id
      ORDER BY mo.orden, mo.creado_en
      LIMIT 1;
  END IF;
  RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION public.hc_activo_completar_desde_diagnostico() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_hc_activo_completar_desde_diagnostico ON public.hoja_costeo_lineas_activos;
CREATE TRIGGER trg_hc_activo_completar_desde_diagnostico
BEFORE INSERT ON public.hoja_costeo_lineas_activos
FOR EACH ROW EXECUTE FUNCTION public.hc_activo_completar_desde_diagnostico();

-- Backfill de hojas no aprobadas ya generadas desde diagnóstico.
UPDATE public.hoja_costeo_lineas_mano_obra mo
SET actividad_receta_id = l.actividad_id
FROM public.diagnostico_tecnico_lineas l, public.hojas_costeo h
WHERE mo.diagnostico_linea_id = l.id
  AND h.id = mo.hoja_costeo_id AND h.estado IS DISTINCT FROM 'aprobada'
  AND mo.actividad_receta_id IS NULL AND mo.tarea_id IS NOT NULL AND l.actividad_id IS NOT NULL;

UPDATE public.hoja_costeo_lineas_activos a
SET linea_mano_obra_id = mo.id
FROM public.hoja_costeo_lineas_mano_obra mo, public.hojas_costeo h
WHERE a.diagnostico_linea_id IS NOT NULL AND a.linea_mano_obra_id IS NULL
  AND mo.hoja_costeo_id = a.hoja_costeo_id AND mo.diagnostico_linea_id = a.diagnostico_linea_id
  AND h.id = a.hoja_costeo_id AND h.estado IS DISTINCT FROM 'aprobada';
