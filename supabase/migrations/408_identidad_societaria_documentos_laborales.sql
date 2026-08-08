alter table public.amonestaciones_personal
  add column if not exists sociedad_id uuid default null
    references public.sociedades(id) on delete set null;

alter table public.solicitudes_rrhh
  add column if not exists sociedad_id uuid default null
    references public.sociedades(id) on delete set null;

alter table public.portal_constancias_trabajo
  add column if not exists sociedad_id uuid default null
    references public.sociedades(id) on delete set null;

create index if not exists idx_amonestaciones_personal_sociedad
  on public.amonestaciones_personal (empresa_id, sociedad_id);

create index if not exists idx_solicitudes_rrhh_sociedad
  on public.solicitudes_rrhh (empresa_id, sociedad_id);

create index if not exists idx_portal_constancias_sociedad
  on public.portal_constancias_trabajo (empresa_id, sociedad_id);

select pg_notify('pgrst', 'reload schema');
