-- TIDEO ERP - Crear tablas de Finanzas, Operaciones, Soporte y Auditoría + RLS.
-- Las definiciones vivían en supabase/schemas/ pero nunca se aplicaron como migraciones.
-- Este archivo crea las tablas y aplica aislamiento por tenant en una sola pasada.

-- ─────────────────────────────────────────
-- TABLAS: FINANZAS
-- ─────────────────────────────────────────

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

create index if not exists idx_compras_gastos_empresa      on public.compras_gastos(empresa_id, fecha);
create index if not exists idx_movimientos_tesoreria_empresa on public.movimientos_tesoreria(empresa_id, fecha);
create index if not exists idx_financiamientos_empresa      on public.financiamientos(empresa_id, estado);
create index if not exists idx_tabla_amortizacion_fin       on public.tabla_amortizacion(financiamiento_id, numero);
create index if not exists idx_pagos_financiamiento_fin     on public.pagos_financiamiento(financiamiento_id, fecha_pago);
create index if not exists idx_valorizaciones_empresa       on public.valorizaciones(empresa_id);
create index if not exists idx_facturas_empresa             on public.facturas(empresa_id);
create index if not exists idx_cxc_empresa                  on public.cxc(empresa_id);
create index if not exists idx_cxp_empresa                  on public.cxp(empresa_id);
create index if not exists idx_movimientos_banco_empresa    on public.movimientos_banco(empresa_id);

-- ─────────────────────────────────────────
-- TABLAS: OPERACIONES
-- ─────────────────────────────────────────

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

create index if not exists idx_backlog_empresa   on public.backlog(empresa_id, estado);
create index if not exists idx_ot_empresa        on public.ordenes_trabajo(empresa_id, estado);
create index if not exists idx_partes_empresa    on public.partes_diarios(empresa_id, fecha);
create index if not exists idx_costos_ot_empresa on public.costos_ot(empresa_id);
create index if not exists idx_tickets_empresa   on public.tickets_soporte(empresa_id, estado);

-- ─────────────────────────────────────────
-- TABLA: AUDITORÍA (empresa_id nullable)
-- ─────────────────────────────────────────

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

create index if not exists idx_auditoria_empresa on public.auditoria(empresa_id, created_at desc);

-- ─────────────────────────────────────────
-- TABLA: VERSIONES PLATAFORMA (sin empresa_id)
-- ─────────────────────────────────────────

