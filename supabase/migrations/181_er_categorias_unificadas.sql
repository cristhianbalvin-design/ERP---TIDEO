-- TIDEO ERP — Migración 181: Unificar categorías ER en una sola tabla por tenant
-- Elimina er_categorias_custom y er_configuracion (arquitectura previa con hardcoding).
-- Crea er_categorias: todas las categorías viven aquí, incluyendo las base del sistema.
-- tipos_gasto_empresa.categoria_er pasa a ser texto libre sin CHECK constraint.

-- 1. Eliminar tablas previas
drop table if exists public.er_categorias_custom cascade;
drop table if exists public.er_configuracion cascade;

-- 2. Crear tabla unificada er_categorias
create table if not exists public.er_categorias (
  id         uuid primary key default gen_random_uuid(),
  empresa_id text not null references public.empresas(id) on delete cascade,
  nombre     text not null,
  seccion    text not null check (seccion in ('costo_ventas', 'gastos_operativos', 'gastos_financieros')),
  regla_ot   text not null default 'siempre' check (regla_ot in ('siempre', 'con_ot', 'sin_ot')),
  es_base    boolean default false,
  activo     boolean default true,
  orden      integer default 0,
  creado_en  timestamptz default now(),
  unique (empresa_id, nombre)
);

create index if not exists er_categorias_empresa_activo_idx
  on public.er_categorias (empresa_id, activo);

alter table public.er_categorias enable row level security;

create policy "er_categorias_select" on public.er_categorias
  for select using (public.usuario_tiene_empresa(empresa_id));

create policy "er_categorias_insert" on public.er_categorias
  for insert with check (public.usuario_tiene_empresa(empresa_id));

create policy "er_categorias_update" on public.er_categorias
  for update using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

create policy "er_categorias_delete" on public.er_categorias
  for delete using (public.usuario_es_admin_empresa(empresa_id));

-- 3. Función para insertar categorías base al crear un tenant nuevo
create or replace function public.crear_categorias_base(p_empresa_id text)
returns void language plpgsql security definer as $$
begin
  insert into public.er_categorias (empresa_id, nombre, seccion, regla_ot, es_base, orden)
  values
    (p_empresa_id, 'Mano de obra',       'costo_ventas',       'con_ot',  true, 0),
    (p_empresa_id, 'Materiales',         'costo_ventas',       'con_ot',  true, 1),
    (p_empresa_id, 'Servicios terceros', 'costo_ventas',       'con_ot',  true, 2),
    (p_empresa_id, 'Logística',          'costo_ventas',       'con_ot',  true, 3),
    (p_empresa_id, 'Administrativos',    'gastos_operativos',  'siempre', true, 4),
    (p_empresa_id, 'Comerciales',        'gastos_operativos',  'siempre', true, 5),
    (p_empresa_id, 'Gastos financieros', 'gastos_financieros', 'siempre', true, 6)
  on conflict (empresa_id, nombre) do nothing;
end;
$$;

-- 4. Liberar el CHECK constraint hardcodeado en tipos_gasto_empresa.categoria_er
--    El campo pasa a ser texto libre que referencia er_categorias.nombre del mismo tenant.
alter table public.tipos_gasto_empresa
  drop constraint if exists tipos_gasto_empresa_categoria_er_check;

select pg_notify('pgrst', 'reload schema');
