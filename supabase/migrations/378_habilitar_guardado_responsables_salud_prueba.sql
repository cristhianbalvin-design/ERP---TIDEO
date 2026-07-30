-- PRUEBA es un tenant activo y no-plataforma accesible desde la vista local
-- de Salud de Implementacion. La RPC de guardado debe usar el mismo criterio
-- que la RPC de usuarios corregida en la migracion 376.

CREATE OR REPLACE FUNCTION public.guardar_salud_implementacion_responsables(
  p_configuracion_id UUID,
  p_empresa_id TEXT,
  p_responsable_tideo TEXT,
  p_responsable_cliente TEXT
)
RETURNS public.tideo_salud_anotaciones
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anotacion public.tideo_salud_anotaciones;
BEGIN
  IF NOT public.usuario_es_admin_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Acceso denegado para guardar responsables de este tenant';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.empresas e
    WHERE e.id = p_empresa_id
      AND e.es_plataforma = false
      AND e.estado = 'activa'
  ) THEN
    RAISE EXCEPTION 'Tenant no operativo';
  END IF;

  INSERT INTO public.tideo_salud_anotaciones (
    configuracion_id,
    empresa_id,
    responsable_tideo,
    responsable_cliente,
    solo_interno,
    updated_at,
    updated_by
  )
  VALUES (
    p_configuracion_id,
    p_empresa_id,
    NULLIF(p_responsable_tideo, ''),
    NULLIF(p_responsable_cliente, ''),
    false,
    now(),
    auth.uid()
  )
  ON CONFLICT (configuracion_id, empresa_id)
  DO UPDATE SET
    responsable_tideo = EXCLUDED.responsable_tideo,
    responsable_cliente = EXCLUDED.responsable_cliente,
    updated_at = now(),
    updated_by = auth.uid()
  RETURNING * INTO v_anotacion;

  RETURN v_anotacion;
END;
$$;

REVOKE ALL
ON FUNCTION public.guardar_salud_implementacion_responsables(UUID, TEXT, TEXT, TEXT)
FROM PUBLIC;
GRANT EXECUTE
ON FUNCTION public.guardar_salud_implementacion_responsables(UUID, TEXT, TEXT, TEXT)
TO authenticated;

COMMENT ON FUNCTION public.guardar_salud_implementacion_responsables(UUID, TEXT, TEXT, TEXT) IS
  'Guarda responsables para un tenant activo no-plataforma, incluido PRUEBA, con validacion de administrador y pertenencia de responsables.';
