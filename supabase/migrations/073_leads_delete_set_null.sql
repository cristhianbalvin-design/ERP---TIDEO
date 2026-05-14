-- Permite eliminar leads sin borrar documentos derivados.
-- Las entidades relacionadas conservan su registro y pierden solo el puntero al lead eliminado.

alter table if exists public.oportunidades
  drop constraint if exists oportunidades_lead_id_fkey;

alter table if exists public.oportunidades
  add constraint oportunidades_lead_id_fkey
  foreign key (lead_id) references public.leads(id) on delete set null;

alter table if exists public.actividades_comerciales
  drop constraint if exists actividades_comerciales_lead_id_fkey;

alter table if exists public.actividades_comerciales
  add constraint actividades_comerciales_lead_id_fkey
  foreign key (lead_id) references public.leads(id) on delete set null;

alter table if exists public.agenda_comercial
  drop constraint if exists agenda_comercial_lead_id_fkey;

alter table if exists public.agenda_comercial
  add constraint agenda_comercial_lead_id_fkey
  foreign key (lead_id) references public.leads(id) on delete set null;
