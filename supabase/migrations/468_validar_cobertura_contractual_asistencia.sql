-- 468 · La asistencia se autoriza por la fecha del registro, no por el
-- indicador de bloqueo calculado para la fecha actual del colaborador.
-- Esto permite corregir días históricos cubiertos por un contrato ya vencido,
-- y mantiene bloqueadas las fechas fuera de cualquier vigencia contractual.

CREATE OR REPLACE FUNCTION public.validar_cobertura_contractual_asistencia()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cargo_confianza boolean := false;
  v_vigencia record;
BEGIN
  IF NEW.trabajador_tipo = 'administrativo' THEN
    SELECT COALESCE(cargo_confianza, false)
      INTO v_cargo_confianza
      FROM public.personal_administrativo
     WHERE empresa_id = NEW.empresa_id
       AND id = NEW.trabajador_id;
  ELSE
    SELECT COALESCE(cargo_confianza, false)
      INTO v_cargo_confianza
      FROM public.personal_operativo
     WHERE empresa_id = NEW.empresa_id
       AND id = NEW.trabajador_id;
  END IF;

  -- Mantiene la excepción histórica para cargos de confianza.
  IF COALESCE(v_cargo_confianza, false) THEN
    RETURN NEW;
  END IF;

  SELECT *
    INTO v_vigencia
    FROM public.vigencia_efectiva_core(
      NEW.empresa_id,
      NEW.fecha,
      NEW.trabajador_id,
      NEW.trabajador_tipo
    );

  IF NOT COALESCE(v_vigencia.vigente, false)
     OR v_vigencia.estado_validacion = 'rechazado' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'ASISTENCIA_SIN_COBERTURA_CONTRACTUAL',
      DETAIL = format(
        'El trabajador %s no tiene un contrato válido que cubra la fecha %s.',
        NEW.trabajador_id,
        NEW.fecha
      );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_cobertura_contractual_asistencia ON public.registros_asistencia;
CREATE TRIGGER trg_validar_cobertura_contractual_asistencia
BEFORE INSERT OR UPDATE OF empresa_id, trabajador_id, trabajador_tipo, fecha
ON public.registros_asistencia
FOR EACH ROW
EXECUTE FUNCTION public.validar_cobertura_contractual_asistencia();

COMMENT ON FUNCTION public.validar_cobertura_contractual_asistencia() IS
'Impide escribir asistencia fuera de cobertura contractual para la fecha del registro. No usa asistencia_bloqueada, que representa la vigencia actual.';

SELECT pg_notify('pgrst', 'reload schema');
