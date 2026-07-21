-- La cobertura de una posición se calcula desde el puente de usuarios y las
-- fichas de personal. La misma identidad autenticada en ambas fuentes cuenta
-- una sola vez; una ficha sin auth_user_id conserva identidad propia.

CREATE OR REPLACE FUNCTION public.recalcular_estado_posicion(p_posicion_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ocupantes_activos integer;
BEGIN
  IF p_posicion_id IS NULL THEN
    RETURN;
  END IF;

  -- Serializa recálculos concurrentes de la misma posición.
  PERFORM 1
  FROM public.posiciones
  WHERE id = p_posicion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  WITH ocupantes AS (
    SELECT 'auth:' || pu.user_id::text AS identidad
    FROM public.posiciones_usuarios pu
    WHERE pu.posicion_id = p_posicion_id
      AND pu.fecha_fin IS NULL

    UNION

    SELECT CASE
      WHEN po.auth_user_id IS NOT NULL THEN 'auth:' || po.auth_user_id::text
      ELSE 'operativo:' || po.id
    END AS identidad
    FROM public.personal_operativo po
    WHERE po.posicion_id = p_posicion_id
      AND public.personal_posicion_esta_activa(po.estado, po.estado_laboral)

    UNION

    SELECT CASE
      WHEN pa.auth_user_id IS NOT NULL THEN 'auth:' || pa.auth_user_id::text
      ELSE 'administrativo:' || pa.id
    END AS identidad
    FROM public.personal_administrativo pa
    WHERE pa.posicion_id = p_posicion_id
      AND public.personal_posicion_esta_activa(pa.estado, pa.estado_laboral)
  )
  SELECT count(*) INTO v_ocupantes_activos
  FROM ocupantes;

  UPDATE public.posiciones
  SET estado = CASE
        WHEN v_ocupantes_activos = 0 THEN 'vacante'
        WHEN v_ocupantes_activos = 1 THEN 'cubierta'
        ELSE 'parcial'
      END,
      updated_at = now()
  WHERE id = p_posicion_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_fn_recalcular_estado_posicion_desde_ficha()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalcular_estado_posicion(OLD.posicion_id);
    RETURN NULL;
  END IF;

  PERFORM public.recalcular_estado_posicion(NEW.posicion_id);

  IF TG_OP = 'UPDATE' AND OLD.posicion_id IS DISTINCT FROM NEW.posicion_id THEN
    PERFORM public.recalcular_estado_posicion(OLD.posicion_id);
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_personal_operativo_estado_posicion ON public.personal_operativo;
CREATE TRIGGER trg_personal_operativo_estado_posicion
  AFTER INSERT OR DELETE OR UPDATE OF posicion_id, estado, estado_laboral
  ON public.personal_operativo
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_recalcular_estado_posicion_desde_ficha();

DROP TRIGGER IF EXISTS trg_personal_administrativo_estado_posicion ON public.personal_administrativo;
CREATE TRIGGER trg_personal_administrativo_estado_posicion
  AFTER INSERT OR DELETE OR UPDATE OF posicion_id, estado, estado_laboral
  ON public.personal_administrativo
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_recalcular_estado_posicion_desde_ficha();

COMMENT ON FUNCTION public.recalcular_estado_posicion(uuid) IS
  'Calcula vacante/cubierta/parcial desde posiciones_usuarios activas y fichas activas con posicion_id; deduplica por auth_user_id.';
