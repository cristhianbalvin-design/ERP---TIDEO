-- Evita que un colaborador pueda ser asignado como su propio supervisor.
-- Aplica para supervisor_id (referencia al id interno de personal).
-- La restricción de jefe_user_id ya fue agregada en la migración 069.
-- IMPORTANTE: Ejecutar el script audit_jefaturas.js para limpiar inconsistencias ANTES de ejecutar esta migración.

ALTER TABLE public.personal_operativo
ADD CONSTRAINT chk_operativo_no_autosupervisor 
CHECK (supervisor_id IS NULL OR supervisor_id != id);

ALTER TABLE public.personal_administrativo
ADD CONSTRAINT chk_admin_no_autosupervisor 
CHECK (supervisor_id IS NULL OR supervisor_id != id);
