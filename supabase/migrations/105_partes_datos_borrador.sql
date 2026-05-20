-- Almacena el estado completo del formulario de un parte borrador.
-- Permite retomar la edición tras recargar la página.

alter table public.partes_diarios
  add column if not exists datos_borrador jsonb default null;
