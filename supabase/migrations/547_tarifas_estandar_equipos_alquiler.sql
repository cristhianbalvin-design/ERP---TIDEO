-- 547 · Tarifa estándar por activo para contratos de alquiler.
-- Cada fila del maestro corresponde a un activo_id individual.

begin;

do $guard$
begin
  if exists (select 1 from public.contratos_alquiler limit 1)
     or exists (select 1 from public.contratos_alquiler_equipos limit 1) then
    raise exception
      '547_GUARD: contratos_alquiler y contratos_alquiler_equipos deben estar vacías antes de cambiar la granularidad tarifaria.';
  end if;
end;
$guard$;

create table public.tarifas_estandar_equipos (
  activo_id   text primary key references public.activos(id) on delete cascade,
  tarifa_hora numeric(14,2) not null check (tarifa_hora >= 0),
  moneda      text not null default 'USD' check (char_length(moneda) = 3),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index tarifas_estandar_equipos_moneda_idx
  on public.tarifas_estandar_equipos (moneda);

alter table public.tarifas_estandar_equipos enable row level security;

create policy tarifas_estandar_equipos_select
on public.tarifas_estandar_equipos
for select
using (
  exists (
    select 1
    from public.activos a
    where a.id = activo_id
      and public.usuario_tiene_empresa(a.empresa_id)
  )
);

create policy tarifas_estandar_equipos_insert
on public.tarifas_estandar_equipos
for insert
with check (
  exists (
    select 1
    from public.activos a
    where a.id = activo_id
      and public.usuario_tiene_empresa(a.empresa_id)
  )
);

create policy tarifas_estandar_equipos_update
on public.tarifas_estandar_equipos
for update
using (
  exists (
    select 1
    from public.activos a
    where a.id = activo_id
      and public.usuario_tiene_empresa(a.empresa_id)
  )
)
with check (
  exists (
    select 1
    from public.activos a
    where a.id = activo_id
      and public.usuario_tiene_empresa(a.empresa_id)
  )
);

create policy tarifas_estandar_equipos_delete
on public.tarifas_estandar_equipos
for delete
using (
  exists (
    select 1
    from public.activos a
    where a.id = activo_id
      and public.usuario_es_admin_empresa(a.empresa_id)
  )
);

grant select, insert, update, delete
on public.tarifas_estandar_equipos
to authenticated;

alter table public.contratos_alquiler_equipos
  add column tarifa_hora_override numeric(14,2)
    check (tarifa_hora_override is null or tarifa_hora_override >= 0);

alter table public.contratos_alquiler_equipos
  add constraint contratos_alquiler_equipos_equipo_id_fkey
  foreign key (equipo_id)
  references public.activos(id)
  on delete restrict;

drop index if exists idx_contratos_alquiler_equipos_equipo;
create index idx_contratos_alquiler_equipos_equipo
  on public.contratos_alquiler_equipos (equipo_id);

alter table public.contratos_alquiler
  drop column if exists tarifa_monto,
  drop column if exists tarifa_periodicidad;

select pg_notify('pgrst', 'reload schema');
commit;
