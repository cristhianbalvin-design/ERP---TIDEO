-- 654: Roles destinatarios configurables por evento.
-- destinatarios.roles_rrhh / destinatarios.roles_operaciones (arreglo de roles.id de la empresa).
-- Si la clave existe, la lista manda (los administradores se pueden quitar).
-- Si no existe, se mantiene la detección automática actual:
--   RRHH = administradores + roles cuyo nombre contiene rrhh/recursos.
--   Operaciones = administradores + roles con permiso de ver OTs o Partes diarios.
-- Las funciones existentes se modifican a partir de pg_get_functiondef de la versión remota vigente,
-- con reemplazos puntuales verificados (si un fragmento no se encuentra, la migración se revierte).

-- 1) Destinatarios por rol según la regla del evento.
create or replace function public.notif_usuarios_rrhh(p_empresa_id text, p_destinatarios jsonb)
returns table(user_id uuid)
language sql
stable
security definer
set search_path to 'public'
as $$
  select u.user_id from public.notif_usuarios_rrhh(p_empresa_id) u
  where jsonb_typeof(p_destinatarios -> 'roles_rrhh') is distinct from 'array'
  union
  select distinct ue.user_id
  from public.usuarios_empresas ue
  where jsonb_typeof(p_destinatarios -> 'roles_rrhh') = 'array'
    and ue.empresa_id = p_empresa_id
    and coalesce(ue.estado, 'activo') = 'activo'
    and ue.user_id is not null
    and ue.rol_id::text in (select jsonb_array_elements_text(p_destinatarios -> 'roles_rrhh'))
$$;

create or replace function public.notif_usuarios_operaciones(p_empresa_id text, p_destinatarios jsonb)
returns table(user_id uuid)
language sql
stable
security definer
set search_path to 'public'
as $$
  select u.user_id from public.notif_usuarios_operaciones(p_empresa_id) u
  where jsonb_typeof(p_destinatarios -> 'roles_operaciones') is distinct from 'array'
  union
  select distinct ue.user_id
  from public.usuarios_empresas ue
  where jsonb_typeof(p_destinatarios -> 'roles_operaciones') = 'array'
    and ue.empresa_id = p_empresa_id
    and coalesce(ue.estado, 'activo') = 'activo'
    and ue.user_id is not null
    and ue.rol_id::text in (select jsonb_array_elements_text(p_destinatarios -> 'roles_operaciones'))
$$;

revoke all on function public.notif_usuarios_rrhh(text, jsonb) from public, anon, authenticated;
revoke all on function public.notif_usuarios_operaciones(text, jsonb) from public, anon, authenticated;

-- 2) Roles de la empresa para la pantalla (solo administradores), con la preselección automática.
create or replace function public.notif_roles_empresa(p_empresa_id text)
returns table(id text, nombre text, categoria text, es_admin boolean, usuarios integer, auto_rrhh boolean, auto_operaciones boolean)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if not public.usuario_es_admin_empresa(p_empresa_id) then
    raise exception 'Se requiere ser administrador de la empresa.' using errcode = '42501';
  end if;
  return query
  select ro.id::text, ro.nombre::text, ro.categoria::text, coalesce(ro.es_admin_empresa, false),
         (select count(*)::int from public.usuarios_empresas ue
           where ue.rol_id = ro.id and ue.empresa_id = p_empresa_id and coalesce(ue.estado, 'activo') = 'activo'),
         coalesce(ro.es_admin_empresa, false)
           or lower(coalesce(ro.nombre, '')) like '%rrhh%' or lower(coalesce(ro.nombre, '')) like '%recursos%',
         coalesce(ro.es_admin_empresa, false)
           or exists (select 1 from public.permisos_roles pr
                      where pr.rol_id = ro.id and coalesce(pr.puede_ver, false)
                        and pr.pantalla in ('ot', 'ots', 'Ordenes de Trabajo', 'partes', 'Partes Diarios'))
  from public.roles ro
  where ro.empresa_id = p_empresa_id and coalesce(ro.activo, true)
  order by coalesce(ro.es_admin_empresa, false) desc, ro.nombre;
end;
$$;

revoke all on function public.notif_roles_empresa(text) from public, anon;
grant execute on function public.notif_roles_empresa(text) to authenticated;

-- 3) Reemplazos puntuales.
do $mig$
declare
  v_fn text; v_def text; v_new text;
