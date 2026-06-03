-- TIDEO ERP — Migración 179: Tabla er_configuracion por tenant
-- Permite a cada empresa definir la estructura de su Estado de Resultados:
-- qué categorías van a qué sección y bajo qué condición de OT vinculada.
-- Si no existen filas para el tenant, el servicio usa la configuración por defecto del sistema.

create table if not exists public.er_configuracion (
  id                   uuid primary key default gen_random_uuid(),
  empresa_id           text not null references public.empresas(id) on delete cascade,
  seccion              text not null check (seccion in ('costo_ventas', 'gastos_operativos', 'gastos_financieros')),
  nombre_categoria     text not null,
  categoria_er_interna text not null,
  regla_ot             text not null default 'siempre'
                         check (regla_ot in ('siempre', 'con_ot', 'sin_ot')),
  orden                integer default 0,
  activo               boolean default true,
  creado_en            timestamptz default now()
);

create index if not exists er_configuracion_empresa_seccion_idx
  on public.er_configuracion (empresa_id, seccion, activo);

alter table public.er_configuracion enable row level security;

create policy "er_config_tenant_select" on public.er_configuracion
  for select using (public.usuario_tiene_empresa(empresa_id));

create policy "er_config_tenant_insert" on public.er_configuracion
  for insert with check (public.usuario_tiene_empresa(empresa_id));

create policy "er_config_tenant_update" on public.er_configuracion
  for update using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

create policy "er_config_tenant_delete" on public.er_configuracion
  for delete using (public.usuario_es_admin_empresa(empresa_id));

select pg_notify('pgrst', 'reload schema');
