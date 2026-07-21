-- Fase 1 de la migración de fuente única ficha -> posición.
-- No contiene backfill ni altera posiciones_usuarios: las asignaciones históricas
-- con más de una posición por usuario requieren clasificación funcional previa.

ALTER TABLE public.personal_operativo
  ADD COLUMN IF NOT EXISTS posicion_id uuid NULL;

ALTER TABLE public.personal_administrativo
  ADD COLUMN IF NOT EXISTS posicion_id uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'personal_operativo_posicion_id_fkey'
  ) THEN
    ALTER TABLE public.personal_operativo
      ADD CONSTRAINT personal_operativo_posicion_id_fkey
      FOREIGN KEY (posicion_id) REFERENCES public.posiciones(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'personal_administrativo_posicion_id_fkey'
  ) THEN
    ALTER TABLE public.personal_administrativo
      ADD CONSTRAINT personal_administrativo_posicion_id_fkey
      FOREIGN KEY (posicion_id) REFERENCES public.posiciones(id) ON DELETE SET NULL;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_personal_operativo_posicion_activa
  ON public.personal_operativo (posicion_id)
  WHERE posicion_id IS NOT NULL
    AND estado_laboral = 'activo'
    AND COALESCE(estado, 'activo') NOT IN ('inactivo', 'cesado', 'baja');

CREATE INDEX IF NOT EXISTS idx_personal_administrativo_posicion_activa
  ON public.personal_administrativo (posicion_id)
  WHERE posicion_id IS NOT NULL
    AND estado_laboral = 'activo'
    AND COALESCE(estado, 'activo') NOT IN ('inactivo', 'cesado', 'baja');

CREATE OR REPLACE FUNCTION public.personal_posicion_esta_activa(
  p_estado text,
  p_estado_laboral text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(p_estado_laboral, 'activo') = 'activo'
     AND COALESCE(p_estado, 'activo') NOT IN ('inactivo', 'cesado', 'baja')
$$;

-- La posición pertenece a la empresa y al mismo cargo de la ficha. Para cargos
-- individuales no se permite otra ficha activa (ni operativa ni administrativa).
CREATE OR REPLACE FUNCTION public.validar_ficha_posicion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cargo_id text;
  v_modo_gestion text;
  v_otra_ficha_activa boolean;
BEGIN
  IF NEW.posicion_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.cargo_id, c.modo_gestion
    INTO v_cargo_id, v_modo_gestion
  FROM public.posiciones p
  LEFT JOIN public.cargos_empresa c
    ON c.id = p.cargo_id AND c.empresa_id = p.empresa_id
  WHERE p.id = NEW.posicion_id
    AND p.empresa_id = NEW.empresa_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La posición % no pertenece a la empresa de la ficha', NEW.posicion_id;
  END IF;

  IF v_cargo_id IS NULL OR NEW.cargo_id IS DISTINCT FROM v_cargo_id THEN
    RAISE EXCEPTION 'El cargo de la ficha debe coincidir con el cargo de la posición';
  END IF;

  IF COALESCE(v_modo_gestion, 'individual') = 'compartido'
     OR NOT public.personal_posicion_esta_activa(NEW.estado, NEW.estado_laboral) THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.personal_operativo po
    WHERE po.posicion_id = NEW.posicion_id
      AND NOT (TG_TABLE_NAME = 'personal_operativo' AND po.id = NEW.id)
      AND public.personal_posicion_esta_activa(po.estado, po.estado_laboral)
    UNION ALL
    SELECT 1
    FROM public.personal_administrativo pa
    WHERE pa.posicion_id = NEW.posicion_id
      AND NOT (TG_TABLE_NAME = 'personal_administrativo' AND pa.id = NEW.id)
      AND public.personal_posicion_esta_activa(pa.estado, pa.estado_laboral)
  ) INTO v_otra_ficha_activa;

  IF v_otra_ficha_activa THEN
    RAISE EXCEPTION 'La posición individual % ya tiene una ficha activa asignada', NEW.posicion_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_ficha_posicion_operativa ON public.personal_operativo;
CREATE TRIGGER trg_validar_ficha_posicion_operativa
  BEFORE INSERT OR UPDATE OF empresa_id, posicion_id, cargo_id, estado, estado_laboral
  ON public.personal_operativo
  FOR EACH ROW EXECUTE FUNCTION public.validar_ficha_posicion();

DROP TRIGGER IF EXISTS trg_validar_ficha_posicion_administrativa ON public.personal_administrativo;
CREATE TRIGGER trg_validar_ficha_posicion_administrativa
  BEFORE INSERT OR UPDATE OF empresa_id, posicion_id, cargo_id, estado, estado_laboral
  ON public.personal_administrativo
  FOR EACH ROW EXECUTE FUNCTION public.validar_ficha_posicion();

COMMENT ON COLUMN public.personal_operativo.posicion_id IS
  'Posición organizacional editable de la ficha. La proyección a posiciones_usuarios se realiza en la fase de corte.';
COMMENT ON COLUMN public.personal_administrativo.posicion_id IS
  'Posición organizacional editable de la ficha. La proyección a posiciones_usuarios se realiza en la fase de corte.';
