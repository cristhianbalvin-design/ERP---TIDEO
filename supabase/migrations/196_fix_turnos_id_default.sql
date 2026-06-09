-- La tabla turnos fue creada sin DEFAULT en la columna id.
-- Al hacer INSERT sin id, PostgreSQL no genera UUID y viola el NOT NULL.
ALTER TABLE public.turnos ALTER COLUMN id SET DEFAULT gen_random_uuid();
