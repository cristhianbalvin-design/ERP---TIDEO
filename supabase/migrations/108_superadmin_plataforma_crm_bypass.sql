-- Super Admin TIDEO: bypass correcto para datos CRM de cualquier tenant.
--
-- La funcion usuario_tiene_empresa() ya permite al superadmin de plataforma
-- entrar a cualquier tenant. Faltaba que las funciones usadas por las
-- politicas jerarquicas tambien reconocieran ese bypass.

create or replace function public.usuario_puede(
  target_empresa_id text,
  target_pantalla text,
  target_accion text
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.usuario_es_superadmin_plataforma()
  or exists (
    select 1
    from public.usuarios_empresas ue
    join public.roles r on r.id = ue.rol_id
    where ue.user_id = auth.uid()
      and ue.empresa_id = target_empresa_id
      and ue.estado = 'activo'
      and (r.es_admin_empresa = true or r.es_superadmin = true)
  )
  or exists (
    select 1
    from public.usuarios_empresas ue
    join public.permisos_roles pr on pr.rol_id = ue.rol_id
    where ue.user_id = auth.uid()
      and ue.empresa_id = target_empresa_id
      and ue.estado = 'activo'
      and pr.pantalla = target_pantalla
      and (
        case target_accion
          when 'ver' then pr.puede_ver
          when 'crear' then pr.puede_crear
          when 'editar' then pr.puede_editar
          when 'anular' then pr.puede_anular
          when 'aprobar' then pr.puede_aprobar
          when 'exportar' then pr.puede_exportar
          when 'ver_costos' then pr.puede_ver_costos
          when 'ver_finanzas' then pr.puede_ver_finanzas
          else false
        end
      )
  );
$$;

create or replace function public.usuario_puede_ver_registro(
  target_empresa_id text,
  owner_user_id uuid default null,
  target_categoria text default null,
  target_alcance_tipo text default null,
  target_alcance_id text default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.usuario_es_superadmin_plataforma()
    or exists (
      select 1
      from public.usuarios_asignaciones ua
      join public.roles r on r.id = ua.rol_id
      where ua.user_id = auth.uid()
        and ua.empresa_id = target_empresa_id
        and ua.activo = true
        and (
          r.es_superadmin = true
          or r.es_admin_empresa = true
          or ua.nivel_jerarquico = 'direccion'
        )
    )
    or coalesce(owner_user_id = auth.uid(), false)
    or (
      owner_user_id is not null
      and public.usuario_puede_ver_usuario(target_empresa_id, owner_user_id)
    )
    or exists (
      select 1
      from public.usuarios_asignaciones ua
      where ua.user_id = auth.uid()
        and ua.empresa_id = target_empresa_id
        and ua.activo = true
        and (target_categoria is null or ua.categoria = target_categoria)
        and (
          target_alcance_tipo is null
          or ua.alcance_tipo = 'tenant'
          or (
            ua.alcance_tipo = target_alcance_tipo
            and coalesce(ua.alcance_id, '') = coalesce(target_alcance_id, '')
          )
        )
    );
$$;

select pg_notify('pgrst', 'reload schema');
