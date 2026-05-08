-- Asegurar columnas usadas por el formulario de personal operativo.
-- Es idempotente para bases que ya aplicaron migraciones anteriores.

ALTER TABLE public.personal_operativo
  ADD COLUMN IF NOT EXISTS sede text,
  ADD COLUMN IF NOT EXISTS supervisor text,
  ADD COLUMN IF NOT EXISTS especialidad2 text,
  ADD COLUMN IF NOT EXISTS fecha_ingreso date,
  ADD COLUMN IF NOT EXISTS acceso_campo boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS perfil_campo text DEFAULT 'Tecnico',
  ADD COLUMN IF NOT EXISTS docs jsonb DEFAULT '{"sctr":"pendiente","medico":"pendiente","epp":"pendiente","licencia":"pendiente"}'::jsonb,
  ADD COLUMN IF NOT EXISTS tipo_contrato text DEFAULT 'Planilla',
  ADD COLUMN IF NOT EXISTS afp_nombre text,
  ADD COLUMN IF NOT EXISTS tiene_hijos boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS regimen_laboral text,
  ADD COLUMN IF NOT EXISTS cuota_prestamo_mes numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS descuento_judicial numeric(14,2) DEFAULT 0;

UPDATE public.personal_operativo
SET acceso_campo = COALESCE(acceso_campo, true),
    perfil_campo = COALESCE(perfil_campo, 'Tecnico'),
    docs = COALESCE(docs, '{"sctr":"pendiente","medico":"pendiente","epp":"pendiente","licencia":"pendiente"}'::jsonb),
    tipo_contrato = COALESCE(tipo_contrato, 'Planilla'),
    tiene_hijos = COALESCE(tiene_hijos, false),
    cuota_prestamo_mes = COALESCE(cuota_prestamo_mes, 0),
    descuento_judicial = COALESCE(descuento_judicial, 0);

SELECT pg_notify('pgrst', 'reload schema');
