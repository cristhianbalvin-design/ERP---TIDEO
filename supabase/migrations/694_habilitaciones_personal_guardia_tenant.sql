-- calcular_habilitaciones_personal es SECURITY DEFINER y no comprobaba que quien la llama pertenezca a la empresa:
-- cualquier usuario autenticado podía pedir el estado documental del personal de otra empresa.
-- Se parte de la versión remota vigente (pg_get_functiondef) y solo se agrega la guardia en el CTE "personal":
-- con sesión de usuario exige usuario_tiene_empresa; sin sesión (cron, service_role) sigue igual.
-- Idempotente: si la guardia ya está, no hace nada.
DO $$
DECLARE
  v_def text := pg_get_functiondef('public.calcular_habilitaciones_personal(text)'::regprocedure);
  v_ancla text := 'WHERE  empresa_id = p_empresa_id';
  v_guardia text := E'WHERE  empresa_id = p_empresa_id\n      AND  (auth.uid() IS NULL OR public.usuario_tiene_empresa(p_empresa_id))';
  v_antes integer; v_despues integer; v_empresa text;
BEGIN
  IF position('usuario_tiene_empresa' IN v_def) > 0 THEN RETURN; END IF;
  IF (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla) <> 2 THEN
    RAISE EXCEPTION 'La función cambió: se esperaban 2 anclas en el CTE personal';
  END IF;
  SELECT empresa_id INTO v_empresa FROM public.personal_operativo GROUP BY 1 ORDER BY count(*) DESC LIMIT 1;
  SELECT count(*) INTO v_antes FROM public.calcular_habilitaciones_personal(v_empresa);
  EXECUTE replace(v_def, v_ancla, v_guardia);
  -- Sin sesión (como el cron de notificaciones) el resultado no debe cambiar.
  SELECT count(*) INTO v_despues FROM public.calcular_habilitaciones_personal(v_empresa);
  IF v_despues <> v_antes THEN RAISE EXCEPTION 'Sin sesión cambió el resultado: % vs %', v_despues, v_antes; END IF;
END $$;
