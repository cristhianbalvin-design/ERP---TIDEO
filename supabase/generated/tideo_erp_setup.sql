-- TIDEO ERP - Setup combinado Supabase
-- Generado automaticamente por supabase/scripts/build_combined_sql.ps1
-- Ejecutar en un proyecto Supabase limpio o revisar cuidadosamente antes de aplicar.


-- ============================================================
-- Fuente: supabase/schemas/001_platform.sql
-- ============================================================

-- TIDEO ERP - Plataforma global
-- Tablas sin empresa_id: gobiernan el SaaS completo.

create table if not exists public.planes (
  id text primary key,
  nombre text not null,
  descripcion text,
  usuarios_incluidos integer default 0,
  modulos jsonb default '[]'::jsonb,
  precio_mensual numeric(14,2) default 0,
  moneda text default 'PEN',
  activo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.empresas (
  id text primary key,
  razon_social text not null,
  nombre_comercial text not null,
  ruc text,
  pais text default 'PE',
  moneda_base text default 'PEN',
  zona_horaria text default 'America/Lima',
  plan_id text references public.planes(id),
  estado text default 'activa' check (estado in ('activa','suspendida','cancelada','demo')),
  fecha_inicio date default current_date,
  fecha_cancelacion date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.monedas (
  codigo text primary key,
  nombre text not null,
  simbolo text not null,
  decimales integer default 2,
  activa boolean default true
);

create table if not exists public.paises (
  codigo text primary key,
  nombre text not null,
  moneda_default text references public.monedas(codigo),
  zona_horaria_default text default 'America/Lima'
);

create table if not exists public.versiones_plataforma (
  id text primary key,
  version text not null,
  descripcion text,
  fecha_release date default current_date,
  cambios jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

insert into public.monedas (codigo, nombre, simbolo)
values
  ('PEN', 'Sol peruano', 'S/'),
  ('USD', 'Dolar estadounidense', 'US$')
on conflict (codigo) do nothing;

-- ============================================================
-- Fuente: supabase/schemas/002_access.sql
-- ============================================================

-- TIDEO ERP - Acceso, roles, permisos y auditoria.

create table if not exists public.roles (
  id text primary key,
  empresa_id text references public.empresas(id),
  nombre text not null,
  descripcion text,
  es_superadmin boolean default false,
  es_admin_empresa boolean default false,
  activo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.usuarios_empresas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  empresa_id text not null references public.empresas(id),
  rol_id text not null references public.roles(id),
  acceso_campo boolean default false,
  perfil_campo text,
  estado text default 'activo' check (estado in ('activo','invitado','suspendido','inactivo')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, empresa_id)
);

create table if not exists public.permisos_roles (
  id uuid primary key default gen_random_uuid(),
  rol_id text not null references public.roles(id) on delete cascade,
  pantalla text not null,
  puede_ver boolean default false,
  puede_crear boolean default false,
  puede_editar boolean default false,
  puede_anular boolean default false,
  puede_aprobar boolean default false,
  puede_exportar boolean default false,
  puede_ver_costos boolean default false,
  puede_ver_finanzas boolean default false,
  permisos_extra jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (rol_id, pantalla)
);

create table if not exists public.auditoria (
  id uuid primary key default gen_random_uuid(),
  empresa_id text references public.empresas(id),
  user_id uuid,
  modulo text not null,
  entidad text,
  entidad_id text,
  accion text not null,
  valor_anterior jsonb,
  valor_nuevo jsonb,
  ip inet,
  user_agent text,
  created_at timestamptz default now()
);

create index if not exists idx_usuarios_empresas_user on public.usuarios_empresas(user_id);
create index if not exists idx_usuarios_empresas_empresa on public.usuarios_empresas(empresa_id);
create index if not exists idx_auditoria_empresa on public.auditoria(empresa_id, created_at desc);

-- ============================================================
-- Fuente: supabase/schemas/003_business_core.sql
-- ============================================================

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

-- ============================================================
-- Fuente: supabase/schemas/006_purchasing_inventory.sql
-- ============================================================

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

-- ============================================================
-- Fuente: supabase/schemas/004_finance.sql
-- ============================================================

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

-- ============================================================
-- Fuente: supabase/schemas/005_operations.sql
-- ============================================================

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

-- ============================================================
-- Fuente: supabase/schemas/007_hr_cs_ai.sql
-- ============================================================

-- TIDEO ERP - RRHH, Customer Success e IA auditada.

create table if not exists public.personal_operativo (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  codigo text,
  nombre text not null,
  documento text,
  cargo text,
  especialidad text,
  area text default 'Operaciones',
  turno_id text,
  telefono text,
  email text,
  sueldo_base numeric(14,2) default 0,
  moneda text default 'PEN',
  sistema_pensionario text,
  costo_hora_real numeric(14,2) default 0,
  costo_hora_extra numeric(14,2) default 0,
  estado text default 'activo',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.personal_administrativo (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  codigo text,
  nombre text not null,
  documento text,
  cargo text,
  area text,
  telefono text,
  email text,
  sueldo_base numeric(14,2) default 0,
  moneda text default 'PEN',
  sistema_pensionario text,
  fecha_ingreso date,
  fecha_fin_contrato date,
  vacaciones_pendientes numeric(8,2) default 0,
  estado text default 'activo',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.turnos (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  nombre text not null,
  hora_entrada time not null,
  hora_salida time not null,
  tolerancia_minutos integer default 0,
  cruza_medianoche boolean default false,
  dias_laborables jsonb default '[]'::jsonb,
  minutos_refrigerio integer default 0,
  horas_efectivas numeric(8,2) default 0,
  estado text default 'activo',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.registros_asistencia (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  trabajador_tipo text not null check (trabajador_tipo in ('operativo','administrativo')),
  trabajador_id text not null,
  turno_id text references public.turnos(id),
  fecha date not null,
  hora_entrada time,
  hora_salida time,
  tardanza_minutos integer default 0,
  horas_extra numeric(8,2) default 0,
  estado text default 'completo',
  justificacion text,
  origen_registro text default 'backoffice',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.periodos_nomina (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  periodo text not null,
  fecha_inicio date not null,
  fecha_fin date not null,
  total_trabajadores integer default 0,
  masa_salarial_bruta numeric(14,2) default 0,
  total_neto numeric(14,2) default 0,
  total_cargas_empresa numeric(14,2) default 0,
  moneda text default 'PEN',
  estado text default 'abierto',
  cerrado_por uuid,
  cerrado_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (empresa_id, periodo)
);

create table if not exists public.detalle_nomina (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  periodo_nomina_id text not null references public.periodos_nomina(id) on delete cascade,
  trabajador_tipo text not null,
  trabajador_id text not null,
  sueldo_base numeric(14,2) default 0,
  remuneracion_bruta numeric(14,2) default 0,
  descuentos numeric(14,2) default 0,
  retencion_ir numeric(14,2) default 0,
  neto numeric(14,2) default 0,
  essalud numeric(14,2) default 0,
  cts numeric(14,2) default 0,
  gratificacion numeric(14,2) default 0,
  vacaciones numeric(14,2) default 0,
  costo_real_empresa numeric(14,2) default 0,
  costo_hora_real numeric(14,2) default 0,
  moneda text default 'PEN',
  desglose jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.prestamos_personal (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  trabajador_tipo text not null,
  trabajador_id text not null,
  monto numeric(14,2) not null,
  moneda text default 'PEN',
  cuota_mensual numeric(14,2) default 0,
  cuotas integer default 1,
  cuotas_pagadas integer default 0,
  saldo numeric(14,2) default 0,
  descontar_nomina boolean default true,
  estado text default 'vigente',
  fecha_desembolso date default current_date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.onboardings (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  cuenta_id text references public.cuentas(id),
  oportunidad_id text references public.oportunidades(id),
  responsable_id uuid,
  fecha_inicio date,
  fecha_objetivo date,
  checklist jsonb default '[]'::jsonb,
  avance_pct numeric(5,2) default 0,
  estado text default 'en_progreso',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.planes_exito (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  cuenta_id text not null references public.cuentas(id),
  objetivos jsonb default '[]'::jsonb,
  responsable_id uuid,
  periodicidad_revision text default 'mensual',
  estado text default 'activo',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.health_scores (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  cuenta_id text not null references public.cuentas(id),
  score numeric(5,2) default 0,
  clasificacion text,
  dimensiones jsonb default '{}'::jsonb,
  fecha_calculo date default current_date,
  created_at timestamptz default now()
);

create table if not exists public.renovaciones (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  cuenta_id text not null references public.cuentas(id),
  fecha_vencimiento date not null,
  monto_contrato numeric(14,2) default 0,
  moneda text default 'PEN',
  estado text default 'pendiente_contacto',
  oportunidad_id text references public.oportunidades(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.nps_encuestas (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  cuenta_id text references public.cuentas(id),
  contacto_id text references public.contactos(id),
  score integer,
  clasificacion text,
  comentario text,
  fecha_envio date,
  fecha_respuesta date,
  estado text default 'enviado',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.ia_logs (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  modulo text not null,
  entidad_tipo text,
  entidad_id text,
  accion text not null,
  prompt_resumen text,
  recomendacion text,
  accion_tomada text,
  usuario_id uuid,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_personal_operativo_empresa on public.personal_operativo(empresa_id, estado);
create index if not exists idx_personal_admin_empresa on public.personal_administrativo(empresa_id, estado);
create index if not exists idx_asistencia_empresa on public.registros_asistencia(empresa_id, fecha);
create index if not exists idx_nomina_empresa on public.periodos_nomina(empresa_id, periodo);
create index if not exists idx_prestamos_personal_empresa on public.prestamos_personal(empresa_id, estado);
create index if not exists idx_onboarding_empresa on public.onboardings(empresa_id, estado);
create index if not exists idx_health_scores_empresa on public.health_scores(empresa_id, fecha_calculo);
create index if not exists idx_ia_logs_empresa on public.ia_logs(empresa_id, created_at desc);

-- ============================================================
-- Fuente: supabase/schemas/008_maestros_base.sql
-- ============================================================

-- TIDEO ERP - Maestros Base

create table if not exists public.cargos_empresa (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  codigo text not null,
  nombre text not null,
  tipo text default 'Administrativo',
  detalle text,
  estado text default 'activo',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.especialidades_tecnicas (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  codigo text not null,
  nombre text not null,
  area text default 'General',
  requiere_cert boolean default false,
  estado text default 'activo',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.tipos_servicio_interno (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  codigo text not null,
  nombre text not null,
  clasificacion text default 'General',
  facturable boolean default false,
  estado text default 'activo',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.sedes (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  codigo text not null,
  nombre text not null,
  direccion text,
  gps text,
  estado text default 'activo',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_cargos_empresa_emp on public.cargos_empresa(empresa_id, estado);
create index if not exists idx_especialidades_emp on public.especialidades_tecnicas(empresa_id, estado);
create index if not exists idx_tipos_servicio_emp on public.tipos_servicio_interno(empresa_id, estado);
create index if not exists idx_sedes_emp on public.sedes(empresa_id, estado);

-- ============================================================
-- Fuente: supabase/policies/000_access_rls.sql
-- ============================================================

-- TIDEO ERP - Politicas RLS para acceso y auditoria.
-- Este archivo corre antes de las policies de negocio porque usuarios_empresas
-- participa en la funcion usuario_tiene_empresa().

alter table public.roles enable row level security;
alter table public.usuarios_empresas enable row level security;
alter table public.auditoria enable row level security;

create or replace function public.usuario_tiene_empresa(target_empresa_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = target_empresa_id
      and ue.estado = 'activo'
  )
  or exists (
    select 1
    from public.usuarios_empresas ue
    join public.roles r on r.id = ue.rol_id
    where ue.user_id = auth.uid()
      and ue.estado = 'activo'
      and r.es_superadmin = true
  );
$$;

create or replace function public.usuario_es_admin_empresa(target_empresa_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios_empresas ue
    join public.roles r on r.id = ue.rol_id
    where ue.user_id = auth.uid()
      and ue.empresa_id = target_empresa_id
      and ue.estado = 'activo'
      and (r.es_admin_empresa = true or r.es_superadmin = true)
  );
$$;

create policy access_roles_tenant on public.roles
  for all using (
    empresa_id is null or public.usuario_tiene_empresa(empresa_id)
  )
  with check (
    empresa_id is null or public.usuario_tiene_empresa(empresa_id)
  );

create policy access_usuarios_empresas_self on public.usuarios_empresas
  for select using (
    user_id = auth.uid() or public.usuario_tiene_empresa(empresa_id)
  );

create policy access_usuarios_empresas_manage on public.usuarios_empresas
  for insert with check (
    public.usuario_es_admin_empresa(empresa_id)
  );

create policy access_usuarios_empresas_update on public.usuarios_empresas
  for update using (
    public.usuario_es_admin_empresa(empresa_id)
  )
  with check (
    public.usuario_es_admin_empresa(empresa_id)
  );

create policy access_auditoria_tenant on public.auditoria
  for select using (
    empresa_id is null or public.usuario_tiene_empresa(empresa_id)
  );

create policy access_auditoria_insert on public.auditoria
  for insert with check (
    empresa_id is null or public.usuario_tiene_empresa(empresa_id)
  );

-- ============================================================
-- Fuente: supabase/policies/001_tenant_rls.sql
-- ============================================================

-- TIDEO ERP - Politicas RLS base por tenant.
-- Requiere que auth.uid() exista y que usuarios_empresas vincule usuario con empresa.

alter table public.cuentas enable row level security;
alter table public.leads enable row level security;
alter table public.contactos enable row level security;
alter table public.oportunidades enable row level security;
alter table public.cotizaciones enable row level security;
alter table public.hojas_costeo enable row level security;
alter table public.os_clientes enable row level security;
alter table public.compras_gastos enable row level security;
alter table public.movimientos_tesoreria enable row level security;
alter table public.financiamientos enable row level security;
alter table public.tabla_amortizacion enable row level security;
alter table public.pagos_financiamiento enable row level security;

create policy tenant_cuentas on public.cuentas
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

create policy tenant_leads on public.leads
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

create policy tenant_contactos on public.contactos
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

create policy tenant_oportunidades on public.oportunidades
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

create policy tenant_cotizaciones on public.cotizaciones
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

create policy tenant_hojas_costeo on public.hojas_costeo
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

create policy tenant_os_clientes on public.os_clientes
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

create policy tenant_compras_gastos on public.compras_gastos
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

create policy tenant_movimientos_tesoreria on public.movimientos_tesoreria
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

create policy tenant_financiamientos on public.financiamientos
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

create policy tenant_tabla_amortizacion on public.tabla_amortizacion
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

create policy tenant_pagos_financiamiento on public.pagos_financiamiento
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

-- ============================================================
-- Fuente: supabase/policies/002_domain_rls.sql
-- ============================================================

-- TIDEO ERP - Politicas RLS por tenant para dominios restantes.

alter table public.backlog enable row level security;
alter table public.ordenes_trabajo enable row level security;
alter table public.partes_diarios enable row level security;
alter table public.cierres_tecnicos enable row level security;
alter table public.costos_ot enable row level security;
alter table public.tickets_soporte enable row level security;

alter table public.almacenes enable row level security;
alter table public.materiales enable row level security;
alter table public.stock enable row level security;
alter table public.kardex enable row level security;
alter table public.proveedores enable row level security;
alter table public.documentos_proveedor enable row level security;
alter table public.evaluaciones_proveedor enable row level security;
alter table public.solpe_interna enable row level security;
alter table public.procesos_compra enable row level security;
alter table public.ordenes_compra enable row level security;
alter table public.ordenes_servicio_interna enable row level security;
alter table public.recepciones enable row level security;

alter table public.valorizaciones enable row level security;
alter table public.facturas enable row level security;
alter table public.cxc enable row level security;
alter table public.cxp enable row level security;
alter table public.movimientos_banco enable row level security;

alter table public.personal_operativo enable row level security;
alter table public.personal_administrativo enable row level security;
alter table public.turnos enable row level security;
alter table public.registros_asistencia enable row level security;
alter table public.periodos_nomina enable row level security;
alter table public.detalle_nomina enable row level security;
alter table public.prestamos_personal enable row level security;

alter table public.onboardings enable row level security;
alter table public.planes_exito enable row level security;
alter table public.health_scores enable row level security;
alter table public.renovaciones enable row level security;
alter table public.nps_encuestas enable row level security;
alter table public.ia_logs enable row level security;
alter table public.agenda_comercial enable row level security;
alter table public.actividades_comerciales enable row level security;

alter table public.cargos_empresa enable row level security;
alter table public.especialidades_tecnicas enable row level security;
alter table public.tipos_servicio_interno enable row level security;
alter table public.sedes enable row level security;

create policy tenant_backlog on public.backlog for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_ordenes_trabajo on public.ordenes_trabajo for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_partes_diarios on public.partes_diarios for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_cierres_tecnicos on public.cierres_tecnicos for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_costos_ot on public.costos_ot for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_tickets_soporte on public.tickets_soporte for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));

create policy tenant_almacenes on public.almacenes for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_materiales on public.materiales for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_stock on public.stock for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_kardex on public.kardex for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_proveedores on public.proveedores for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_documentos_proveedor on public.documentos_proveedor for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_evaluaciones_proveedor on public.evaluaciones_proveedor for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_solpe_interna on public.solpe_interna for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_procesos_compra on public.procesos_compra for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_ordenes_compra on public.ordenes_compra for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_ordenes_servicio_interna on public.ordenes_servicio_interna for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_recepciones on public.recepciones for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));

create policy tenant_valorizaciones on public.valorizaciones for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_facturas on public.facturas for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_cxc on public.cxc for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_cxp on public.cxp for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_movimientos_banco on public.movimientos_banco for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));

create policy tenant_personal_operativo on public.personal_operativo for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_personal_administrativo on public.personal_administrativo for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_turnos on public.turnos for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_registros_asistencia on public.registros_asistencia for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_periodos_nomina on public.periodos_nomina for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_detalle_nomina on public.detalle_nomina for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_prestamos_personal on public.prestamos_personal for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));

create policy tenant_onboardings on public.onboardings for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_planes_exito on public.planes_exito for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_health_scores on public.health_scores for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_renovaciones on public.renovaciones for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_nps_encuestas on public.nps_encuestas for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_ia_logs on public.ia_logs for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));

create policy tenant_cargos_empresa on public.cargos_empresa for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_especialidades_tecnicas on public.especialidades_tecnicas for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_tipos_servicio_interno on public.tipos_servicio_interno for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tenant_sedes on public.sedes for all using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));

-- ============================================================
-- Fuente: supabase/policies/003_role_permissions.sql
-- ============================================================

-- TIDEO ERP - Permisos por rol y accion.
-- Extiende la validacion de tenant con permisos funcionales por pantalla.

create or replace function public.usuario_puede(target_empresa_id text, target_pantalla text, target_accion text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios_empresas ue
    join public.roles r on r.id = ue.rol_id
    where ue.user_id = auth.uid()
      and ue.estado = 'activo'
      and r.es_superadmin = true
  )
  or exists (
    select 1
    from public.usuarios_empresas ue
    join public.roles r on r.id = ue.rol_id
    where ue.user_id = auth.uid()
      and ue.empresa_id = target_empresa_id
      and ue.estado = 'activo'
      and (r.es_admin_empresa = true or r.es_superadmin = true)
  )
  or exists (
    select 1
    from public.usuarios_empresas ue
    join public.permisos_roles pr on pr.rol_id = ue.rol_id
    where ue.user_id = auth.uid()
      and ue.empresa_id = target_empresa_id
      and ue.estado = 'activo'
      and pr.pantalla = target_pantalla
      and (
        case target_accion
          when 'ver' then pr.puede_ver
          when 'crear' then pr.puede_crear
          when 'editar' then pr.puede_editar
          when 'anular' then pr.puede_anular
          when 'aprobar' then pr.puede_aprobar
          when 'exportar' then pr.puede_exportar
          when 'ver_costos' then pr.puede_ver_costos
          when 'ver_finanzas' then pr.puede_ver_finanzas
          else false
        end
      )
  );
$$;

-- Las policies iniciales siguen cubriendo tenant. Estas policies agregan una
-- capa explicita de permisos para tablas financieras criticas.

drop policy if exists tenant_financiamientos on public.financiamientos;
create policy tenant_financiamientos_select on public.financiamientos
  for select using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'financiamiento', 'ver')
  );
create policy tenant_financiamientos_insert on public.financiamientos
  for insert with check (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'financiamiento', 'crear')
  );
create policy tenant_financiamientos_update on public.financiamientos
  for update using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'financiamiento', 'editar')
  )
  with check (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'financiamiento', 'editar')
  );

drop policy if exists tenant_tabla_amortizacion on public.tabla_amortizacion;
create policy tenant_tabla_amortizacion_select on public.tabla_amortizacion
  for select using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'financiamiento', 'ver')
  );
