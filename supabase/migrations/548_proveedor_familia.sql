-- TIDEO ERP - Relacion proveedor <-> familia de materiales.
-- No contiene backfill: la carga de cobertura se ejecutara en una fase posterior.

create table if not exists public.proveedor_familia (
  id          text primary key default ('pvf_' || left(replace(gen_random_uuid()::text, '-', ''), 18)),
  empresa_id  text not null references public.empresas(id),
  proveedor_id text not null references public.proveedores(id) on delete restrict,
  familia_id  text not null references public.material_familias(id) on delete restrict,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint proveedor_familia_unq unique (empresa_id, proveedor_id, familia_id)
);

create index if not exists idx_proveedor_familia_proveedor
  on public.proveedor_familia (empresa_id, proveedor_id, familia_id);

create index if not exists idx_proveedor_familia_familia
  on public.proveedor_familia (empresa_id, familia_id, proveedor_id);

alter table public.proveedor_familia enable row level security;

drop policy if exists tenant_proveedor_familia_isolation
  on public.proveedor_familia;

create policy tenant_proveedor_familia_isolation
on public.proveedor_familia
for all
using (public.usuario_tiene_empresa(empresa_id))
with check (public.usuario_tiene_empresa(empresa_id));

notify pgrst, 'reload schema';
