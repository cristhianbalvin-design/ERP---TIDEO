-- TIDEO ERP - Marcar explícitamente el tenant de plataforma.
-- Agrega columna es_plataforma a empresas para diferenciar el tenant TIDEO
-- del resto de tenants clientes. Evitar depender solo del flag es_superadmin
-- del rol, que viaja con el usuario a cualquier tenant.

alter table public.empresas
  add column if not exists es_plataforma boolean not null default false;

-- Marcar emp_tideo como el único tenant de plataforma.
update public.empresas
  set es_plataforma = true
  where id = 'emp_tideo';

-- RLS: superadmin puede leer la columna; admins de tenant solo ven su propio registro
-- (ya cubierto por la política existente de empresas — no se necesita cambio).

-- Índice parcial: acelera la búsqueda del tenant de plataforma.
create unique index if not exists empresas_plataforma_unico
  on public.empresas (es_plataforma)
  where es_plataforma = true;

comment on column public.empresas.es_plataforma is
  'true únicamente para el tenant propietario de la plataforma (emp_tideo). Permite distinguirlo sin depender del flag es_superadmin del rol.';
