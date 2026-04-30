-- TIDEO ERP - Migración 010: Políticas RLS para módulo de Compras/Proveedores
-- Las tablas ya existen en 006_purchasing_inventory.sql.
-- Este archivo sólo activa RLS y crea las políticas de aislamiento por tenant.

alter table public.proveedores enable row level security;
drop policy if exists tenant_proveedores_isolation on public.proveedores;
create policy tenant_proveedores_isolation on public.proveedores
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

alter table public.documentos_proveedor enable row level security;
drop policy if exists tenant_docs_proveedor_isolation on public.documentos_proveedor;
create policy tenant_docs_proveedor_isolation on public.documentos_proveedor
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

alter table public.evaluaciones_proveedor enable row level security;
drop policy if exists tenant_evals_proveedor_isolation on public.evaluaciones_proveedor;
create policy tenant_evals_proveedor_isolation on public.evaluaciones_proveedor
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

alter table public.solpe_interna enable row level security;
drop policy if exists tenant_solpe_isolation on public.solpe_interna;
create policy tenant_solpe_isolation on public.solpe_interna
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

alter table public.procesos_compra enable row level security;
drop policy if exists tenant_procesos_compra_isolation on public.procesos_compra;
create policy tenant_procesos_compra_isolation on public.procesos_compra
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

alter table public.ordenes_compra enable row level security;
drop policy if exists tenant_ordenes_compra_isolation on public.ordenes_compra;
create policy tenant_ordenes_compra_isolation on public.ordenes_compra
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

alter table public.ordenes_servicio_interna enable row level security;
drop policy if exists tenant_ordenes_servicio_interna_isolation on public.ordenes_servicio_interna;
create policy tenant_ordenes_servicio_interna_isolation on public.ordenes_servicio_interna
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

alter table public.recepciones enable row level security;
drop policy if exists tenant_recepciones_isolation on public.recepciones;
create policy tenant_recepciones_isolation on public.recepciones
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

alter table public.almacenes enable row level security;
drop policy if exists tenant_almacenes_isolation on public.almacenes;
create policy tenant_almacenes_isolation on public.almacenes
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

alter table public.materiales enable row level security;
drop policy if exists tenant_materiales_isolation on public.materiales;
create policy tenant_materiales_isolation on public.materiales
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

alter table public.stock enable row level security;
drop policy if exists tenant_stock_isolation on public.stock;
create policy tenant_stock_isolation on public.stock
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

alter table public.kardex enable row level security;
drop policy if exists tenant_kardex_isolation on public.kardex;
create policy tenant_kardex_isolation on public.kardex
  for all using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));
