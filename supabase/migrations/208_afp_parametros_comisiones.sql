-- Migración 208: Agregar columnas de comisiones a afp_parametros

-- 1. Agregar las nuevas columnas
alter table public.afp_parametros
  add column if not exists pct_comision_flujo numeric(5,2) not null default 0,
  add column if not exists pct_comision_mixta_saldo numeric(5,2) not null default 0;

-- Nota regulatoria: desde febrero de 2023, la comisión por flujo para comisión mixta es 0% para todas las AFP.
-- Esto significa que no hay descuento sobre la remuneración mensual en el sistema mixto (solo sobre el saldo del fondo).

comment on column public.afp_parametros.pct_comision_flujo is 'Porcentaje de comisión sobre el flujo mensual';
comment on column public.afp_parametros.pct_comision_mixta_saldo is 'Porcentaje anual sobre el saldo del fondo para comisión mixta (flujo de esta comisión es 0% desde feb 2023)';

-- 2. Actualizar/Insertar para las empresas existentes
-- Valores iniciales (SBS a junio 2026):
-- Habitat: Prima 1.37, Flujo 1.47, Mixta 1.25
-- Integra: Prima 1.37, Flujo 1.55, Mixta 0.78
-- Prima:   Prima 1.37, Flujo 1.60, Mixta 1.25
-- Profuturo: Prima 1.37, Flujo 1.69, Mixta 0.68

insert into public.afp_parametros (empresa_id, afp_nombre, pct_prima_seguro, vigente_desde, pct_comision_flujo, pct_comision_mixta_saldo)
select e.id, v.afp_nombre, 1.37, date '2026-01-01', v.flujo, v.mixta
from public.empresas e
cross join (values
  ('Habitat', 1.47, 1.25),
  ('Integra', 1.55, 0.78),
  ('Prima', 1.60, 1.25),
  ('Profuturo', 1.69, 0.68)
) as v(afp_nombre, flujo, mixta)
on conflict (empresa_id, afp_nombre, vigente_desde) do update
set pct_comision_flujo = excluded.pct_comision_flujo,
    pct_comision_mixta_saldo = excluded.pct_comision_mixta_saldo;

-- 3. Crear función y trigger para onboarding de nuevos tenants
create or replace function public.seed_afp_parametros_nueva_empresa()
returns trigger as $$
begin
  insert into public.afp_parametros (empresa_id, afp_nombre, pct_prima_seguro, vigente_desde, pct_comision_flujo, pct_comision_mixta_saldo)
  values
    (new.id, 'Habitat', 1.37, date '2026-01-01', 1.47, 1.25),
    (new.id, 'Integra', 1.37, date '2026-01-01', 1.55, 0.78),
    (new.id, 'Prima', 1.37, date '2026-01-01', 1.60, 1.25),
    (new.id, 'Profuturo', 1.37, date '2026-01-01', 1.69, 0.68)
  on conflict (empresa_id, afp_nombre, vigente_desde) do nothing;
  
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_seed_afp_parametros_nueva_empresa on public.empresas;
create trigger trg_seed_afp_parametros_nueva_empresa
  after insert on public.empresas
  for each row
  execute function public.seed_afp_parametros_nueva_empresa();

select pg_notify('pgrst', 'reload schema');
