-- ============================================================================
-- 334 · Tipo de sede (oficina vs. unidad minera) + asignación trabajador -> UM
-- ============================================================================
-- La auditoría previa confirmó que hoy no existe una fuente de verdad dedicada
-- para "a qué Unidad Minera (UM) pertenece un trabajador": sede_id en
-- personal_operativo está vacío o apunta a oficinas administrativas en el
-- 100% de los 15 casos reales de régimen ciclo_acumulativo, y
-- rrhh_geocerca_asignaciones (que acierta en 12/15 por casualidad) es una
-- tabla de geofencing/SAR sin ninguna restricción de negocio — no debe
-- reutilizarse como dependencia del roster.
--
-- Este cambio es puramente aditivo sobre sedes (columna nueva con default) y
-- crea una tabla nueva independiente para la pertenencia trabajador -> UM con
-- tramos de vigencia. No toca sede_id en personal_operativo/administrativo,
-- ni rrhh_geocerca_asignaciones, ni ninguna tabla del roster ya construida.

-- 1. Columna tipo en sedes (aditiva) --------------------------------------------

alter table public.sedes
  add column if not exists tipo text not null default 'oficina' check (tipo in ('oficina', 'unidad_minera'));

-- Backfill: las 6 UM reales de DIFESMAQ (emp_20601829101), por id exacto
-- (confirmado por consulta directa en la auditoría previa).
update public.sedes set tipo = 'unidad_minera'
where id in (
  'sed_fa469b84d76c4e95a4', -- UM CORIPUNO
  'sed_8d09d662c11c4378a6', -- UM ISCAYCRUZ
  'sed_1097afb35360402bab', -- UM KOLPA
  'sed_01568bb16500411a8f', -- UM MOROCOCHA
  'sed_9127aad37ec64214ba', -- UM PEPAS DE ORO
  'sed_01c7fc0a15e54e1090'  -- UM TANGANA
);
-- SEDE LURIN (sed_647087daad4f4069a6) y SEDE  CARAPONGO (sed_95c82cc26bda4ab08b)
-- quedan con el default 'oficina' — no se tocan explícitamente.

-- 2. Tabla de pertenencia trabajador -> Unidad Minera, con tramos de vigencia --
-- Requiere btree_gist para poder usar igualdad de texto dentro del EXCLUDE.

create extension if not exists btree_gist;

