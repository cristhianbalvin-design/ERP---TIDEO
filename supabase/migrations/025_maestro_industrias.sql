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
