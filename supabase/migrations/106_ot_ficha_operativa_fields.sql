-- Campos editables desde la ficha de OT.
-- Evita que los cambios de backoffice queden solo en estado local.

alter table public.ordenes_trabajo
  add column if not exists fecha_fin date,
  add column if not exists supervisor text,
  add column if not exists facturable boolean not null default true;

