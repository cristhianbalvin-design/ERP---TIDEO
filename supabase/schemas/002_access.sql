-- TIDEO ERP - Acceso, roles, permisos y auditoria.

create table if not exists public.roles (
  id text primary key,
  empresa_id text references public.empresas(id),
  nombre text not null,
  descripcion text,
  categoria text not null default 'otro',
  nivel_jerarquico text not null default 'operativo',
  es_superadmin boolean default false,
  es_admin_empresa boolean default false,
  activo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.usuarios_empresas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  empresa_id text not null references public.empresas(id),
  rol_id text not null references public.roles(id),
  jefe_user_id uuid references auth.users(id) on delete set null,
  acceso_campo boolean default false,
  perfil_campo text,
  estado text default 'activo' check (estado in ('activo','invitado','suspendido','inactivo')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint usuarios_empresas_no_self_jefe check (jefe_user_id is null or jefe_user_id <> user_id),
  unique (user_id, empresa_id)
);

create table if not exists public.usuarios_asignaciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null references public.empresas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rol_id text not null references public.roles(id) on delete restrict,
  categoria text not null default 'otro',
  nivel_jerarquico text not null default 'operativo',
  jefe_user_id uuid references auth.users(id) on delete set null,
  alcance_tipo text not null default 'tenant',
  alcance_id text,
  principal boolean not null default false,
  activo boolean not null default true,
  fecha_inicio date not null default current_date,
  fecha_fin date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint usuarios_asignaciones_no_self_jefe check (jefe_user_id is null or jefe_user_id <> user_id),
  constraint usuarios_asignaciones_alcance_tipo_check check (
    alcance_tipo in ('tenant', 'area', 'equipo', 'sede', 'proyecto', 'centro_costo', 'custom')
  ),
  constraint usuarios_asignaciones_fechas_check check (fecha_fin is null or fecha_fin >= fecha_inicio)
);

create table if not exists public.permisos_roles (
  id uuid primary key default gen_random_uuid(),
  rol_id text not null references public.roles(id) on delete cascade,
  pantalla text not null,
  puede_ver boolean default false,
  puede_crear boolean default false,
  puede_editar boolean default false,
  puede_anular boolean default false,
  puede_aprobar boolean default false,
  puede_exportar boolean default false,
  puede_ver_costos boolean default false,
  puede_ver_finanzas boolean default false,
  permisos_extra jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (rol_id, pantalla)
);

create table if not exists public.auditoria (
  id uuid primary key default gen_random_uuid(),
  empresa_id text references public.empresas(id),
  user_id uuid,
  modulo text not null,
  entidad text,
  entidad_id text,
  accion text not null,
  valor_anterior jsonb,
  valor_nuevo jsonb,
  ip inet,
  user_agent text,
  created_at timestamptz default now()
);

create index if not exists idx_usuarios_empresas_user on public.usuarios_empresas(user_id);
create index if not exists idx_usuarios_empresas_empresa on public.usuarios_empresas(empresa_id);
create index if not exists idx_usuarios_empresas_jefe on public.usuarios_empresas(empresa_id, jefe_user_id);
create unique index if not exists ux_usuarios_asignaciones_principal_activa on public.usuarios_asignaciones(empresa_id, user_id) where principal = true and activo = true;
create index if not exists idx_usuarios_asignaciones_user on public.usuarios_asignaciones(empresa_id, user_id, activo);
create index if not exists idx_usuarios_asignaciones_jefe on public.usuarios_asignaciones(empresa_id, jefe_user_id, activo);
create index if not exists idx_usuarios_asignaciones_categoria on public.usuarios_asignaciones(empresa_id, categoria, nivel_jerarquico, activo);
create index if not exists idx_usuarios_asignaciones_alcance on public.usuarios_asignaciones(empresa_id, alcance_tipo, alcance_id, activo);
create index if not exists idx_auditoria_empresa on public.auditoria(empresa_id, created_at desc);
