-- Prueba transaccional: PRUEBA y un tenant regular aceptan el guardado para
-- sus administradores, sin conservar las anotaciones creadas.

BEGIN;

DO $$
DECLARE
  v_tenant_id TEXT;
  v_admin_id TEXT;
  v_configuracion_id UUID;
  v_resultado public.tideo_salud_anotaciones;
BEGIN
  SELECT id
  INTO v_configuracion_id
  FROM public.tideo_salud_configuracion
  WHERE activa = true
  ORDER BY orden, pantalla
  LIMIT 1;

  FOR v_tenant_id IN
    SELECT unnest(ARRAY['emp_2000000000', 'emp_20541435833']::TEXT[])
  LOOP
    SELECT ue.user_id::text
    INTO v_admin_id
    FROM public.usuarios_empresas ue
    JOIN public.usuarios u ON u.id = ue.user_id::text
    JOIN public.roles r ON r.id = ue.rol_id
    WHERE ue.empresa_id = v_tenant_id
      AND ue.estado = 'activo'
      AND lower(u.estado) = 'activo'
      AND r.es_admin_empresa = true
    LIMIT 1;

    IF v_admin_id IS NULL THEN
      RAISE EXCEPTION 'No existe administrador activo para tenant %', v_tenant_id;
    END IF;

    PERFORM set_config('request.jwt.claim.sub', v_admin_id, true);
    SET LOCAL ROLE authenticated;

    SELECT *
    INTO v_resultado
    FROM public.guardar_salud_implementacion_responsables(
      v_configuracion_id,
      v_tenant_id,
      NULL,
      NULL
    );

    IF v_resultado.empresa_id <> v_tenant_id
       OR v_resultado.configuracion_id <> v_configuracion_id THEN
      RAISE EXCEPTION 'Resultado incorrecto para tenant %', v_tenant_id;
    END IF;

    RESET ROLE;
  END LOOP;
END;
$$;

ROLLBACK;
