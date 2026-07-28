-- Normaliza unicamente las secciones de filas agregadas por la migracion 373.
-- Los nombres historicos de las 66 filas anteriores permanecen intactos.

UPDATE public.tideo_salud_configuracion
SET seccion = 'Admin/Finanzas'
WHERE pestana = 'pantallas'
  AND pantalla = 'Estado de Resultados'
  AND tipo = 'Vista compuesta'
  AND seccion = 'Administracion';

UPDATE public.tideo_salud_configuracion
SET seccion = 'Configuración'
WHERE pestana = 'pantallas'
  AND pantalla = 'Organigrama'
  AND tipo = 'Maestro'
  AND seccion = 'Configuracion';

UPDATE public.tideo_salud_configuracion
SET seccion = 'Campo Móvil'
WHERE pestana = 'pantallas'
  AND pantalla = 'Vistas de Campo'
  AND tipo = 'Vista compuesta'
  AND seccion = 'Campo Movil';
