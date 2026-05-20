-- Vincula personal_administrativo con auth.users
-- Permite asociar una cuenta del sistema a un colaborador administrativo (vendedor)
-- Necesario para el lookup de comisión base en el Pipeline

alter table public.personal_administrativo
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

create index if not exists idx_personal_admin_auth_user
  on public.personal_administrativo(empresa_id, auth_user_id)
  where auth_user_id is not null;
