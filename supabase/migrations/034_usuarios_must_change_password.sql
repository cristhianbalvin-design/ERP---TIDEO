-- Agrega columna must_change_password a tabla usuarios existente
alter table public.usuarios
  add column if not exists must_change_password boolean default true;
