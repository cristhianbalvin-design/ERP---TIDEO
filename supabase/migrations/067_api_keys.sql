-- TIDEO ERP - API Keys para integraciones externas.
-- El key nunca se guarda en texto plano: solo su hash SHA-256 (pgcrypto).
-- validar_api_key() es SECURITY DEFINER para que Edge Functions puedan llamarla sin sesión.

create extension if not exists pgcrypto;

create table if not exists public.api_keys (
  id            uuid        primary key default gen_random_uuid(),
  empresa_id    text        not null references public.empresas(id) on delete cascade,
  key_hash      text        not null unique,
  descripcion   text        not null,
  permisos      text[]      not null default '{}',
  activo        boolean     not null default true,
  creado_por    uuid        references auth.users(id) on delete set null,
  creado_en     timestamptz not null default now(),
  ultimo_uso_en timestamptz
);

-- Índice en hash activo: usado en cada validación de request externo.
create index if not exists api_keys_hash_active_idx on public.api_keys (key_hash) where activo = true;
create index if not exists api_keys_empresa_idx     on public.api_keys (empresa_id, activo);

comment on table public.api_keys is
  'API keys para integraciones externas. Solo se almacena el hash SHA-256. El key original es irrecuperable.';

-- ─── RLS ───────────────────────────────────────────────────────────────────

alter table public.api_keys enable row level security;

drop policy if exists api_keys_select on public.api_keys;
drop policy if exists api_keys_insert on public.api_keys;
drop policy if exists api_keys_update on public.api_keys;
drop policy if exists api_keys_delete on public.api_keys;

create policy api_keys_select on public.api_keys
  for select using (public.usuario_tiene_empresa(empresa_id));

create policy api_keys_insert on public.api_keys
  for insert with check (public.usuario_tiene_empresa(empresa_id));

-- Permite actualizar permisos y revocar (activo = false).
create policy api_keys_update on public.api_keys
  for update using  (public.usuario_tiene_empresa(empresa_id))
  with check        (public.usuario_tiene_empresa(empresa_id));

-- Eliminación física solo para admins; la operación normal es revocar.
create policy api_keys_delete on public.api_keys
  for delete using (public.usuario_es_admin_empresa(empresa_id));

-- ─── FUNCIÓN DE VALIDACIÓN ─────────────────────────────────────────────────

create or replace function public.validar_api_key(key_plain text, permiso text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id       uuid;
  v_empresa  text;
  v_permisos text[];
  v_hash     text;
begin
  v_hash := encode(digest(key_plain::bytea, 'sha256'), 'hex');

  select id, empresa_id, permisos
  into   v_id, v_empresa, v_permisos
  from   public.api_keys
  where  key_hash = v_hash
    and  activo   = true
  limit  1;

  if not found                        then return null; end if;
  if not (permiso = any(v_permisos))  then return null; end if;

  update public.api_keys set ultimo_uso_en = now() where id = v_id;

  return v_empresa;
end;
$$;

comment on function public.validar_api_key(text, text) is
  'Valida un API key (texto plano), verifica el permiso requerido y retorna empresa_id. Llamada desde Edge Functions sin sesión de usuario.';

select pg_notify('pgrst', 'reload schema');
