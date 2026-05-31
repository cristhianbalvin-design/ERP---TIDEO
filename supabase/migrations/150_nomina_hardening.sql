-- Hardening Nómina Perú: régimen MYPE, minero 14×7, quincena, cálculos corregidos
-- Migración 150

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. empresa_config — parámetros de nómina
-- ══════════════════════════════════════════════════════════════════════════════
alter table public.empresa_config
  add column if not exists regimen_laboral_empresa text not null default 'general'
    check (regimen_laboral_empresa in ('general', 'pequena_empresa', 'microempresa')),
  add column if not exists frecuencia_pago text not null default 'mensual'
    check (frecuencia_pago in ('mensual', 'quincenal')),
  add column if not exists dia_corte_mensual   integer not null default 25,
  add column if not exists dia_pago_mensual    integer not null default 30,
  add column if not exists dia_corte_q1        integer not null default 10,
  add column if not exists dia_pago_q1         integer not null default 15,
  add column if not exists dia_corte_q2        integer not null default 25,
  add column if not exists dia_pago_q2         integer not null default 30,
  add column if not exists pct_quincena_1      numeric(5,2) not null default 50
    check (pct_quincena_1 between 1 and 99),
  add column if not exists uit_vigente         numeric(10,2) not null default 5500,
  add column if not exists rmv_vigente         numeric(10,2) not null default 1130,
  add column if not exists ram_tope_afp        numeric(10,2) not null default 12598.91,
  add column if not exists pct_prima_seguro    numeric(5,4) not null default 1.37;

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. personal_operativo — régimen de jornada y sistema previsional ampliado
-- ══════════════════════════════════════════════════════════════════════════════
alter table public.personal_operativo
  add column if not exists regimen_jornada      text not null default 'general'
    check (regimen_jornada in ('general','minero_14x7','minero_20x10','minero_28x14')),
  add column if not exists horas_diarias_pactadas integer not null default 8,
  add column if not exists fecha_inicio_ciclo   date,
  add column if not exists bonif_altitud        numeric(10,2) not null default 0,
  add column if not exists tipo_comision_afp    text not null default 'mixta'
    check (tipo_comision_afp in ('flujo','mixta')),
  add column if not exists pct_comision_afp_flujo numeric(5,4) not null default 0;

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. personal_administrativo — campos de nómina (algunos ya pueden existir)
-- ══════════════════════════════════════════════════════════════════════════════
alter table public.personal_administrativo
  add column if not exists sistema_pensionario    text,
  add column if not exists afp_nombre             text,
  add column if not exists tiene_hijos            boolean not null default false,
  add column if not exists regimen_laboral        text not null default 'general',
  add column if not exists cuota_prestamo_mes     numeric(14,2) not null default 0,
  add column if not exists descuento_judicial     numeric(14,2) not null default 0,
  add column if not exists regimen_jornada        text not null default 'general'
    check (regimen_jornada in ('general','minero_14x7','minero_20x10','minero_28x14')),
  add column if not exists horas_diarias_pactadas integer not null default 8,
  add column if not exists fecha_inicio_ciclo     date,
  add column if not exists bonif_altitud          numeric(10,2) not null default 0,
  add column if not exists tipo_comision_afp      text not null default 'mixta'
    check (tipo_comision_afp in ('flujo','mixta')),
  add column if not exists pct_comision_afp_flujo numeric(5,4) not null default 0;

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. periodos_nomina — tabla de períodos configurados
-- ══════════════════════════════════════════════════════════════════════════════
create table if not exists public.periodos_nomina (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    text not null references public.empresas(id) on delete cascade,
  anio          integer not null,
  mes           integer not null check (mes between 1 and 12),
  periodo       text not null,
  fecha_corte   date,
  fecha_pago    date,
  estado        text not null default 'abierto'
    check (estado in ('abierto','en_proceso','cerrado','anulado')),
  total_trabajadores integer,
  masa_salarial_bruta numeric(14,2),
  total_neto    numeric(14,2),
  total_cargas_empresa numeric(14,2),
  cerrado_por   text,
  cerrado_en    timestamptz,
  creado_en     timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- Columnas que puede no tener si la tabla ya existía antes de esta migración
alter table public.periodos_nomina
  add column if not exists anio integer,
  add column if not exists mes integer,
  add column if not exists quincena integer,
  add column if not exists periodo text,
  add column if not exists fecha_corte date,
  add column if not exists fecha_pago date,
  add column if not exists estado text,
  add column if not exists total_trabajadores integer,
  add column if not exists masa_salarial_bruta numeric(14,2),
  add column if not exists total_neto numeric(14,2),
  add column if not exists total_cargas_empresa numeric(14,2),
  add column if not exists cerrado_por text,
  add column if not exists cerrado_en timestamptz,
  add column if not exists creado_en timestamptz default now(),
  add column if not exists actualizado_en timestamptz default now();

create unique index if not exists periodos_nomina_empresa_periodo_uq
  on public.periodos_nomina (empresa_id, anio, mes, coalesce(quincena, 0));

alter table public.periodos_nomina enable row level security;

drop policy if exists periodos_nomina_select on public.periodos_nomina;
drop policy if exists periodos_nomina_insert on public.periodos_nomina;
drop policy if exists periodos_nomina_update on public.periodos_nomina;

create policy periodos_nomina_select on public.periodos_nomina
  for select using (public.usuario_tiene_empresa(empresa_id));
create policy periodos_nomina_insert on public.periodos_nomina
  for insert with check (public.usuario_tiene_empresa(empresa_id));
create policy periodos_nomina_update on public.periodos_nomina
  for update using (public.usuario_tiene_empresa(empresa_id));

-- ══════════════════════════════════════════════════════════════════════════════
-- 5. nomina_detalle — línea por trabajador × período
-- ══════════════════════════════════════════════════════════════════════════════
create table if not exists public.nomina_detalle (
  id                        uuid primary key default gen_random_uuid(),
  empresa_id                text not null references public.empresas(id) on delete cascade,
  periodo_id                text not null references public.periodos_nomina(id) on delete cascade,
  trabajador_id             text not null,
  trabajador_tipo           text not null check (trabajador_tipo in ('operativo','administrativo')),
  -- Snapshots al momento de calcular
  regimen_jornada_snap      text,
  regimen_empresa_snap      text,
  -- Asistencia
  dias_laborables           integer,
  dias_laborados            integer,
  dias_computables          integer,
  horas_extra_tramo1_min    integer not null default 0,
  horas_extra_tramo2_min    integer not null default 0,
  -- Ingresos
  sueldo_base               numeric(14,2),
  remuneracion_bruta        numeric(14,2),
  asignacion_familiar       numeric(14,2) not null default 0,
  add_horas_extra           numeric(14,2) not null default 0,
  bonif_altitud             numeric(14,2) not null default 0,
  otros_ingresos            numeric(14,2) not null default 0,
  -- Descuentos trabajador
  desc_faltas               numeric(14,2) not null default 0,
  desc_tardanzas            numeric(14,2) not null default 0,
  aporte_afp                numeric(14,2) not null default 0,
  comision_afp_flujo        numeric(14,2) not null default 0,
  prima_seguro_afp          numeric(14,2) not null default 0,
  desc_onp                  numeric(14,2) not null default 0,
  retencion_ir              numeric(14,2) not null default 0,
  desc_prestamo             numeric(14,2) not null default 0,
  desc_anticipo             numeric(14,2) not null default 0,
  desc_judicial             numeric(14,2) not null default 0,
  total_descuentos          numeric(14,2),
  neto                      numeric(14,2),
  -- Cargas empresa
  essalud                   numeric(14,2) not null default 0,
  cts_mensualizado          numeric(14,2) not null default 0,
  tiene_cts                 boolean not null default true,
  gratificacion_mensualizada numeric(14,2) not null default 0,
  bonif_extraordinaria      numeric(14,2) not null default 0,
  tiene_gratificacion       boolean not null default true,
  vacaciones_mensualizadas  numeric(14,2) not null default 0,
  total_cargas              numeric(14,2),
  costo_real_empresa        numeric(14,2),
  -- Quincenal
  es_quincena               boolean not null default false,
  quincena                  integer,
  pct_quincena_aplicado     numeric(5,2),
  creado_en                 timestamptz not null default now()
);

create index if not exists nomina_detalle_periodo
  on public.nomina_detalle (periodo_id);

alter table public.nomina_detalle enable row level security;

drop policy if exists nomina_detalle_select on public.nomina_detalle;
drop policy if exists nomina_detalle_insert on public.nomina_detalle;

create policy nomina_detalle_select on public.nomina_detalle
  for select using (public.usuario_tiene_empresa(empresa_id));
create policy nomina_detalle_insert on public.nomina_detalle
  for insert with check (public.usuario_tiene_empresa(empresa_id));

select pg_notify('pgrst', 'reload schema');
