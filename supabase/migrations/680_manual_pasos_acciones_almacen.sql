-- 680: Los pasos del manual de Aria aceptan también las acciones de almacén despachar y liberar
-- (permisos extra de inventario que usuario_puede ya reconoce). Aplicada en producción el 2026-11-10
-- desde el SQL Editor para que el workflow sincronizar-aria.yml pudiera cargar la revisión 5.
BEGIN;
ALTER TABLE public.asistente_manual_pasos DROP CONSTRAINT IF EXISTS asistente_manual_pasos_permiso_accion_check;
ALTER TABLE public.asistente_manual_pasos ADD CONSTRAINT asistente_manual_pasos_permiso_accion_check
  CHECK (permiso_accion = ANY (ARRAY['crear','editar','aprobar','anular','exportar','despachar','liberar']));
DO $$ BEGIN
  IF pg_get_constraintdef((SELECT oid FROM pg_constraint WHERE conname = 'asistente_manual_pasos_permiso_accion_check')) NOT LIKE '%liberar%'
  THEN RAISE EXCEPTION '680: la regla no quedó ampliada'; END IF;
END $$;
COMMIT;
