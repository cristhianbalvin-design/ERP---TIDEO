-- TIDEO ERP - Compras, proveedores e inventario.

create table if not exists public.almacenes (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  codigo text not null,
  nombre text not null,
  ubicacion text,
  responsable_id uuid,
  estado text default 'activo',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (empresa_id, codigo)
);

create table if not exists public.materiales (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  codigo text not null,
  descripcion text not null,
  unidad text default 'und',
  familia text,
  codigo_barras text,
  costo_promedio numeric(14,2) default 0,
  moneda text default 'PEN',
  stock_minimo numeric(14,2) default 0,
  estado text default 'activo',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (empresa_id, codigo)
);

create table if not exists public.stock (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null references public.empresas(id),
  material_id text not null references public.materiales(id),
  almacen_id text not null references public.almacenes(id),
  disponible numeric(14,2) default 0,
  reservado numeric(14,2) default 0,
  lote text,
  serie text,
  vencimiento date,
  updated_at timestamptz default now(),
  unique (material_id, almacen_id, lote, serie)
);

create table if not exists public.kardex (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  material_id text not null references public.materiales(id),
  almacen_id text references public.almacenes(id),
  fecha timestamptz default now(),
  tipo text not null,
  cantidad numeric(14,2) not null,
  costo_unitario numeric(14,2) default 0,
  moneda text default 'PEN',
  referencia_tipo text,
  referencia_id text,
  observacion text,
  created_by uuid,
  created_at timestamptz default now()
);

create table if not exists public.proveedores (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  razon_social text not null,
  ruc text,
  tipo text default 'empresa',
  estado text default 'potencial',
  rubro text,
  telefono text,
  email text,
  condicion_pago text,
  banco text,
  cuenta_bancaria text,
  cci text,
  calificacion_promedio numeric(5,2) default 0,
  homologado_at timestamptz,
  bloqueado_motivo text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.documentos_proveedor (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  proveedor_id text not null references public.proveedores(id) on delete cascade,
  tipo text not null,
  nombre_archivo text,
  url text,
  fecha_emision date,
  fecha_vencimiento date,
  estado text default 'vigente',
  created_at timestamptz default now()
);

create table if not exists public.evaluaciones_proveedor (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  proveedor_id text not null references public.proveedores(id),
  tipo text not null,
  puntaje numeric(5,2) default 0,
  detalle jsonb default '{}'::jsonb,
  resultado text,
  evaluado_por uuid,
  fecha date default current_date,
  created_at timestamptz default now()
);

create table if not exists public.solpe_interna (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  codigo text not null,
  origen_tipo text,
  origen_id text,
  solicitante_id uuid,
  descripcion text not null,
  tipo text default 'bien',
  prioridad text default 'media',
  centro_costo text,
  estado text default 'borrador',
  fecha_requerida date,
  aprobada_por uuid,
  aprobada_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (empresa_id, codigo)
);

create table if not exists public.procesos_compra (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  codigo text not null,
  solpe_id text references public.solpe_interna(id),
  descripcion text not null,
  tipo text default 'bien',
  fecha_limite date,
  proveedores_consultados jsonb default '[]'::jsonb,
  proveedor_ganador text references public.proveedores(id),
  monto_referencial numeric(14,2) default 0,
  monto_seleccionado numeric(14,2) default 0,
  moneda text default 'PEN',
  estado text default 'abierto',
  responsable_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (empresa_id, codigo)
);

create table if not exists public.ordenes_compra (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  codigo text not null,
  proceso_compra_id text references public.procesos_compra(id),
  proveedor_id text not null references public.proveedores(id),
  descripcion text,
  items jsonb default '[]'::jsonb,
  subtotal numeric(14,2) default 0,
  igv numeric(14,2) default 0,
  total numeric(14,2) default 0,
  moneda text default 'PEN',
  fecha_emision date default current_date,
  fecha_entrega_esperada date,
  estado text default 'emitida',
  porcentaje_recibido numeric(5,2) default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (empresa_id, codigo)
);

create table if not exists public.ordenes_servicio_interna (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  codigo text not null,
  proceso_compra_id text references public.procesos_compra(id),
  proveedor_id text not null references public.proveedores(id),
  descripcion text not null,
  entregables jsonb default '[]'::jsonb,
  total numeric(14,2) default 0,
  moneda text default 'PEN',
  fecha_inicio date,
  fecha_fin date,
  estado text default 'emitida',
  responsable_validacion uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (empresa_id, codigo)
);

create table if not exists public.recepciones (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  orden_compra_id text references public.ordenes_compra(id),
  orden_servicio_id text references public.ordenes_servicio_interna(id),
  tipo text default 'total',
  fecha date default current_date,
  items_recibidos jsonb default '[]'::jsonb,
  observaciones text,
  estado text default 'confirmada',
  recibido_por uuid,
  created_at timestamptz default now()
);

create index if not exists idx_proveedores_empresa on public.proveedores(empresa_id, estado);
create index if not exists idx_solpe_empresa on public.solpe_interna(empresa_id, estado);
create index if not exists idx_oc_empresa on public.ordenes_compra(empresa_id, estado);
create index if not exists idx_recepciones_empresa on public.recepciones(empresa_id, fecha);
create index if not exists idx_stock_empresa on public.stock(empresa_id, material_id, almacen_id);
