-- Permitir a anon subir archivos CV a documentos-privados
drop policy if exists storage_docs_privados_anon_insert on storage.objects;
create policy storage_docs_privados_anon_insert
on storage.objects for insert to anon
with check (
  bucket_id = 'documentos-privados'
  and name like '%/reclutamiento/%'
);

-- RPC para registrar postulacion evadiendo RLS de candidatos (ya que anon no puede hacer UPSERT)
create or replace function public.registrar_postulacion_publica(
  p_empresa_id text,
  p_vacante_id text,
  p_nombre text,
  p_dni text,
  p_telefono text,
  p_email text,
  p_cv_url text,
  p_cv_path text,
  p_fuente text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidato_id text;
  v_candidatura_id text;
  v_vacante public.rrhh_vacantes;
begin
  -- Validate vacante
  select * into v_vacante from public.rrhh_vacantes where id = p_vacante_id and empresa_id = p_empresa_id;
  if not found or v_vacante.estado <> 'abierta' then
    raise exception 'Vacante no disponible';
  end if;

  -- Upsert candidato
  select id into v_candidato_id from public.rrhh_candidatos where empresa_id = p_empresa_id and dni = p_dni;
  if found then
    update public.rrhh_candidatos
       set nombre = coalesce(p_nombre, nombre),
           telefono = coalesce(p_telefono, telefono),
           email = coalesce(p_email, email),
           cv_url = coalesce(p_cv_url, cv_url),
           cv_path = coalesce(p_cv_path, cv_path),
           updated_at = now()
     where id = v_candidato_id;
  else
    v_candidato_id := 'cand_' || replace(gen_random_uuid()::text, '-', '');
    insert into public.rrhh_candidatos(id, empresa_id, nombre, dni, telefono, email, cv_url, cv_path)
    values (v_candidato_id, p_empresa_id, p_nombre, p_dni, p_telefono, p_email, p_cv_url, p_cv_path);
  end if;

  -- Insert candidatura
  v_candidatura_id := 'candit_' || replace(gen_random_uuid()::text, '-', '');
  insert into public.rrhh_candidaturas(id, empresa_id, vacante_id, candidato_id, etapa, fuente)
  values (v_candidatura_id, p_empresa_id, p_vacante_id, v_candidato_id, 'postulado', p_fuente);

  -- Insert historial
  insert into public.rrhh_candidatura_historial(empresa_id, candidatura_id, etapa_desde, etapa_hasta, motivo, notas, usuario_id)
  values (p_empresa_id, v_candidatura_id, null, 'postulado', 'Postulación pública', null, 'Sistema');

  return jsonb_build_object('candidatura_id', v_candidatura_id, 'candidato_id', v_candidato_id);
end;
$$;

grant execute on function public.registrar_postulacion_publica to anon, authenticated;

select pg_notify('pgrst', 'reload schema');
