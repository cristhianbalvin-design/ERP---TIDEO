-- Verificacion de catalogo para SEG-2b.
-- Ejecutar solo despues de aplicar 410_cerrar_postulacion_publica.sql en un
-- proyecto de desarrollo. No crea, modifica ni elimina datos de negocio.

do $$
declare
  v_count integer;
  v_bucket storage.buckets%rowtype;
begin
  if has_table_privilege('anon', 'public.rrhh_vacantes', 'SELECT') then
    raise exception 'SEG-2b: anon conserva SELECT directo sobre rrhh_vacantes';
  end if;

  if has_table_privilege('anon', 'public.rrhh_candidatos', 'INSERT')
     or has_table_privilege('anon', 'public.rrhh_candidaturas', 'INSERT')
     or has_table_privilege('anon', 'public.rrhh_candidatura_historial', 'INSERT') then
    raise exception 'SEG-2b: anon conserva INSERT directo en tablas de postulacion';
  end if;

  select count(*)
    into v_count
  from pg_policies
  where schemaname = 'public'
    and tablename = 'rrhh_vacantes'
    and policyname = 'rrhh_vacantes_authenticated_select'
    and cmd = 'SELECT'
    and roles = array['authenticated']::name[];
  if v_count <> 1 then
    raise exception 'SEG-2b: falta la politica authenticated de vacantes';
  end if;

  select count(*)
    into v_count
  from pg_policies
  where schemaname = 'public'
    and tablename in (
      'rrhh_candidatos',
      'rrhh_candidaturas',
      'rrhh_candidatura_historial'
    )
    and 'anon' = any(roles);
  if v_count <> 0 then
    raise exception 'SEG-2b: persisten politicas anon sobre tablas de postulacion';
  end if;

  if not has_function_privilege(
    'anon',
    'public.obtener_vacante_publica(text)',
    'EXECUTE'
  ) then
    raise exception 'SEG-2b: anon no puede ejecutar el lookup publico';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(
      coalesce(p.proacl, acldefault('f', p.proowner))
    ) acl
    where n.nspname = 'public'
      and p.proname = 'obtener_vacante_publica'
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) then
    raise exception 'SEG-2b: PUBLIC conserva EXECUTE sobre el lookup';
  end if;

  select count(*)
    into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'registrar_postulacion_publica'
    and pg_get_function_identity_arguments(p.oid) =
      'p_public_token text, p_upload_ticket_id uuid, p_nombre text, p_dni text, p_telefono text, p_email text';
  if v_count <> 1 then
    raise exception 'SEG-2b: no existe la firma endurecida de postulacion';
  end if;

  select count(*)
    into v_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'registrar_postulacion_publica'
    and pg_get_function_identity_arguments(p.oid) =
      'p_empresa_id text, p_vacante_id text, p_nombre text, p_dni text, p_telefono text, p_email text, p_cv_url text, p_cv_path text, p_fuente text';
  if v_count <> 0 then
    raise exception 'SEG-2b: persiste la firma insegura anterior';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(
      coalesce(p.proacl, acldefault('f', p.proowner))
    ) acl
    where n.nspname = 'public'
      and p.oid = 'public.registrar_postulacion_publica(text,uuid,text,text,text,text)'::regprocedure
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) then
    raise exception 'SEG-2b: PUBLIC conserva EXECUTE sobre la postulacion';
  end if;

  if not has_function_privilege(
    'anon',
    'public.registrar_postulacion_publica(text,uuid,text,text,text,text)',
    'EXECUTE'
  ) then
    raise exception 'SEG-2b: anon no puede ejecutar la postulacion endurecida';
  end if;

  select *
    into v_bucket
  from storage.buckets
  where id = 'reclutamiento-cv';
  if not found
     or v_bucket.public
     or v_bucket.file_size_limit <> 5242880
     or v_bucket.allowed_mime_types is distinct from
       array['application/pdf', 'image/jpeg', 'image/png']::text[] then
    raise exception 'SEG-2b: configuracion invalida del bucket reclutamiento-cv';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'storage_docs_privados_anon_insert'
  ) then
    raise exception 'SEG-2b: persiste la subida anon a documentos-privados';
  end if;

  if not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'rrhh_postulacion_upload_tickets'
      and c.relrowsecurity
  ) then
    raise exception 'SEG-2b: la tabla de tickets no existe o no tiene RLS';
  end if;
end;
$$;

select 'SEG-2b catalogo OK' as resultado;