begin
  -- 3a) Generadores: usan la lista de roles de su regla.
  foreach v_fn in array array[
    'notif_generar_contratos_por_vencer(text,date)', 'notif_generar_contratos_vencidos(text,date)',
    'notif_generar_documentos_por_vencer(text,date)', 'notif_generar_tardanzas_resumen(text,date)',
    'notif_generar_ots_creadas(text,date)', 'notif_generar_partes_no_llenados(text,date)'] loop
    v_def := pg_get_functiondef(('public.' || v_fn)::regprocedure);
    v_new := replace(v_def, 'public.notif_usuarios_rrhh(p_empresa_id)', 'public.notif_usuarios_rrhh(p_empresa_id, v_regla.destinatarios)');
    v_new := replace(v_new, 'public.notif_usuarios_operaciones(p_empresa_id)', 'public.notif_usuarios_operaciones(p_empresa_id, v_regla.destinatarios)');
    if v_new = v_def then
      raise exception '654: no se pudo ajustar %', v_fn;
    end if;
    execute v_new;
  end loop;

  -- 3b) notif_config_guardar: valida y guarda roles_rrhh / roles_operaciones.
  v_def := pg_get_functiondef('public.notif_config_guardar(text,text,boolean,jsonb,jsonb)'::regprocedure);
  v_new := replace(v_def,
    'v_correos text[]; v_invalidos text[]; v_telefonos text[]; v_tel_invalidos text[];',
    'v_correos text[]; v_invalidos text[]; v_telefonos text[]; v_tel_invalidos text[]; v_roles_key text; v_roles text[]; v_roles_invalidos text[];');
  v_new := replace(v_new,
    'coalesce(to_jsonb((select array_agg(t order by t) from unnest(v_telefonos) t)), ''[]''::jsonb));',
    'coalesce(to_jsonb((select array_agg(t order by t) from unnest(v_telefonos) t)), ''[]''::jsonb));'
      || chr(10) || '  foreach v_roles_key in array array[''roles_rrhh'', ''roles_operaciones''] loop'
      || chr(10) || '    if jsonb_typeof(p_destinatarios -> v_roles_key) = ''array'''
      || chr(10) || '       and (replace(v_roles_key, ''roles_'', '''')) = any(v_cat.roles_soportados) then'
      || chr(10) || '      select array_agg(distinct x order by x) filter (where nullif(trim(x), '''') is not null),'
      || chr(10) || '             array_agg(distinct x) filter (where nullif(trim(x), '''') is not null and not exists ('
      || chr(10) || '               select 1 from public.roles ro where ro.id::text = x and ro.empresa_id = p_empresa_id))'
      || chr(10) || '        into v_roles, v_roles_invalidos'
      || chr(10) || '      from jsonb_array_elements_text(p_destinatarios -> v_roles_key) x;'
      || chr(10) || '      if v_roles_invalidos is not null and cardinality(v_roles_invalidos) > 0 then'
      || chr(10) || '        raise exception ''Rol no válido para esta empresa: %'', array_to_string(v_roles_invalidos, '', '');'
      || chr(10) || '      end if;'
      || chr(10) || '      v_dest := v_dest || jsonb_build_object(v_roles_key, coalesce(to_jsonb(v_roles), ''[]''::jsonb));'
      || chr(10) || '    end if;'
      || chr(10) || '  end loop;');
  if v_new = v_def or position('v_roles_key text;' in v_new) = 0 or position('foreach v_roles_key' in v_new) = 0 then
    raise exception '654: no se pudo ajustar notif_config_guardar';
  end if;
  execute v_new;
end
$mig$;

-- 4) Comprobación final.
do $chk$
declare v_fn text; v_d text;
begin
  foreach v_fn in array array[
    'notif_generar_contratos_por_vencer(text,date)', 'notif_generar_contratos_vencidos(text,date)',
    'notif_generar_documentos_por_vencer(text,date)', 'notif_generar_tardanzas_resumen(text,date)',
    'notif_generar_ots_creadas(text,date)', 'notif_generar_partes_no_llenados(text,date)'] loop
    v_d := pg_get_functiondef(('public.' || v_fn)::regprocedure);
    if position('notif_usuarios_rrhh(p_empresa_id)' in v_d) > 0 or position('notif_usuarios_operaciones(p_empresa_id)' in v_d) > 0 then
      raise exception '654 chk: % aún usa la detección sin regla', v_fn;
    end if;
  end loop;
  if position('foreach v_roles_key' in pg_get_functiondef('public.notif_config_guardar(text,text,boolean,jsonb,jsonb)'::regprocedure)) = 0 then
    raise exception '654 chk: config_guardar sin roles';
  end if;
end
$chk$;
