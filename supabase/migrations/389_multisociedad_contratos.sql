-- TIDEO ERP - Escritura contractual por sociedad.
-- Las funciones legacy se mantienen intactas para tenants con el flag desactivado.

create or replace function public.subir_documento_personal_sociedad(
  p_empresa_id text,
  p_sociedad_id uuid,
  p_personal_id text,
  p_personal_tipo text,
  p_tipo_doc text,
  p_nombre_archivo text,
  p_archivo_url text,
  p_fecha_emision date default null,
  p_fecha_vencimiento date default null,
  p_notas text default null,
  p_subido_desde text default 'backoffice',
  p_tipo_documento_id text default null,
  p_condiciones_laborales jsonb default '{}'::jsonb,
  p_contrato_referencia_id text default null,
  p_adenda_cambios jsonb default '{}'::jsonb,
  p_fecha_vigencia_cambio date default null,
  p_seccion_documental text default null,
  p_contrato_periodo_id text default null,
  p_origen text default 'backoffice',
  p_es_indefinido boolean default false,
  p_forzar_override boolean default false,
  p_motivo_override text default null
)
returns public.personal_documentos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.personal_documentos;
  v_sociedad_contrato uuid;
begin
  if p_sociedad_id is null then
    raise exception 'La sociedad empleadora es obligatoria.';
  end if;

  if not exists (
    select 1 from public.sociedades
    where id = p_sociedad_id and empresa_id = p_empresa_id and activa = true
  ) then
    raise exception 'La sociedad empleadora no pertenece al tenant o esta inactiva.';
  end if;

  if p_contrato_referencia_id is not null then
    select sociedad_id into v_sociedad_contrato
    from public.personal_documentos
    where id = p_contrato_referencia_id
      and empresa_id = p_empresa_id
      and personal_id = p_personal_id;

    if not found or v_sociedad_contrato is distinct from p_sociedad_id then
      raise exception 'La adenda debe usar la misma sociedad que su contrato de referencia.';
    end if;
  end if;

  v_row := public.subir_documento_personal(
    p_empresa_id => p_empresa_id,
    p_personal_id => p_personal_id,
    p_personal_tipo => p_personal_tipo,
    p_tipo_doc => p_tipo_doc,
    p_nombre_archivo => p_nombre_archivo,
    p_archivo_url => p_archivo_url,
    p_fecha_emision => p_fecha_emision,
    p_fecha_vencimiento => p_fecha_vencimiento,
    p_notas => p_notas,
    p_subido_desde => p_subido_desde,
    p_tipo_documento_id => p_tipo_documento_id,
    p_condiciones_laborales => p_condiciones_laborales,
    p_contrato_referencia_id => p_contrato_referencia_id,
    p_adenda_cambios => p_adenda_cambios,
    p_fecha_vigencia_cambio => p_fecha_vigencia_cambio,
    p_seccion_documental => p_seccion_documental,
    p_contrato_periodo_id => p_contrato_periodo_id,
    p_origen => p_origen,
    p_es_indefinido => p_es_indefinido,
    p_forzar_override => p_forzar_override,
    p_motivo_override => p_motivo_override
  );

  update public.personal_documentos
  set sociedad_id = p_sociedad_id
  where id = v_row.id
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.nuevo_contrato_periodo_sociedad(
  p_empresa_id text,
  p_sociedad_id uuid,
  p_personal_id text,
  p_personal_tipo text,
  p_tipo_doc text,
  p_nombre_archivo text,
  p_archivo_url text,
  p_fecha_emision date default null,
  p_fecha_vencimiento date default null,
  p_notas text default null,
  p_condiciones_laborales jsonb default '{}'::jsonb,
  p_tipo_documento_id text default null,
  p_periodo_id_anterior text default null,
  p_es_indefinido boolean default false,
  p_forzar_override boolean default false,
  p_motivo_override text default null
)
returns public.personal_documentos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id text;
  v_nuevo_periodo text;
  v_nuevo_grupo_id uuid;
  v_row public.personal_documentos;
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'Acceso denegado al tenant';
  end if;

  if not exists (
    select 1 from public.empresas
    where id = p_empresa_id and multisociedad_habilitado = true
  ) then
    raise exception 'El tenant no tiene multisociedad habilitada.';
  end if;

  if p_sociedad_id is null or not exists (
    select 1 from public.sociedades
    where id = p_sociedad_id and empresa_id = p_empresa_id and activa = true
  ) then
    raise exception 'Selecciona una sociedad empleadora activa del tenant.';
  end if;

  if p_forzar_override and not public.personal_documentos_puede_forzar_retro(p_empresa_id, p_personal_tipo) then
    raise exception 'No tiene autorizacion para forzar cambios retroactivos sobre nomina ya procesada.';
  end if;

  select id into v_usuario_id
  from public.usuarios
  where id = auth.uid()::text
  limit 1;

  v_nuevo_periodo := 'cper_' || gen_random_uuid()::text;
  v_nuevo_grupo_id := gen_random_uuid();

  if p_periodo_id_anterior is not null then
    update public.personal_documentos
    set periodo_estado = 'archivado', activo = false
    where empresa_id = p_empresa_id
      and sociedad_id = p_sociedad_id
      and personal_id = p_personal_id
      and contrato_periodo_id = p_periodo_id_anterior;
  else
    update public.personal_documentos
    set periodo_estado = 'archivado', activo = false
    where empresa_id = p_empresa_id
      and sociedad_id = p_sociedad_id
      and personal_id = p_personal_id
      and periodo_estado = 'vigente'
      and (
        (p_tipo_documento_id is not null and tipo_documento_id = p_tipo_documento_id)
        or tipo_doc = p_tipo_doc
      );
  end if;

  insert into public.personal_documentos (
    empresa_id, sociedad_id, personal_id, personal_tipo,
    tipo_doc, tipo_documento_id, nombre_archivo, archivo_url,
    fecha_emision, fecha_vencimiento, version, activo,
    estado_validacion, notas, subido_por, subido_desde,
    condiciones_laborales, contrato_periodo_id, periodo_grupo_id,
    periodo_fecha_inicio, periodo_fecha_fin, periodo_estado,
    seccion_documental, es_indefinido, retro_override_por,
    retro_override_motivo
  ) values (
    p_empresa_id, p_sociedad_id, p_personal_id, p_personal_tipo,
    p_tipo_doc, p_tipo_documento_id, p_nombre_archivo, p_archivo_url,
    p_fecha_emision, p_fecha_vencimiento, 1, true,
    'pendiente', p_notas, v_usuario_id, 'backoffice',
    coalesce(p_condiciones_laborales, '{}'::jsonb), v_nuevo_periodo, v_nuevo_grupo_id,
    p_fecha_emision, p_fecha_vencimiento, 'vigente',
    'requisito_cargo', p_es_indefinido,
    case when p_forzar_override then v_usuario_id else null end,
    case when p_forzar_override then p_motivo_override else null end
  )
  returning * into v_row;

  return v_row;
