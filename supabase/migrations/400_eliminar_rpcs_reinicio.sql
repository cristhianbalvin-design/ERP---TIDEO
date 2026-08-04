-- ============================================================================
-- 400 · Eliminar RPCs de particionamiento huérfanas
-- ============================================================================
-- Se eliminan las funciones de particionamiento antiguo que ya no se utilizan
-- para evitar confusión futura.

DROP FUNCTION IF EXISTS public.reiniciar_roster_minero(text, text, date, date);
DROP FUNCTION IF EXISTS public.previsualizar_reinicio_roster_minero(text, text, date, date);
DROP FUNCTION IF EXISTS public.reinicio_roster_minero_impactos(text, text, date, date);

DROP FUNCTION IF EXISTS public.reiniciar_jornada_trabajadores(text, text[], date, date);
DROP FUNCTION IF EXISTS public.previsualizar_reinicio_jornada_trabajadores(text, text[], date, date);
DROP FUNCTION IF EXISTS public.reinicio_jornada_trabajadores_impactos(text, text[], date, date);

SELECT pg_notify('pgrst', 'reload schema');