create table if not exists public.versiones_plataforma (
  id text primary key,
  version text not null,
  descripcion text,
  fecha_release date default current_date,
  cambios jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────
-- RLS: FINANZAS
-- ─────────────────────────────────────────

alter table public.compras_gastos enable row level security;
drop policy if exists compras_gastos_select on public.compras_gastos;
drop policy if exists compras_gastos_insert on public.compras_gastos;
drop policy if exists compras_gastos_update on public.compras_gastos;
drop policy if exists compras_gastos_delete on public.compras_gastos;
create policy compras_gastos_select on public.compras_gastos for select using (public.usuario_tiene_empresa(empresa_id));
create policy compras_gastos_insert on public.compras_gastos for insert with check (public.usuario_tiene_empresa(empresa_id));
create policy compras_gastos_update on public.compras_gastos for update using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy compras_gastos_delete on public.compras_gastos for delete using (public.usuario_es_admin_empresa(empresa_id));

alter table public.movimientos_tesoreria enable row level security;
drop policy if exists movimientos_tesoreria_select on public.movimientos_tesoreria;
drop policy if exists movimientos_tesoreria_insert on public.movimientos_tesoreria;
drop policy if exists movimientos_tesoreria_update on public.movimientos_tesoreria;
drop policy if exists movimientos_tesoreria_delete on public.movimientos_tesoreria;
create policy movimientos_tesoreria_select on public.movimientos_tesoreria for select using (public.usuario_tiene_empresa(empresa_id));
create policy movimientos_tesoreria_insert on public.movimientos_tesoreria for insert with check (public.usuario_tiene_empresa(empresa_id));
create policy movimientos_tesoreria_update on public.movimientos_tesoreria for update using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy movimientos_tesoreria_delete on public.movimientos_tesoreria for delete using (public.usuario_es_admin_empresa(empresa_id));

alter table public.financiamientos enable row level security;
drop policy if exists financiamientos_select on public.financiamientos;
drop policy if exists financiamientos_insert on public.financiamientos;
drop policy if exists financiamientos_update on public.financiamientos;
drop policy if exists financiamientos_delete on public.financiamientos;
create policy financiamientos_select on public.financiamientos for select using (public.usuario_tiene_empresa(empresa_id));
create policy financiamientos_insert on public.financiamientos for insert with check (public.usuario_tiene_empresa(empresa_id));
create policy financiamientos_update on public.financiamientos for update using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy financiamientos_delete on public.financiamientos for delete using (public.usuario_es_admin_empresa(empresa_id));

alter table public.tabla_amortizacion enable row level security;
drop policy if exists tabla_amortizacion_select on public.tabla_amortizacion;
drop policy if exists tabla_amortizacion_insert on public.tabla_amortizacion;
drop policy if exists tabla_amortizacion_update on public.tabla_amortizacion;
drop policy if exists tabla_amortizacion_delete on public.tabla_amortizacion;
create policy tabla_amortizacion_select on public.tabla_amortizacion for select using (public.usuario_tiene_empresa(empresa_id));
create policy tabla_amortizacion_insert on public.tabla_amortizacion for insert with check (public.usuario_tiene_empresa(empresa_id));
create policy tabla_amortizacion_update on public.tabla_amortizacion for update using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tabla_amortizacion_delete on public.tabla_amortizacion for delete using (public.usuario_es_admin_empresa(empresa_id));

alter table public.pagos_financiamiento enable row level security;
drop policy if exists pagos_financiamiento_select on public.pagos_financiamiento;
drop policy if exists pagos_financiamiento_insert on public.pagos_financiamiento;
drop policy if exists pagos_financiamiento_update on public.pagos_financiamiento;
drop policy if exists pagos_financiamiento_delete on public.pagos_financiamiento;
create policy pagos_financiamiento_select on public.pagos_financiamiento for select using (public.usuario_tiene_empresa(empresa_id));
create policy pagos_financiamiento_insert on public.pagos_financiamiento for insert with check (public.usuario_tiene_empresa(empresa_id));
create policy pagos_financiamiento_update on public.pagos_financiamiento for update using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy pagos_financiamiento_delete on public.pagos_financiamiento for delete using (public.usuario_es_admin_empresa(empresa_id));

alter table public.valorizaciones enable row level security;
drop policy if exists valorizaciones_select on public.valorizaciones;
drop policy if exists valorizaciones_insert on public.valorizaciones;
drop policy if exists valorizaciones_update on public.valorizaciones;
drop policy if exists valorizaciones_delete on public.valorizaciones;
create policy valorizaciones_select on public.valorizaciones for select using (public.usuario_tiene_empresa(empresa_id));
create policy valorizaciones_insert on public.valorizaciones for insert with check (public.usuario_tiene_empresa(empresa_id));
create policy valorizaciones_update on public.valorizaciones for update using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy valorizaciones_delete on public.valorizaciones for delete using (public.usuario_es_admin_empresa(empresa_id));

alter table public.facturas enable row level security;
drop policy if exists facturas_select on public.facturas;
drop policy if exists facturas_insert on public.facturas;
drop policy if exists facturas_update on public.facturas;
drop policy if exists facturas_delete on public.facturas;
create policy facturas_select on public.facturas for select using (public.usuario_tiene_empresa(empresa_id));
create policy facturas_insert on public.facturas for insert with check (public.usuario_tiene_empresa(empresa_id));
create policy facturas_update on public.facturas for update using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy facturas_delete on public.facturas for delete using (public.usuario_es_admin_empresa(empresa_id));

alter table public.cxc enable row level security;
drop policy if exists cxc_select on public.cxc;
drop policy if exists cxc_insert on public.cxc;
drop policy if exists cxc_update on public.cxc;
drop policy if exists cxc_delete on public.cxc;
create policy cxc_select on public.cxc for select using (public.usuario_tiene_empresa(empresa_id));
create policy cxc_insert on public.cxc for insert with check (public.usuario_tiene_empresa(empresa_id));
create policy cxc_update on public.cxc for update using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy cxc_delete on public.cxc for delete using (public.usuario_es_admin_empresa(empresa_id));

alter table public.cxp enable row level security;
drop policy if exists cxp_select on public.cxp;
drop policy if exists cxp_insert on public.cxp;
drop policy if exists cxp_update on public.cxp;
drop policy if exists cxp_delete on public.cxp;
create policy cxp_select on public.cxp for select using (public.usuario_tiene_empresa(empresa_id));
create policy cxp_insert on public.cxp for insert with check (public.usuario_tiene_empresa(empresa_id));
create policy cxp_update on public.cxp for update using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy cxp_delete on public.cxp for delete using (public.usuario_es_admin_empresa(empresa_id));

alter table public.movimientos_banco enable row level security;
drop policy if exists movimientos_banco_select on public.movimientos_banco;
drop policy if exists movimientos_banco_insert on public.movimientos_banco;
drop policy if exists movimientos_banco_update on public.movimientos_banco;
drop policy if exists movimientos_banco_delete on public.movimientos_banco;
create policy movimientos_banco_select on public.movimientos_banco for select using (public.usuario_tiene_empresa(empresa_id));
create policy movimientos_banco_insert on public.movimientos_banco for insert with check (public.usuario_tiene_empresa(empresa_id));
create policy movimientos_banco_update on public.movimientos_banco for update using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy movimientos_banco_delete on public.movimientos_banco for delete using (public.usuario_es_admin_empresa(empresa_id));

-- ─────────────────────────────────────────
-- RLS: OPERACIONES
-- ─────────────────────────────────────────

alter table public.backlog enable row level security;
drop policy if exists backlog_select on public.backlog;
drop policy if exists backlog_insert on public.backlog;
drop policy if exists backlog_update on public.backlog;
drop policy if exists backlog_delete on public.backlog;
create policy backlog_select on public.backlog for select using (public.usuario_tiene_empresa(empresa_id));
create policy backlog_insert on public.backlog for insert with check (public.usuario_tiene_empresa(empresa_id));
create policy backlog_update on public.backlog for update using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy backlog_delete on public.backlog for delete using (public.usuario_es_admin_empresa(empresa_id));

alter table public.ordenes_trabajo enable row level security;
drop policy if exists ordenes_trabajo_select on public.ordenes_trabajo;
drop policy if exists ordenes_trabajo_insert on public.ordenes_trabajo;
drop policy if exists ordenes_trabajo_update on public.ordenes_trabajo;
drop policy if exists ordenes_trabajo_delete on public.ordenes_trabajo;
create policy ordenes_trabajo_select on public.ordenes_trabajo for select using (public.usuario_tiene_empresa(empresa_id));
create policy ordenes_trabajo_insert on public.ordenes_trabajo for insert with check (public.usuario_tiene_empresa(empresa_id));
create policy ordenes_trabajo_update on public.ordenes_trabajo for update using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy ordenes_trabajo_delete on public.ordenes_trabajo for delete using (public.usuario_es_admin_empresa(empresa_id));

alter table public.partes_diarios enable row level security;
drop policy if exists partes_diarios_select on public.partes_diarios;
drop policy if exists partes_diarios_insert on public.partes_diarios;
drop policy if exists partes_diarios_update on public.partes_diarios;
drop policy if exists partes_diarios_delete on public.partes_diarios;
create policy partes_diarios_select on public.partes_diarios for select using (public.usuario_tiene_empresa(empresa_id));
create policy partes_diarios_insert on public.partes_diarios for insert with check (public.usuario_tiene_empresa(empresa_id));
create policy partes_diarios_update on public.partes_diarios for update using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy partes_diarios_delete on public.partes_diarios for delete using (public.usuario_es_admin_empresa(empresa_id));

alter table public.cierres_tecnicos enable row level security;
drop policy if exists cierres_tecnicos_select on public.cierres_tecnicos;
drop policy if exists cierres_tecnicos_insert on public.cierres_tecnicos;
drop policy if exists cierres_tecnicos_update on public.cierres_tecnicos;
drop policy if exists cierres_tecnicos_delete on public.cierres_tecnicos;
create policy cierres_tecnicos_select on public.cierres_tecnicos for select using (public.usuario_tiene_empresa(empresa_id));
create policy cierres_tecnicos_insert on public.cierres_tecnicos for insert with check (public.usuario_tiene_empresa(empresa_id));
create policy cierres_tecnicos_update on public.cierres_tecnicos for update using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy cierres_tecnicos_delete on public.cierres_tecnicos for delete using (public.usuario_es_admin_empresa(empresa_id));

alter table public.costos_ot enable row level security;
drop policy if exists costos_ot_select on public.costos_ot;
drop policy if exists costos_ot_insert on public.costos_ot;
drop policy if exists costos_ot_update on public.costos_ot;
drop policy if exists costos_ot_delete on public.costos_ot;
create policy costos_ot_select on public.costos_ot for select using (public.usuario_tiene_empresa(empresa_id));
create policy costos_ot_insert on public.costos_ot for insert with check (public.usuario_tiene_empresa(empresa_id));
create policy costos_ot_update on public.costos_ot for update using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy costos_ot_delete on public.costos_ot for delete using (public.usuario_es_admin_empresa(empresa_id));

alter table public.tickets_soporte enable row level security;
drop policy if exists tickets_soporte_select on public.tickets_soporte;
drop policy if exists tickets_soporte_insert on public.tickets_soporte;
drop policy if exists tickets_soporte_update on public.tickets_soporte;
drop policy if exists tickets_soporte_delete on public.tickets_soporte;
create policy tickets_soporte_select on public.tickets_soporte for select using (public.usuario_tiene_empresa(empresa_id));
create policy tickets_soporte_insert on public.tickets_soporte for insert with check (public.usuario_tiene_empresa(empresa_id));
create policy tickets_soporte_update on public.tickets_soporte for update using (public.usuario_tiene_empresa(empresa_id)) with check (public.usuario_tiene_empresa(empresa_id));
create policy tickets_soporte_delete on public.tickets_soporte for delete using (public.usuario_es_admin_empresa(empresa_id));

-- ─────────────────────────────────────────
-- RLS: AUDITORÍA (append-only, empresa_id nullable)
-- ─────────────────────────────────────────

alter table public.auditoria enable row level security;
drop policy if exists auditoria_select on public.auditoria;
drop policy if exists auditoria_insert on public.auditoria;
create policy auditoria_select on public.auditoria
  for select using (
    public.usuario_es_superadmin_plataforma()
    or (empresa_id is not null and public.usuario_tiene_empresa(empresa_id))
  );
create policy auditoria_insert on public.auditoria
  for insert with check (
    empresa_id is null
    or public.usuario_tiene_empresa(empresa_id)
  );

-- ─────────────────────────────────────────
-- RLS: VERSIONES PLATAFORMA (sin empresa_id, metadata global)
-- ─────────────────────────────────────────

alter table public.versiones_plataforma enable row level security;
drop policy if exists versiones_plataforma_select on public.versiones_plataforma;
drop policy if exists versiones_plataforma_insert on public.versiones_plataforma;
drop policy if exists versiones_plataforma_update on public.versiones_plataforma;
drop policy if exists versiones_plataforma_delete on public.versiones_plataforma;
create policy versiones_plataforma_select on public.versiones_plataforma for select using (auth.uid() is not null);
create policy versiones_plataforma_insert on public.versiones_plataforma for insert with check (public.usuario_es_superadmin_plataforma());
create policy versiones_plataforma_update on public.versiones_plataforma for update using (public.usuario_es_superadmin_plataforma()) with check (public.usuario_es_superadmin_plataforma());
create policy versiones_plataforma_delete on public.versiones_plataforma for delete using (public.usuario_es_superadmin_plataforma());

select pg_notify('pgrst', 'reload schema');