create policy tenant_tabla_amortizacion_insert on public.tabla_amortizacion
  for insert with check (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'financiamiento', 'crear')
  );
create policy tenant_tabla_amortizacion_update on public.tabla_amortizacion
  for update using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'financiamiento', 'editar')
  )
  with check (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'financiamiento', 'editar')
  );

drop policy if exists tenant_pagos_financiamiento on public.pagos_financiamiento;
create policy tenant_pagos_financiamiento_select on public.pagos_financiamiento
  for select using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'financiamiento', 'ver')
  );
create policy tenant_pagos_financiamiento_insert on public.pagos_financiamiento
  for insert with check (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'financiamiento', 'crear')
  );

drop policy if exists tenant_compras_gastos on public.compras_gastos;
create policy tenant_compras_gastos_select on public.compras_gastos
  for select using (
    public.usuario_tiene_empresa(empresa_id)
    and (
      public.usuario_puede(empresa_id, 'estado_resultados', 'ver_finanzas')
      or public.usuario_puede(empresa_id, 'tesoreria', 'ver_finanzas')
      or public.usuario_puede(empresa_id, 'financiamiento', 'ver_finanzas')
    )
  );
create policy tenant_compras_gastos_insert on public.compras_gastos
  for insert with check (
    public.usuario_tiene_empresa(empresa_id)
    and (
      public.usuario_puede(empresa_id, 'estado_resultados', 'crear')
      or public.usuario_puede(empresa_id, 'financiamiento', 'crear')
    )
  );
create policy tenant_compras_gastos_update on public.compras_gastos
  for update using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'estado_resultados', 'editar')
  )
  with check (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'estado_resultados', 'editar')
  );

drop policy if exists tenant_movimientos_tesoreria on public.movimientos_tesoreria;
create policy tenant_movimientos_tesoreria_select on public.movimientos_tesoreria
  for select using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'tesoreria', 'ver')
  );
create policy tenant_movimientos_tesoreria_insert on public.movimientos_tesoreria
  for insert with check (
    public.usuario_tiene_empresa(empresa_id)
    and (
      public.usuario_puede(empresa_id, 'tesoreria', 'crear')
      or public.usuario_puede(empresa_id, 'financiamiento', 'crear')
    )
  );
create policy tenant_movimientos_tesoreria_update on public.movimientos_tesoreria
  for update using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'tesoreria', 'editar')
  )
  with check (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'tesoreria', 'editar')
  );

-- ============================================================
-- Fuente: supabase/policies/004_domain_permissions.sql
-- ============================================================

-- TIDEO ERP - Permisos por rol para dominios no financieros.
-- Reemplaza policies tenant genericas por checks de tenant + pantalla + accion.

-- CRM y comercial
drop policy if exists tenant_cuentas on public.cuentas;
drop policy if exists crm_cuentas_select on public.cuentas;
drop policy if exists crm_cuentas_insert on public.cuentas;
drop policy if exists crm_cuentas_update on public.cuentas;
create policy crm_cuentas_select on public.cuentas for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'cuentas', 'ver'));
create policy crm_cuentas_insert on public.cuentas for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'cuentas', 'crear'));
create policy crm_cuentas_update on public.cuentas for update using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'cuentas', 'editar')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'cuentas', 'editar'));

drop policy if exists tenant_contactos on public.contactos;
drop policy if exists crm_contactos_select on public.contactos;
drop policy if exists crm_contactos_insert on public.contactos;
drop policy if exists crm_contactos_update on public.contactos;
create policy crm_contactos_select on public.contactos for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'cuentas', 'ver'));
create policy crm_contactos_insert on public.contactos for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'cuentas', 'crear'));
create policy crm_contactos_update on public.contactos for update using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'cuentas', 'editar')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'cuentas', 'editar'));

drop policy if exists tenant_leads on public.leads;
drop policy if exists crm_leads_select on public.leads;
drop policy if exists crm_leads_insert on public.leads;
drop policy if exists crm_leads_update on public.leads;
create policy crm_leads_select on public.leads for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'leads', 'ver'));
create policy crm_leads_insert on public.leads for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'leads', 'crear'));
create policy crm_leads_update on public.leads for update using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'leads', 'editar')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'leads', 'editar'));

drop policy if exists tenant_oportunidades on public.oportunidades;
drop policy if exists crm_oportunidades_select on public.oportunidades;
drop policy if exists crm_oportunidades_insert on public.oportunidades;
drop policy if exists crm_oportunidades_update on public.oportunidades;
create policy crm_oportunidades_select on public.oportunidades for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'pipeline', 'ver'));
create policy crm_oportunidades_insert on public.oportunidades for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'pipeline', 'crear'));
create policy crm_oportunidades_update on public.oportunidades for update using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'pipeline', 'editar')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'pipeline', 'editar'));

drop policy if exists tenant_agenda_comercial on public.agenda_comercial;
drop policy if exists agenda_comercial_select on public.agenda_comercial;
drop policy if exists agenda_comercial_insert on public.agenda_comercial;
drop policy if exists agenda_comercial_update on public.agenda_comercial;
drop policy if exists crm_agenda_select on public.agenda_comercial;
drop policy if exists crm_agenda_insert on public.agenda_comercial;
drop policy if exists crm_agenda_update on public.agenda_comercial;
create policy crm_agenda_select on public.agenda_comercial for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'agenda_comercial', 'ver'));
create policy crm_agenda_insert on public.agenda_comercial for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'agenda_comercial', 'crear'));
create policy crm_agenda_update on public.agenda_comercial for update using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'agenda_comercial', 'editar')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'agenda_comercial', 'editar'));

drop policy if exists tenant_actividades_comerciales on public.actividades_comerciales;
drop policy if exists actividades_comerciales_select on public.actividades_comerciales;
drop policy if exists actividades_comerciales_insert on public.actividades_comerciales;
drop policy if exists actividades_comerciales_update on public.actividades_comerciales;
drop policy if exists crm_actividades_select on public.actividades_comerciales;
drop policy if exists crm_actividades_insert on public.actividades_comerciales;
drop policy if exists crm_actividades_update on public.actividades_comerciales;
create policy crm_actividades_select on public.actividades_comerciales for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'actividades', 'ver'));
create policy crm_actividades_insert on public.actividades_comerciales for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'actividades', 'crear'));
create policy crm_actividades_update on public.actividades_comerciales for update using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'actividades', 'editar')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'actividades', 'editar'));

drop policy if exists tenant_hojas_costeo on public.hojas_costeo;
drop policy if exists crm_hojas_costeo_select on public.hojas_costeo;
drop policy if exists crm_hojas_costeo_insert on public.hojas_costeo;
drop policy if exists crm_hojas_costeo_update on public.hojas_costeo;
create policy crm_hojas_costeo_select on public.hojas_costeo for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'hoja_costeo', 'ver'));
create policy crm_hojas_costeo_insert on public.hojas_costeo for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'hoja_costeo', 'crear'));
create policy crm_hojas_costeo_update on public.hojas_costeo for update using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'hoja_costeo', 'editar')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'hoja_costeo', 'editar'));

drop policy if exists tenant_cotizaciones on public.cotizaciones;
drop policy if exists crm_cotizaciones_select on public.cotizaciones;
drop policy if exists crm_cotizaciones_insert on public.cotizaciones;
drop policy if exists crm_cotizaciones_update on public.cotizaciones;
create policy crm_cotizaciones_select on public.cotizaciones for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'cotizaciones', 'ver'));
create policy crm_cotizaciones_insert on public.cotizaciones for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'cotizaciones', 'crear'));
create policy crm_cotizaciones_update on public.cotizaciones for update using (public.usuario_tiene_empresa(empresa_id) and (public.usuario_puede(empresa_id, 'cotizaciones', 'editar') or public.usuario_puede(empresa_id, 'cotizaciones', 'aprobar'))) with check (public.usuario_tiene_empresa(empresa_id) and (public.usuario_puede(empresa_id, 'cotizaciones', 'editar') or public.usuario_puede(empresa_id, 'cotizaciones', 'aprobar')));

-- Operaciones
drop policy if exists tenant_os_clientes on public.os_clientes;
drop policy if exists ops_os_clientes_select on public.os_clientes;
drop policy if exists ops_os_clientes_insert on public.os_clientes;
drop policy if exists ops_os_clientes_update on public.os_clientes;
create policy ops_os_clientes_select on public.os_clientes for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'os_cliente', 'ver'));
create policy ops_os_clientes_insert on public.os_clientes for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'os_cliente', 'crear'));
create policy ops_os_clientes_update on public.os_clientes for update using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'os_cliente', 'editar')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'os_cliente', 'editar'));

-- Auditoria basica en base de datos para CRM + comercial.
create or replace function public.audit_crm_comercial_basico()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_empresa_id text;
  v_entidad_id text;
  v_modulo text;
begin
  if TG_OP = 'INSERT' then
    v_new := to_jsonb(NEW);
  elsif TG_OP = 'UPDATE' then
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
  else
    return coalesce(NEW, OLD);
  end if;

  v_empresa_id := coalesce(v_new ->> 'empresa_id', v_old ->> 'empresa_id');
  v_entidad_id := coalesce(v_new ->> 'id', v_old ->> 'id');
  v_modulo := case
    when TG_TABLE_NAME in ('cuentas','contactos','leads','oportunidades','agenda_comercial','actividades_comerciales') then 'crm'
    else 'comercial'
  end;

  insert into public.auditoria (
    empresa_id, user_id, modulo, entidad, entidad_id, accion, valor_anterior, valor_nuevo
  )
  values (
    v_empresa_id, auth.uid(), v_modulo, TG_TABLE_NAME, v_entidad_id,
    lower(TG_OP), v_old, v_new
  );

  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists audit_cuentas_basico on public.cuentas;
create trigger audit_cuentas_basico after insert or update on public.cuentas
  for each row execute function public.audit_crm_comercial_basico();

drop trigger if exists audit_contactos_basico on public.contactos;
create trigger audit_contactos_basico after insert or update on public.contactos
  for each row execute function public.audit_crm_comercial_basico();

drop trigger if exists audit_leads_basico on public.leads;
create trigger audit_leads_basico after insert or update on public.leads
  for each row execute function public.audit_crm_comercial_basico();

drop trigger if exists audit_oportunidades_basico on public.oportunidades;
create trigger audit_oportunidades_basico after insert or update on public.oportunidades
  for each row execute function public.audit_crm_comercial_basico();

drop trigger if exists audit_agenda_comercial_basico on public.agenda_comercial;
create trigger audit_agenda_comercial_basico after insert or update on public.agenda_comercial
  for each row execute function public.audit_crm_comercial_basico();

drop trigger if exists audit_actividades_comerciales_basico on public.actividades_comerciales;
create trigger audit_actividades_comerciales_basico after insert or update on public.actividades_comerciales
  for each row execute function public.audit_crm_comercial_basico();

drop trigger if exists audit_hojas_costeo_basico on public.hojas_costeo;
create trigger audit_hojas_costeo_basico after insert or update on public.hojas_costeo
  for each row execute function public.audit_crm_comercial_basico();

drop trigger if exists audit_cotizaciones_basico on public.cotizaciones;
create trigger audit_cotizaciones_basico after insert or update on public.cotizaciones
  for each row execute function public.audit_crm_comercial_basico();

drop trigger if exists audit_os_clientes_basico on public.os_clientes;
create trigger audit_os_clientes_basico after insert or update on public.os_clientes
  for each row execute function public.audit_crm_comercial_basico();

drop policy if exists tenant_backlog on public.backlog;
create policy ops_backlog_select on public.backlog for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'backlog', 'ver'));
create policy ops_backlog_insert on public.backlog for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'backlog', 'crear'));
create policy ops_backlog_update on public.backlog for update using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'backlog', 'editar')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'backlog', 'editar'));

drop policy if exists tenant_ordenes_trabajo on public.ordenes_trabajo;
create policy ops_ot_select on public.ordenes_trabajo for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'ots', 'ver'));
create policy ops_ot_insert on public.ordenes_trabajo for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'ots', 'crear'));
create policy ops_ot_update on public.ordenes_trabajo for update using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'ots', 'editar')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'ots', 'editar'));

drop policy if exists tenant_partes_diarios on public.partes_diarios;
create policy ops_partes_select on public.partes_diarios for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'partes', 'ver'));
create policy ops_partes_insert on public.partes_diarios for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'partes', 'crear'));
create policy ops_partes_update on public.partes_diarios for update using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'partes', 'editar')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'partes', 'editar'));

drop policy if exists tenant_cierres_tecnicos on public.cierres_tecnicos;
create policy ops_cierres_select on public.cierres_tecnicos for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'cierres_calidad', 'ver'));
create policy ops_cierres_insert on public.cierres_tecnicos for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'cierres_calidad', 'crear'));
create policy ops_cierres_update on public.cierres_tecnicos for update using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'cierres_calidad', 'editar')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'cierres_calidad', 'editar'));

drop policy if exists tenant_costos_ot on public.costos_ot;
create policy ops_costos_ot_select on public.costos_ot for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'ots', 'ver_costos'));
create policy ops_costos_ot_insert on public.costos_ot for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'ots', 'editar'));
create policy ops_costos_ot_update on public.costos_ot for update using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'ots', 'editar')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'ots', 'editar'));

drop policy if exists tenant_tickets_soporte on public.tickets_soporte;
create policy ops_tickets_select on public.tickets_soporte for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'tickets', 'ver'));
create policy ops_tickets_insert on public.tickets_soporte for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'tickets', 'crear'));
create policy ops_tickets_update on public.tickets_soporte for update using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'tickets', 'editar')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'tickets', 'editar'));

-- Compras e inventario
drop policy if exists tenant_proveedores on public.proveedores;
create policy pur_proveedores_select on public.proveedores for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'proveedores', 'ver'));
create policy pur_proveedores_insert on public.proveedores for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'proveedores', 'crear'));
create policy pur_proveedores_update on public.proveedores for update using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'proveedores', 'editar')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'proveedores', 'editar'));

drop policy if exists tenant_documentos_proveedor on public.documentos_proveedor;
create policy pur_docs_proveedor_select on public.documentos_proveedor for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'proveedores', 'ver'));
create policy pur_docs_proveedor_insert on public.documentos_proveedor for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'proveedores', 'crear'));
create policy pur_docs_proveedor_update on public.documentos_proveedor for update using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'proveedores', 'editar')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'proveedores', 'editar'));

drop policy if exists tenant_evaluaciones_proveedor on public.evaluaciones_proveedor;
create policy pur_eval_proveedor_select on public.evaluaciones_proveedor for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'proveedores', 'ver'));
create policy pur_eval_proveedor_insert on public.evaluaciones_proveedor for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'proveedores', 'crear'));

drop policy if exists tenant_solpe_interna on public.solpe_interna;
create policy pur_solpe_select on public.solpe_interna for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'solpe', 'ver'));
create policy pur_solpe_insert on public.solpe_interna for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'solpe', 'crear'));
create policy pur_solpe_update on public.solpe_interna for update using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'solpe', 'editar')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'solpe', 'editar'));

drop policy if exists tenant_procesos_compra on public.procesos_compra;
create policy pur_procesos_select on public.procesos_compra for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'cotizaciones_compra', 'ver'));
create policy pur_procesos_insert on public.procesos_compra for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'cotizaciones_compra', 'crear'));
create policy pur_procesos_update on public.procesos_compra for update using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'cotizaciones_compra', 'editar')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'cotizaciones_compra', 'editar'));

