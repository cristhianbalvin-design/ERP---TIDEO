-- 100 - Diccionario comercial para plantillas y condiciones

create table if not exists public.diccionario_comercial (
  id text primary key,
  empresa_id text not null references public.empresas(id) on delete cascade,
  categoria text not null default 'Comercial',
  clave text not null,
  texto text not null,
  estado text not null default 'activo',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (empresa_id, categoria, clave)
);

create index if not exists idx_diccionario_comercial_empresa
  on public.diccionario_comercial(empresa_id, categoria, estado);

alter table public.diccionario_comercial enable row level security;

drop policy if exists tenant_diccionario_comercial_select on public.diccionario_comercial;
create policy tenant_diccionario_comercial_select on public.diccionario_comercial
  for select using (public.usuario_tiene_empresa(empresa_id));

drop policy if exists tenant_diccionario_comercial_insert on public.diccionario_comercial;
create policy tenant_diccionario_comercial_insert on public.diccionario_comercial
  for insert with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'parametros', 'crear'));

drop policy if exists tenant_diccionario_comercial_update on public.diccionario_comercial;
create policy tenant_diccionario_comercial_update on public.diccionario_comercial
  for update using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'parametros', 'editar'))
  with check (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'parametros', 'editar'));

drop policy if exists tenant_diccionario_comercial_delete on public.diccionario_comercial;
create policy tenant_diccionario_comercial_delete on public.diccionario_comercial
  for delete using (public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id, 'parametros', 'editar'));

select pg_notify('pgrst', 'reload schema');
