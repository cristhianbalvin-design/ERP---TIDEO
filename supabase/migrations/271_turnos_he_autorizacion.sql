-- Añadir flag de requiere autorización previa para horas extras
-- null: hereda de la empresa (empresa_config.requiere_autorizacion_he)
-- true: exige autorización explícitamente para este turno
-- false: no exige autorización explícitamente para este turno

ALTER TABLE public.turnos
ADD COLUMN IF NOT EXISTS requiere_autorizacion_he boolean DEFAULT null;

COMMENT ON COLUMN public.turnos.requiere_autorizacion_he IS 'Si es true, exige autorización previa de HE. Si es false, no exige. Si es null, hereda la configuración de la empresa (empresa_config.requiere_autorizacion_he).';