drop policy if exists tenant_ordenes_compra on public.ordenes_compra;
create policy pur_oc_select on public.ordenes_compra for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'ordenes_compra', 'ver'));
create policy pur_oc_insert on public.ordenes_compra for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'ordenes_compra', 'crear'));
create policy pur_oc_update on public.ordenes_compra for update using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'ordenes_compra', 'editar')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'ordenes_compra', 'editar'));

drop policy if exists tenant_ordenes_servicio_interna on public.ordenes_servicio_interna;
create policy pur_osi_select on public.ordenes_servicio_interna for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'ordenes_servicio', 'ver'));
create policy pur_osi_insert on public.ordenes_servicio_interna for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'ordenes_servicio', 'crear'));
create policy pur_osi_update on public.ordenes_servicio_interna for update using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'ordenes_servicio', 'editar')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'ordenes_servicio', 'editar'));

drop policy if exists tenant_recepciones on public.recepciones;
create policy pur_recepciones_select on public.recepciones for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'recepciones', 'ver'));
create policy pur_recepciones_insert on public.recepciones for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'recepciones', 'crear'));
create policy pur_recepciones_update on public.recepciones for update using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'recepciones', 'editar')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'recepciones', 'editar'));

drop policy if exists tenant_almacenes on public.almacenes;
create policy inv_almacenes_all on public.almacenes for all using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'inventario', 'ver')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'inventario', 'editar'));
drop policy if exists tenant_materiales on public.materiales;
create policy inv_materiales_all on public.materiales for all using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'inventario', 'ver')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'inventario', 'editar'));
drop policy if exists tenant_stock on public.stock;
create policy inv_stock_all on public.stock for all using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'inventario', 'ver')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'inventario', 'editar'));
drop policy if exists tenant_kardex on public.kardex;
create policy inv_kardex_select on public.kardex for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'inventario', 'ver'));
create policy inv_kardex_insert on public.kardex for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'inventario', 'editar'));

-- RRHH
drop policy if exists tenant_personal_operativo on public.personal_operativo;
create policy hr_operativo_all on public.personal_operativo for all using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'personal_operativo', 'ver')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'personal_operativo', 'editar'));
drop policy if exists tenant_personal_administrativo on public.personal_administrativo;
create policy hr_admin_all on public.personal_administrativo for all using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'personal_administrativo', 'ver')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'personal_administrativo', 'editar'));
drop policy if exists tenant_turnos on public.turnos;
create policy hr_turnos_all on public.turnos for all using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'turnos', 'ver')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'turnos', 'editar'));
drop policy if exists tenant_registros_asistencia on public.registros_asistencia;
create policy hr_asistencia_all on public.registros_asistencia for all using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'asistencia', 'ver')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'asistencia', 'editar'));
drop policy if exists tenant_periodos_nomina on public.periodos_nomina;
create policy hr_nomina_all on public.periodos_nomina for all using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'nomina', 'ver_finanzas')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'nomina', 'editar'));
drop policy if exists tenant_detalle_nomina on public.detalle_nomina;
create policy hr_detalle_nomina_all on public.detalle_nomina for all using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'nomina', 'ver_finanzas')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'nomina', 'editar'));
drop policy if exists tenant_prestamos_personal on public.prestamos_personal;
create policy hr_prestamos_personal_all on public.prestamos_personal for all using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'prestamos_personal', 'ver')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'prestamos_personal', 'editar'));

-- Customer Success e IA
drop policy if exists tenant_onboardings on public.onboardings;
create policy cs_onboardings_all on public.onboardings for all using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'onboarding', 'ver')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'onboarding', 'editar'));
drop policy if exists tenant_planes_exito on public.planes_exito;
create policy cs_planes_all on public.planes_exito for all using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'planes_exito', 'ver')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'planes_exito', 'editar'));
drop policy if exists tenant_health_scores on public.health_scores;
create policy cs_health_all on public.health_scores for all using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'health_score', 'ver')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'health_score', 'editar'));
drop policy if exists tenant_renovaciones on public.renovaciones;
create policy cs_renovaciones_all on public.renovaciones for all using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'renovaciones', 'ver')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'renovaciones', 'editar'));
drop policy if exists tenant_nps_encuestas on public.nps_encuestas;
create policy cs_nps_all on public.nps_encuestas for all using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'nps', 'ver')) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'nps', 'editar'));

drop policy if exists tenant_ia_logs on public.ia_logs;
create policy ia_logs_select on public.ia_logs for select using (public.usuario_tiene_empresa(empresa_id) and (public.usuario_puede(empresa_id, 'ia_comercial', 'ver') or public.usuario_puede(empresa_id, 'ia_operativa', 'ver') or public.usuario_puede(empresa_id, 'ia_financiera', 'ver')));
create policy ia_logs_insert on public.ia_logs for insert with check (public.usuario_tiene_empresa(empresa_id) and (public.usuario_puede(empresa_id, 'ia_comercial', 'crear') or public.usuario_puede(empresa_id, 'ia_operativa', 'crear') or public.usuario_puede(empresa_id, 'ia_financiera', 'crear')));

-- ============================================================
-- Fuente: supabase/migrations/008_auth_frontend_access.sql
-- ============================================================

-- TIDEO ERP - Acceso frontend inicial con Supabase Auth.
-- Ejecutar despues de supabase/generated/tideo_erp_setup.sql.

alter table public.empresas enable row level security;
alter table public.planes enable row level security;
alter table public.monedas enable row level security;
alter table public.paises enable row level security;

drop policy if exists platform_empresas_select on public.empresas;
create policy platform_empresas_select on public.empresas
  for select using (public.usuario_tiene_empresa(id));

drop policy if exists platform_planes_select on public.planes;
create policy platform_planes_select on public.planes
  for select using (
    exists (
      select 1
      from public.empresas e
      where e.plan_id = planes.id
        and public.usuario_tiene_empresa(e.id)
    )
  );

drop policy if exists platform_monedas_select on public.monedas;
create policy platform_monedas_select on public.monedas
  for select using (auth.uid() is not null);

drop policy if exists platform_paises_select on public.paises;
create policy platform_paises_select on public.paises
  for select using (auth.uid() is not null);

-- Ejecuta este bloque reemplazando el email por el usuario creado en Auth.
-- Esto asigna el usuario real al tenant demo emp_001 como administrador.
/*
insert into public.usuarios_empresas (user_id, empresa_id, rol_id, acceso_campo, perfil_campo, estado)
select id, 'emp_001', 'rol_emp001_admin', true, 'gerencia', 'activo'
from auth.users
where email = 'cristhianbalvin@gmail.com'
on conflict (user_id, empresa_id) do update set
  rol_id = excluded.rol_id,
  acceso_campo = excluded.acceso_campo,
  perfil_campo = excluded.perfil_campo,
  estado = excluded.estado;
*/

-- ============================================================
-- Fuente: supabase/migrations/019_platform_tenant_admin.sql
-- ============================================================

-- TIDEO ERP - Alta operativa de tenants por Superadmin TIDEO
-- Ejecutar en proyectos existentes despues de 018_backend_crm_comercial_hardening.sql.
-- Crea tenants sin dependencia de pagos y vincula un Admin Empresa si el usuario Auth ya existe.

create or replace function public.usuario_es_superadmin_plataforma()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios_empresas ue
    join public.roles r on r.id = ue.rol_id
    where ue.user_id = auth.uid()
      and ue.estado = 'activo'
      and r.es_superadmin = true
  );
$$;

alter table public.empresas enable row level security;
alter table public.roles enable row level security;
alter table public.usuarios_empresas enable row level security;

drop policy if exists platform_empresas_insert on public.empresas;
create policy platform_empresas_insert on public.empresas
  for insert with check (public.usuario_es_superadmin_plataforma());

drop policy if exists platform_empresas_update on public.empresas;
create policy platform_empresas_update on public.empresas
  for update using (public.usuario_es_superadmin_plataforma())
  with check (public.usuario_es_superadmin_plataforma());

drop policy if exists access_roles_platform_all on public.roles;
create policy access_roles_platform_all on public.roles
  for all using (public.usuario_es_superadmin_plataforma())
  with check (public.usuario_es_superadmin_plataforma());

drop policy if exists access_usuarios_empresas_platform_all on public.usuarios_empresas;
create policy access_usuarios_empresas_platform_all on public.usuarios_empresas
  for all using (public.usuario_es_superadmin_plataforma())
  with check (public.usuario_es_superadmin_plataforma());

