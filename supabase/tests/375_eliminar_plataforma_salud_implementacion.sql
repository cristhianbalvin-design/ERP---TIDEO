-- Verificacion repetible de la migracion 375.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.tideo_salud_configuracion
    WHERE pestana = 'pantallas'
      AND seccion = 'Plataforma'
      AND pantalla IN ('Empresas / Tenants', 'Planes y Licencias')
  ) THEN
    RAISE EXCEPTION 'Las filas Plataforma todavia existen en Pantallas';
  END IF;

  IF (
    SELECT count(*)
    FROM public.tideo_salud_configuracion
    WHERE pestana = 'pantallas'
      AND activa = true
  ) <> 82 THEN
    RAISE EXCEPTION 'El total activo de Pantallas no es 82';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tideo_salud_anotaciones
    WHERE configuracion_id IN (
      '135eee54-0f18-4169-a4ad-370c1659f2f4'::UUID,
      '51ad0c1f-970f-46ed-b592-df2dc8a5a646'::UUID
    )
  ) THEN
    RAISE EXCEPTION 'Persisten anotaciones de las configuraciones Plataforma';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.tideo_salud_comentarios
    WHERE configuracion_id IN (
      '135eee54-0f18-4169-a4ad-370c1659f2f4'::UUID,
      '51ad0c1f-970f-46ed-b592-df2dc8a5a646'::UUID
    )
  ) THEN
    RAISE EXCEPTION 'Persisten comentarios de las configuraciones Plataforma';
  END IF;
END;
$$;

ROLLBACK;
