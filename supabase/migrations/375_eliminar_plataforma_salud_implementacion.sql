-- Retira de Salud de Implementacion las pantallas exclusivas de Plataforma.
-- Son administracion TIDEO sobre tenants y no forman parte de la matriz de un tenant.
--
-- Alcance estricto:
--   Plataforma / Empresas / Tenants
--   Plataforma / Planes y Licencias
--
-- Las dependencias tambien tienen ON DELETE CASCADE, pero se eliminan de forma
-- explicita para documentar la resolucion de anotaciones y comentarios.

DO $$
DECLARE
  v_configuracion_ids UUID[];
  v_objetivos INTEGER;
  v_eliminadas INTEGER;
  v_total_activo INTEGER;
BEGIN
  SELECT array_agg(c.id), count(*)::INTEGER
  INTO v_configuracion_ids, v_objetivos
  FROM public.tideo_salud_configuracion c
  WHERE c.pestana = 'pantallas'
    AND c.seccion = 'Plataforma'
    AND c.pantalla IN ('Empresas / Tenants', 'Planes y Licencias');

  IF v_objetivos <> 2 THEN
    RAISE EXCEPTION
      'Se esperaban exactamente 2 configuraciones Plataforma y se encontraron %',
      v_objetivos;
  END IF;

  DELETE FROM public.tideo_salud_comentarios
  WHERE configuracion_id = ANY(v_configuracion_ids);

  DELETE FROM public.tideo_salud_anotaciones
  WHERE configuracion_id = ANY(v_configuracion_ids);

  DELETE FROM public.tideo_salud_configuracion
  WHERE id = ANY(v_configuracion_ids);

  GET DIAGNOSTICS v_eliminadas = ROW_COUNT;
  IF v_eliminadas <> 2 THEN
    RAISE EXCEPTION
      'Se esperaban eliminar 2 configuraciones Plataforma y se eliminaron %',
      v_eliminadas;
  END IF;

  SELECT count(*)::INTEGER
  INTO v_total_activo
  FROM public.tideo_salud_configuracion
  WHERE pestana = 'pantallas'
    AND activa = true;

  IF v_total_activo <> 82 THEN
    RAISE EXCEPTION
      'El total activo esperado de Pantallas era 82 y se obtuvo %',
      v_total_activo;
  END IF;
END;
$$;