create or replace function public.crear_tenant_con_admin(
  p_razon_social text,
  p_nombre_comercial text default null,
  p_ruc text default null,
  p_pais text default 'PE',
  p_moneda_base text default 'PEN',
  p_zona_horaria text default 'America/Lima',
  p_estado text default 'activa',
  p_admin_email text default null,
  p_admin_nombre text default 'Administrador del tenant'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id text;
  v_rol_id text;
  v_user_id uuid;
  v_estado text;
begin
  if not public.usuario_es_superadmin_plataforma() then
    raise exception 'Solo Superadmin TIDEO puede crear tenants.';
  end if;

  if nullif(trim(p_razon_social), '') is null then
    raise exception 'La razon social es obligatoria.';
  end if;

  v_estado := case lower(coalesce(p_estado, 'activa'))
    when 'activo' then 'activa'
    when 'activa' then 'activa'
    when 'en prueba' then 'demo'
    when 'demo' then 'demo'
    when 'suspendido' then 'suspendida'
    when 'suspendida' then 'suspendida'
    else 'activa'
  end;

  v_empresa_id := 'emp_' || lower(substr(regexp_replace(coalesce(nullif(p_ruc, ''), p_razon_social), '[^a-zA-Z0-9]+', '', 'g'), 1, 18));
  if v_empresa_id = 'emp_' then
    v_empresa_id := 'emp_' || substr(md5(p_razon_social || clock_timestamp()::text), 1, 10);
  end if;

  while exists (select 1 from public.empresas where id = v_empresa_id) loop
    v_empresa_id := 'emp_' || substr(md5(p_razon_social || clock_timestamp()::text), 1, 10);
  end loop;

  insert into public.empresas (
    id, razon_social, nombre_comercial, ruc, pais, moneda_base, zona_horaria, plan_id, estado
  )
  values (
    v_empresa_id,
    trim(p_razon_social),
    coalesce(nullif(trim(p_nombre_comercial), ''), trim(p_razon_social)),
    nullif(trim(coalesce(p_ruc, '')), ''),
    coalesce(nullif(trim(p_pais), ''), 'PE'),
    coalesce(nullif(trim(p_moneda_base), ''), 'PEN'),
    coalesce(nullif(trim(p_zona_horaria), ''), 'America/Lima'),
    null,
    v_estado
  );

  v_rol_id := 'rol_' || v_empresa_id || '_admin';
  insert into public.roles (
    id, empresa_id, nombre, descripcion, es_superadmin, es_admin_empresa, activo
  )
  values (
    v_rol_id,
    v_empresa_id,
    coalesce(nullif(trim(p_admin_nombre), ''), 'Administrador del tenant'),
    'Admin Empresa creado desde Plataforma TIDEO',
    false,
    true,
    true
  );

  if nullif(trim(coalesce(p_admin_email, '')), '') is not null then
    select u.id into v_user_id
    from auth.users u
    where lower(u.email) = lower(trim(p_admin_email))
    limit 1;

    if v_user_id is not null then
      insert into public.usuarios_empresas (
        user_id, empresa_id, rol_id, acceso_campo, perfil_campo, estado
      )
      values (
        v_user_id, v_empresa_id, v_rol_id, true, 'gerencia', 'activo'
      )
      on conflict (user_id, empresa_id) do update set
        rol_id = excluded.rol_id,
        acceso_campo = excluded.acceso_campo,
        perfil_campo = excluded.perfil_campo,
        estado = 'activo',
        updated_at = now();
    end if;
  end if;

  insert into public.auditoria (
    empresa_id, user_id, modulo, entidad, entidad_id, accion, valor_nuevo
  )
  values (
    v_empresa_id,
    auth.uid(),
    'plataforma',
    'empresas',
    v_empresa_id,
    'crear_tenant',
    jsonb_build_object(
      'razon_social', p_razon_social,
      'admin_email', p_admin_email,
      'admin_vinculado', v_user_id is not null
    )
  );

  return jsonb_build_object(
    'empresa_id', v_empresa_id,
    'rol_id', v_rol_id,
    'admin_user_id', v_user_id,
    'admin_vinculado', v_user_id is not null
  );
end;
$$;

-- Fuerza a PostgREST/Supabase API a refrescar el cache de funciones RPC.
select pg_notify('pgrst', 'reload schema');

-- ============================================================
-- Fuente: supabase/migrations/020_hojas_costeo_versionado.sql
-- ============================================================

-- TIDEO ERP - Versionado editable de Hojas de Costeo
-- Ejecutar en proyectos existentes despues de 019_platform_tenant_admin.sql.

alter table public.hojas_costeo
  add column if not exists version integer default 1,
  add column if not exists historial_versiones jsonb default '[]'::jsonb;

update public.hojas_costeo
set version = 1
where version is null;

update public.hojas_costeo
set historial_versiones = '[]'::jsonb
where historial_versiones is null;

select pg_notify('pgrst', 'reload schema');

-- ============================================================
-- Fuente: supabase/migrations/021_superadmin_tenant_data_access.sql
-- ============================================================

-- TIDEO ERP - Acceso operativo Superadmin TIDEO a datos tenant
-- Ejecutar en proyectos existentes despues de 020_hojas_costeo_versionado.sql.
-- Permite que Superadmin TIDEO opere cualquier tenant sin crear membresias artificiales por empresa.

create or replace function public.usuario_tiene_empresa(target_empresa_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = auth.uid()
      and ue.empresa_id = target_empresa_id
      and ue.estado = 'activo'
  )
  or exists (
    select 1
    from public.usuarios_empresas ue
    join public.roles r on r.id = ue.rol_id
    where ue.user_id = auth.uid()
      and ue.estado = 'activo'
      and r.es_superadmin = true
  );
$$;

select pg_notify('pgrst', 'reload schema');

-- ============================================================
-- Fuente: supabase/migrations/022_superadmin_global_permissions.sql
-- ============================================================

-- TIDEO ERP - Permisos funcionales globales para Superadmin TIDEO
-- Ejecutar en proyectos existentes despues de 021_superadmin_tenant_data_access.sql.
-- Completa el bypass de plataforma: Superadmin TIDEO puede operar cualquier pantalla en cualquier tenant.

create or replace function public.usuario_puede(target_empresa_id text, target_pantalla text, target_accion text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios_empresas ue
    join public.roles r on r.id = ue.rol_id
    where ue.user_id = auth.uid()
      and ue.estado = 'activo'
      and r.es_superadmin = true
  )
  or exists (
    select 1
    from public.usuarios_empresas ue
    join public.roles r on r.id = ue.rol_id
    where ue.user_id = auth.uid()
      and ue.empresa_id = target_empresa_id
      and ue.estado = 'activo'
      and r.es_admin_empresa = true
  )
  or exists (
    select 1
    from public.usuarios_empresas ue
    join public.permisos_roles pr on pr.rol_id = ue.rol_id
    where ue.user_id = auth.uid()
      and ue.empresa_id = target_empresa_id
      and ue.estado = 'activo'
      and pr.pantalla = target_pantalla
      and (
        case target_accion
          when 'ver' then pr.puede_ver
          when 'crear' then pr.puede_crear
          when 'editar' then pr.puede_editar
          when 'anular' then pr.puede_anular
          when 'aprobar' then pr.puede_aprobar
          when 'exportar' then pr.puede_exportar
          when 'ver_costos' then pr.puede_ver_costos
          when 'ver_finanzas' then pr.puede_ver_finanzas
          else false
        end
      )
  );
$$;

select pg_notify('pgrst', 'reload schema');

-- ============================================================
-- Fuente: supabase/migrations/023_rpc_crear_hoja_costeo.sql
-- ============================================================

-- TIDEO ERP - RPC robusta para crear Hoja de Costeo
-- Ejecutar en proyectos existentes despues de 022_superadmin_global_permissions.sql.
-- Evita inserts fantasma desde frontend: la HC se crea en backend y retorna la fila persistida.

alter table public.hojas_costeo
  add column if not exists version integer default 1,
  add column if not exists historial_versiones jsonb default '[]'::jsonb;

create or replace function public.crear_hoja_costeo(
  p_empresa_id text,
  p_id text,
  p_numero text,
  p_oportunidad_id text default null,
  p_cuenta_id text default null,
  p_responsable_costeo text default null,
  p_fecha date default current_date,
  p_margen_objetivo_pct numeric default 35,
  p_notas text default null,
  p_mano_obra jsonb default '[]'::jsonb,
  p_materiales jsonb default '[]'::jsonb,
  p_servicios_terceros jsonb default '[]'::jsonb,
  p_logistica jsonb default '[]'::jsonb,
  p_total_mano_obra numeric default 0,
  p_total_materiales numeric default 0,
  p_total_servicios_terceros numeric default 0,
  p_total_logistica numeric default 0,
  p_costo_total numeric default 0,
  p_precio_sugerido_sin_igv numeric default 0,
  p_precio_sugerido_total numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.hojas_costeo%rowtype;
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tienes acceso al tenant %.', p_empresa_id;
  end if;

  if not public.usuario_puede(p_empresa_id, 'hoja_costeo', 'crear') then
    raise exception 'No tienes permiso para crear hojas de costeo en este tenant.';
  end if;

  insert into public.hojas_costeo (
    id, empresa_id, numero, oportunidad_id, cuenta_id, estado,
    responsable_costeo, fecha, margen_objetivo_pct, notas,
    mano_obra, materiales, servicios_terceros, logistica,
    total_mano_obra, total_materiales, total_servicios_terceros, total_logistica,
    costo_total, precio_sugerido_sin_igv, precio_sugerido_total,
    version, historial_versiones
  )
  values (
    p_id, p_empresa_id, p_numero, p_oportunidad_id, p_cuenta_id, 'borrador',
    p_responsable_costeo, coalesce(p_fecha, current_date), coalesce(p_margen_objetivo_pct, 35), p_notas,
    coalesce(p_mano_obra, '[]'::jsonb), coalesce(p_materiales, '[]'::jsonb),
    coalesce(p_servicios_terceros, '[]'::jsonb), coalesce(p_logistica, '[]'::jsonb),
    coalesce(p_total_mano_obra, 0), coalesce(p_total_materiales, 0),
    coalesce(p_total_servicios_terceros, 0), coalesce(p_total_logistica, 0),
    coalesce(p_costo_total, 0), coalesce(p_precio_sugerido_sin_igv, 0),
    coalesce(p_precio_sugerido_total, 0),
    1, '[]'::jsonb
  )
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

grant execute on function public.crear_hoja_costeo(
  text, text, text, text, text, text, date, numeric, text,
  jsonb, jsonb, jsonb, jsonb,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric
) to authenticated;

select pg_notify('pgrst', 'reload schema');

-- ============================================================
-- Fuente: supabase/migrations/024_backend_minimos_deploy_beta.sql
-- ============================================================

-- TIDEO ERP - Minimos backend para deploy beta controlado
-- Ejecutar en proyectos existentes despues de 023_rpc_crear_hoja_costeo.sql.
-- Cierra RLS por permisos en modulos fuera de CRM/Comercial, auditoria DB
-- transversal y aprueba HC -> Cotizacion en una transaccion backend.

-- ============================================================
-- Permisos admin por pantalla
-- ============================================================

insert into public.permisos_roles (
  rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular,
  puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas
)
select r.id, x.pantalla, true, true, true, false, true, true, true, true
from public.roles r
cross join (
  values
    ('backlog'), ('ot'), ('partes'), ('cierre'), ('valorizacion'),
    ('proveedores'), ('solpe'), ('cot_compras'), ('ordenes_compra'),
    ('ordenes_servicio'), ('recepciones'), ('inventario'),
    ('facturacion'), ('cxc'), ('cxp'), ('tesoreria'), ('resultados'),
    ('financiamiento'), ('ventas'), ('caja'),
    ('rrhh_operativo'), ('rrhh_admin'), ('turnos'), ('asistencia'),
    ('nomina'), ('prestamos_personal'),
    ('maestros'), ('servicios'), ('tarifarios'), ('parametros'),
    ('cs_onboarding'), ('cs_planes'), ('cs_health'), ('cs_renovaciones'),
    ('cs_fidelizacion'), ('bi_cs'),
    ('ia_comercial'), ('ia_operativa'), ('ia_financiera')
) as x(pantalla)
where r.es_admin_empresa = true or r.es_superadmin = true
on conflict (rol_id, pantalla) do update set
  puede_ver = true,
  puede_crear = true,
  puede_editar = true,
  puede_aprobar = true,
  puede_exportar = true,
  puede_ver_costos = true,
  puede_ver_finanzas = true;

-- ============================================================
-- Helper RLS por pantalla
-- ============================================================

create or replace function public.aplicar_rls_pantalla(
  p_table text,
  p_policy_prefix text,
  p_pantalla text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
  v_table regclass;
  v_table_name text;
begin
  v_table := to_regclass(p_table);
  if v_table is null then
    raise notice 'Tabla % no existe, se omite RLS.', p_table;
    return;
  end if;

  v_table_name := coalesce(nullif(split_part(v_table::text, '.', 2), ''), v_table::text);

  execute format('alter table %s enable row level security', v_table);

  for p in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = v_table_name
  loop
    execute format('drop policy if exists %I on %s', p.policyname, v_table);
  end loop;

  execute format(
    'create policy %I on %s for select using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, %L, %L))',
    p_policy_prefix || '_select', v_table, p_pantalla, 'ver'
  );

  execute format(
    'create policy %I on %s for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, %L, %L))',
    p_policy_prefix || '_insert', v_table, p_pantalla, 'crear'
  );

  execute format(
    'create policy %I on %s for update using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, %L, %L)) with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, %L, %L))',
    p_policy_prefix || '_update', v_table, p_pantalla, 'editar', p_pantalla, 'editar'
  );
end;
$$;

select public.aplicar_rls_pantalla('public.backlog', 'ops_backlog', 'backlog');
select public.aplicar_rls_pantalla('public.ordenes_trabajo', 'ops_ot', 'ot');
select public.aplicar_rls_pantalla('public.partes_diarios', 'ops_partes', 'partes');
select public.aplicar_rls_pantalla('public.cierres_tecnicos', 'ops_cierre', 'cierre');

select public.aplicar_rls_pantalla('public.proveedores', 'com_proveedores', 'proveedores');
select public.aplicar_rls_pantalla('public.documentos_proveedor', 'com_docs_proveedor', 'proveedores');
select public.aplicar_rls_pantalla('public.evaluaciones_proveedor', 'com_evals_proveedor', 'proveedores');
select public.aplicar_rls_pantalla('public.solpe_interna', 'com_solpe', 'solpe');
select public.aplicar_rls_pantalla('public.procesos_compra', 'com_procesos', 'cot_compras');
select public.aplicar_rls_pantalla('public.ordenes_compra', 'com_oc', 'ordenes_compra');
select public.aplicar_rls_pantalla('public.ordenes_servicio_interna', 'com_osi', 'ordenes_servicio');
select public.aplicar_rls_pantalla('public.recepciones', 'com_recepciones', 'recepciones');
select public.aplicar_rls_pantalla('public.almacenes', 'log_almacenes', 'inventario');
select public.aplicar_rls_pantalla('public.materiales', 'log_materiales', 'inventario');
select public.aplicar_rls_pantalla('public.stock', 'log_stock', 'inventario');
select public.aplicar_rls_pantalla('public.kardex', 'log_kardex', 'inventario');

select public.aplicar_rls_pantalla('public.valorizaciones', 'fin_valorizaciones', 'valorizacion');
select public.aplicar_rls_pantalla('public.facturas', 'fin_facturas', 'facturacion');
select public.aplicar_rls_pantalla('public.cxc', 'fin_cxc', 'cxc');
select public.aplicar_rls_pantalla('public.cxp', 'fin_cxp', 'cxp');
select public.aplicar_rls_pantalla('public.movimientos_banco', 'fin_mov_banco', 'tesoreria');
select public.aplicar_rls_pantalla('public.movimientos_tesoreria', 'fin_mov_tesoreria', 'tesoreria');
select public.aplicar_rls_pantalla('public.compras_gastos', 'fin_gastos', 'caja');
select public.aplicar_rls_pantalla('public.financiamientos', 'fin_deuda', 'financiamiento');
select public.aplicar_rls_pantalla('public.tabla_amortizacion', 'fin_amortizacion', 'financiamiento');
select public.aplicar_rls_pantalla('public.pagos_financiamiento', 'fin_pagos_deuda', 'financiamiento');

select public.aplicar_rls_pantalla('public.personal_operativo', 'rrhh_operativo', 'rrhh_operativo');
select public.aplicar_rls_pantalla('public.personal_administrativo', 'rrhh_admin', 'rrhh_admin');
select public.aplicar_rls_pantalla('public.turnos', 'rrhh_turnos', 'turnos');
select public.aplicar_rls_pantalla('public.registros_asistencia', 'rrhh_asistencia', 'asistencia');
select public.aplicar_rls_pantalla('public.periodos_nomina', 'rrhh_nomina', 'nomina');
select public.aplicar_rls_pantalla('public.detalle_nomina', 'rrhh_detalle_nomina', 'nomina');
select public.aplicar_rls_pantalla('public.prestamos_personal', 'rrhh_prestamos', 'prestamos_personal');

select public.aplicar_rls_pantalla('public.onboardings', 'cs_onboardings', 'cs_onboarding');
select public.aplicar_rls_pantalla('public.planes_exito', 'cs_planes', 'cs_planes');
select public.aplicar_rls_pantalla('public.health_scores', 'cs_health', 'cs_health');
select public.aplicar_rls_pantalla('public.renovaciones', 'cs_renovaciones', 'cs_renovaciones');
select public.aplicar_rls_pantalla('public.nps_encuestas', 'cs_nps', 'cs_fidelizacion');
select public.aplicar_rls_pantalla('public.ia_logs', 'ia_logs', 'ia_comercial');

select public.aplicar_rls_pantalla('public.cargos_empresa', 'mst_cargos', 'maestros');
select public.aplicar_rls_pantalla('public.especialidades_tecnicas', 'mst_especialidades', 'maestros');
select public.aplicar_rls_pantalla('public.tipos_servicio_interno', 'mst_tipos_servicio', 'maestros');
select public.aplicar_rls_pantalla('public.sedes', 'mst_sedes', 'maestros');

drop function if exists public.aplicar_rls_pantalla(text, text, text);

-- ============================================================
-- Auditoria transversal
-- ============================================================

create or replace function public.audit_backend_minimo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_empresa_id text;
  v_entidad_id text;
begin
  if TG_OP = 'INSERT' then
    v_new := to_jsonb(NEW);
  elsif TG_OP = 'UPDATE' then
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
  else
    return coalesce(NEW, OLD);
  end if;

  v_empresa_id := coalesce(v_new ->> 'empresa_id', v_old ->> 'empresa_id');
  v_entidad_id := coalesce(v_new ->> 'id', v_old ->> 'id');

  insert into public.auditoria (
    empresa_id, user_id, modulo, entidad, entidad_id, accion, valor_anterior, valor_nuevo
  )
  values (
    v_empresa_id, auth.uid(), 'backend_beta', TG_TABLE_NAME, v_entidad_id,
    lower(TG_OP), v_old, v_new
  );

  return coalesce(NEW, OLD);
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'backlog','ordenes_trabajo','partes_diarios','cierres_tecnicos',
    'proveedores','evaluaciones_proveedor','solpe_interna','procesos_compra',
    'ordenes_compra','ordenes_servicio_interna','recepciones','stock','kardex',
    'valorizaciones','facturas','cxc','cxp','movimientos_banco','movimientos_tesoreria',
    'compras_gastos','financiamientos','pagos_financiamiento',
    'personal_operativo','personal_administrativo','turnos','registros_asistencia',
    'periodos_nomina','detalle_nomina','prestamos_personal',
    'onboardings','planes_exito','health_scores','renovaciones','nps_encuestas','ia_logs',
    'cargos_empresa','especialidades_tecnicas','tipos_servicio_interno','sedes'
  ] loop
    if to_regclass('public.' || t) is null then
      raise notice 'Tabla public.% no existe, se omite auditoria.', t;
      continue;
    end if;
    execute format('drop trigger if exists audit_backend_minimo_%I on public.%I', t, t);
    execute format(
      'create trigger audit_backend_minimo_%I after insert or update on public.%I for each row execute function public.audit_backend_minimo()',
      t, t
    );
  end loop;
end;
$$;

-- ============================================================
-- RPC: aprobar Hoja de Costeo y generar Cotizacion atomica
-- ============================================================

create or replace function public.aprobar_hoja_costeo_y_crear_cotizacion(
  p_empresa_id text,
  p_hoja_costeo_id text,
  p_cotizacion_id text,
  p_numero text,
  p_moneda text default 'PEN',
  p_validez text default '30 dias'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hc public.hojas_costeo%rowtype;
  v_cot public.cotizaciones%rowtype;
  v_items jsonb;
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tienes acceso al tenant %.', p_empresa_id;
  end if;

  if not (
    public.usuario_puede(p_empresa_id, 'hoja_costeo', 'aprobar')
    or public.usuario_puede(p_empresa_id, 'cotizaciones', 'crear')
  ) then
    raise exception 'No tienes permiso para aprobar hojas de costeo.';
  end if;

  select * into v_hc
  from public.hojas_costeo
  where id = p_hoja_costeo_id
    and empresa_id = p_empresa_id
  for update;

  if not found then
    raise exception 'Hoja de Costeo no encontrada.';
  end if;

  if v_hc.estado = 'aprobada' and v_hc.cotizacion_id is not null then
    select * into v_cot from public.cotizaciones where id = v_hc.cotizacion_id;
    return jsonb_build_object('hoja_costeo', to_jsonb(v_hc), 'cotizacion', to_jsonb(v_cot));
  end if;

  v_items := coalesce(v_hc.mano_obra, '[]'::jsonb)
    || coalesce(v_hc.materiales, '[]'::jsonb)
    || coalesce(v_hc.servicios_terceros, '[]'::jsonb)
    || coalesce(v_hc.logistica, '[]'::jsonb);

  insert into public.cotizaciones (
    id, empresa_id, oportunidad_id, cuenta_id, numero, version, estado, fecha,
    items, subtotal, descuento_global_pct, descuento_global, base_imponible,
    igv_pct, igv, total, moneda, condicion_pago, hoja_costeo_id
  )
  values (
    p_cotizacion_id, p_empresa_id, v_hc.oportunidad_id, v_hc.cuenta_id,
    p_numero, 1, 'borrador', current_date,
    v_items, coalesce(v_hc.precio_sugerido_sin_igv, 0), 0, 0,
    coalesce(v_hc.precio_sugerido_sin_igv, 0), 18,
    round(coalesce(v_hc.precio_sugerido_sin_igv, 0) * 0.18),
    coalesce(v_hc.precio_sugerido_total, 0),
    coalesce(p_moneda, 'PEN'), p_validez, p_hoja_costeo_id
  )
  returning * into v_cot;

  update public.hojas_costeo
  set estado = 'aprobada',
      cotizacion_id = p_cotizacion_id,
      updated_at = now()
  where id = p_hoja_costeo_id
  returning * into v_hc;

  return jsonb_build_object('hoja_costeo', to_jsonb(v_hc), 'cotizacion', to_jsonb(v_cot));
end;
$$;

grant execute on function public.aprobar_hoja_costeo_y_crear_cotizacion(
  text, text, text, text, text, text
) to authenticated;

select pg_notify('pgrst', 'reload schema');

-- ============================================================
-- Fuente: supabase/migrations/025_maestro_industrias.sql
-- ============================================================

-- TIDEO ERP - Maestro de industrias
-- Ejecutar en proyectos existentes despues de 024_backend_minimos_deploy_beta.sql.
-- Normaliza la industria de leads y cuentas para reportes comerciales.

create table if not exists public.industrias (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  codigo text not null,
  nombre text not null,
  categoria text default 'General',
  estado text default 'activo',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (empresa_id, codigo),
  unique (empresa_id, nombre)
);

create index if not exists idx_industrias_empresa_estado on public.industrias(empresa_id, estado, nombre);

alter table public.industrias enable row level security;

drop policy if exists mst_industrias_select on public.industrias;
create policy mst_industrias_select on public.industrias
  for select using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'maestros', 'ver')
  );

drop policy if exists mst_industrias_insert on public.industrias;
create policy mst_industrias_insert on public.industrias
  for insert with check (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'maestros', 'crear')
  );

drop policy if exists mst_industrias_update on public.industrias;
create policy mst_industrias_update on public.industrias
  for update using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'maestros', 'editar')
  )
  with check (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'maestros', 'editar')
  );

insert into public.industrias (id, empresa_id, codigo, nombre, categoria)
select
  'ind_' || e.id || '_' || lower(v.codigo),
  e.id,
  v.codigo,
  v.nombre,
  v.categoria
from public.empresas e
cross join (
  values
    ('MIN', 'Mineria', 'Industrial'),
    ('IND', 'Industrial', 'Industrial'),
    ('CON', 'Construccion', 'Infraestructura'),
    ('AGR', 'Agroindustria', 'Industrial'),
    ('FAC', 'Facilities', 'Servicios'),
    ('ENE', 'Energia', 'Industrial'),
    ('OIL', 'Petroleo & Gas', 'Industrial'),
    ('LOG', 'Logistica', 'Servicios'),
    ('RET', 'Retail', 'Comercial'),
    ('SAL', 'Salud', 'Servicios'),
    ('EDU', 'Educacion', 'Servicios'),
    ('TEC', 'Tecnologia', 'Servicios'),
    ('PRO', 'Servicios profesionales', 'Servicios'),
    ('PUB', 'Sector publico', 'Gobierno'),
    ('OTR', 'Otro', 'General')
) as v(codigo, nombre, categoria)
on conflict (empresa_id, codigo) do update set
  nombre = excluded.nombre,
  categoria = excluded.categoria,
  estado = 'activo',
  updated_at = now();

select pg_notify('pgrst', 'reload schema');

-- ============================================================
-- Fuente: supabase/migrations/026_fix_hc_cotizacion_items.sql
-- ============================================================

-- TIDEO ERP - Correccion de partidas de Cotizacion generadas desde Hoja de Costeo
-- Ejecutar en proyectos existentes despues de 025_maestro_industrias.sql.
-- Normaliza los items generados por la RPC para que Cotizaciones use precio_unitario,
-- no costo_unitario, y aplique el margen objetivo de la Hoja de Costeo.

