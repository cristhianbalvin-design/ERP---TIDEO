-- TIDEO ERP - Logging de accesos cross-tenant del superadmin.
-- Registra cada vez que el superadmin selecciona explícitamente un tenant
-- que no es el de plataforma (emp_tideo). Tabla inmutable: no hay políticas
-- de UPDATE ni DELETE — los logs no se pueden borrar desde el cliente.

create table if not exists public.superadmin_accesos (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  empresa_id   text        not null references public.empresas(id) on delete cascade,
  empresa_nombre text,
  accedido_en  timestamptz not null default now()
);

alter table public.superadmin_accesos enable row level security;

-- Solo el superadmin puede insertar y leer sus propios logs.
create policy superadmin_accesos_insert on public.superadmin_accesos
  for insert with check (public.usuario_es_superadmin_plataforma());

create policy superadmin_accesos_select on public.superadmin_accesos
  for select using (public.usuario_es_superadmin_plataforma());

-- Índices para las consultas más comunes: timeline por usuario, historial por tenant.
create index superadmin_accesos_user_idx    on public.superadmin_accesos (user_id,    accedido_en desc);
create index superadmin_accesos_empresa_idx on public.superadmin_accesos (empresa_id, accedido_en desc);

comment on table public.superadmin_accesos is
  'Audit log de accesos cross-tenant. Solo el superadmin puede insertar/leer. Inmutable desde el cliente.';
