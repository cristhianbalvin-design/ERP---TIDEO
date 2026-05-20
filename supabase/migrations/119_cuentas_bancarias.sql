-- Cuentas bancarias configuradas por empresa
create table if not exists public.cuentas_bancarias (
  id              text primary key,
  empresa_id      text not null references public.empresas(id),
  nombre          text not null,
  banco           text not null,
  numero_cuenta   text,
  cci             text,
  moneda          text not null default 'PEN',
  tipo            text not null default 'corriente',
  estado          text not null default 'activo',
  saldo_inicial   numeric(14,2) not null default 0,
  creado_en       timestamptz not null default now()
);

alter table public.cuentas_bancarias enable row level security;

create policy cb_select on public.cuentas_bancarias
  for select using (public.usuario_tiene_empresa(empresa_id));
create policy cb_insert on public.cuentas_bancarias
  for insert with check (public.usuario_tiene_empresa(empresa_id));
create policy cb_update on public.cuentas_bancarias
  for update using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));
create policy cb_delete on public.cuentas_bancarias
  for delete using (public.usuario_tiene_empresa(empresa_id));

create index if not exists cb_empresa_id_idx on public.cuentas_bancarias (empresa_id, estado);

-- Agregar cuenta_bancaria_id a movimientos para trazabilidad por cuenta
alter table public.movimientos_tesoreria
  add column if not exists cuenta_bancaria_id text references public.cuentas_bancarias(id);

alter table public.movimientos_banco
  add column if not exists cuenta_bancaria_id text references public.cuentas_bancarias(id);