create or replace function public.aprobar_hoja_costeo_y_crear_cotizacion(
  p_empresa_id text,
  p_hoja_costeo_id text,
  p_cotizacion_id text,
  p_numero text,
  p_moneda text default 'PEN',
  p_validez text default '30 dias'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hc public.hojas_costeo%rowtype;
  v_cot public.cotizaciones%rowtype;
  v_items jsonb;
  v_divisor numeric;
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tienes acceso al tenant %.', p_empresa_id;
  end if;

  if not (
    public.usuario_puede(p_empresa_id, 'hoja_costeo', 'aprobar')
    or public.usuario_puede(p_empresa_id, 'cotizaciones', 'crear')
  ) then
    raise exception 'No tienes permiso para aprobar hojas de costeo.';
  end if;

  select * into v_hc
  from public.hojas_costeo
  where id = p_hoja_costeo_id
    and empresa_id = p_empresa_id
  for update;

  if not found then
    raise exception 'Hoja de Costeo no encontrada.';
  end if;

  if v_hc.estado = 'aprobada' and v_hc.cotizacion_id is not null then
    select * into v_cot from public.cotizaciones where id = v_hc.cotizacion_id;
    return jsonb_build_object('hoja_costeo', to_jsonb(v_hc), 'cotizacion', to_jsonb(v_cot));
  end if;

  v_divisor := greatest(0.05, 1 - least(greatest(coalesce(v_hc.margen_objetivo_pct, 35), 0), 95) / 100);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', coalesce(item->>'id', origen || '_' || md5(item::text)),
    'descripcion', coalesce(nullif(item->>'descripcion', ''), 'Partida de costeo'),
    'tipo', case when origen = 'materiales' then 'material' else 'servicio' end,
    'cantidad', coalesce(nullif(item->>'cantidad', '')::numeric, 0),
    'unidad', coalesce(nullif(item->>'unidad', ''), 'und'),
    'precio_unitario', round(coalesce(nullif(item->>'costo_unitario', '')::numeric, nullif(item->>'precio_unitario', '')::numeric, 0) / v_divisor),
    'subtotal', coalesce(nullif(item->>'cantidad', '')::numeric, 0)
      * round(coalesce(nullif(item->>'costo_unitario', '')::numeric, nullif(item->>'precio_unitario', '')::numeric, 0) / v_divisor)
  )), '[]'::jsonb)
  into v_items
  from (
    select 'mano_obra' as origen, item from jsonb_array_elements(coalesce(v_hc.mano_obra, '[]'::jsonb)) item
    union all
    select 'materiales' as origen, item from jsonb_array_elements(coalesce(v_hc.materiales, '[]'::jsonb)) item
    union all
    select 'servicios_terceros' as origen, item from jsonb_array_elements(coalesce(v_hc.servicios_terceros, '[]'::jsonb)) item
    union all
    select 'logistica' as origen, item from jsonb_array_elements(coalesce(v_hc.logistica, '[]'::jsonb)) item
  ) src;

  insert into public.cotizaciones (
    id, empresa_id, oportunidad_id, cuenta_id, numero, version, estado, fecha,
    items, subtotal, descuento_global_pct, descuento_global, base_imponible,
    igv_pct, igv, total, moneda, condicion_pago, hoja_costeo_id
  )
  values (
    p_cotizacion_id, p_empresa_id, v_hc.oportunidad_id, v_hc.cuenta_id,
    p_numero, 1, 'borrador', current_date,
    v_items, coalesce(v_hc.precio_sugerido_sin_igv, 0), 0, 0,
    coalesce(v_hc.precio_sugerido_sin_igv, 0), 18,
    round(coalesce(v_hc.precio_sugerido_sin_igv, 0) * 0.18),
    coalesce(v_hc.precio_sugerido_total, 0),
    coalesce(p_moneda, 'PEN'), p_validez, p_hoja_costeo_id
  )
  returning * into v_cot;

  update public.hojas_costeo
  set estado = 'aprobada',
      cotizacion_id = p_cotizacion_id,
      updated_at = now()
  where id = p_hoja_costeo_id
  returning * into v_hc;

  return jsonb_build_object('hoja_costeo', to_jsonb(v_hc), 'cotizacion', to_jsonb(v_cot));
end;
$$;

grant execute on function public.aprobar_hoja_costeo_y_crear_cotizacion(
  text, text, text, text, text, text
) to authenticated;

with normalizados as (
  select
    c.id as cotizacion_id,
    coalesce(jsonb_agg(jsonb_build_object(
      'id', coalesce(src.item->>'id', src.origen || '_' || md5(src.item::text)),
      'descripcion', coalesce(nullif(src.item->>'descripcion', ''), 'Partida de costeo'),
      'tipo', case when src.origen = 'materiales' then 'material' else 'servicio' end,
      'cantidad', coalesce(nullif(src.item->>'cantidad', '')::numeric, 0),
      'unidad', coalesce(nullif(src.item->>'unidad', ''), 'und'),
      'precio_unitario', round(coalesce(nullif(src.item->>'costo_unitario', '')::numeric, nullif(src.item->>'precio_unitario', '')::numeric, 0) / src.divisor),
      'subtotal', coalesce(nullif(src.item->>'cantidad', '')::numeric, 0)
        * round(coalesce(nullif(src.item->>'costo_unitario', '')::numeric, nullif(src.item->>'precio_unitario', '')::numeric, 0) / src.divisor)
    )), '[]'::jsonb) as items
  from public.cotizaciones c
  join public.hojas_costeo h on h.id = c.hoja_costeo_id
  cross join lateral (
    select 'mano_obra' as origen, item, greatest(0.05, 1 - least(greatest(coalesce(h.margen_objetivo_pct, 35), 0), 95) / 100) as divisor
    from jsonb_array_elements(coalesce(h.mano_obra, '[]'::jsonb)) item
    union all
    select 'materiales' as origen, item, greatest(0.05, 1 - least(greatest(coalesce(h.margen_objetivo_pct, 35), 0), 95) / 100) as divisor
    from jsonb_array_elements(coalesce(h.materiales, '[]'::jsonb)) item
    union all
    select 'servicios_terceros' as origen, item, greatest(0.05, 1 - least(greatest(coalesce(h.margen_objetivo_pct, 35), 0), 95) / 100) as divisor
    from jsonb_array_elements(coalesce(h.servicios_terceros, '[]'::jsonb)) item
    union all
    select 'logistica' as origen, item, greatest(0.05, 1 - least(greatest(coalesce(h.margen_objetivo_pct, 35), 0), 95) / 100) as divisor
    from jsonb_array_elements(coalesce(h.logistica, '[]'::jsonb)) item
  ) src
  where c.hoja_costeo_id is not null
  group by c.id
)
update public.cotizaciones c
set items = n.items
from normalizados n
where c.id = n.cotizacion_id;

select pg_notify('pgrst', 'reload schema');

-- ============================================================
-- Fuente: supabase/migrations/027_rpc_crear_ot_desde_os.sql
-- ============================================================

-- TIDEO ERP - Creacion atomica de OT desde OS Cliente
-- Ejecutar en proyectos existentes despues de 026_fix_hc_cotizacion_items.sql.
-- Evita que la OT quede solo en memoria cuando RLS rechaza inserts directos.

insert into public.permisos_roles (
  rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular,
  puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas
)
select r.id, x.pantalla, true, true, true, false, true, true, true, true
from public.roles r
cross join (values ('ot'), ('ots')) as x(pantalla)
where r.es_admin_empresa = true or r.es_superadmin = true
on conflict (rol_id, pantalla) do update set
  puede_ver = true,
  puede_crear = true,
  puede_editar = true,
  puede_aprobar = true,
  puede_exportar = true,
  puede_ver_costos = true,
  puede_ver_finanzas = true;

