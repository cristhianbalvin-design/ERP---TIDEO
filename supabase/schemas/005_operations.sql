-- TIDEO ERP - Operaciones y ejecucion de servicios.

create table if not exists public.backlog (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  os_cliente_id text references public.os_clientes(id),
  cuenta_id text references public.cuentas(id),
  descripcion text not null,
  prioridad text default 'media',
  estado text default 'pendiente',
  fecha_requerida date,
  centro_costo text,
  responsable_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.ordenes_trabajo (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  os_cliente_id text references public.os_clientes(id),
  backlog_id text references public.backlog(id),
  numero text not null,
  cuenta_id text references public.cuentas(id),
  servicio text not null,
  descripcion text,
  direccion_ejecucion text,
  ubicacion_gps jsonb,
  fecha_programada date,
  hora_inicio time,
  hora_fin time,
  tecnico_responsable_id text,
  cuadrilla jsonb default '[]'::jsonb,
  estado text default 'programada',
  avance_pct numeric(5,2) default 0,
  costo_estimado numeric(14,2) default 0,
  costo_real numeric(14,2) default 0,
  moneda text default 'PEN',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (empresa_id, numero)
);

create table if not exists public.partes_diarios (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  orden_trabajo_id text not null references public.ordenes_trabajo(id),
  tecnico_id text,
  fecha date not null,
  hora_inicio time,
  hora_fin time,
  horas_normales numeric(8,2) default 0,
  horas_extra numeric(8,2) default 0,
  actividad text,
  avance_pct numeric(5,2) default 0,
  materiales jsonb default '[]'::jsonb,
  evidencias jsonb default '[]'::jsonb,
  origen_registro text default 'backoffice',
  ubicacion_gps jsonb,
  estado text default 'registrado',
  aprobado_por uuid,
  aprobado_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.cierres_tecnicos (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  orden_trabajo_id text not null references public.ordenes_trabajo(id),
  fecha_cierre date not null,
  resultado text default 'conforme',
  observaciones text,
  conformidad_cliente jsonb,
  evidencias jsonb default '[]'::jsonb,
  cerrado_por uuid,
  estado text default 'cerrado',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.costos_ot (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  orden_trabajo_id text not null references public.ordenes_trabajo(id),
  mano_obra numeric(14,2) default 0,
  materiales numeric(14,2) default 0,
  servicios_terceros numeric(14,2) default 0,
  logistica numeric(14,2) default 0,
  otros numeric(14,2) default 0,
  total numeric(14,2) default 0,
  moneda text default 'PEN',
  calculado_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (orden_trabajo_id)
);

create table if not exists public.tickets_soporte (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  cuenta_id text references public.cuentas(id),
  orden_trabajo_id text references public.ordenes_trabajo(id),
  asunto text not null,
  descripcion text,
  prioridad text default 'media',
  estado text default 'abierto',
  canal text,
  responsable_id uuid,
  fecha_vencimiento timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_backlog_empresa on public.backlog(empresa_id, estado);
create index if not exists idx_ot_empresa on public.ordenes_trabajo(empresa_id, estado);
create index if not exists idx_partes_empresa on public.partes_diarios(empresa_id, fecha);
create index if not exists idx_costos_ot_empresa on public.costos_ot(empresa_id);
create index if not exists idx_tickets_empresa on public.tickets_soporte(empresa_id, estado);
