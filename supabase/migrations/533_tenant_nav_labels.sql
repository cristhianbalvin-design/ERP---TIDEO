-- TIDEO ERP - Catalogo global de navegacion y etiquetas por tenant

create table if not exists public.nav_modules (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  parent_key text null references public.nav_modules(key) on delete restrict,
  section_key text not null,
  default_label text not null,
  icon text null,
  order_index integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.tenant_nav_labels (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null,
  module_key text not null references public.nav_modules(key) on delete cascade,
  custom_label text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id) on delete set null,
  unique (empresa_id, module_key),
  constraint tenant_nav_labels_custom_label_not_blank check (btrim(custom_label) <> '')
);

create index if not exists idx_nav_modules_section_order
  on public.nav_modules (section_key, order_index, key);
create index if not exists idx_nav_modules_parent_key
  on public.nav_modules (parent_key);
create index if not exists idx_tenant_nav_labels_empresa
  on public.tenant_nav_labels (empresa_id);

alter table public.nav_modules enable row level security;
alter table public.tenant_nav_labels enable row level security;

drop policy if exists nav_modules_select_authenticated on public.nav_modules;
create policy nav_modules_select_authenticated
  on public.nav_modules for select
  using (auth.uid() is not null);

drop policy if exists nav_modules_write_platform_superadmin on public.nav_modules;
create policy nav_modules_write_platform_superadmin
  on public.nav_modules for all
  using (public.usuario_es_superadmin_plataforma())
  with check (public.usuario_es_superadmin_plataforma());

drop policy if exists tenant_nav_labels_select_own_tenant on public.tenant_nav_labels;
create policy tenant_nav_labels_select_own_tenant
  on public.tenant_nav_labels for select
  using (public.usuario_tiene_empresa(empresa_id));

drop policy if exists tenant_nav_labels_insert_own_tenant_admin on public.tenant_nav_labels;
create policy tenant_nav_labels_insert_own_tenant_admin
  on public.tenant_nav_labels for insert
  with check (public.usuario_es_admin_empresa(empresa_id));

drop policy if exists tenant_nav_labels_update_own_tenant_admin on public.tenant_nav_labels;
create policy tenant_nav_labels_update_own_tenant_admin
  on public.tenant_nav_labels for update
  using (public.usuario_es_admin_empresa(empresa_id))
  with check (public.usuario_es_admin_empresa(empresa_id));

drop policy if exists tenant_nav_labels_delete_own_tenant_admin on public.tenant_nav_labels;
create policy tenant_nav_labels_delete_own_tenant_admin
  on public.tenant_nav_labels for delete
  using (public.usuario_es_admin_empresa(empresa_id));

create or replace function public.set_tenant_nav_label_updated_by()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists trg_tenant_nav_labels_updated_by on public.tenant_nav_labels;
create trigger trg_tenant_nav_labels_updated_by
before insert or update on public.tenant_nav_labels
for each row execute function public.set_tenant_nav_label_updated_by();

