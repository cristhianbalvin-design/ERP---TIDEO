-- Vincula un usuario Auth existente o recien creado a un tenant.
-- Necesario porque el cliente anon no puede consultar auth.users para resolver
-- el UUID cuando el email ya estaba registrado.

create or replace function public.vincular_usuario_a_empresa(
  p_email text,
  p_empresa_id text,
  p_rol_id text,
  p_acceso_campo boolean default false,
  p_perfil_campo text default null
)
returns table(user_id uuid, empresa_id text, rol_id text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_rol_id text;
begin
  if nullif(trim(coalesce(p_email, '')), '') is null then
    raise exception 'El email del usuario es obligatorio.';
  end if;

  if not (
    public.usuario_es_admin_empresa(p_empresa_id)
    or public.usuario_es_superadmin_plataforma()
  ) then
    raise exception 'No tienes permiso para vincular usuarios a este tenant.';
  end if;

  select u.id
    into v_user_id
  from auth.users u
  where lower(u.email) = lower(trim(p_email))
  limit 1;

  if v_user_id is null then
    raise exception 'El usuario Auth % todavia no existe.', p_email;
  end if;

  select r.id
    into v_rol_id
  from public.roles r
  where r.id = p_rol_id
    and (r.empresa_id = p_empresa_id or r.empresa_id is null)
    and coalesce(r.activo, true) = true
  limit 1;

  if v_rol_id is null then
    raise exception 'El rol % no existe o no pertenece al tenant %.', p_rol_id, p_empresa_id;
  end if;

  insert into public.usuarios_empresas (
    user_id, empresa_id, rol_id, acceso_campo, perfil_campo, estado
  )
  values (
    v_user_id, p_empresa_id, v_rol_id, coalesce(p_acceso_campo, false), p_perfil_campo, 'activo'
  )
  on conflict (user_id, empresa_id) do update set
    rol_id = excluded.rol_id,
    acceso_campo = excluded.acceso_campo,
    perfil_campo = excluded.perfil_campo,
    estado = 'activo',
    updated_at = now();

  return query select v_user_id, p_empresa_id, v_rol_id;
end;
$$;

grant execute on function public.vincular_usuario_a_empresa(text, text, text, boolean, text) to authenticated;

select pg_notify('pgrst', 'reload schema');
