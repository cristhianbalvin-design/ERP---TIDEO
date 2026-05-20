-- Historial individual de cobros por CxC
create table if not exists public.cobros_cxc (
  id                text primary key,
  empresa_id        text not null references public.empresas(id),
  cxc_id            text not null references public.cxc(id),
  factura_id        text references public.facturas(id),
  cuenta_id         text references public.cuentas(id),
  monto_capital     numeric(14,2) not null default 0,
  monto_mora        numeric(14,2) not null default 0,
  medio_pago        text not null,
  cuenta_bancaria   text,
  numero_operacion  text,
  fecha_cobro       date not null,
  notas             text,
  registrado_por    text,
  creado_en         timestamptz not null default now()
);

alter table public.cobros_cxc enable row level security;
create policy cobros_cxc_select on public.cobros_cxc
  for select using (public.usuario_tiene_empresa(empresa_id));
create policy cobros_cxc_insert on public.cobros_cxc
  for insert with check (public.usuario_tiene_empresa(empresa_id));

create index if not exists cobros_cxc_cxc_id_idx on public.cobros_cxc (cxc_id, creado_en desc);
create index if not exists cobros_cxc_empresa_id_idx on public.cobros_cxc (empresa_id, creado_en desc);

-- Historial de gestiones de cobranza por CxC
create table if not exists public.gestion_cobranza (
  id                    text primary key,
  empresa_id            text not null references public.empresas(id),
  cxc_id                text not null references public.cxc(id),
  tipo_gestion          text not null,
  resultado             text not null,
  fecha_gestion         date not null,
  fecha_proxima_accion  date,
  fecha_acordada_pago   date,
  notas                 text not null,
  usuario               text,
  creado_en             timestamptz not null default now()
);

alter table public.gestion_cobranza enable row level security;
create policy gestion_cobranza_select on public.gestion_cobranza
  for select using (public.usuario_tiene_empresa(empresa_id));
create policy gestion_cobranza_insert on public.gestion_cobranza
  for insert with check (public.usuario_tiene_empresa(empresa_id));

create index if not exists gestion_cobranza_cxc_id_idx on public.gestion_cobranza (cxc_id, creado_en desc);
create index if not exists gestion_cobranza_empresa_id_idx on public.gestion_cobranza (empresa_id, creado_en desc);

-- Comisiones generadas al registrar un cobro
create table if not exists public.comisiones (
  id                  text primary key,
  empresa_id          text not null references public.empresas(id),
  cobro_cxc_id        text references public.cobros_cxc(id),
  cxc_id              text references public.cxc(id),
  factura_id          text references public.facturas(id),
  vendedor_id         text,
  vendedor_nombre     text,
  monto_cobrado       numeric(14,2),
  porcentaje_comision numeric(5,2),
  monto_comision      numeric(14,2),
  periodo             text,
  estado              text not null default 'pendiente_aprobacion',
  creado_en           timestamptz not null default now()
);

alter table public.comisiones enable row level security;
create policy comisiones_select on public.comisiones
  for select using (public.usuario_tiene_empresa(empresa_id));
create policy comisiones_insert on public.comisiones
  for insert with check (public.usuario_tiene_empresa(empresa_id));
create policy comisiones_update on public.comisiones
  for update using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

create index if not exists comisiones_empresa_id_idx on public.comisiones (empresa_id, creado_en desc);

-- Columnas adicionales en cxc para el módulo de cobranza
alter table public.cxc
  add column if not exists gestor_cobranza_id   text,
  add column if not exists medio_pago_esperado  text,
  add column if not exists tasa_mora_diaria     numeric(8,6) default 0.000833;
