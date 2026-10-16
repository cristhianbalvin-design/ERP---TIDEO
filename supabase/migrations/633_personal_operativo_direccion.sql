-- 633: domicilio del personal operativo (necesario para contratos y renovaciones con firma digital).
-- Aditiva: agrega la columna si no existe. personal_administrativo ya tiene "direccion".

ALTER TABLE public.personal_operativo
  ADD COLUMN IF NOT EXISTS direccion text;

COMMENT ON COLUMN public.personal_operativo.direccion IS
  'Domicilio del trabajador. Se usa en contratos y renovaciones generados desde plantillas.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'personal_operativo'
       AND column_name = 'direccion'
       AND data_type = 'text'
  ) THEN
    RAISE EXCEPTION '633: la columna personal_operativo.direccion no quedó creada';
  END IF;
END $$;
