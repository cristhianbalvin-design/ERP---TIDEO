-- ============================================================================
-- 276 · Fix: supervisor_id huerfano bloqueaba guardado en Personal Operativo
-- ============================================================================
-- personal_operativo.supervisor_id referencia personal_operativo.id con
-- ON DELETE SET NULL (migracion 056). Algunos registros quedaron con un
-- supervisor_id que ya no existe en la tabla (ej. restauraciones de datos
-- que no disparan los triggers de FK), lo que hace fallar cualquier UPDATE
-- posterior con "violates foreign key constraint personal_operativo_supervisor_id_fkey".

UPDATE public.personal_operativo po
SET supervisor_id = NULL
WHERE po.supervisor_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.personal_operativo sup WHERE sup.id = po.supervisor_id
  );

SELECT pg_notify('pgrst', 'reload schema');
