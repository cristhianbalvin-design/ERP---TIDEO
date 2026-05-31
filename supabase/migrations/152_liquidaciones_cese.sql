-- Módulo Liquidación por Cese
-- D.Leg.728, D.S.003-97-TR, D.S.001-97-TR (CTS), Ley 27735 (gratificaciones)
-- Los montos son referenciales. Validar con asesor legal o contador antes de procesar.

-- ─── 1. Ampliar personal_operativo ────────────────────────────────────────────
alter table public.personal_operativo
  add column if not exists fecha_ingreso date,
  add column if not exists estado_laboral text not null default 'activo'
    check (estado_laboral in ('activo','cesado')),
  add column if not exists fecha_cese date,
  add column if not exists tipo_cese text
    check (tipo_cese is null or tipo_cese in (
      'renuncia_voluntaria','despido_arbitrario','mutuo_acuerdo',
      'vencimiento_contrato','fallecimiento'
    ));

-- ─── 2. Ampliar personal_administrativo ───────────────────────────────────────
alter table public.personal_administrativo
  add column if not exists fecha_ingreso date,
  add column if not exists estado_laboral text not null default 'activo'
    check (estado_laboral in ('activo','cesado')),
  add column if not exists fecha_cese date,
  add column if not exists tipo_cese text
    check (tipo_cese is null or tipo_cese in (
      'renuncia_voluntaria','despido_arbitrario','mutuo_acuerdo',
      'vencimiento_contrato','fallecimiento'
    ));

