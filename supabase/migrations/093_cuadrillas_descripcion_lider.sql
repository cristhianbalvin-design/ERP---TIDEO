-- Agregar descripcion y lider_id a cuadrillas
alter table public.cuadrillas
  add column if not exists descripcion text,
  add column if not exists lider_id text references public.personal_operativo(id) on delete set null;
