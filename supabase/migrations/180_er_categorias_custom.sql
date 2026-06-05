-- TIDEO ERP — Migración 180: Tabla er_categorias_custom por tenant
-- Permite a cada empresa definir categorías ER internas adicionales a las 6 del sistema.
-- Las categorías del sistema (Materiales, Servicios terceros, etc.) siguen como constantes
-- en el código. Esta tabla solo almacena las adicionales que crea cada empresa.

create table if not exists public.er_categorias_custom (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  text not null references public.empresas(id) on delete cascade,
  nombre      text not null,
  seccion     text not null check (seccion in ('costo_ventas', 'gastos_operativos', 'gastos_financieros')),
  descripcion text,
  activo      boolean default true,
  orden       integer default 0,
  creado_en   timestamptz default now()
);

create index if not exists er_categorias_custom_empresa_activo_idx
  on public.er_categorias_custom (empresa_id, activo);

alter table public.er_categorias_custom enable row level security;

create policy "er_cat_custom_select" on public.er_categorias_custom
  for select using (public.usuario_tiene_empresa(empresa_id));

create policy "er_cat_custom_insert" on public.er_categorias_custom
  for insert with check (public.usuario_tiene_empresa(empresa_id));

create policy "er_cat_custom_update" on public.er_categorias_custom
  for update using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

create policy "er_cat_custom_delete" on public.er_categorias_custom
  for delete using (public.usuario_es_admin_empresa(empresa_id));

select pg_notify('pgrst', 'reload schema');
