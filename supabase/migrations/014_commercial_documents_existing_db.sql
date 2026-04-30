-- TIDEO ERP - Tablas comerciales agregadas despues del setup inicial.
-- Ejecutar en proyectos existentes si cotizaciones u OS Cliente no persisten.

create table if not exists public.cotizaciones (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  oportunidad_id text references public.oportunidades(id),
  cuenta_id text references public.cuentas(id),
  numero text not null,
  version integer default 1,
  estado text default 'borrador',
  fecha date,
  items jsonb default '[]'::jsonb,
  subtotal numeric(14,2) default 0,
  descuento_global_pct numeric(5,2) default 0,
  descuento_global numeric(14,2) default 0,
  base_imponible numeric(14,2) default 0,
  igv_pct numeric(5,2) default 18,
  igv numeric(14,2) default 0,
  total numeric(14,2) default 0,
  moneda text default 'PEN',
  condicion_pago text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (empresa_id, numero, version)
);

create table if not exists public.os_clientes (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  cuenta_id text references public.cuentas(id),
  cotizacion_id text references public.cotizaciones(id),
  oportunidad_id text references public.oportunidades(id),
  numero text not null,
  numero_doc_cliente text,
  monto_aprobado numeric(14,2) default 0,
  moneda text default 'PEN',
  condicion_pago text,
  fecha_emision date,
  fecha_inicio date,
  fecha_fin date,
  sla text,
  estado text default 'en_ejecucion',
  saldo_por_ejecutar numeric(14,2) default 0,
  saldo_por_valorizar numeric(14,2) default 0,
  saldo_por_facturar numeric(14,2) default 0,
  anticipo_recibido numeric(14,2) default 0,
  monto_facturado numeric(14,2) default 0,
  monto_cobrado numeric(14,2) default 0,
  ots_asociadas jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (empresa_id, numero)
);

create index if not exists idx_cotizaciones_empresa on public.cotizaciones(empresa_id);
create index if not exists idx_os_clientes_empresa_core on public.os_clientes(empresa_id);

alter table public.cotizaciones enable row level security;
alter table public.os_clientes enable row level security;

drop policy if exists tenant_cotizaciones on public.cotizaciones;
create policy tenant_cotizaciones on public.cotizaciones
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

drop policy if exists tenant_os_clientes on public.os_clientes;
create policy tenant_os_clientes on public.os_clientes
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));
