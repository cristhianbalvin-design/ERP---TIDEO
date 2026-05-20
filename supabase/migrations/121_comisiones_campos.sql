-- Extender tabla comisiones con campos faltantes para el flujo completo
alter table public.comisiones
  add column if not exists os_cliente_id       text references public.os_clientes(id),
  add column if not exists oportunidad_id      text,
  add column if not exists bonificacion        numeric(14,2) not null default 0,
  add column if not exists monto_total         numeric(14,2),
  add column if not exists modalidad_pago      text not null default 'Planilla',
  add column if not exists nota_aprobacion     text,
  add column if not exists motivo_rechazo      text,
  add column if not exists aprobado_por        text,
  add column if not exists aprobado_en         timestamptz,
  add column if not exists pagado_en           timestamptz,
  add column if not exists recibo_id           text;

-- Campos de comisión en personal_administrativo
alter table public.personal_administrativo
  add column if not exists tiene_comisiones    boolean not null default false,
  add column if not exists porcentaje_comision numeric(5,2) not null default 0,
  add column if not exists modalidad_comision  text not null default 'Planilla';

-- Recibos por honorarios generados desde comisiones
create table if not exists public.recibos_honorarios (
  id                text primary key,
  empresa_id        text not null references public.empresas(id),
  vendedor_id       text not null,
  vendedor_nombre   text,
  vendedor_ruc      text,
  periodo           text not null,
  comisiones_ids    text[],
  monto_bruto       numeric(14,2) not null default 0,
  retencion_ir      numeric(14,2) not null default 0,
  monto_neto        numeric(14,2) not null default 0,
  estado            text not null default 'borrador',
  creado_en         timestamptz not null default now()
);

alter table public.recibos_honorarios enable row level security;

create policy rh_select on public.recibos_honorarios
  for select using (public.usuario_tiene_empresa(empresa_id));
create policy rh_insert on public.recibos_honorarios
  for insert with check (public.usuario_tiene_empresa(empresa_id));
create policy rh_update on public.recibos_honorarios
  for update using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

create index if not exists rh_empresa_vendedor_idx on public.recibos_honorarios (empresa_id, vendedor_id);
