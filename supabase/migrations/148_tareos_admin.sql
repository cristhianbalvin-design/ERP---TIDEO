-- Módulo Tareo Administrativo
-- 1. Ampliar perfil_campo para admins
-- 2. Nueva tabla tareos_admin

-- ──────────────────────────────────────────────────
-- 1. Agregar 'administrativo' como valor válido en usuarios_empresas.perfil_campo
-- ──────────────────────────────────────────────────
alter table public.usuarios_empresas
  drop constraint if exists usuarios_empresas_perfil_campo_check;

alter table public.usuarios_empresas
  add constraint usuarios_empresas_perfil_campo_check
    check (perfil_campo in (
      -- valores originales (mayúsculas / tildes tal como los guarda el selector)
      'Técnico', 'Tecnico', 'Vendedor', 'Compras', 'Supervisor', 'Gerencia',
      'Logistica', 'Logística', 'Asistencia',
      -- valores en minúscula (legado y nuevos)
      'tecnico', 'vendedor', 'compras', 'supervisor', 'gerencia',
      'logistica', 'asistencia',
      -- nuevo perfil
      'administrativo', 'Administrativo'
    ));

-- ──────────────────────────────────────────────────
-- 2. Tabla tareos_admin
-- ──────────────────────────────────────────────────
create table if not exists public.tareos_admin (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      text not null references public.empresas(id) on delete cascade,

  personal_id     text not null references public.personal_administrativo(id) on delete cascade,
  personal_nombre text not null,

  fecha           date not null,
  horas           numeric(4,1) not null check (horas >= 0.5 and horas <= 24),
  descripcion     text not null,

  tipo            text not null check (tipo in ('ot', 'libre')),
  ot_id           text references public.ordenes_trabajo(id) on delete set null,
  ceco_id         text references public.centros_costo(id) on delete set null,
  ceco_nombre     text,

  estado          text not null default 'borrador'
                    check (estado in ('borrador', 'enviado')),
  origen          text not null default 'backoffice'
                    check (origen in ('mobile', 'backoffice')),

  creado_por      uuid references auth.users(id) on delete set null,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

-- índices
create index if not exists idx_tareos_admin_empresa_fecha
  on public.tareos_admin(empresa_id, fecha desc);
create index if not exists idx_tareos_admin_personal
  on public.tareos_admin(personal_id, fecha desc);
create index if not exists idx_tareos_admin_ot
  on public.tareos_admin(ot_id, fecha desc);
create index if not exists idx_tareos_admin_estado
  on public.tareos_admin(empresa_id, estado, fecha desc);

-- trigger updated_at
create or replace function public.trg_tareos_admin_updated_at()
returns trigger language plpgsql
set search_path = public
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

drop trigger if exists trg_tareos_admin_upd on public.tareos_admin;
create trigger trg_tareos_admin_upd
before update on public.tareos_admin
for each row execute function public.trg_tareos_admin_updated_at();

-- RLS
alter table public.tareos_admin enable row level security;

drop policy if exists tareos_admin_select on public.tareos_admin;
drop policy if exists tareos_admin_insert on public.tareos_admin;
drop policy if exists tareos_admin_update on public.tareos_admin;

create policy tareos_admin_select on public.tareos_admin
  for select using (public.usuario_tiene_empresa(empresa_id));
create policy tareos_admin_insert on public.tareos_admin
  for insert with check (public.usuario_tiene_empresa(empresa_id));
create policy tareos_admin_update on public.tareos_admin
  for update using (public.usuario_tiene_empresa(empresa_id))
  with check (public.usuario_tiene_empresa(empresa_id));

select pg_notify('pgrst', 'reload schema');
