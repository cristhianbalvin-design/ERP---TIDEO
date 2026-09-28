-- 558 · Trazabilidad del tarifario de Flota & Alquileres en cotizaciones.
-- El contexto es opcional para no alterar los caminos existentes.

alter table public.cotizaciones
  add column if not exists proyecto_id text
    references public.proyectos(id) on delete set null,
  add column if not exists contrato_alquiler_id text
    references public.contratos_alquiler(id) on delete set null;
alter table public.cotizaciones_especiales
  add column if not exists proyecto_id text
    references public.proyectos(id) on delete set null,
  add column if not exists contrato_alquiler_id text
    references public.contratos_alquiler(id) on delete set null;
create index if not exists cotizaciones_proyecto_idx
  on public.cotizaciones (proyecto_id)
  where proyecto_id is not null;
create index if not exists cotizaciones_contrato_alquiler_idx
  on public.cotizaciones (contrato_alquiler_id)
  where contrato_alquiler_id is not null;
create index if not exists cotizaciones_especiales_proyecto_idx
  on public.cotizaciones_especiales (proyecto_id)
  where proyecto_id is not null;
create index if not exists cotizaciones_especiales_contrato_alquiler_idx
  on public.cotizaciones_especiales (contrato_alquiler_id)
  where contrato_alquiler_id is not null;
select pg_notify('pgrst', 'reload schema');
