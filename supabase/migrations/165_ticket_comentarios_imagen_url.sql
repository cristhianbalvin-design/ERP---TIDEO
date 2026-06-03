-- Agrega la columna imagen_url a ticket_comentarios si no existe.
-- La migración 149 no fue aplicada en producción, por lo que la tabla
-- fue creada sin esta columna.

alter table public.ticket_comentarios
  add column if not exists imagen_url text;

select pg_notify('pgrst', 'reload schema');
