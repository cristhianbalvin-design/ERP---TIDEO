BEGIN;

ALTER TABLE public.leads
  RENAME COLUMN ruc TO numero_documento;

ALTER TABLE public.leads
  ADD COLUMN tipo_documento text NOT NULL DEFAULT 'RUC',
  ADD CONSTRAINT leads_tipo_documento_check
    CHECK (tipo_documento IN ('RUC', 'DNI', 'TAX_ID_EXTRANJERO')),
  ALTER COLUMN empresa_nombre DROP NOT NULL,
  ADD CONSTRAINT leads_empresa_nombre_requerido_por_documento_check
    CHECK (
      tipo_documento = 'DNI'
      OR nullif(btrim(empresa_nombre), '') IS NOT NULL
    );

ALTER TABLE public.cuentas
  DROP CONSTRAINT cuentas_tipo_documento_check,
  ADD CONSTRAINT cuentas_tipo_documento_check
    CHECK (tipo_documento IN ('RUC', 'DNI', 'TAX_ID_EXTRANJERO'));

COMMENT ON COLUMN public.cuentas.ruc IS
  'Nombre histórico: almacena RUC cuando tipo_documento=RUC, DNI cuando tipo_documento=DNI y Tax ID cuando tipo_documento=TAX_ID_EXTRANJERO.';

COMMENT ON COLUMN public.cuentas.tipo_documento IS
  'Tipo de identificación fiscal de la cuenta: RUC, DNI o TAX_ID_EXTRANJERO.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads'
      AND column_name = 'numero_documento'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads'
      AND column_name = 'tipo_documento'
  ) THEN
    RAISE EXCEPTION 'La estructura esperada de leads no fue creada';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'cuentas'
      AND column_name = 'ruc'
  ) THEN
    RAISE EXCEPTION 'La columna ruc esperada de cuentas no existe';
  END IF;
END $$;

SELECT table_name, column_name, is_nullable, column_default,
  col_description(format('%I.%I', table_schema, table_name)::regclass::oid, ordinal_position) AS comentario
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('leads', 'cuentas')
  AND column_name IN ('numero_documento', 'tipo_documento', 'empresa_nombre', 'ruc')
ORDER BY table_name, ordinal_position;

SELECT conrelid::regclass AS tabla, conname, pg_get_constraintdef(oid) AS definicion
FROM pg_constraint
WHERE conrelid IN ('public.leads'::regclass, 'public.cuentas'::regclass)
  AND conname IN (
    'leads_tipo_documento_check',
    'leads_empresa_nombre_requerido_por_documento_check',
    'cuentas_tipo_documento_check'
  )
ORDER BY conrelid::regclass::text, conname;

COMMIT;
