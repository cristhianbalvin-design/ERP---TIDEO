-- TIDEO ERP - Caja chica como fondos administrados.
-- Mantiene caja_chica historica intacta: los registros legacy pueden quedar sin fondo_id.

create table if not exists public.caja_chica_fondos (
  id                  text primary key default ('ccf_' || substr(gen_random_uuid()::text, 1, 12)),
  empresa_id          text not null references public.empresas(id),
  nombre              text not null,
  responsable_id      text references public.usuarios(id) on delete set null,
  monto_asignado      numeric(14,2) not null check (monto_asignado > 0),
  monto_minimo        numeric(14,2) not null default 0 check (monto_minimo >= 0),
  cuenta_bancaria_id  text references public.cuentas_bancarias(id) on delete set null,
  moneda              text not null default 'PEN',
  estado              text not null default 'activo' check (estado in ('activo','suspendido','cerrado')),
  fecha_apertura      date not null default current_date,
  fecha_cierre        date,
  notas               text,
  creado_por          text references public.usuarios(id) on delete set null,
  cerrado_por         text references public.usuarios(id) on delete set null,
  creado_en           timestamptz not null default now(),
  actualizado_en      timestamptz not null default now(),
  constraint caja_chica_fondos_minimo_menor_asignado check (monto_minimo <= monto_asignado)
);

alter table public.caja_chica
  add column if not exists fondo_id text references public.caja_chica_fondos(id) on delete set null;

create index if not exists idx_caja_chica_fondos_empresa_estado
  on public.caja_chica_fondos(empresa_id, estado);
create index if not exists idx_caja_chica_fondos_responsable
  on public.caja_chica_fondos(empresa_id, responsable_id)
  where responsable_id is not null;
create index if not exists idx_caja_chica_fondo_id
  on public.caja_chica(empresa_id, fondo_id, fecha)
  where fondo_id is not null;

create table if not exists public.caja_chica_rendiciones (
  id                            text primary key default ('ccr_' || substr(gen_random_uuid()::text, 1, 12)),
  empresa_id                    text not null references public.empresas(id),
  fondo_id                      text not null references public.caja_chica_fondos(id) on delete cascade,
  periodo_inicio                date not null,
  periodo_fin                   date not null,
  monto_solicitado              numeric(14,2) not null check (monto_solicitado >= 0),
  monto_aprobado                numeric(14,2) not null default 0 check (monto_aprobado >= 0),
  estado                        text not null default 'solicitada'
                                  check (estado in ('solicitada','aprobada','rechazada','repuesta')),
  aprobado_por                  text references public.usuarios(id) on delete set null,
  aprobado_en                   timestamptz,
  cuenta_bancaria_id            text references public.cuentas_bancarias(id) on delete set null,
  transferencia_reposicion_ref  text,
  moneda                        text not null default 'PEN',
  notas                         text,
  creado_por                    text references public.usuarios(id) on delete set null,
  creado_en                     timestamptz not null default now(),
  actualizado_en                timestamptz not null default now(),
  constraint caja_chica_rendiciones_periodo_ok check (periodo_fin >= periodo_inicio)
);

create index if not exists idx_cc_rendiciones_fondo_estado
  on public.caja_chica_rendiciones(empresa_id, fondo_id, estado, periodo_inicio);

create table if not exists public.caja_chica_arqueos (
  id                       text primary key default ('cca_' || substr(gen_random_uuid()::text, 1, 12)),
  empresa_id               text not null references public.empresas(id),
  fondo_id                 text not null references public.caja_chica_fondos(id) on delete cascade,
  fecha                    date not null default current_date,
  saldo_sistema            numeric(14,2) not null default 0,
  efectivo_declarado       numeric(14,2) not null default 0,
  comprobantes_pendientes  numeric(14,2) not null default 0,
  diferencia               numeric(14,2) not null default 0,
  justificacion            text,
  estado                   text not null default 'registrado' check (estado in ('registrado','observado')),
  arqueado_por             text references public.usuarios(id) on delete set null,
  creado_en                timestamptz not null default now(),
  constraint caja_chica_arqueos_justificacion_diff check (
    abs(diferencia) <= 0.009 or length(trim(coalesce(justificacion, ''))) > 0
  )
);

create index if not exists idx_cc_arqueos_fondo_fecha
  on public.caja_chica_arqueos(empresa_id, fondo_id, fecha desc);

