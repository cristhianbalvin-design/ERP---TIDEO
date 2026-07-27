-- Prevent a public applicant from creating more than one candidacy for the
-- same vacancy when the browser retries or the submit button is clicked twice.
-- Existing historical duplicates are preserved; the UI shows one card per
-- vacancy/candidate and this function prevents new duplicates.

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
  v_dni text;
begin
  v_dni := regexp_replace(coalesce(p_dni, ''), '\D', '', 'g');
  if v_dni = '' then
    raise exception 'DNI obligatorio';
  end if;

  -- Serializes duplicate submissions for this tenant, vacancy and applicant.
  perform pg_advisory_xact_lock(hashtextextended(p_empresa_id || '|' || p_vacante_id || '|' || v_dni, 0));

  select * into v_vacante
  from public.rrhh_vacantes
  where id = p_vacante_id and empresa_id = p_empresa_id;
  if not found or v_vacante.estado <> 'abierta' then
    raise exception 'Vacante no disponible';
  end if;

  insert into public.rrhh_candidatos as candidato(
    id, empresa_id, nombre, dni, telefono, email, cv_url, cv_path
  ) values (
    'cand_' || replace(gen_random_uuid()::text, '-', ''), p_empresa_id, p_nombre,
    v_dni, p_telefono, p_email, p_cv_url, p_cv_path
  )
  on conflict (empresa_id, dni) do update
    set nombre = coalesce(excluded.nombre, candidato.nombre),
        telefono = coalesce(excluded.telefono, candidato.telefono),
        email = coalesce(excluded.email, candidato.email),
        cv_url = coalesce(excluded.cv_url, candidato.cv_url),
        cv_path = coalesce(excluded.cv_path, candidato.cv_path),
        updated_at = now()
  returning id into v_candidato_id;

  -- The earliest existing candidacy is reused so existing duplicate rows are
  -- not deleted by this safety fix.
  select id into v_candidatura_id
  from public.rrhh_candidaturas
  where empresa_id = p_empresa_id
    and vacante_id = p_vacante_id
    and candidato_id = v_candidato_id
  order by created_at asc, id asc
  limit 1;

  if found then
    return jsonb_build_object(
      'candidatura_id', v_candidatura_id,
      'candidato_id', v_candidato_id,
      'ya_existia', true
    );
  end if;

  v_candidatura_id := 'candit_' || replace(gen_random_uuid()::text, '-', '');
  insert into public.rrhh_candidaturas(
    id, empresa_id, vacante_id, candidato_id, etapa, fuente
  ) values (
    v_candidatura_id, p_empresa_id, p_vacante_id, v_candidato_id,
    'postulado', coalesce(nullif(p_fuente, ''), 'portal_publico')
  );

  insert into public.rrhh_candidatura_historial(
    empresa_id, candidatura_id, etapa_desde, etapa_hasta, motivo, notas, usuario_id
  ) values (
    p_empresa_id, v_candidatura_id, null, 'postulado',
    'Postulacion publica', null, 'Sistema'
  );

  return jsonb_build_object(
    'candidatura_id', v_candidatura_id,
    'candidato_id', v_candidato_id,
    'ya_existia', false
  );
end;
$$;

grant execute on function public.registrar_postulacion_publica(
  text, text, text, text, text, text, text, text, text
) to anon, authenticated;

select pg_notify('pgrst', 'reload schema');
