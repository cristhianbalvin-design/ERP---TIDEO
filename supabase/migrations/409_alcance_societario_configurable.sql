-- TIDEO ERP - Alcance societario configurable y permiso de vista consolidada.
-- No asigna alcances a usuarios existentes ni modifica la frontera RLS de 404.

-- La firma extendida mantiene compatibles las llamadas posicionales anteriores:
-- los dos parametros nuevos tienen default NULL. Cuando no se informa alcance,
-- una asignacion existente conserva exactamente su configuracion societaria.
drop function if exists public.posicion_guardar_asignacion_principal(
  uuid, text, uuid, text, text, text, uuid
);

create function public.posicion_guardar_asignacion_principal(
  p_asignacion_id uuid,
  p_empresa_id text,
  p_user_id uuid,
  p_rol_id text,
  p_categoria text,
  p_nivel_jerarquico text,
  p_posicion_id uuid,
  p_alcance_tipo text default null,
  p_sociedades_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asignacion_id uuid := p_asignacion_id;
  v_pos_anterior_id uuid;
  v_jefe_user_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  if p_alcance_tipo is not null and p_alcance_tipo <> 'grupo' then
    raise exception 'El alcance societario configurable debe usar alcance_tipo=grupo.';
  end if;

  if p_alcance_tipo is null and p_sociedades_ids is not null then
    raise exception 'sociedades_ids requiere informar alcance_tipo=grupo.';
  end if;

  if p_sociedades_ids is not null and exists (
    select 1
    from unnest(p_sociedades_ids) as sociedad_id
    left join public.sociedades s
      on s.id = sociedad_id
     and s.empresa_id = p_empresa_id
    where s.id is null
  ) then
    raise exception 'Una o mas sociedades del alcance no pertenecen al tenant.';
  end if;

  v_jefe_user_id := public.resolver_jefe_desde_posicion(p_posicion_id, p_user_id);

  if v_asignacion_id is not null then
    v_pos_anterior_id := public.posicion_detach_origen(v_asignacion_id);

    if p_alcance_tipo is null then
      update public.usuarios_asignaciones
      set rol_id = p_rol_id,
          categoria = p_categoria,
          nivel_jerarquico = p_nivel_jerarquico,
          jefe_user_id = v_jefe_user_id,
          principal = true,
          activo = true,
          fecha_fin = null,
          updated_at = now()
      where id = v_asignacion_id;
    else
      update public.usuarios_asignaciones
      set rol_id = p_rol_id,
          categoria = p_categoria,
          nivel_jerarquico = p_nivel_jerarquico,
          jefe_user_id = v_jefe_user_id,
          alcance_tipo = p_alcance_tipo,
          alcance_id = null,
          sociedades_ids = p_sociedades_ids,
          principal = true,
          activo = true,
          fecha_fin = null,
          updated_at = now()
      where id = v_asignacion_id;
    end if;
  else
    insert into public.usuarios_asignaciones(
      empresa_id, user_id, rol_id, categoria, nivel_jerarquico, jefe_user_id,
      alcance_tipo, alcance_id, sociedades_ids, principal, activo, fecha_fin, updated_at
    ) values (
      p_empresa_id, p_user_id, p_rol_id, p_categoria, p_nivel_jerarquico, v_jefe_user_id,
      coalesce(p_alcance_tipo, 'tenant'), null,
      case when p_alcance_tipo is null then null else p_sociedades_ids end,
      true, true, null, now()
    )
    returning id into v_asignacion_id;
  end if;

  perform public.posicion_asignar_usuario(
    p_empresa_id, p_user_id, p_posicion_id, v_asignacion_id, v_pos_anterior_id
  );

  return jsonb_build_object(
    'asignacion_id', v_asignacion_id,
    'jefe_user_id', v_jefe_user_id
  );
end;
$$;

revoke execute on function public.posicion_guardar_asignacion_principal(
  uuid, text, uuid, text, text, text, uuid, text, uuid[]
) from public;
revoke execute on function public.posicion_guardar_asignacion_principal(
  uuid, text, uuid, text, text, text, uuid, text, uuid[]
) from anon;
revoke execute on function public.posicion_guardar_asignacion_principal(
  uuid, text, uuid, text, text, text, uuid, text, uuid[]
) from authenticated;
grant execute on function public.posicion_guardar_asignacion_principal(
  uuid, text, uuid, text, text, text, uuid, text, uuid[]
) to service_role;

-- Fila unica de permisos especiales por rol. Todos los roles existentes
-- conservan la vista consolidada que tenian antes de introducir este permiso.
insert into public.permisos_roles (
  rol_id,
  pantalla,
  puede_ver,
  puede_crear,
  puede_editar,
  puede_anular,
  puede_aprobar,
  puede_exportar,
  puede_ver_costos,
  puede_ver_finanzas,
  permisos_extra
)
select
  r.id,
  '__especiales__',
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  false,
  jsonb_build_object('ver_consolidado_grupo', true)
from public.roles r
on conflict (rol_id, pantalla) do update
set permisos_extra = coalesce(public.permisos_roles.permisos_extra, '{}'::jsonb)
  || jsonb_build_object('ver_consolidado_grupo', true),
    updated_at = now();

create or replace function public.sembrar_permiso_consolidado_rol_nuevo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.permisos_roles (
    rol_id,
    pantalla,
    permisos_extra
  ) values (
    new.id,
    '__especiales__',
    jsonb_build_object(
      'ver_consolidado_grupo',
      coalesce(new.es_admin_empresa, false) or coalesce(new.es_superadmin, false)
    )
  )
  on conflict (rol_id, pantalla) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_roles_sembrar_permiso_consolidado on public.roles;
create trigger trg_roles_sembrar_permiso_consolidado
after insert on public.roles
for each row execute function public.sembrar_permiso_consolidado_rol_nuevo();

revoke all on function public.sembrar_permiso_consolidado_rol_nuevo() from public;
revoke all on function public.sembrar_permiso_consolidado_rol_nuevo() from anon;
revoke all on function public.sembrar_permiso_consolidado_rol_nuevo() from authenticated;
