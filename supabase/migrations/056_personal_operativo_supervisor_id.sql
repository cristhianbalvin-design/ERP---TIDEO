-- Formalizar supervisor directo de personal operativo.
-- Mantiene la columna supervisor como texto legado, pero agrega supervisor_id
-- para guardar la relacion real contra otro colaborador operativo.

ALTER TABLE public.personal_operativo
  ADD COLUMN IF NOT EXISTS supervisor_id text;

UPDATE public.personal_operativo po
SET supervisor_id = sup.id
FROM public.personal_operativo sup
WHERE po.supervisor_id IS NULL
  AND po.supervisor IS NOT NULL
  AND po.supervisor <> ''
  AND sup.empresa_id = po.empresa_id
  AND lower(sup.nombre) = lower(po.supervisor)
  AND sup.id <> po.id;

CREATE INDEX IF NOT EXISTS idx_personal_operativo_supervisor_id
  ON public.personal_operativo(supervisor_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'personal_operativo_supervisor_id_fkey'
  ) THEN
    ALTER TABLE public.personal_operativo
      ADD CONSTRAINT personal_operativo_supervisor_id_fkey
      FOREIGN KEY (supervisor_id)
      REFERENCES public.personal_operativo(id)
      ON DELETE SET NULL;
  END IF;
END $$;

SELECT pg_notify('pgrst', 'reload schema');
