-- TIDEO ERP - Finanzas, tesoreria y deuda.

create table if not exists public.compras_gastos (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  tipo text not null,
  descripcion text not null,
  categoria text not null,
  subcategoria text,
  monto numeric(14,2) not null,
  moneda text default 'PEN',
  fecha date not null,
  origen_registro text default 'backoffice',
  financiamiento_id text,
  cuota_numero integer,
  estado text default 'registrado',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.movimientos_tesoreria (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  tipo text not null check (tipo in ('ingreso','egreso','credito','debito')),
  descripcion text not null,
  monto numeric(14,2) not null,
  moneda text default 'PEN',
  fecha date not null,
  cuenta_bancaria text,
  referencia text,
  vinculo_tipo text,
  vinculo_id text,
  estado text default 'registrado',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.financiamientos (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  codigo text not null,
  tipo text not null,
  entidad text not null,
  tipo_entidad text,
  contacto_nombre text,
  contacto_telefono text,
  contacto_email text,
  monto_original numeric(14,2) not null,
  moneda text default 'PEN',
  tasa_anual numeric(8,4) default 0,
  tipo_tasa text default 'TEA',
  plazo_meses integer,
  meses_gracia integer default 0,
  dia_pago integer,
  tipo_cuota text default 'frances',
  cuota_mensual numeric(14,2),
  fecha_desembolso date,
  fecha_primer_pago date,
  fecha_ultimo_pago date,
  saldo_pendiente numeric(14,2) default 0,
  cuotas_pagadas integer default 0,
  intereses_pagados_total numeric(14,2) default 0,
  proposito text,
  centro_costo text,
  cuenta_bancaria_destino text,
  estado text default 'vigente',
  notas text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (empresa_id, codigo)
);

create table if not exists public.tabla_amortizacion (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null references public.empresas(id),
  financiamiento_id text not null references public.financiamientos(id) on delete cascade,
  numero integer not null,
  fecha date not null,
  capital numeric(14,2) default 0,
  interes numeric(14,2) default 0,
  total numeric(14,2) default 0,
  saldo numeric(14,2) default 0,
  estado text default 'futura',
  fecha_pago_real date,
  referencia text,
  comprobante text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (financiamiento_id, numero)
);

create table if not exists public.pagos_financiamiento (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  financiamiento_id text not null references public.financiamientos(id),
  fecha_pago date not null,
  tipo text not null check (tipo in ('cuota','capital_parcial','capital_total')),
  cuota_numero integer,
  capital numeric(14,2) default 0,
  interes numeric(14,2) default 0,
  total numeric(14,2) default 0,
  saldo_despues numeric(14,2) default 0,
  moneda text default 'PEN',
  cuenta_bancaria text,
  referencia text,
  comprobante text,
  registrado_por uuid,
  created_at timestamptz default now()
);

create index if not exists idx_compras_gastos_empresa on public.compras_gastos(empresa_id, fecha);
create index if not exists idx_movimientos_tesoreria_empresa on public.movimientos_tesoreria(empresa_id, fecha);
create index if not exists idx_financiamientos_empresa on public.financiamientos(empresa_id, estado);
create index if not exists idx_tabla_amortizacion_fin on public.tabla_amortizacion(financiamiento_id, numero);
create index if not exists idx_pagos_financiamiento_fin on public.pagos_financiamiento(financiamiento_id, fecha_pago);

create table if not exists public.valorizaciones (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  os_cliente_id text references public.os_clientes(id),
  numero text not null,
  fecha date not null,
  periodo text,
  subtotal numeric(14,2) default 0,
  igv numeric(14,2) default 0,
  total numeric(14,2) default 0,
  moneda text default 'PEN',
  estado text default 'borrador',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.facturas (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  cuenta_id text references public.cuentas(id),
  valorizacion_id text references public.valorizaciones(id),
  numero text not null,
  fecha_emision date not null,
  subtotal numeric(14,2) default 0,
  igv numeric(14,2) default 0,
  total numeric(14,2) default 0,
  moneda text default 'PEN',
  estado text default 'emitida',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.cxc (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  cuenta_id text not null references public.cuentas(id),
  factura_id text not null references public.facturas(id),
  fecha_emision date not null,
  fecha_vencimiento date not null,
  monto_total numeric(14,2) not null,
  monto_pagado numeric(14,2) default 0,
  saldo numeric(14,2) not null,
  moneda text default 'PEN',
  estado text default 'por_cobrar',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.cxp (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  proveedor_id text references public.proveedores(id),
  factura_numero text,
  factura_imagen_url text,
  fecha_emision date not null,
  fecha_vencimiento date not null,
  monto_total numeric(14,2) not null,
  monto_pagado numeric(14,2) default 0,
  saldo numeric(14,2) not null,
  moneda text default 'PEN',
  estado text default 'por_pagar',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.movimientos_banco (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  fecha date not null,
  descripcion text not null,
  tipo text not null check (tipo in ('credito','debito')),
  monto numeric(14,2) not null,
  moneda text default 'PEN',
  vinculado_tipo text,
  vinculado_id text,
  conciliado boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_valorizaciones_empresa on public.valorizaciones(empresa_id);
create index if not exists idx_facturas_empresa on public.facturas(empresa_id);
create index if not exists idx_cxc_empresa on public.cxc(empresa_id);
create index if not exists idx_cxp_empresa on public.cxp(empresa_id);
create index if not exists idx_movimientos_banco_empresa on public.movimientos_banco(empresa_id);