create or replace function public.usuario_responsable_fondo_caja(target_fondo_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.caja_chica_fondos f
    left join public.usuarios u on u.id = f.responsable_id
    where f.id = target_fondo_id
      and public.usuario_tiene_empresa(f.empresa_id)
      and (
        f.responsable_id = auth.uid()::text
        or lower(coalesce(u.email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  );
$$;

alter table public.caja_chica_fondos enable row level security;
alter table public.caja_chica_rendiciones enable row level security;
alter table public.caja_chica_arqueos enable row level security;

drop policy if exists cc_fondos_select on public.caja_chica_fondos;
drop policy if exists cc_fondos_insert on public.caja_chica_fondos;
drop policy if exists cc_fondos_update on public.caja_chica_fondos;

create policy cc_fondos_select on public.caja_chica_fondos
  for select using (
    public.usuario_tiene_empresa(empresa_id)
    and (
      public.usuario_puede(empresa_id, 'caja', 'ver')
      or public.usuario_responsable_fondo_caja(id)
    )
  );
create policy cc_fondos_insert on public.caja_chica_fondos
  for insert with check (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'caja', 'crear')
  );
create policy cc_fondos_update on public.caja_chica_fondos
  for update using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'caja', 'editar')
  )
  with check (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'caja', 'editar')
  );

drop policy if exists cc_rendiciones_select on public.caja_chica_rendiciones;
drop policy if exists cc_rendiciones_insert on public.caja_chica_rendiciones;
drop policy if exists cc_rendiciones_update on public.caja_chica_rendiciones;

create policy cc_rendiciones_select on public.caja_chica_rendiciones
  for select using (
    public.usuario_tiene_empresa(empresa_id)
    and (
      public.usuario_puede(empresa_id, 'caja', 'ver')
      or public.usuario_responsable_fondo_caja(fondo_id)
    )
  );
create policy cc_rendiciones_insert on public.caja_chica_rendiciones
  for insert with check (
    public.usuario_tiene_empresa(empresa_id)
    and (
      public.usuario_puede(empresa_id, 'caja', 'crear')
      or public.usuario_responsable_fondo_caja(fondo_id)
    )
  );
create policy cc_rendiciones_update on public.caja_chica_rendiciones
  for update using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'caja', 'aprobar')
  )
  with check (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'caja', 'aprobar')
  );

drop policy if exists cc_arqueos_select on public.caja_chica_arqueos;
drop policy if exists cc_arqueos_insert on public.caja_chica_arqueos;

create policy cc_arqueos_select on public.caja_chica_arqueos
  for select using (
    public.usuario_tiene_empresa(empresa_id)
    and (
      public.usuario_puede(empresa_id, 'caja', 'ver')
      or public.usuario_responsable_fondo_caja(fondo_id)
    )
  );
create policy cc_arqueos_insert on public.caja_chica_arqueos
  for insert with check (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'caja', 'editar')
  );

drop policy if exists caja_chica_select on public.caja_chica;
drop policy if exists caja_chica_insert on public.caja_chica;
drop policy if exists caja_chica_update on public.caja_chica;

create policy caja_chica_select on public.caja_chica
  for select using (
    public.usuario_tiene_empresa(empresa_id)
    and (
      public.usuario_puede(empresa_id, 'caja', 'ver')
      or fondo_id is null
      or public.usuario_responsable_fondo_caja(fondo_id)
    )
  );
create policy caja_chica_insert on public.caja_chica
  for insert with check (
    public.usuario_tiene_empresa(empresa_id)
    and (
      public.usuario_puede(empresa_id, 'caja', 'crear')
      or public.usuario_responsable_fondo_caja(fondo_id)
    )
  );
create policy caja_chica_update on public.caja_chica
  for update using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'caja', 'editar')
  )
  with check (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'caja', 'editar')
  );

insert into public.permisos_roles (
  rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular,
  puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas
)
select
  r.id,
  'caja',
  true,
  true,
  true,
  false,
  true,
  true,
  true,
  true
from public.roles r
where coalesce(r.es_admin_empresa, false)
   or coalesce(r.es_superadmin, false)
   or lower(coalesce(r.categoria, '')) = 'finanzas'
   or lower(coalesce(r.nombre, '')) like '%finanzas%'
on conflict (rol_id, pantalla) do update set
  puede_ver = excluded.puede_ver,
  puede_crear = excluded.puede_crear,
  puede_editar = excluded.puede_editar,
  puede_aprobar = excluded.puede_aprobar,
  puede_exportar = excluded.puede_exportar,
  puede_ver_costos = excluded.puede_ver_costos,
  puede_ver_finanzas = excluded.puede_ver_finanzas;

select pg_notify('pgrst', 'reload schema');