create table if not exists public.personal_asignaciones_um (
  id            text primary key default ('umas_' || substr(md5(random()::text || clock_timestamp()::text), 1, 18)),
  empresa_id    text not null references public.empresas(id) on delete cascade,
  personal_id   text not null,
  personal_tipo text not null check (personal_tipo in ('operativo', 'administrativo')),
  sede_id       text not null references public.sedes(id),
  fecha_inicio  date not null,
  fecha_fin     date,
  motivo        text,
  creado_por    text references public.usuarios(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint personal_asignaciones_um_fechas_check check (fecha_fin is null or fecha_fin >= fecha_inicio),

  -- Un trabajador no puede tener dos tramos de UM cuyo rango de fechas se
  -- superponga, sin importar si están abiertos, cerrados o son históricos.
  exclude using gist (
    personal_id with =,
    personal_tipo with =,
    daterange(fecha_inicio, coalesce(fecha_fin, 'infinity'::date), '[]') with &&
  )
);

create index if not exists idx_personal_asignaciones_um_personal
  on public.personal_asignaciones_um (empresa_id, personal_id, personal_tipo, fecha_inicio desc);

alter table public.personal_asignaciones_um enable row level security;

drop policy if exists personal_asignaciones_um_isolation on public.personal_asignaciones_um;
create policy personal_asignaciones_um_isolation on public.personal_asignaciones_um
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

-- 3. La sede asignada debe estar marcada como unidad minera --------------------

create or replace function public.validar_sede_es_unidad_minera()
returns trigger
language plpgsql
as $$
declare
  v_tipo text;
begin
  select tipo into v_tipo from public.sedes where id = NEW.sede_id;
  if v_tipo is null then
    raise exception 'La sede % no existe.', NEW.sede_id;
  end if;
  if v_tipo <> 'unidad_minera' then
    raise exception 'La sede % no está marcada como unidad minera (tipo actual: %).', NEW.sede_id, v_tipo;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_validar_sede_es_unidad_minera on public.personal_asignaciones_um;
create trigger trg_validar_sede_es_unidad_minera
before insert or update on public.personal_asignaciones_um
for each row execute function public.validar_sede_es_unidad_minera();

-- 4. Carga inicial: 12 de los 15 trabajadores con ciclo_acumulativo, usando la
-- UM ya confirmada en rrhh_geocerca_asignaciones. Los 3 restantes (Varona
-- Girón, Ñaña Matos, Rivera Huamán) quedan sin asignación — no se inventa su
-- UM. fecha_inicio = fecha_inicio del tramo vigente en personal_asignaciones_jornada.

insert into public.personal_asignaciones_um (empresa_id, personal_id, personal_tipo, sede_id, fecha_inicio, motivo) values
  ('emp_20601829101', 'pop_1782165665853', 'operativo', 'sed_01c7fc0a15e54e1090', '2026-06-25', 'Carga inicial: UM confirmada via rrhh_geocerca_asignaciones (auditoría GAP-16)'),
  ('emp_20601829101', 'pop_1780966157331', 'operativo', 'sed_01c7fc0a15e54e1090', '2026-06-25', 'Carga inicial: UM confirmada via rrhh_geocerca_asignaciones (auditoría GAP-16)'),
  ('emp_20601829101', 'pop_1781013965295', 'operativo', 'sed_fa469b84d76c4e95a4', '2026-06-25', 'Carga inicial: UM confirmada via rrhh_geocerca_asignaciones (auditoría GAP-16)'),
  ('emp_20601829101', 'pop_1781014384717', 'operativo', 'sed_9127aad37ec64214ba', '2026-06-30', 'Carga inicial: UM confirmada via rrhh_geocerca_asignaciones (auditoría GAP-16)'),
  ('emp_20601829101', 'pop_1782165495769', 'operativo', 'sed_01568bb16500411a8f', '2026-07-01', 'Carga inicial: UM confirmada via rrhh_geocerca_asignaciones (auditoría GAP-16)'),
  ('emp_20601829101', 'pop_1781014695900', 'operativo', 'sed_8d09d662c11c4378a6', '2026-07-01', 'Carga inicial: UM confirmada via rrhh_geocerca_asignaciones (auditoría GAP-16)'),
  ('emp_20601829101', 'pop_1781015087846', 'operativo', 'sed_9127aad37ec64214ba', '2026-06-30', 'Carga inicial: UM confirmada via rrhh_geocerca_asignaciones (auditoría GAP-16)'),
  ('emp_20601829101', 'pop_1782165868709', 'operativo', 'sed_01568bb16500411a8f', '2026-06-24', 'Carga inicial: UM confirmada via rrhh_geocerca_asignaciones (auditoría GAP-16)'),
  ('emp_20601829101', 'pop_1781016512343', 'operativo', 'sed_01568bb16500411a8f', '2026-07-01', 'Carga inicial: UM confirmada via rrhh_geocerca_asignaciones (auditoría GAP-16)'),
  ('emp_20601829101', 'pop_1781016725300', 'operativo', 'sed_01c7fc0a15e54e1090', '2026-06-24', 'Carga inicial: UM confirmada via rrhh_geocerca_asignaciones (auditoría GAP-16)'),
  ('emp_20601829101', 'pop_1781017203106', 'operativo', 'sed_01c7fc0a15e54e1090', '2026-07-01', 'Carga inicial: UM confirmada via rrhh_geocerca_asignaciones (auditoría GAP-16)'),
  ('emp_20601829101', 'pop_1781017281608', 'operativo', 'sed_01568bb16500411a8f', '2026-06-30', 'Carga inicial: UM confirmada via rrhh_geocerca_asignaciones (auditoría GAP-16)')
on conflict do nothing;

select pg_notify('pgrst', 'reload schema');