create or replace function public.crear_ot_desde_os_cliente(
  p_empresa_id text,
  p_os_cliente_id text,
  p_ot_id text,
  p_numero text,
  p_servicio text,
  p_descripcion text default null,
  p_direccion_ejecucion text default null,
  p_fecha_programada date default null,
  p_tecnico_responsable_id text default null,
  p_estado text default 'programada',
  p_costo_estimado numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_os public.os_clientes%rowtype;
  v_ot public.ordenes_trabajo%rowtype;
  v_ots jsonb;
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tienes acceso al tenant %.', p_empresa_id;
  end if;

  if not (
    public.usuario_puede(p_empresa_id, 'ot', 'crear')
    or public.usuario_puede(p_empresa_id, 'ots', 'crear')
  ) then
    raise exception 'No tienes permiso para crear Ordenes de Trabajo.';
  end if;

  select * into v_os
  from public.os_clientes
  where id = p_os_cliente_id
    and empresa_id = p_empresa_id
  for update;

  if not found then
    raise exception 'OS Cliente no encontrada.';
  end if;

  insert into public.ordenes_trabajo (
    id, empresa_id, os_cliente_id, numero, cuenta_id, servicio, descripcion,
    direccion_ejecucion, fecha_programada, tecnico_responsable_id, estado,
    avance_pct, costo_estimado, costo_real, moneda
  )
  values (
    p_ot_id, p_empresa_id, p_os_cliente_id, p_numero, v_os.cuenta_id,
    coalesce(nullif(p_servicio, ''), 'Servicio cliente'),
    p_descripcion, p_direccion_ejecucion, p_fecha_programada,
    p_tecnico_responsable_id, coalesce(nullif(p_estado, ''), 'programada'),
    0, coalesce(p_costo_estimado, 0), 0, coalesce(v_os.moneda, 'PEN')
  )
  returning * into v_ot;

  select coalesce(jsonb_agg(distinct value), '[]'::jsonb)
  into v_ots
  from (
    select value
    from jsonb_array_elements_text(coalesce(v_os.ots_asociadas, '[]'::jsonb)) value
    union all
    select p_ot_id
  ) items;

  update public.os_clientes
  set ots_asociadas = v_ots,
      saldo_por_ejecutar = greatest(0, coalesce(saldo_por_ejecutar, 0) - coalesce(p_costo_estimado, 0)),
      updated_at = now()
  where id = p_os_cliente_id
  returning * into v_os;

  return jsonb_build_object('orden_trabajo', to_jsonb(v_ot), 'os_cliente', to_jsonb(v_os));
end;
$$;

grant execute on function public.crear_ot_desde_os_cliente(
  text, text, text, text, text, text, text, date, text, text, numeric
) to authenticated;

select pg_notify('pgrst', 'reload schema');

-- ============================================================
-- Fuente: supabase/migrations/028_fix_ot_os_cliente_fkey.sql
-- ============================================================

-- TIDEO ERP - Fix FK constraint ordenes_trabajo.os_cliente_id
-- El constraint puede haberse vuelto stale si os_clientes fue recreada.
-- Elimina y recrea el FK correctamente.

alter table public.ordenes_trabajo
  drop constraint if exists ordenes_trabajo_os_cliente_id_fkey;

alter table public.ordenes_trabajo
  add constraint ordenes_trabajo_os_cliente_id_fkey
  foreign key (os_cliente_id)
  references public.os_clientes(id)
  on delete set null;

-- Mismo fix para backlog.os_cliente_id por si acaso
alter table public.backlog
  drop constraint if exists backlog_os_cliente_id_fkey;

alter table public.backlog
  add constraint backlog_os_cliente_id_fkey
  foreign key (os_cliente_id)
  references public.os_clientes(id)
  on delete set null;

-- ============================================================
-- Fuente: supabase/migrations/029_rrhh_planner_campo_operativo.sql
-- ============================================================

-- TIDEO ERP - RRHH Operativo + Planner listo para pruebas en Supabase
-- Ejecutar despues de 028_fix_ot_os_cliente_fkey.sql.
-- Agrega campos necesarios para app de campo y corrige RLS de alta de personal.

alter table public.personal_operativo
  add column if not exists sede text,
  add column if not exists supervisor text,
  add column if not exists especialidad2 text,
  add column if not exists fecha_ingreso date,
  add column if not exists acceso_campo boolean default true,
  add column if not exists perfil_campo text default 'Tecnico',
  add column if not exists docs jsonb default '{"sctr":"pendiente","medico":"pendiente","epp":"pendiente","licencia":"pendiente"}'::jsonb;

update public.personal_operativo
set acceso_campo = true,
    perfil_campo = coalesce(perfil_campo, 'Tecnico'),
    docs = coalesce(docs, '{"sctr":"pendiente","medico":"pendiente","epp":"pendiente","licencia":"pendiente"}'::jsonb);

update public.usuarios_empresas
set acceso_campo = true,
    perfil_campo = coalesce(perfil_campo, 'Tecnico'),
    updated_at = now()
where estado = 'activo';

insert into public.permisos_roles (
  rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular,
  puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas
)
select r.id, x.pantalla, true, true, true, false, true, true, true, true
from public.roles r
cross join (values ('rrhh_operativo'), ('personal_operativo'), ('planner'), ('campo')) as x(pantalla)
where r.es_admin_empresa = true or r.es_superadmin = true
on conflict (rol_id, pantalla) do update set
  puede_ver = true,
  puede_crear = true,
  puede_editar = true,
  puede_aprobar = true,
  puede_exportar = true,
  puede_ver_costos = true,
  puede_ver_finanzas = true;

alter table public.personal_operativo enable row level security;

drop policy if exists tenant_personal_operativo on public.personal_operativo;
drop policy if exists tenant_personal_operativo_isolation on public.personal_operativo;
drop policy if exists hr_operativo_all on public.personal_operativo;
drop policy if exists rrhh_operativo_select on public.personal_operativo;
drop policy if exists rrhh_operativo_insert on public.personal_operativo;
drop policy if exists rrhh_operativo_update on public.personal_operativo;

create policy rrhh_operativo_select on public.personal_operativo
  for select using (
    public.usuario_tiene_empresa(empresa_id)
    and (
      public.usuario_puede(empresa_id, 'rrhh_operativo', 'ver')
      or public.usuario_puede(empresa_id, 'personal_operativo', 'ver')
      or public.usuario_puede(empresa_id, 'planner', 'ver')
    )
  );

create policy rrhh_operativo_insert on public.personal_operativo
  for insert with check (
    public.usuario_tiene_empresa(empresa_id)
    and (
      public.usuario_puede(empresa_id, 'rrhh_operativo', 'crear')
      or public.usuario_puede(empresa_id, 'personal_operativo', 'crear')
    )
  );

create policy rrhh_operativo_update on public.personal_operativo
  for update using (
    public.usuario_tiene_empresa(empresa_id)
    and (
      public.usuario_puede(empresa_id, 'rrhh_operativo', 'editar')
      or public.usuario_puede(empresa_id, 'personal_operativo', 'editar')
    )
  )
  with check (
    public.usuario_tiene_empresa(empresa_id)
    and (
      public.usuario_puede(empresa_id, 'rrhh_operativo', 'editar')
      or public.usuario_puede(empresa_id, 'personal_operativo', 'editar')
    )
  );

select pg_notify('pgrst', 'reload schema');

-- ============================================================
-- Fuente: supabase/seeds/001_demo_tenants.sql
-- ============================================================

-- TIDEO ERP - Seeds demo multitenant.
-- Estos datos sirven para validar aislamiento por empresa y flujos base.

insert into public.planes (id, nombre, descripcion, usuarios_incluidos, modulos, precio_mensual, moneda)
values
  ('plan_growth', 'Growth', 'Plan demo para empresas de servicios en crecimiento', 25, '["crm","operaciones","compras","finanzas","rrhh","cs"]', 899.00, 'PEN'),
  ('plan_enterprise', 'Enterprise', 'Plan demo avanzado multitenant', 100, '["todos"]', 2499.00, 'PEN')
on conflict (id) do update set
  nombre = excluded.nombre,
  descripcion = excluded.descripcion,
  usuarios_incluidos = excluded.usuarios_incluidos,
  modulos = excluded.modulos,
  precio_mensual = excluded.precio_mensual,
  moneda = excluded.moneda;

insert into public.empresas (id, razon_social, nombre_comercial, ruc, pais, moneda_base, plan_id, estado)
values
  ('emp_001', 'Servicios Industriales Norte SAC', 'Servicios Industriales Norte SAC', '20100023491', 'PE', 'PEN', 'plan_growth', 'activa'),
  ('emp_002', 'Facilities Lima SA', 'Facilities Lima', '20500011122', 'PE', 'PEN', 'plan_growth', 'activa')
on conflict (id) do update set
  razon_social = excluded.razon_social,
  nombre_comercial = excluded.nombre_comercial,
  ruc = excluded.ruc,
  plan_id = excluded.plan_id,
  estado = excluded.estado;

insert into public.roles (id, empresa_id, nombre, descripcion, es_admin_empresa)
values
  ('rol_emp001_admin', 'emp_001', 'Administrador', 'Administrador del tenant demo emp_001', true),
  ('rol_emp001_finanzas', 'emp_001', 'Finanzas', 'Rol demo con acceso financiero', false),
  ('rol_emp002_admin', 'emp_002', 'Administrador', 'Administrador del tenant demo emp_002', true)
on conflict (id) do update set
  nombre = excluded.nombre,
  descripcion = excluded.descripcion,
  es_admin_empresa = excluded.es_admin_empresa;

-- Reemplazar estos UUID por usuarios reales de auth.users al conectar Supabase Auth.
insert into public.usuarios_empresas (user_id, empresa_id, rol_id, acceso_campo, perfil_campo, estado)
values
  ('00000000-0000-0000-0000-000000000001', 'emp_001', 'rol_emp001_admin', true, 'gerencia', 'activo'),
  ('00000000-0000-0000-0000-000000000002', 'emp_001', 'rol_emp001_finanzas', false, null, 'activo'),
  ('00000000-0000-0000-0000-000000000003', 'emp_002', 'rol_emp002_admin', true, 'gerencia', 'activo')
on conflict (user_id, empresa_id) do update set
  rol_id = excluded.rol_id,
  acceso_campo = excluded.acceso_campo,
  perfil_campo = excluded.perfil_campo,
  estado = excluded.estado;

insert into public.permisos_roles (rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular, puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas)
values
  ('rol_emp001_admin', 'dashboard', true, true, true, true, true, true, true, true),
  ('rol_emp001_admin', 'financiamiento', true, true, true, true, true, true, true, true),
  ('rol_emp001_admin', 'estado_resultados', true, true, true, false, false, true, true, true),
  ('rol_emp001_admin', 'tesoreria', true, true, true, false, true, true, true, true),
  ('rol_emp001_admin', 'crm', true, true, true, true, true, true, false, false),
  ('rol_emp001_finanzas', 'financiamiento', true, true, true, false, false, true, true, true),
  ('rol_emp001_finanzas', 'estado_resultados', true, false, false, false, false, true, true, true),
  ('rol_emp001_finanzas', 'tesoreria', true, true, true, false, false, true, true, true),
  ('rol_emp002_admin', 'dashboard', true, true, true, true, true, true, true, true),
  ('rol_emp002_admin', 'financiamiento', true, true, true, true, true, true, true, true)
on conflict (rol_id, pantalla) do update set
  puede_ver = excluded.puede_ver,
  puede_crear = excluded.puede_crear,
  puede_editar = excluded.puede_editar,
  puede_anular = excluded.puede_anular,
  puede_aprobar = excluded.puede_aprobar,
  puede_exportar = excluded.puede_exportar,
  puede_ver_costos = excluded.puede_ver_costos,
  puede_ver_finanzas = excluded.puede_ver_finanzas;

insert into public.permisos_roles (rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular, puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas)
select rol_id, pantalla, true, true, true, true, true, true, true, true
from (
  values
    ('rol_emp001_admin'), ('rol_emp002_admin')
) as roles(rol_id)
cross join (
  values
    ('actividades'), ('agenda_comercial'), ('hoja_costeo'), ('cotizaciones'), ('os_cliente'), ('backlog'), ('ots'), ('partes'), ('cierres_calidad'), ('tickets'),
    ('proveedores'), ('solpe'), ('cotizaciones_compra'), ('ordenes_compra'), ('ordenes_servicio'), ('recepciones'), ('inventario'),
    ('personal_operativo'), ('personal_administrativo'), ('turnos'), ('asistencia'), ('nomina'), ('prestamos_personal'),
    ('onboarding'), ('planes_exito'), ('health_score'), ('renovaciones'), ('nps'),
    ('ia_comercial'), ('ia_operativa'), ('ia_financiera')
) as pantallas(pantalla)
on conflict (rol_id, pantalla) do update set
  puede_ver = excluded.puede_ver,
  puede_crear = excluded.puede_crear,
  puede_editar = excluded.puede_editar,
  puede_anular = excluded.puede_anular,
  puede_aprobar = excluded.puede_aprobar,
  puede_exportar = excluded.puede_exportar,
  puede_ver_costos = excluded.puede_ver_costos,
  puede_ver_finanzas = excluded.puede_ver_finanzas;

insert into public.cuentas (id, empresa_id, nombre_comercial, razon_social, ruc, tipo, industria, responsable_id, condicion_pago, limite_credito, moneda, riesgo_financiero, estado)
values
  ('cta_001', 'emp_001', 'Minera Andes', 'Minera Andes SAC', '20451234987', 'cliente', 'Mineria', '00000000-0000-0000-0000-000000000001', '30 dias', 120000.00, 'PEN', 'medio', 'activo'),
  ('cta_002', 'emp_001', 'Planta Industrial Norte', 'Planta Industrial Norte SRL', '20678912345', 'cliente', 'Industrial', '00000000-0000-0000-0000-000000000001', '15 dias', 60000.00, 'PEN', 'bajo', 'activo'),
  ('cta_101', 'emp_002', 'Retail Lima', 'Retail Lima SAC', '20555111222', 'cliente', 'Retail', '00000000-0000-0000-0000-000000000003', '30 dias', 50000.00, 'PEN', 'bajo', 'activo')
on conflict (id) do update set
  nombre_comercial = excluded.nombre_comercial,
  razon_social = excluded.razon_social,
  estado = excluded.estado;

insert into public.leads (id, empresa_id, nombre_contacto, empresa_nombre, razon_social, ruc, industria, fuente, responsable_id, necesidad, presupuesto_estimado, moneda, estado)
values
  ('lead_001', 'emp_001', 'Carlos Rojas', 'Agro Norte', 'Agro Norte SAC', '20600123456', 'Agroindustria', 'Referido', '00000000-0000-0000-0000-000000000001', 'Mantenimiento preventivo de planta', 38000.00, 'PEN', 'nuevo'),
  ('lead_101', 'emp_002', 'Ana Torres', 'Clinica Lima', 'Clinica Lima SA', '20500999888', 'Salud', 'Web', '00000000-0000-0000-0000-000000000003', 'Facility management', 25000.00, 'PEN', 'nuevo')
on conflict (id) do update set estado = excluded.estado;

insert into public.financiamientos (
  id, empresa_id, codigo, tipo, entidad, tipo_entidad, contacto_nombre,
  monto_original, moneda, tasa_anual, tipo_tasa, plazo_meses, meses_gracia,
  dia_pago, tipo_cuota, cuota_mensual, fecha_desembolso, fecha_primer_pago,
  fecha_ultimo_pago, saldo_pendiente, cuotas_pagadas, intereses_pagados_total,
  proposito, centro_costo, cuenta_bancaria_destino, estado
)
values
  ('fin_001', 'emp_001', 'FIN-001', 'bancario', 'BCP - Banco de Credito del Peru', 'banco', 'Maria Gutierrez', 50000.00, 'PEN', 12.00, 'TEA', 24, 0, 5, 'frances', 2354.17, '2026-03-01', '2026-04-05', '2028-03-05', 31250.00, 8, 3240.00, 'Compra de equipos para operaciones de campo', 'CC-OPS', 'BCP Cta. cte.', 'vigente'),
  ('fin_002', 'emp_001', 'FIN-002', 'tercero', 'Luis Ramirez', 'persona_natural', 'Luis Ramirez', 10000.00, 'USD', 10.00, 'TEA', 24, 0, 5, 'bullet', 83.33, '2026-04-01', '2026-05-05', '2028-04-05', 5000.00, 1, 83.33, 'Capital de trabajo en dolares', 'CC-ADM', 'BCP Cta. cte.', 'vigente'),
  ('fin_101', 'emp_002', 'FIN-001', 'bancario', 'Interbank Empresas', 'banco', 'Ejecutivo Interbank', 30000.00, 'PEN', 11.00, 'TEA', 18, 0, 10, 'frances', 1835.00, '2026-02-10', '2026-03-10', '2027-08-10', 22000.00, 2, 520.00, 'Equipamiento operativo', 'CC-OPS', 'Interbank Cta.', 'vigente')
on conflict (id) do update set
  saldo_pendiente = excluded.saldo_pendiente,
  intereses_pagados_total = excluded.intereses_pagados_total,
  estado = excluded.estado;

insert into public.tabla_amortizacion (empresa_id, financiamiento_id, numero, fecha, capital, interes, total, saldo, estado, fecha_pago_real)
values
  ('emp_001', 'fin_001', 1, '2026-04-05', 1854.17, 500.00, 2354.17, 48145.83, 'pagada', '2026-04-05'),
  ('emp_001', 'fin_001', 2, '2026-05-05', 1872.71, 481.46, 2354.17, 46273.12, 'pendiente', null),
  ('emp_001', 'fin_002', 1, '2026-05-05', 0.00, 83.33, 83.33, 10000.00, 'pagada', '2026-04-28'),
  ('emp_001', 'fin_002', 2, '2026-06-05', 0.00, 41.67, 41.67, 5000.00, 'pendiente', null),
  ('emp_002', 'fin_101', 1, '2026-03-10', 1560.00, 275.00, 1835.00, 28440.00, 'pagada', '2026-03-10'),
  ('emp_002', 'fin_101', 2, '2026-04-10', 1574.30, 260.70, 1835.00, 26865.70, 'pagada', '2026-04-10'),
  ('emp_002', 'fin_101', 3, '2026-05-10', 1588.73, 246.27, 1835.00, 25276.97, 'pendiente', null)
on conflict (financiamiento_id, numero) do update set
  capital = excluded.capital,
  interes = excluded.interes,
  total = excluded.total,
  saldo = excluded.saldo,
  estado = excluded.estado,
  fecha_pago_real = excluded.fecha_pago_real;

insert into public.pagos_financiamiento (id, empresa_id, financiamiento_id, fecha_pago, tipo, cuota_numero, capital, interes, total, saldo_despues, moneda, cuenta_bancaria, referencia, registrado_por)
values
  ('pag_fin_001_1', 'emp_001', 'fin_001', '2026-04-05', 'cuota', 1, 1854.17, 500.00, 2354.17, 48145.83, 'PEN', 'BCP Cta. cte.', 'TRX-001', '00000000-0000-0000-0000-000000000002'),
  ('pag_fin_002_1', 'emp_001', 'fin_002', '2026-04-28', 'cuota', 1, 0.00, 83.33, 83.33, 10000.00, 'USD', 'BCP Cta. cte.', 'TRX-USD-001', '00000000-0000-0000-0000-000000000002'),
  ('pag_fin_002_abono', 'emp_001', 'fin_002', '2026-04-28', 'capital_parcial', null, 5000.00, 0.00, 5000.00, 5000.00, 'USD', 'BCP Cta. cte.', 'ABO-USD-001', '00000000-0000-0000-0000-000000000002')
on conflict (id) do nothing;

insert into public.compras_gastos (id, empresa_id, tipo, descripcion, categoria, subcategoria, monto, moneda, fecha, financiamiento_id, cuota_numero, estado)
values
  ('gasto_int_fin_001_1', 'emp_001', 'gasto', 'Intereses BCP - Cuota 1/24', 'Gastos financieros', 'Intereses de prestamos', 500.00, 'PEN', '2026-04-05', 'fin_001', 1, 'registrado'),
  ('gasto_int_fin_002_1', 'emp_001', 'gasto', 'Intereses Luis Ramirez - Cuota 1/24', 'Gastos financieros', 'Intereses de prestamos', 83.33, 'USD', '2026-04-28', 'fin_002', 1, 'registrado')
on conflict (id) do update set monto = excluded.monto, moneda = excluded.moneda;

insert into public.movimientos_tesoreria (id, empresa_id, tipo, descripcion, monto, moneda, fecha, cuenta_bancaria, referencia, vinculo_tipo, vinculo_id, estado)
values
  ('egr_fin_001_1', 'emp_001', 'egreso', 'Cuota 1 BCP - Banco de Credito del Peru', 2354.17, 'PEN', '2026-04-05', 'BCP Cta. cte.', 'TRX-001', 'financiamiento', 'fin_001', 'registrado'),
  ('egr_fin_002_1', 'emp_001', 'egreso', 'Cuota 1 Luis Ramirez', 83.33, 'USD', '2026-04-28', 'BCP Cta. cte.', 'TRX-USD-001', 'financiamiento', 'fin_002', 'registrado'),
  ('egr_fin_002_abono', 'emp_001', 'egreso', 'Abono a capital Luis Ramirez', 5000.00, 'USD', '2026-04-28', 'BCP Cta. cte.', 'ABO-USD-001', 'financiamiento', 'fin_002', 'registrado')
on conflict (id) do update set monto = excluded.monto, moneda = excluded.moneda;

-- ============================================================
-- Fuente: supabase/seeds/008_maestros_base_demo.sql
-- ============================================================

-- TIDEO ERP - Seeds Maestros Base demo para emp_001.
-- Ejecutar despues de 001_demo_tenants.sql.

-- Cargos
insert into public.cargos_empresa (id, empresa_id, codigo, nombre, tipo, detalle, estado)
values
  ('car_001', 'emp_001', 'CAR-001', 'Gerente General',                'Administrativo', 'Responsable legal y dirección',             'activo'),
  ('car_002', 'emp_001', 'CAR-002', 'Super Administrador',            'Administrativo', 'Administrador total del tenant',            'activo'),
  ('car_003', 'emp_001', 'CAR-003', 'Jefe Comercial',                 'Administrativo', 'Responsable de ventas y pipeline',          'activo'),
  ('car_004', 'emp_001', 'CAR-004', 'Ejecutivo Comercial',            'Administrativo', 'Gestión de cuentas y oportunidades',        'activo'),
  ('car_005', 'emp_001', 'CAR-005', 'Jefe de Operaciones',            'Administrativo', 'Responsable de ejecución operativa',        'activo'),
  ('car_006', 'emp_001', 'CAR-006', 'Jefe de Finanzas',               'Administrativo', 'CxC, CxP, tesorería y EEFF',                'activo'),
  ('car_007', 'emp_001', 'CAR-007', 'Analista Financiero',            'Administrativo', 'Soporte financiero y reportes',             'activo'),
  ('car_008', 'emp_001', 'CAR-008', 'Responsable Customer Success',   'Administrativo', 'Gestión de clientes y renovaciones',        'activo'),
  ('car_009', 'emp_001', 'CAR-009', 'Comprador',                      'Administrativo', 'Adquisiciones y proveedores',               'activo'),
  ('car_010', 'emp_001', 'CAR-010', 'Almacenero',                     'Administrativo', 'Control de inventario y despacho',          'activo'),
  ('car_011', 'emp_001', 'CAR-011', 'Técnico Mecánico',               'Operativo',      'Mantenimiento mecánico industrial',         'activo'),
  ('car_012', 'emp_001', 'CAR-012', 'Técnico Electrónico',            'Operativo',      'Sistemas eléctricos y electrónicos',        'activo'),
  ('car_013', 'emp_001', 'CAR-013', 'Técnico de Instrumentación',     'Operativo',      'Instrumentos de medición y control',        'activo'),
  ('car_015', 'emp_001', 'CAR-015', 'Electricista Industrial',        'Operativo',      'Instalaciones eléctricas de alta tensión',  'activo'),
  ('car_016', 'emp_001', 'CAR-016', 'Supervisora SSO',                'Operativo',      'Seguridad y salud ocupacional',             'activo'),
  ('car_018', 'emp_001', 'CAR-018', 'Ayudante Técnico',               'Operativo',      'Apoyo en trabajos de campo',                'activo'),
  ('car_019', 'emp_001', 'CAR-019', 'Soldador Certificado',           'Operativo',      'Soldadura estructural e industrial',        'activo'),
  ('car_021', 'emp_001', 'CAR-021', 'Operario de Mantenimiento',      'Operativo',      'Mantenimiento general en campo',            'activo'),
  ('car_022', 'emp_001', 'CAR-022', 'Supervisor de Operaciones',      'Ambos',          'Supervisión de equipos mixtos',             'activo')
on conflict (id) do nothing;

-- Especialidades Tecnicas
insert into public.especialidades_tecnicas (id, empresa_id, codigo, nombre, area, requiere_cert, estado)
values
  ('esp_001', 'emp_001', 'ESP-001', 'Electricista industrial',           'Eléctrica',       true,  'activo'),
  ('esp_002', 'emp_001', 'ESP-002', 'Mecánico de fajas transportadoras', 'Mecánica',        false, 'activo'),
  ('esp_003', 'emp_001', 'ESP-003', 'Técnico en instrumentación',        'Instrumentación', true,  'activo'),
  ('esp_004', 'emp_001', 'ESP-004', 'Soldador homologado',               'Mecánica',        true,  'activo'),
  ('esp_005', 'emp_001', 'ESP-005', 'Técnico CCTV y seguridad',          'Sistemas',        false, 'activo'),
  ('esp_006', 'emp_001', 'ESP-006', 'Técnico en climatización',          'Mecánica',        false, 'activo'),
  ('esp_007', 'emp_001', 'ESP-007', 'Supervisor HSE',                    'Seguridad',       true,  'activo'),
  ('esp_008', 'emp_001', 'ESP-008', 'Técnico polivalente',               'General',         false, 'activo')
on conflict (id) do nothing;

-- Tipos de Servicio Interno
insert into public.tipos_servicio_interno (id, empresa_id, codigo, nombre, clasificacion, facturable, estado)
values
  ('tsi_001', 'emp_001', 'TSI-001', 'Mantenimiento preventivo', 'Preventivo', true,  'activo'),
  ('tsi_002', 'emp_001', 'TSI-002', 'Mantenimiento correctivo', 'Correctivo', true,  'activo'),
  ('tsi_003', 'emp_001', 'TSI-003', 'Proyecto de instalación',  'Proyecto',   true,  'activo'),
  ('tsi_004', 'emp_001', 'TSI-004', 'Atención de emergencia',   'Emergencia', true,  'activo'),
  ('tsi_005', 'emp_001', 'TSI-005', 'Servicio en garantía',     'Garantía',   false, 'activo'),
  ('tsi_006', 'emp_001', 'TSI-006', 'Trabajo interno',          'Interno',    false, 'activo')
on conflict (id) do nothing;

-- Sedes
insert into public.sedes (id, empresa_id, codigo, nombre, direccion, gps, estado)
values
  ('sed_001', 'emp_001', 'SED-001', 'Sede Central San Isidro', 'Av. Javier Prado Este 456, San Isidro, Lima', '-12.0934,-77.0256', 'activo'),
  ('sed_002', 'emp_001', 'SED-002', 'Planta Lurin', 'Km 35 Antigua Panamericana Sur, Lurin', '-12.2831,-76.8833', 'activo')
on conflict (id) do nothing;

-- ============================================================
-- Fuente: supabase/seeds/002_crm_demo.sql
-- ============================================================

-- TIDEO ERP - Seeds CRM demo para emp_001.
-- Ejecutar despues de 001_demo_tenants.sql.
-- Proporciona datos ricos para validar el modulo CRM en modo Supabase.

-- Cuentas
insert into public.cuentas (id, empresa_id, nombre_comercial, razon_social, ruc, tipo, industria, condicion_pago, limite_credito, moneda, riesgo_financiero, estado)
values
  ('cta_001', 'emp_001', 'Minera Andes',          'Minera Andes SAC',                   '20451234987', 'estrategico', 'Mineria',        '30 dias', 120000, 'PEN', 'medio', 'activo'),
  ('cta_002', 'emp_001', 'Planta Industrial Norte','Planta Industrial Norte SRL',         '20678912345', 'clave',       'Industrial',     '15 dias',  60000, 'PEN', 'bajo',  'activo'),
  ('cta_003', 'emp_001', 'Logistica Altiplano',    'Logistica Altiplano SAC',            '20512398761', 'recurrente',  'Logistica',      '30 dias',  45000, 'PEN', 'alto',  'activo'),
  ('cta_004', 'emp_001', 'Textil Andina',          'Textil Andina SA',                   '20309876543', 'recurrente',  'Textil',         '30 dias',  30000, 'PEN', 'bajo',  'activo'),
  ('cta_005', 'emp_001', 'Facilities Lima',        'Facilities Lima SA',                 '20500011122', 'estrategico', 'Facility Mgmt',  '45 dias',  80000, 'PEN', 'medio', 'activo'),
  ('cta_006', 'emp_001', 'Distribuidora Sur',      'Distribuidora Sur EIRL',             '20412356789', 'prospecto',   'Distribucion',   '15 dias',  15000, 'PEN', 'bajo',  'activo')
on conflict (id) do update set
  nombre_comercial  = excluded.nombre_comercial,
  tipo              = excluded.tipo,
  industria         = excluded.industria,
  condicion_pago    = excluded.condicion_pago,
  limite_credito    = excluded.limite_credito,
  riesgo_financiero = excluded.riesgo_financiero,
  estado            = excluded.estado;

-- Contactos
insert into public.contactos (id, empresa_id, cuenta_id, nombre, cargo, telefono, email, es_principal, estado)
values
  ('con_001', 'emp_001', 'cta_001', 'Jorge Mamani',    'Jefe de Mantenimiento', '+51 987 001 001', 'j.mamani@mineraandes.pe',    true,  'activo'),
  ('con_002', 'emp_001', 'cta_001', 'Patricia Flores', 'Gerente de Compras',    '+51 987 001 002', 'p.flores@mineraandes.pe',    false, 'activo'),
  ('con_003', 'emp_001', 'cta_002', 'Carlos Quispe',   'Director de Planta',    '+51 987 002 001', 'c.quispe@plantanorte.pe',    true,  'activo'),
  ('con_004', 'emp_001', 'cta_003', 'Lucia Vargas',    'Jefa de Operaciones',   '+51 987 003 001', 'l.vargas@altiplano.pe',      true,  'activo'),
  ('con_005', 'emp_001', 'cta_004', 'Rosa Mamani',     'Gerente de Operaciones','+51 976 543 210', 'r.mamani@textil-andina.pe',  true,  'activo'),
  ('con_006', 'emp_001', 'cta_005', 'Ana Torres',      'Administradora',        '+51 987 005 001', 'a.torres@facilitieslima.pe', true,  'activo')
on conflict (id) do update set
  nombre    = excluded.nombre,
  cargo     = excluded.cargo,
  telefono  = excluded.telefono,
  email     = excluded.email,
  es_principal = excluded.es_principal;

-- Leads
insert into public.leads (id, empresa_id, nombre_contacto, empresa_nombre, razon_social, ruc, industria, telefono, email, fuente, necesidad, presupuesto_estimado, moneda, estado, convertido)
values
  ('lead_001', 'emp_001', 'Carlos Huanca',    'Minera San Cristobal SAC',    'Minera San Cristobal SAC',    '20600123456', 'Mineria',        '+51 987 654 321', 'c.huanca@sancristobal.pe',  'Referido',       'Mantenimiento de fajas transportadoras, 3 unidades con desgaste critico', 85000, 'PEN', 'calificado',  false),
  ('lead_002', 'emp_001', 'Rosa Mamani',      'Textil Andina SA',            'Textil Andina SA',            '20309876543', 'Textil',         '+51 976 543 210', 'r.mamani@textil-andina.pe', 'Formulario web', 'Servicio de limpieza industrial y mantenimiento preventivo mensual',    24000, 'PEN', 'nuevo',       false),
  ('lead_003', 'emp_001', 'Jorge Quispe',     'Distribuidora Sur EIRL',      'Distribuidora Sur EIRL',      '20412356789', 'Distribucion',   '+51 965 432 109', 'j.quispe@distrisur.pe',     'Evento / Feria', 'Mantenimiento electrico preventivo de almacenes',                      8000, 'PEN', 'en_contacto', false),
  ('lead_004', 'emp_001', 'Patricia Condori', 'Agroindustrial Valle Verde',  'Agroindustrial Valle Verde SAC','20600999001','Agroindustria',  '+51 954 321 098', 'p.condori@valleverde.pe',   'Referido',       'Instalacion de sistema de riego automatizado y mantenimiento',         45000, 'PEN', 'nuevo',       false),
  ('lead_005', 'emp_001', 'Manuel Chavez',    'Constructora Rimac SA',       'Constructora Rimac SA',       '20500567890', 'Construccion',   '+51 943 210 987', 'm.chavez@constructora-rimac.pe','LinkedIn',    'Outsourcing de personal tecnico para proyecto 8 meses',               120000,'PEN', 'descartado',  false)
on conflict (id) do update set
  nombre_contacto     = excluded.nombre_contacto,
  empresa_nombre      = excluded.empresa_nombre,
  necesidad           = excluded.necesidad,
  presupuesto_estimado= excluded.presupuesto_estimado,
  estado              = excluded.estado;

-- Oportunidades
insert into public.oportunidades (id, empresa_id, cuenta_id, lead_id, nombre, etapa, probabilidad, monto_estimado, moneda, fecha_cierre_estimada, estado)
values
  ('opp_001', 'emp_001', 'cta_001', null,     'Contrato mantenimiento anual Minera Andes',    'negociacion',  70, 280000, 'PEN', '2026-06-30', 'abierta'),
  ('opp_002', 'emp_001', 'cta_002', null,     'Overhaul de linea de produccion',              'propuesta',    50, 145000, 'PEN', '2026-07-15', 'abierta'),
  ('opp_003', 'emp_001', 'cta_003', null,     'Servicio preventivo flota logistica',          'calificacion', 30,  72000, 'PEN', '2026-08-01', 'abierta'),
  ('opp_004', 'emp_001', 'cta_004', 'lead_002','Limpieza industrial Textil Andina',           'propuesta',    60,  24000, 'PEN', '2026-05-31', 'abierta'),
  ('opp_005', 'emp_001', 'cta_005', null,     'Gestion integral de instalaciones',            'ganada',      100, 195000, 'PEN', '2026-04-15', 'ganada'),
  ('opp_006', 'emp_001', 'cta_001', null,     'Instalacion sistema monitoreo predictivo',     'calificacion', 25,  58000, 'PEN', '2026-09-01', 'abierta')
on conflict (id) do update set
  etapa        = excluded.etapa,
  probabilidad = excluded.probabilidad,
  monto_estimado = excluded.monto_estimado,
  estado       = excluded.estado;

-- Agenda Comercial
insert into public.agenda_comercial (id, empresa_id, titulo, tipo, cuenta_id, lead_id, oportunidad_id, vendedor, registrado_por, fecha, hora, duracion_minutos, estado, notas)
values
  ('evt_001', 'emp_001', 'Visita de inspeccion inicial', 'visita', 'cta_003', null, 'opp_003', 'Carla Meza', 'Carla Meza', '2026-04-29', '10:00', 60, 'programado', 'Confirmar medidas para propuesta'),
  ('evt_002', 'emp_001', 'Reunion de seguimiento', 'reunion', 'cta_001', null, 'opp_001', 'Carla Meza', 'Carla Meza', '2026-04-30', '15:00', 45, 'programado', 'Revision de contrato anual'),
  ('evt_003', 'emp_001', 'Llamada prospecto', 'llamada', null, 'lead_002', null, 'Pedro Salas', 'Pedro Salas', '2026-04-29', '09:30', 15, 'realizado', 'No contesto, reprogramar'),
  ('evt_004', 'emp_001', 'Demo del servicio', 'demo', 'cta_004', null, 'opp_004', 'Pedro Salas', 'Pedro Salas', '2026-05-02', '11:00', 60, 'programado', 'Llevar equipos de muestra')
on conflict (id) do update set
  titulo = excluded.titulo,
  tipo = excluded.tipo,
  vendedor = excluded.vendedor,
  registrado_por = excluded.registrado_por,
  fecha = excluded.fecha,
  hora = excluded.hora,
  estado = excluded.estado;

-- Actividades Comerciales
insert into public.actividades_comerciales (
  id, empresa_id, tipo, vinculo_tipo, vinculo_id, cuenta_id, contacto_id,
  oportunidad_id, lead_id, responsable, fecha, hora, descripcion, resultado,
  proxima_accion, proxima_accion_fecha, estado
)
values
  ('act_001', 'emp_001', 'reunion', 'oportunidad', 'opp_001', 'cta_001', 'con_001', 'opp_001', null, 'Carla Meza', '2026-04-20', '10:00', 'Reunion de renovacion contrato anual.', 'Cliente pide incluir dos sedes adicionales.', 'Preparar propuesta ajustada', '2026-04-25', 'completada'),
  ('act_002', 'emp_001', 'llamada', 'oportunidad', 'opp_004', 'cta_004', 'con_005', 'opp_004', null, 'Pedro Salas', '2026-04-25', '15:30', 'Llamada de seguimiento a propuesta.', 'Pendiente revision con operaciones.', 'Enviar alcance actualizado', '2026-04-30', 'pendiente'),
  ('act_003', 'emp_001', 'tarea', 'lead', 'lead_002', null, null, null, 'lead_002', 'Pedro Salas', '2026-04-29', '09:00', 'Primer contacto con prospecto Textil Andina.', null, null, null, 'pendiente')
on conflict (id) do update set
  tipo = excluded.tipo,
  responsable = excluded.responsable,
  fecha = excluded.fecha,
  hora = excluded.hora,
  descripcion = excluded.descripcion,
  resultado = excluded.resultado,
  estado = excluded.estado;

-- Cotizaciones
insert into public.cotizaciones (id, empresa_id, oportunidad_id, cuenta_id, numero, version, estado, fecha, items, subtotal, descuento_global_pct, descuento_global, base_imponible, igv_pct, igv, total, moneda, condicion_pago)
values
  ('cot_001', 'emp_001', 'opp_005', 'cta_005', 'COT-2026-0001', 1, 'aprobada', '2026-04-10', '[{"desc": "Gestión integral de instalaciones", "monto": 195000}]'::jsonb, 195000, 0, 0, 195000, 18, 35100, 230100, 'PEN', '45 dias'),
  ('cot_002', 'emp_001', 'opp_004', 'cta_004', 'COT-2026-0002', 1, 'enviada', '2026-04-25', '[{"desc": "Limpieza industrial", "monto": 24000}]'::jsonb, 24000, 5, 1200, 22800, 18, 4104, 26904, 'PEN', '30 dias')
on conflict (id) do update set
  estado = excluded.estado,
  total = excluded.total;

-- OS Clientes
insert into public.os_clientes (id, empresa_id, cuenta_id, cotizacion_id, oportunidad_id, numero, numero_doc_cliente, monto_aprobado, moneda, condicion_pago, fecha_emision, fecha_inicio, fecha_fin, sla, estado, saldo_por_ejecutar, saldo_por_valorizar, saldo_por_facturar, anticipo_recibido, monto_facturado, monto_cobrado, ots_asociadas)
values
  ('osc_001', 'emp_001', 'cta_005', 'cot_001', 'opp_005', 'OSC-2026-0001', 'OC-998877', 230100, 'PEN', '45 dias', '2026-04-15', '2026-05-01', '2026-12-31', 'estricto', 'en_ejecucion', 230100, 230100, 230100, 0, 0, 0, '[]'::jsonb)
on conflict (id) do update set
  estado = excluded.estado,
  saldo_por_ejecutar = excluded.saldo_por_ejecutar;

-- ============================================================
-- Fuente: supabase/seeds/003_ops_demo.sql
-- ============================================================

-- Semillas de datos para Operaciones (Tenant emp_001)

insert into public.backlog (id, empresa_id, cuenta_id, descripcion, prioridad, estado, centro_costo)
values
  ('req_001', 'emp_001', 'cta_005', 'Mantenimiento preventivo de aire acondicionado (Piso 4)', 'alta', 'pendiente', 'CC-MANT-01'),
  ('req_002', 'emp_001', 'cta_005', 'Reparación de luminarias (Recepción)', 'media', 'convertido', 'CC-MANT-02')
on conflict do nothing;

insert into public.ordenes_trabajo (id, empresa_id, os_cliente_id, backlog_id, numero, cuenta_id, servicio, descripcion, estado, avance_pct, costo_estimado, costo_real)
values
  ('ot_001', 'emp_001', 'osc_001', 'req_002', 'OT-26-0001', 'cta_005', 'Mantenimiento Correctivo', 'Reparación de luminarias (Recepción) e instalación de nuevos focos LED', 'ejecucion', 50, 1500, 450),
  ('ot_002', 'emp_001', 'osc_001', null, 'OT-26-0002', 'cta_005', 'Mantenimiento Preventivo', 'Limpieza general de ductos y filtros', 'programada', 0, 800, 0)
on conflict do nothing;

insert into public.partes_diarios (id, empresa_id, orden_trabajo_id, tecnico_id, fecha, horas_normales, actividad, avance_pct, materiales, estado)
values
  ('part_001', 'emp_001', 'ot_001', null, '2026-04-18', 4, 'Desmontaje de luminarias antiguas e inspección de cableado', 20, '[]'::jsonb, 'aprobado'),
  ('part_002', 'emp_001', 'ot_001', null, '2026-04-19', 6, 'Instalación de 10 focos LED y pruebas de encendido', 30, '[{"sku": "MAT-001", "nombre": "Foco LED 18W", "cantidad": 10}]'::jsonb, 'en_revision')
on conflict do nothing;

-- ============================================================
-- Fuente: supabase/seeds/005_compras_demo.sql
-- ============================================================

-- TIDEO ERP - Seeds Compras y Proveedores para emp_001.
-- Ejecutar despues de 001_demo_tenants.sql.

-- Proveedores
insert into public.proveedores (id, empresa_id, razon_social, ruc, tipo, estado, rubro, telefono, email, condicion_pago, calificacion_promedio)
values
  ('prv_001', 'emp_001', 'Ferreteria Industrial SAC',       '20512345678', 'empresa', 'homologado',    'Materiales',  '+51 987 111 222', 'ventas@ferind.pe',       '30 dias', 4.4),
  ('prv_002', 'emp_001', 'Electroandes EIRL',               '20609876543', 'empresa', 'homologado',    'Materiales',  '+51 987 333 444', 'info@electroandes.pe',   'Contado', 4.8),
  ('prv_003', 'emp_001', 'Transporte Rapido SAC',           '20511112222', 'empresa', 'en_evaluacion', 'Transporte',  '+51 987 444 555', 'ops@transrapido.pe',     '15 dias', 3.9),
  ('prv_004', 'emp_001', 'Mantenimientos Externos EIRL',   '20498765432', 'empresa', 'potencial',      'Servicios',   '+51 987 666 777', 'contacto@mantex.pe',     'Contado', null),
  ('prv_005', 'emp_001', 'Logistica Norte EIRL',            '20412356789', 'empresa', 'observado',     'Transporte',  '+51 987 888 999', 'l.norte@logisticanorte.pe','30 dias', 2.5)
on conflict (id) do nothing;

-- SOLPE
insert into public.solpe_interna (id, empresa_id, codigo, descripcion, tipo, prioridad, estado, fecha_requerida)
values
  ('slp_001', 'emp_001', 'SLP-2025-001', 'Materiales electricos para mantenimiento fajas - cable, terminales, canaletas', 'bien',     'alta',  'aprobada', '2025-04-28'),
  ('slp_002', 'emp_001', 'SLP-2025-002', 'Transporte de materiales a planta Toquepala',                                   'servicio', 'media', 'aprobada', '2025-04-30'),
  ('slp_003', 'emp_001', 'SLP-2025-003', 'EPP para personal de campo (cascos, lentes, guantes)',                          'bien',     'alta',  'borrador',  '2025-05-05')
on conflict (id) do nothing;

-- Procesos de Compra
insert into public.procesos_compra (id, empresa_id, codigo, solpe_id, descripcion, tipo, fecha_limite, proveedores_consultados, proveedor_ganador, monto_referencial, monto_seleccionado, estado)
values
  ('pc_001', 'emp_001', 'COT-COMP-001', 'slp_001', 'Materiales electricos para mantenimiento fajas', 'bien',     '2025-04-28', '["prv_001","prv_002"]'::jsonb, 'prv_001', 4500, 4150, 'comparativo_listo'),
  ('pc_002', 'emp_001', 'COT-COMP-002', 'slp_002', 'Transporte de materiales a planta Toquepala',   'servicio', '2025-04-30', '["prv_003"]'::jsonb,           null,      900,  null, 'esperando_respuesta')
on conflict (id) do nothing;

-- Órdenes de Compra
insert into public.ordenes_compra (id, empresa_id, codigo, proceso_compra_id, proveedor_id, descripcion, items, subtotal, igv, total, moneda, condicion_pago, fecha_emision, fecha_entrega_esperada, estado, porcentaje_recibido)
values
  ('oc_001', 'emp_001', 'OC-2025-0089', 'pc_001', 'prv_001',
   'Materiales electricos - cable 2.5mm, terminales, canaletas',
   '[{"descripcion":"Cable NHX-80 2.5mm","cantidad":100,"unidad":"m","precio_unitario":2.80,"subtotal":280},{"descripcion":"Terminales de compresion","cantidad":50,"unidad":"Und","precio_unitario":1.20,"subtotal":60},{"descripcion":"Canaleta ranurada 40x25","cantidad":20,"unidad":"m","precio_unitario":8.50,"subtotal":170},{"descripcion":"Breaker 3x32A Schneider","cantidad":2,"unidad":"Und","precio_unitario":185,"subtotal":370}]'::jsonb,
   880, 158.40, 1038.40, 'PEN', '30 dias', '2025-04-23', '2025-04-25', 'recibida_total', 100),
  ('oc_002', 'emp_001', 'OC-2025-0090', null, 'prv_001',
   'EPP para personal - cascos, lentes, guantes',
   '[{"descripcion":"Casco MSA blanco","cantidad":5,"unidad":"Und","precio_unitario":45,"subtotal":225},{"descripcion":"Lentes de seguridad","cantidad":10,"unidad":"Und","precio_unitario":12,"subtotal":120},{"descripcion":"Guantes nitrilo talla L","cantidad":20,"unidad":"Par","precio_unitario":8.50,"subtotal":170}]'::jsonb,
   515, 92.70, 607.70, 'PEN', '30 dias', '2025-04-24', '2025-04-28', 'confirmada', 0),
  ('oc_003', 'emp_001', 'OC-2025-0086', null, 'prv_002',
   'Tablero electrico 12 polos con caja',
   '[{"descripcion":"Tablero electrico 12 polos","cantidad":1,"unidad":"Und","precio_unitario":380,"subtotal":380},{"descripcion":"Caja metalica 400x300x150","cantidad":1,"unidad":"Und","precio_unitario":120,"subtotal":120}]'::jsonb,
   500, 90, 590, 'PEN', 'Contado', '2025-04-18', '2025-04-21', 'cerrada', 100)
on conflict (id) do nothing;

-- Órdenes de Servicio Interna (OSI)
insert into public.ordenes_servicio_interna (id, empresa_id, codigo, proceso_compra_id, proveedor_id, descripcion, entregables, total, moneda, condicion_pago, fecha_emision, fecha_inicio, fecha_fin, estado)
values
  ('os_001', 'emp_001', 'OS-2025-0012', 'pc_002', 'prv_003',
   'Transporte de materiales y personal tecnico a planta Toquepala',
   '["Guia de remision","Registro de llegada firmado por supervisor de planta"]'::jsonb,
   800, 'PEN', '15 dias', '2025-04-20', '2025-04-22', '2025-04-22', 'cerrada')
on conflict (id) do nothing;

-- Recepciones
insert into public.recepciones (id, empresa_id, orden_compra_id, tipo, fecha, items_recibidos, estado)
values
  ('rec_001', 'emp_001', 'oc_001', 'total', '2025-04-25',
   '[{"descripcion":"Cable NHX-80 2.5mm","pedido":100,"recibido":100,"unidad":"m","conforme":true},{"descripcion":"Terminales de compresion","pedido":50,"recibido":50,"unidad":"Und","conforme":true},{"descripcion":"Canaleta ranurada 40x25","pedido":20,"recibido":20,"unidad":"m","conforme":true},{"descripcion":"Breaker 3x32A Schneider","pedido":2,"recibido":2,"unidad":"Und","conforme":true}]'::jsonb,
   'confirmada')
on conflict (id) do nothing;

-- ============================================================
-- Fuente: supabase/seeds/004_finances_demo.sql
-- ============================================================

-- TIDEO ERP - Seeds Finanzas demo para emp_001.
-- Ejecutar despues de 003_ops_demo.sql.

-- 1. Valorizaciones
insert into public.valorizaciones (id, empresa_id, os_cliente_id, numero, fecha, periodo, subtotal, igv, total, moneda, estado)
values
  ('val_001', 'emp_001', 'osc_001', 'VAL-0089', '2026-04-18', 'Abril 2026', 80508.47, 14491.53, 95000.00, 'PEN', 'facturada'),
  ('val_002', 'emp_001', 'osc_002', 'VAL-0087', '2026-04-16', 'Abril 2026', 18983.05,  3416.95, 22400.00, 'PEN', 'facturada')
on conflict (id) do update set estado = excluded.estado;

-- 2. Facturas
insert into public.facturas (id, empresa_id, cuenta_id, valorizacion_id, numero, fecha_emision, subtotal, igv, total, moneda, estado)
values
  ('fac_001', 'emp_001', 'cta_001', 'val_001', 'F001-0512', '2026-04-20', 80508.47, 14491.53, 95000.00, 'PEN', 'emitida'),
  ('fac_002', 'emp_001', 'cta_001', 'val_002', 'F001-0510', '2026-04-18', 18983.05,  3416.95, 22400.00, 'PEN', 'pagada')
on conflict (id) do update set estado = excluded.estado;

-- 3. CxC
insert into public.cxc (id, empresa_id, cuenta_id, factura_id, fecha_emision, fecha_vencimiento, monto_total, monto_pagado, saldo, moneda, estado)
values
  ('cxc_001', 'emp_001', 'cta_001', 'fac_001', '2026-04-20', '2026-05-20', 95000.00,      0.00, 95000.00, 'PEN', 'por_cobrar'),
  ('cxc_002', 'emp_001', 'cta_001', 'fac_002', '2026-04-18', '2026-05-18', 22400.00,  22400.00,      0.00, 'PEN', 'cobrada')
on conflict (id) do update set estado = excluded.estado;

-- 4. CxP (Usando proveedores existentes de compras demo o creando uno genérico)
insert into public.cxp (id, empresa_id, proveedor_id, factura_numero, fecha_emision, fecha_vencimiento, monto_total, monto_pagado, saldo, moneda, estado)
values
  ('cxp_001', 'emp_001', 'prv_001', 'F001-2341', '2026-04-22', '2026-05-07',  450.00,   0.00,  450.00, 'PEN', 'por_pagar'),
  ('cxp_002', 'emp_001', 'prv_002', 'F002-1122', '2026-04-20', '2026-04-24', 1250.00, 1250.00,    0.00, 'PEN', 'pagada')
on conflict (id) do update set estado = excluded.estado;

-- 5. Movimientos Banco
insert into public.movimientos_banco (id, empresa_id, fecha, descripcion, tipo, monto, moneda, vinculado_tipo, vinculado_id, conciliado)
values
  ('mb_001', 'emp_001', '2026-04-20', 'Pago Factura F001-0510', 'credito', 22400.00, 'PEN', 'cxc', 'cxc_002', true),
  ('mb_002', 'emp_001', '2026-04-21', 'Abono cliente Minera Andes', 'credito', 15000.00, 'PEN', null, null, false),
  ('mb_003', 'emp_001', '2026-04-23', 'Pago proveedor Electroandes', 'debito', 1250.00, 'PEN', 'cxp', 'cxp_002', true)
on conflict (id) do update set conciliado = excluded.conciliado;

-- ============================================================
-- Fuente: supabase/seeds/006_rrhh_demo.sql
-- ============================================================

-- TIDEO ERP - Seeds RRHH para emp_001.
-- Ejecutar despues de 001_demo_tenants.sql.

-- Turnos de trabajo
insert into public.turnos (id, empresa_id, nombre, hora_entrada, hora_salida, tolerancia_minutos, cruza_medianoche, dias_laborables, minutos_refrigerio, horas_efectivas, estado)
values
  ('tur_001', 'emp_001', 'Turno Mañana',        '07:00', '15:00', 10, false, '["lun","mar","mie","jue","vie"]'::jsonb, 60, 7.0,  'activo'),
  ('tur_002', 'emp_001', 'Turno Tarde',          '15:00', '23:00', 10, false, '["lun","mar","mie","jue","vie"]'::jsonb, 60, 7.0,  'activo'),
  ('tur_003', 'emp_001', 'Turno Noche',          '23:00', '07:00', 10, true,  '["lun","mar","mie","jue","vie"]'::jsonb, 60, 7.0,  'activo'),
  ('tur_004', 'emp_001', 'Turno Campo 10h',      '07:00', '17:00', 15, false, '["lun","mar","mie","jue","vie","sab"]'::jsonb, 60, 9.0,  'activo'),
  ('tur_005', 'emp_001', 'Turno Administrativo', '08:00', '17:00', 10, false, '["lun","mar","mie","jue","vie"]'::jsonb, 60, 8.0,  'activo')
on conflict (id) do nothing;

-- Personal Operativo (técnicos de campo)
insert into public.personal_operativo (id, empresa_id, codigo, nombre, documento, cargo, especialidad, area, turno_id, telefono, sueldo_base, moneda, sistema_pensionario, costo_hora_real, costo_hora_extra, estado)
values
  ('pop_001', 'emp_001', 'TEC-001', 'Luis Mendoza Ramirez',   '72345678', 'Técnico Electricista',     'Electricidad Industrial', 'Operaciones', 'tur_001', '+51 987 100 001', 2800, 'PEN', 'AFP - Integra',   17.50, 26.25, 'disponible'),
  ('pop_002', 'emp_001', 'TEC-002', 'Carlos Reyes Vargas',    '73456789', 'Técnico Mecánico',         'Mecánica Industrial',    'Operaciones', 'tur_001', '+51 987 100 002', 2600, 'PEN', 'AFP - Prima',     16.25, 24.38, 'ocupado'),
  ('pop_003', 'emp_001', 'TEC-003', 'Ana Torres Huanca',      '74567890', 'Supervisora Técnica',      'Control de Calidad',     'Operaciones', 'tur_005', '+51 987 100 003', 3500, 'PEN', 'AFP - Integra',   21.88, 32.81, 'disponible'),
  ('pop_004', 'emp_001', 'TEC-004', 'Jorge Quispe Mamani',    '75678901', 'Técnico Instrumentista',   'Automatización',         'Operaciones', 'tur_004', '+51 987 100 004', 3000, 'PEN', 'ONP',             18.75, 28.13, 'vacaciones'),
  ('pop_005', 'emp_001', 'TEC-005', 'Pedro Condori Lima',     '76789012', 'Técnico Civil',            'Construcción',           'Operaciones', 'tur_001', '+51 987 100 005', 2500, 'PEN', 'AFP - Habitat',   15.63, 23.44, 'disponible'),
  ('pop_006', 'emp_001', 'TEC-006', 'Rosa Huanca Flores',     '77890123', 'Técnica Electrónica',      'Electrónica',            'Operaciones', 'tur_001', '+51 987 100 006', 2700, 'PEN', 'AFP - Prima',     16.88, 25.31, 'ocupado')
on conflict (id) do nothing;

-- Personal Administrativo
insert into public.personal_administrativo (id, empresa_id, codigo, nombre, documento, cargo, area, telefono, email, sueldo_base, moneda, sistema_pensionario, fecha_ingreso, vacaciones_pendientes, estado)
values
  ('pad_001', 'emp_001', 'ADM-001', 'Carla Meza Torres',      '74512345', 'Jefa Comercial',          'Comercial',     '+51 987 200 001', 'c.meza@tideo.pe',    4500, 'PEN', 'AFP - Integra', '2022-01-01', 18, 'activo'),
  ('pad_002', 'emp_001', 'ADM-002', 'Pedro Salas Quinones',   '76543210', 'Ejecutivo Comercial',     'Comercial',     '+51 987 200 002', 'p.salas@tideo.pe',   3200, 'PEN', 'AFP - Prima',   '2023-03-01', 25, 'activo'),
  ('pad_003', 'emp_001', 'ADM-003', 'Andrea Rios Gutierrez',  '73210987', 'Ejecutiva Comercial',     'Comercial',     '+51 987 200 003', 'a.rios@tideo.pe',    3400, 'PEN', 'AFP - Integra', '2021-06-15', 10, 'activo'),
  ('pad_004', 'emp_001', 'ADM-004', 'Roberto Quispe Paredes', '71234567', 'Jefe de Operaciones',     'Operaciones',   '+51 987 200 004', 'r.quispe@tideo.pe',  4800, 'PEN', 'AFP - Habitat', '2020-05-01', 22, 'activo'),
  ('pad_005', 'emp_001', 'ADM-005', 'Maria Flores Cano',      '72109876', 'Coordinadora RRHH',      'RRHH',          '+51 987 200 005', 'm.flores@tideo.pe',  3800, 'PEN', 'ONP',           '2021-11-01', 15, 'activo')
on conflict (id) do nothing;

-- Periodos de Nómina
insert into public.periodos_nomina (id, empresa_id, periodo, fecha_inicio, fecha_fin, total_trabajadores, masa_salarial_bruta, total_neto, total_cargas_empresa, moneda, estado)
values
  ('pnm_001', 'emp_001', '2026-03', '2026-03-01', '2026-03-31', 11, 35300, 28900, 8825, 'PEN', 'cerrado'),
  ('pnm_002', 'emp_001', '2026-04', '2026-04-01', '2026-04-30', 11, 35300, 28900, 8825, 'PEN', 'abierto')
on conflict (id, empresa_id) do nothing;

-- ============================================================
-- Fuente: supabase/seeds/009_rrhh_planner_campo_demo.sql
-- ============================================================

-- TIDEO ERP - Demo RRHH Operativo + Planner + App de Campo
-- Ejecutar despues de 006_rrhh_demo.sql.
-- Enriquecer la data de prueba de emp_001 para validar planner, altas de personal y campo.

insert into public.turnos (id, empresa_id, nombre, hora_entrada, hora_salida, tolerancia_minutos, cruza_medianoche, dias_laborables, minutos_refrigerio, horas_efectivas, estado)
values
  ('tur_001', 'emp_001', 'Turno Manana', '07:00', '15:00', 10, false, '["lun","mar","mie","jue","vie"]'::jsonb, 60, 7.0, 'activo'),
  ('tur_004', 'emp_001', 'Turno Campo 10h', '07:00', '17:00', 15, false, '["lun","mar","mie","jue","vie","sab"]'::jsonb, 60, 9.0, 'activo'),
  ('tur_005', 'emp_001', 'Turno Administrativo', '08:00', '17:00', 10, false, '["lun","mar","mie","jue","vie"]'::jsonb, 60, 8.0, 'activo')
on conflict (id) do update set
  nombre = excluded.nombre,
  hora_entrada = excluded.hora_entrada,
  hora_salida = excluded.hora_salida,
  estado = 'activo',
  updated_at = now();

insert into public.personal_operativo (
  id, empresa_id, codigo, nombre, documento, cargo, especialidad, especialidad2,
  area, turno_id, telefono, email, sede, supervisor, fecha_ingreso,
  sueldo_base, moneda, sistema_pensionario, costo_hora_real, costo_hora_extra,
  estado, acceso_campo, perfil_campo, docs
)
values
  ('pop_001', 'emp_001', 'TEC-001', 'Luis Mendoza', '72345678', 'Tecnico Mecanico', 'Mecanica Industrial', null, 'Operaciones', 'tur_001', '+51 987 100 001', 'l.mendoza@demo.pe', 'Planta Norte', 'Ana Torres', '2023-01-10', 2800, 'PEN', 'AFP - Integra', 45, 68, 'disponible', true, 'Tecnico', '{"sctr":"vigente","medico":"vigente","epp":"ok","licencia":"vigente"}'::jsonb),
  ('pop_002', 'emp_001', 'TEC-002', 'Carlos Reyes', '73456789', 'Electricista Industrial', 'Alta Tension', null, 'Operaciones', 'tur_001', '+51 987 100 002', 'c.reyes@demo.pe', 'Planta Norte', 'Ana Torres', '2023-02-14', 3000, 'PEN', 'AFP - Prima', 50, 75, 'ocupado', true, 'Tecnico', '{"sctr":"por_vencer","medico":"vigente","epp":"ok","licencia":"vigente"}'::jsonb),
  ('pop_003', 'emp_001', 'TEC-003', 'Ana Torres', '74567890', 'Supervisora SSO', 'Seguridad OHSAS', null, 'Operaciones', 'tur_005', '+51 987 100 003', 'a.torres@demo.pe', 'Sede Sur', null, '2022-08-01', 4200, 'PEN', 'AFP - Integra', 75, 113, 'disponible', true, 'Supervisor', '{"sctr":"vigente","medico":"vigente","epp":"ok","licencia":"vigente"}'::jsonb),
  ('pop_004', 'emp_001', 'TEC-004', 'Jorge Quispe', '75678901', 'Ayudante Tecnico', 'General', null, 'Operaciones', 'tur_004', '+51 987 100 004', 'j.quispe@demo.pe', 'Planta Norte', 'Luis Mendoza', '2024-03-05', 2200, 'PEN', 'ONP', 25, 38, 'vacaciones', true, 'Tecnico', '{"sctr":"vencido","medico":"por_vencer","epp":"incompleto","licencia":"vigente"}'::jsonb),
  ('pop_005', 'emp_001', 'TEC-005', 'Pedro Condori', '76789012', 'Tecnico Electronico', 'Instrumentacion', null, 'Operaciones', 'tur_004', '+51 987 100 005', 'p.condori@demo.pe', 'Sede Sur', 'Ana Torres', '2023-11-20', 3300, 'PEN', 'AFP - Habitat', 55, 83, 'disponible', true, 'Tecnico', '{"sctr":"vigente","medico":"vigente","epp":"ok","licencia":"vigente"}'::jsonb),
  ('pop_006', 'emp_001', 'TEC-006', 'Rosa Huanca', '77890123', 'Tecnica de Instrumentacion', 'PLC / SCADA', null, 'Operaciones', 'tur_001', '+51 987 100 006', 'r.huanca@demo.pe', 'Planta Norte', 'Ana Torres', '2024-01-15', 3600, 'PEN', 'AFP - Prima', 65, 98, 'disponible', true, 'Tecnico', '{"sctr":"vigente","medico":"vigente","epp":"ok","licencia":"por_vencer"}'::jsonb)
on conflict (id) do update set
  codigo = excluded.codigo,
  nombre = excluded.nombre,
  documento = excluded.documento,
  cargo = excluded.cargo,
  especialidad = excluded.especialidad,
  especialidad2 = excluded.especialidad2,
  turno_id = excluded.turno_id,
  telefono = excluded.telefono,
  email = excluded.email,
  sede = excluded.sede,
  supervisor = excluded.supervisor,
  fecha_ingreso = excluded.fecha_ingreso,
  sueldo_base = excluded.sueldo_base,
  sistema_pensionario = excluded.sistema_pensionario,
  costo_hora_real = excluded.costo_hora_real,
  costo_hora_extra = excluded.costo_hora_extra,
  estado = excluded.estado,
  acceso_campo = true,
  perfil_campo = excluded.perfil_campo,
  docs = excluded.docs,
  updated_at = now();

insert into public.ordenes_trabajo (
  id, empresa_id, os_cliente_id, numero, cuenta_id, servicio, descripcion,
  direccion_ejecucion, fecha_programada, tecnico_responsable_id, estado,
  avance_pct, costo_estimado, costo_real, moneda
)
values
  ('ot_plan_001', 'emp_001', null, 'OT-26-0101', 'cta_001', 'Mantenimiento preventivo', 'Mantenimiento de faja transportadora', 'Planta Norte', '2026-04-27', 'pop_001', 'programada', 0, 1200, 0, 'PEN'),
  ('ot_plan_002', 'emp_001', null, 'OT-26-0102', 'cta_006', 'Inspeccion electrica', 'Revision tablero principal', 'Planta Norte', '2026-04-28', 'pop_002', 'ejecucion', 35, 900, 250, 'PEN'),
  ('ot_plan_003', 'emp_001', null, 'OT-26-0103', 'cta_004', 'Supervision SSOMA', 'Supervision de trabajos en altura', 'Sede Sur', '2026-04-30', 'pop_003', 'programada', 0, 700, 0, 'PEN'),
  ('ot_plan_004', 'emp_001', null, 'OT-26-0104', 'cta_003', 'Instrumentacion', 'Calibracion de sensores', 'Planta Norte', '2026-05-01', 'pop_006', 'programada', 0, 1100, 0, 'PEN'),
  ('ot_plan_005', 'emp_001', null, 'OT-26-0105', 'cta_006', 'Automatizacion', 'Diagnostico PLC linea 2', 'Sede Sur', '2026-05-02', 'pop_005', 'programada', 0, 1500, 0, 'PEN')
on conflict (id) do update set
  numero = excluded.numero,
  cuenta_id = excluded.cuenta_id,
  servicio = excluded.servicio,
  descripcion = excluded.descripcion,
  direccion_ejecucion = excluded.direccion_ejecucion,
  fecha_programada = excluded.fecha_programada,
  tecnico_responsable_id = excluded.tecnico_responsable_id,
  estado = excluded.estado,
  avance_pct = excluded.avance_pct,
  costo_estimado = excluded.costo_estimado,
  costo_real = excluded.costo_real,
  updated_at = now();
