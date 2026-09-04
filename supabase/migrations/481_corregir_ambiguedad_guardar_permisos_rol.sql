-- La funcion 480 retorna columnas llamadas rol_id y pantalla. Al usar esas
-- columnas sin nombrar en el objetivo de conflicto, PL/pgSQL las interpreta
-- tambien como variables de salida. Se usa la restriccion unica explicita.

create or replace function public.guardar_permisos_rol(
  p_rol_id text,
  p_permisos jsonb
)
returns table(rol_id text, pantalla text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id text;
  v_rol_protegido boolean;
  v_es_admin boolean;
  v_total integer;
  v_distintos integer;
  v_permiso record;
begin
  if auth.uid() is null then
    raise exception 'Sesion no autenticada.';
  end if;

  if jsonb_typeof(p_permisos) is distinct from 'array' then
    raise exception 'El lote de permisos no es valido.';
  end if;

  select r.empresa_id, public.rol_es_protegido(r.id)
    into v_empresa_id, v_rol_protegido
  from public.roles r
  where r.id = p_rol_id;

  if v_empresa_id is null then
    raise exception 'Rol no encontrado.';
  end if;

  v_es_admin := public.usuario_es_admin_empresa(v_empresa_id)
    or public.usuario_es_superadmin_plataforma();

  if not v_es_admin and (
    v_rol_protegido
    or not public.actor_puede_gestionar_roles(v_empresa_id, 'editar')
  ) then
    raise exception 'No tienes permiso para editar este rol.';
  end if;

  select count(*), count(distinct item ->> 'pantalla')
    into v_total, v_distintos
  from jsonb_array_elements(p_permisos) item;

  if v_total = 0 or v_total <> v_distintos then
    raise exception 'El lote de permisos contiene pantallas invalidas o repetidas.';
  end if;

  for v_permiso in
    select *
    from jsonb_to_recordset(p_permisos) as permiso(
      pantalla text,
      puede_ver boolean,
      puede_crear boolean,
      puede_editar boolean,
      puede_anular boolean,
      puede_aprobar boolean,
      puede_exportar boolean,
      puede_ver_costos boolean,
      puede_ver_finanzas boolean,
      permisos_extra jsonb
    )
  loop
    if nullif(trim(v_permiso.pantalla), '') is null then
      raise exception 'El lote contiene una pantalla sin identificador.';
    end if;

    if not public.permiso_rol_pantalla_permitido(p_rol_id, v_permiso.pantalla) then
      raise exception 'La pantalla "%" solo puede guardarse en TIDEO Plataforma.', v_permiso.pantalla;
    end if;

    if not v_es_admin and not public.actor_puede_delegar_permiso(
      v_empresa_id,
      v_permiso.pantalla,
      coalesce(v_permiso.puede_ver, false),
      coalesce(v_permiso.puede_crear, false),
      coalesce(v_permiso.puede_editar, false),
      coalesce(v_permiso.puede_anular, false),
      coalesce(v_permiso.puede_aprobar, false),
      coalesce(v_permiso.puede_exportar, false),
      coalesce(v_permiso.puede_ver_costos, false),
      coalesce(v_permiso.puede_ver_finanzas, false),
      coalesce(v_permiso.permisos_extra, '{}'::jsonb)
    ) then
      raise exception 'No puedes delegar el permiso de "%".', v_permiso.pantalla;
    end if;
  end loop;

  return query
  insert into public.permisos_roles as destino (
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
    p_rol_id,
    trim(origen.pantalla),
    coalesce(origen.puede_ver, false),
    coalesce(origen.puede_crear, false),
    coalesce(origen.puede_editar, false),
    coalesce(origen.puede_anular, false),
    coalesce(origen.puede_aprobar, false),
    coalesce(origen.puede_exportar, false),
    coalesce(origen.puede_ver_costos, false),
    coalesce(origen.puede_ver_finanzas, false),
    coalesce(origen.permisos_extra, '{}'::jsonb)
  from jsonb_to_recordset(p_permisos) as origen(
    pantalla text,
    puede_ver boolean,
    puede_crear boolean,
    puede_editar boolean,
    puede_anular boolean,
    puede_aprobar boolean,
    puede_exportar boolean,
    puede_ver_costos boolean,
    puede_ver_finanzas boolean,
    permisos_extra jsonb
  )
  on conflict on constraint permisos_roles_rol_id_pantalla_key do update set
    puede_ver = excluded.puede_ver,
    puede_crear = excluded.puede_crear,
    puede_editar = excluded.puede_editar,
    puede_anular = excluded.puede_anular,
    puede_aprobar = excluded.puede_aprobar,
    puede_exportar = excluded.puede_exportar,
    puede_ver_costos = excluded.puede_ver_costos,
    puede_ver_finanzas = excluded.puede_ver_finanzas,
    permisos_extra = excluded.permisos_extra
  returning destino.rol_id, destino.pantalla;
end;
$$;

revoke all on function public.guardar_permisos_rol(text, jsonb) from public;
revoke all on function public.guardar_permisos_rol(text, jsonb) from anon;
grant execute on function public.guardar_permisos_rol(text, jsonb) to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');
