-- Agrega columna solicitante (texto del area) y ot_id a solpe_interna

alter table public.solpe_interna
  add column if not exists solicitante text,
  add column if not exists ot_id text references public.ordenes_trabajo(id) on delete set null;

create index if not exists idx_solpe_interna_ot_id
  on public.solpe_interna (ot_id)
  where ot_id is not null;
