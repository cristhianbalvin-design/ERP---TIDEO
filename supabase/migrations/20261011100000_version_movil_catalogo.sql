-- Registro en git de un cambio ya aplicado en producción para conservar los nombres
-- del catálogo al reconstruir la base. Es idempotente: cada UPDATE exige el valor
-- antiguo. Toca public.nav_sections, public.nav_modules y public.tideo_salud_configuracion.

UPDATE public.nav_sections
SET default_label = 'Versión Móvil'
WHERE key = 'campo_movil'
  AND default_label = 'Campo Movil';

UPDATE public.nav_modules
SET default_label = 'Versión Móvil'
WHERE key = 'campo.vistas'
  AND default_label = 'Vistas de Campo';

UPDATE public.tideo_salud_configuracion
SET pantalla = 'Versión Móvil',
    seccion = 'Versión Móvil'
WHERE id = '7999d766-89d8-4f12-8530-8b664212c0e7'
  AND pestana = 'pantallas'
  AND pantalla = 'Vistas de Campo'
  AND seccion = 'Campo Móvil';