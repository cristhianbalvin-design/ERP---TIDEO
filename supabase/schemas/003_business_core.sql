-- TIDEO ERP - Nucleo de negocio multitenant.
-- Todas las tablas transaccionales incluyen empresa_id.

create table if not exists public.cuentas (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  nombre_comercial text not null,
  razon_social text,
  ruc text,
  tipo text default 'prospecto',
  industria text,
  tamano text,
  telefono text,
  email text,
  direccion text,
  responsable_comercial text,
  responsable_cs text,
  fuente_origen text,
  responsable_id uuid,
  condicion_pago text,
  limite_credito numeric(14,2),
  moneda text default 'PEN',
  riesgo_financiero text,
  riesgo_churn text,
  health_score numeric(5,2),
  saldo_cxc numeric(14,2) default 0,
  margen_acumulado numeric(14,2),
  fecha_ultima_compra date,
  estado text default 'activo',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.leads (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  nombre_contacto text not null,
  empresa_nombre text not null,
  razon_social text,
  ruc text,
  industria text,
  telefono text,
  email text,
  fuente text not null,
  cargo text,
  urgencia text default 'media',
  registrado_desde text default 'backoffice',
  responsable text,
  campana text,
  dias_sin_actividad integer default 0,
  fecha_creacion date default current_date,
  motivo_descarte text,
  responsable_id uuid,
  necesidad text,
  presupuesto_estimado numeric(14,2),
  moneda text default 'PEN',
  estado text default 'nuevo',
  convertido boolean default false,
  cuenta_id text references public.cuentas(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.contactos (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  cuenta_id text references public.cuentas(id),
  nombre text not null,
  cargo text,
  telefono text,
  email text,
  es_principal boolean default false,
  estado text default 'activo',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.oportunidades (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  cuenta_id text references public.cuentas(id),
  lead_id text references public.leads(id),
  contacto_id text references public.contactos(id),
  nombre text not null,
  servicio_interes text,
  etapa text default 'calificacion',
  probabilidad numeric(5,2) default 0,
  monto_estimado numeric(14,2) default 0,
  moneda text default 'PEN',
  fecha_cierre_estimada date,
  fecha_cierre_real date,
  fecha_creacion date default current_date,
  forecast_ponderado numeric(14,2) default 0,
  fuente text,
  responsable text,
  notas text,
  competidor text,
  responsable_id uuid,
  estado text default 'abierta',
  motivo_perdida text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.agenda_comercial (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  titulo text not null,
  tipo text not null default 'reunion' check (tipo in ('visita','reunion','llamada','demo','tarea')),
  cuenta_id text references public.cuentas(id),
  lead_id text references public.leads(id),
  oportunidad_id text references public.oportunidades(id),
  vendedor text not null,
  registrado_por text,
  fecha date not null,
  hora time not null,
  duracion_minutos integer default 60,
  estado text default 'programado' check (estado in ('programado','realizado','cancelado','reprogramado')),
  notas text,
  resultado text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.actividades_comerciales (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  tipo text not null default 'tarea' check (tipo in ('llamada','reunion','email','visita','tarea','nota','seguimiento')),
  vinculo_tipo text,
  vinculo_id text,
  cuenta_id text references public.cuentas(id),
  contacto_id text references public.contactos(id),
  oportunidad_id text references public.oportunidades(id),
  lead_id text references public.leads(id),
  responsable text not null,
  fecha date not null,
  hora time,
  descripcion text not null,
  resultado text,
  proxima_accion text,
  proxima_accion_fecha date,
  estado text default 'pendiente' check (estado in ('pendiente','completada','vencida','cancelada')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

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

create table if not exists public.hojas_costeo (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  numero text not null,
  oportunidad_id text references public.oportunidades(id),
  cuenta_id text references public.cuentas(id),
  cotizacion_id text references public.cotizaciones(id),
  estado text default 'borrador',
  responsable_costeo text,
  fecha date default current_date,
  margen_objetivo_pct numeric(5,2) default 35,
  notas text,
  mano_obra jsonb default '[]'::jsonb,
  materiales jsonb default '[]'::jsonb,
  servicios_terceros jsonb default '[]'::jsonb,
  logistica jsonb default '[]'::jsonb,
  total_mano_obra numeric(14,2) default 0,
  total_materiales numeric(14,2) default 0,
  total_servicios_terceros numeric(14,2) default 0,
  total_logistica numeric(14,2) default 0,
  costo_total numeric(14,2) default 0,
  precio_sugerido_sin_igv numeric(14,2) default 0,
  precio_sugerido_total numeric(14,2) default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (empresa_id, numero)
);

alter table public.cotizaciones
  add column if not exists hoja_costeo_id text references public.hojas_costeo(id);

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

create index if not exists idx_cuentas_empresa on public.cuentas(empresa_id);
create index if not exists idx_leads_empresa on public.leads(empresa_id);
create index if not exists idx_contactos_empresa on public.contactos(empresa_id);
create index if not exists idx_oportunidades_empresa on public.oportunidades(empresa_id);
create index if not exists idx_agenda_comercial_empresa_fecha on public.agenda_comercial(empresa_id, fecha, hora);
create index if not exists idx_agenda_comercial_vendedor on public.agenda_comercial(empresa_id, vendedor, fecha);
create index if not exists idx_actividades_comerciales_empresa_fecha on public.actividades_comerciales(empresa_id, fecha);
create index if not exists idx_actividades_comerciales_responsable on public.actividades_comerciales(empresa_id, responsable, fecha);
create index if not exists idx_actividades_comerciales_vinculo on public.actividades_comerciales(vinculo_tipo, vinculo_id);
create index if not exists idx_cotizaciones_empresa on public.cotizaciones(empresa_id);
create index if not exists idx_hojas_costeo_empresa on public.hojas_costeo(empresa_id);
create index if not exists idx_hojas_costeo_oportunidad on public.hojas_costeo(oportunidad_id);
create index if not exists idx_os_clientes_empresa_core on public.os_clientes(empresa_id);