-- ─── 3. Tabla principal ───────────────────────────────────────────────────────
create table if not exists public.liquidaciones_cese (
  id                    uuid    primary key default gen_random_uuid(),
  empresa_id            text    not null references public.empresas(id) on delete cascade,
  personal_id           text    not null,
  personal_nombre       text    not null,
  personal_tipo         text    not null check (personal_tipo in ('operativo','administrativo')),
  tipo_cese             text    not null
    check (tipo_cese in ('renuncia_voluntaria','despido_arbitrario','mutuo_acuerdo',
                         'vencimiento_contrato','fallecimiento')),
  fecha_cese            date    not null,
  fecha_ingreso         date    not null,
  anios_servicio        integer not null default 0,
  meses_servicio        integer not null default 0,
  dias_servicio         integer not null default 0,
  remuneracion_computable numeric(14,2) not null default 0,
  monto_total           numeric(14,2) not null default 0,
  estado                text    not null default 'calculada'
    check (estado in ('borrador','calculada','confirmada','anulada')),
  observaciones         text,
  motivo_anulacion      text,
  beneficiario_nombre   text,
  beneficiario_dni      text,
  cxp_id                uuid,
  parametros_calculo    jsonb   not null default '{}'::jsonb,
  creado_por            uuid    references auth.users(id) on delete set null,
  confirmado_por        uuid    references auth.users(id) on delete set null,
  anulado_por           uuid    references auth.users(id) on delete set null,
  confirmado_en         timestamptz,
  anulado_en            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Solo una liquidación activa (no anulada) por persona por empresa
create unique index if not exists uq_liquidaciones_cese_activa
  on public.liquidaciones_cese (empresa_id, personal_id)
  where estado <> 'anulada';

-- ─── 4. Tabla de conceptos ────────────────────────────────────────────────────
create table if not exists public.liquidaciones_cese_conceptos (
  id                  uuid  primary key default gen_random_uuid(),
  empresa_id          text  not null references public.empresas(id) on delete cascade,
  liquidacion_id      uuid  not null references public.liquidaciones_cese(id) on delete cascade,
  concepto            text  not null
    check (concepto in ('remuneracion_pendiente','vacaciones_truncas','cts_proporcional',
                        'gratificacion_proporcional','indemnizacion','otros')),
  descripcion         text  not null,
  descripcion_calculo text,
  monto               numeric(14,2) not null default 0,
  aplica              boolean not null default true,
  motivo_no_aplica    text,
  es_descuento        boolean not null default false,
  orden               integer not null default 1,
  created_at          timestamptz not null default now()
);

-- ─── 5. Índices ───────────────────────────────────────────────────────────────
create index if not exists idx_liquidaciones_cese_empresa_estado
  on public.liquidaciones_cese (empresa_id, estado, fecha_cese desc);

create index if not exists idx_liquidaciones_cese_personal
  on public.liquidaciones_cese (empresa_id, personal_id);

create index if not exists idx_liquidaciones_cese_conceptos_liq
  on public.liquidaciones_cese_conceptos (liquidacion_id, orden);

-- ─── 6. Trigger updated_at ───────────────────────────────────────────────────
create or replace function public.trg_liquidaciones_cese_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists trg_liquidaciones_cese_updated_at on public.liquidaciones_cese;
create trigger trg_liquidaciones_cese_updated_at
  before update on public.liquidaciones_cese
  for each row execute function public.trg_liquidaciones_cese_updated_at();

-- ─── 7. RLS ──────────────────────────────────────────────────────────────────
alter table public.liquidaciones_cese          enable row level security;
alter table public.liquidaciones_cese_conceptos enable row level security;

-- Helper: puede gestionar liquidaciones (admin o RRHH)
create or replace function public.liquidaciones_puede_gestionar(target_empresa_id text)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.usuario_tiene_empresa(target_empresa_id)
    and (
      public.usuario_es_admin_empresa(target_empresa_id)
      or public.usuario_puede(target_empresa_id, 'liquidaciones_cese', 'editar')
      or public.usuario_puede(target_empresa_id, 'liquidaciones_cese', 'crear')
      or exists (
        select 1
        from public.usuarios_empresas ue
        join public.roles r on r.id = ue.rol_id
        where ue.user_id = auth.uid()
          and ue.empresa_id = target_empresa_id
          and ue.estado = 'activo'
          and (
            lower(coalesce(r.categoria,'')) = 'admin'
            or lower(coalesce(r.nombre,'')) like '%rrhh%'
            or lower(coalesce(r.nombre,'')) like '%recursos humanos%'
          )
      )
    );
$$;

-- Policies liquidaciones_cese
drop policy if exists liquidaciones_cese_select on public.liquidaciones_cese;
create policy liquidaciones_cese_select on public.liquidaciones_cese
  for select using (public.liquidaciones_puede_gestionar(empresa_id));

drop policy if exists liquidaciones_cese_insert on public.liquidaciones_cese;
create policy liquidaciones_cese_insert on public.liquidaciones_cese
  for insert with check (public.liquidaciones_puede_gestionar(empresa_id));

drop policy if exists liquidaciones_cese_update on public.liquidaciones_cese;
create policy liquidaciones_cese_update on public.liquidaciones_cese
  for update using (public.liquidaciones_puede_gestionar(empresa_id))
  with check (public.liquidaciones_puede_gestionar(empresa_id));

drop policy if exists liquidaciones_cese_delete on public.liquidaciones_cese;
create policy liquidaciones_cese_delete on public.liquidaciones_cese
  for delete using (public.liquidaciones_puede_gestionar(empresa_id));

-- Policies conceptos
drop policy if exists liquidaciones_cese_conceptos_all on public.liquidaciones_cese_conceptos;
create policy liquidaciones_cese_conceptos_all on public.liquidaciones_cese_conceptos
  for all
  using (public.liquidaciones_puede_gestionar(empresa_id))
  with check (public.liquidaciones_puede_gestionar(empresa_id));

-- ─── 8. Permisos por rol ──────────────────────────────────────────────────────
-- Todos los roles activos: solo ver
insert into public.permisos_roles (
  rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular,
  puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas
)
select r.id, 'liquidaciones_cese',
  true, false, false, false, false, false, false, false
from public.roles r
where r.activo = true
on conflict (rol_id, pantalla) do update set puede_ver = true;

-- Admin y RRHH: gestión completa
insert into public.permisos_roles (
  rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular,
  puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas
)
select r.id, 'liquidaciones_cese',
  true, true, true, true, true, true, false, false
from public.roles r
where r.es_admin_empresa = true
  or r.es_superadmin = true
  or lower(coalesce(r.categoria,'')) = 'admin'
  or lower(coalesce(r.nombre,'')) like '%rrhh%'
  or lower(coalesce(r.nombre,'')) like '%recursos humanos%'
on conflict (rol_id, pantalla) do update set
  puede_ver      = excluded.puede_ver,
  puede_crear    = excluded.puede_crear,
  puede_editar   = excluded.puede_editar,
  puede_anular   = excluded.puede_anular,
  puede_aprobar  = excluded.puede_aprobar,
  puede_exportar = excluded.puede_exportar;

select pg_notify('pgrst', 'reload schema');
