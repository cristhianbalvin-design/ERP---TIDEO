-- 554 · Maestro independiente de tarifas comerciales de mano de obra.
-- No depende de personal, cargos ni especialidades técnicas.
-- No modela ubicación, alcance ni sede.

begin;
create table public.tarifas_mano_obra_comercial (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       text not null references public.empresas(id),
  especialidad     text not null,
  categoria        text not null,
  tarifa_normal    numeric(14,2) not null check (tarifa_normal >= 0),
  tarifa_stand_by  numeric(14,2) not null check (tarifa_stand_by >= 0),
  moneda           text not null default 'PEN' check (char_length(moneda) = 3),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint tarifas_mo_comercial_especialidad_no_vacia
    check (btrim(especialidad) <> ''),
  constraint tarifas_mo_comercial_categoria_no_vacia
    check (btrim(categoria) <> ''),
  constraint tarifas_mo_comercial_empresa_especialidad_categoria_key
    unique (empresa_id, especialidad, categoria)
);
comment on table public.tarifas_mano_obra_comercial is
  'Maestro independiente de tarifas comerciales de mano de obra; sin ubicación ni FK a catálogos técnicos o de personal.';
alter table public.tarifas_mano_obra_comercial enable row level security;
create policy tarifas_mo_comercial_tenant
on public.tarifas_mano_obra_comercial
for all to authenticated
using (public.usuario_tiene_empresa(empresa_id))
with check (public.usuario_tiene_empresa(empresa_id));
grant select, insert, update, delete
on public.tarifas_mano_obra_comercial
to authenticated;
select pg_notify('pgrst', 'reload schema');
commit;