end;
$$;

-- El validador legacy desactiva todos los documentos del mismo tipo. Esta envoltura
-- conserva activos los contratos equivalentes de otras sociedades dentro de la misma
-- transaccion, sin alterar el comportamiento de documentos con sociedad NULL.
create or replace function public.validar_documento_personal_multisoc(
  p_documento_id text,
  p_decision text,
  p_motivo_rechazo text default null
)
returns public.personal_documentos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.personal_documentos;
  v_row public.personal_documentos;
  v_otros_activos text[];
begin
  select * into v_doc
  from public.personal_documentos
  where id = p_documento_id;

  if not found then
    raise exception 'Documento no encontrado';
  end if;

  if v_doc.sociedad_id is not null and p_decision = 'aprobado' then
    select coalesce(array_agg(id), array[]::text[])
      into v_otros_activos
    from public.personal_documentos
    where empresa_id = v_doc.empresa_id
      and personal_id = v_doc.personal_id
      and id <> v_doc.id
      and activo = true
      and sociedad_id is not null
      and sociedad_id <> v_doc.sociedad_id
      and (
        (v_doc.tipo_documento_id is not null and tipo_documento_id = v_doc.tipo_documento_id)
        or tipo_doc = v_doc.tipo_doc
      );
  end if;

  v_row := public.validar_documento_personal(
    p_documento_id => p_documento_id,
    p_decision => p_decision,
    p_motivo_rechazo => p_motivo_rechazo
  );

  if coalesce(array_length(v_otros_activos, 1), 0) > 0 then
    update public.personal_documentos
    set activo = true
    where id = any(v_otros_activos);
  end if;

  select * into v_row from public.personal_documentos where id = p_documento_id;
  return v_row;
end;
$$;

grant execute on function public.subir_documento_personal_sociedad(text, uuid, text, text, text, text, text, date, date, text, text, text, jsonb, text, jsonb, date, text, text, text, boolean, boolean, text) to authenticated;
grant execute on function public.nuevo_contrato_periodo_sociedad(text, uuid, text, text, text, text, text, date, date, text, jsonb, text, text, boolean, boolean, text) to authenticated;
grant execute on function public.validar_documento_personal_multisoc(text, text, text) to authenticated;
