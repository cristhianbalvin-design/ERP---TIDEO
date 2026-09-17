-- TIDEO ERP - Catalogo global de secciones de navegacion y etiquetas por tenant

create table if not exists public.nav_sections (
  key text primary key,
  default_label text not null,
  order_index integer not null default 0,
  is_active boolean not null default true
);

create table if not exists public.tenant_section_labels (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null,
  section_key text not null references public.nav_sections(key) on delete cascade,
  custom_label text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id) on delete set null,
  unique (empresa_id, section_key),
  constraint tenant_section_labels_custom_label_not_blank check (btrim(custom_label) <> '')
);

create index if not exists idx_nav_sections_order
  on public.nav_sections (order_index, key);
create index if not exists idx_tenant_section_labels_empresa
  on public.tenant_section_labels (empresa_id);

alter table public.nav_sections enable row level security;
alter table public.tenant_section_labels enable row level security;

drop policy if exists nav_sections_select_authenticated on public.nav_sections;
create policy nav_sections_select_authenticated
  on public.nav_sections for select
  using (auth.uid() is not null);

drop policy if exists nav_sections_write_platform_superadmin on public.nav_sections;
create policy nav_sections_write_platform_superadmin
  on public.nav_sections for all
  using (public.usuario_es_superadmin_plataforma())
  with check (public.usuario_es_superadmin_plataforma());

drop policy if exists tenant_section_labels_select_own_tenant on public.tenant_section_labels;
create policy tenant_section_labels_select_own_tenant
  on public.tenant_section_labels for select
  using (public.usuario_tiene_empresa(empresa_id));

drop policy if exists tenant_section_labels_insert_own_tenant_admin on public.tenant_section_labels;
create policy tenant_section_labels_insert_own_tenant_admin
  on public.tenant_section_labels for insert
  with check (public.usuario_es_admin_empresa(empresa_id));

drop policy if exists tenant_section_labels_update_own_tenant_admin on public.tenant_section_labels;
create policy tenant_section_labels_update_own_tenant_admin
  on public.tenant_section_labels for update
  using (public.usuario_es_admin_empresa(empresa_id))
  with check (public.usuario_es_admin_empresa(empresa_id));

drop policy if exists tenant_section_labels_delete_own_tenant_admin on public.tenant_section_labels;
create policy tenant_section_labels_delete_own_tenant_admin
  on public.tenant_section_labels for delete
  using (public.usuario_es_admin_empresa(empresa_id));

create or replace function public.set_tenant_section_label_updated_by()
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

drop trigger if exists trg_tenant_section_labels_updated_by on public.tenant_section_labels;
create trigger trg_tenant_section_labels_updated_by
before insert or update on public.tenant_section_labels
for each row execute function public.set_tenant_section_label_updated_by();

insert into public.nav_sections (key, default_label, order_index, is_active)
values
  ('business_intelligence', 'Business Intelligence', 10, true),
  ('plataforma', 'Plataforma', 20, true),
  ('integraciones', 'Integraciones', 30, true),
  ('crm_marketing', 'CRM & Marketing', 40, true),
  ('comercial', 'Comercial', 50, true),
  ('operaciones', 'Operaciones', 60, true),
  ('rrhh', 'RRHH', 70, true),
  ('logistica', 'Logistica', 80, true),
  ('compras', 'Compras', 90, true),
  ('administracion', 'Administracion', 100, true),
  ('customer_success', 'Customer Success', 110, true),
  ('inteligencia_artificial', 'Inteligencia Artificial', 120, true),
  ('campo_movil', 'Campo Movil', 130, true),
  ('configuracion', 'Configuracion', 140, true)
on conflict (key) do update set
  default_label = excluded.default_label,
  order_index = excluded.order_index,
  is_active = true;

