-- TIDEO ERP - Persistencia de Usuarios y Perfiles
-- Crea la tabla de usuarios si no existe y habilita RLS

create table if not exists public.usuarios (
  id text primary key,
  empresa_id text not null references public.empresas(id),
  nombre text not null,
  email text not null,
  rol text not null,
  area text,
  cargo text,
  telefono text,
  sede text,
  campo boolean default false,
  campo_perfil text,
  estado text default 'Activo',
  ultimo_login timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Habilitar RLS
alter table public.usuarios enable row level security;

-- Política de aislamiento (Relajada para pruebas)
drop policy if exists tenant_usuarios_isolation on public.usuarios;
create policy tenant_usuarios_isolation on public.usuarios
  for all using (auth.uid() is not null);

-- Índices
create index if not exists idx_usuarios_empresa on public.usuarios(empresa_id);
create index if not exists idx_usuarios_email on public.usuarios(email);