insert into public.nav_modules (key, parent_key, section_key, default_label, icon, order_index)
values
  ('bi.dashboard_general', null, 'business_intelligence', 'Dashboard General', 'dashboard', 10),
  ('bi.comercial', null, 'business_intelligence', 'BI Comercial', 'trend', 20),
  ('bi.operativo', null, 'business_intelligence', 'BI Operativo', 'trend', 30),
  ('bi.financiero', null, 'business_intelligence', 'BI Financiero', 'trend', 40),
  ('plataforma.tenants', null, 'plataforma', 'Empresas / Tenants', 'building', 10),
  ('plataforma.planes', null, 'plataforma', 'Planes y Licencias', 'package', 20),
  ('plataforma.metricas_saas', null, 'plataforma', 'Metricas SaaS', 'trend', 30),
  ('integraciones.api_keys', null, 'integraciones', 'API Keys', 'lock', 10),
  ('crm.cuentas_contactos', null, 'crm_marketing', 'Cuentas y Contactos', 'users', 10),
  ('crm.leads_scoring', null, 'crm_marketing', 'Leads y Scoring', 'target', 20),
  ('crm.marketing_automation', null, 'crm_marketing', 'Marketing Automation', 'plus', 30),
  ('crm.pipeline', null, 'crm_marketing', 'Pipeline', 'pipe', 40),
  ('crm.actividades', null, 'crm_marketing', 'Actividades', 'calendar', 50),
  ('comercial.agenda', null, 'comercial', 'Agenda Comercial', 'calendar', 10),
  ('comercial.hoja_costeo', null, 'comercial', 'Hoja de Costeo', 'receipt', 20),
  ('comercial.variables_costeo', null, 'comercial', 'Variables de Costeo', 'dollar', 30),
  ('comercial.cotizaciones', null, 'comercial', 'Cotizaciones', 'file', 40),
  ('comercial.os_cliente', null, 'comercial', 'OS Cliente', 'clipboard', 50),
  ('comercial.panel_produccion', null, 'comercial', 'Panel de Producción', 'trend', 60),
  ('comercial.equipos_clientes', null, 'comercial', 'Equipos de Clientes', 'package', 70),
  ('operaciones.planner', null, 'operaciones', 'Planner y Recursos', 'calendar', 10),
  ('operaciones.backlog', null, 'operaciones', 'Backlog', 'list', 20),
  ('operaciones.ot', null, 'operaciones', 'Ordenes de Trabajo', 'wrench', 30),
  ('operaciones.partes', null, 'operaciones', 'Partes Diarios', 'clipboard', 40),
  ('operaciones.cierre', null, 'operaciones', 'Cierre y Calidad', 'check', 50),
  ('operaciones.tickets', null, 'operaciones', 'Soporte y Tickets', 'alert', 60),
  ('rrhh.mi_portal', null, 'rrhh', 'Mi portal', 'userCheck', 10),
  ('rrhh.reclutamiento', null, 'rrhh', 'Reclutamiento', 'target', 20),
  ('rrhh.operativo', null, 'rrhh', 'Personal Operativo', 'wrench', 30),
  ('rrhh.administrativo', null, 'rrhh', 'Personal Administrativo', 'users', 40),
  ('rrhh.asistencia', null, 'rrhh', 'Control de Asistencia', 'clock', 50),
  ('rrhh.turnos', null, 'rrhh', 'Turnos y Horarios', 'calendar', 60),
  ('rrhh.nomina', null, 'rrhh', 'Nomina', 'receipt', 70),
  ('rrhh.comisiones', null, 'rrhh', 'Comisiones', 'percent', 80),
  ('rrhh.solicitudes', null, 'rrhh', 'Solicitudes', 'clipboard', 90),
  ('rrhh.prestamos_personal', null, 'rrhh', 'Prestamos al Personal', 'userCheck', 100),
  ('rrhh.tareo_admin', null, 'rrhh', 'Tareo Administrativo', 'clock', 110),
  ('rrhh.control_horas', null, 'rrhh', 'Control de Horas', 'clock', 120),
  ('rrhh.evaluaciones_desempeno', null, 'rrhh', 'Evaluación de Desempeño', 'target', 130),
  ('rrhh.liquidaciones_cese', null, 'rrhh', 'Liquidación por Cese', 'receipt', 140),
  ('logistica.inventario', null, 'logistica', 'Almacenes', 'warehouse', 10),
  ('logistica.solpe', null, 'logistica', 'SOLPE Interna', 'clipboard', 20),
  ('logistica.remision', null, 'logistica', 'Transporte y Guias', 'truck', 30),
  ('compras.proveedores', null, 'compras', 'Proveedores', 'users', 10),
  ('compras.cotizaciones', null, 'compras', 'Cotizaciones', 'file', 20),
  ('compras.ordenes_compra', null, 'compras', 'Ordenes de Compra', 'cart', 30),
  ('compras.ordenes_servicio', null, 'compras', 'Ordenes de Servicio', 'wrench', 40),
  ('compras.recepciones', null, 'compras', 'Recepciones', 'check', 50),
  ('compras.gastos', null, 'compras', 'Compras / Gastos', 'receipt', 60),
  ('administracion.ventas', null, 'administracion', 'Ventas', 'store', 10),
  ('administracion.caja', null, 'administracion', 'Caja Chica', 'card', 20),
  ('administracion.activos_fijos', null, 'administracion', 'Activos Fijos', 'package', 30),
  ('administracion.financiamiento', null, 'administracion', 'Financiamiento y Deuda', 'bank', 40),
  ('administracion.cxc', null, 'administracion', 'Cuentas por Cobrar', 'dollar', 50),
  ('administracion.cxp', null, 'administracion', 'Cuentas por Pagar', 'dollar', 60),
  ('administracion.facturacion', null, 'administracion', 'Facturacion', 'receipt', 70),
  ('administracion.tesoreria', null, 'administracion', 'Tesoreria / Match', 'bank', 80),
  ('administracion.resultados', null, 'administracion', 'Estado Resultados', 'trend', 90),
  ('administracion.valorizacion', null, 'administracion', 'Valorizaciones', 'dollar', 100),
  ('administracion.presupuestos', null, 'administracion', 'Presupuesto vs Real', 'trend', 110),
  ('customer_success.onboarding', null, 'customer_success', 'Onboarding', 'users', 10),
  ('customer_success.planes', null, 'customer_success', 'Planes de Exito', 'target', 20),
  ('customer_success.health', null, 'customer_success', 'Health Score', 'trend', 30),
  ('customer_success.renovaciones', null, 'customer_success', 'Renovaciones', 'calendar', 40),
  ('customer_success.fidelizacion', null, 'customer_success', 'Fidelizacion y NPS', 'sparkles', 50),
  ('customer_success.bi', null, 'customer_success', 'BI Customer Success', 'trend', 60),
  ('ia.comercial', null, 'inteligencia_artificial', 'IA Comercial', 'sparkles', 10),
  ('ia.operativa', null, 'inteligencia_artificial', 'IA Operativa', 'sparkles', 20),
  ('ia.financiera', null, 'inteligencia_artificial', 'IA Financiera', 'sparkles', 30),
  ('campo.vistas', null, 'campo_movil', 'Vistas de Campo', 'mobile', 10),
  ('configuracion.usuarios', null, 'configuracion', 'Usuarios', 'users', 10),
  ('configuracion.organigrama', null, 'configuracion', 'Organigrama', 'users', 20),
  ('configuracion.roles', null, 'configuracion', 'Roles y Permisos', 'shield', 30),
  ('configuracion.maestros', null, 'configuracion', 'Maestros Base', 'settings', 40),
  ('configuracion.parametros', null, 'configuracion', 'Parametros Generales', 'settings', 50),
  ('configuracion.salud_implementacion', null, 'configuracion', 'Salud Implementacion', 'trend', 60)
on conflict (key) do update set
  parent_key = excluded.parent_key,
  section_key = excluded.section_key,
  default_label = excluded.default_label,
  icon = excluded.icon,
  order_index = excluded.order_index,
  is_active = true;
