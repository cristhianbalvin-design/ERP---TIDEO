-- Bloque A: corrige rutas activas que podian crear sociedad_id NULL.
-- No instala la defensa generica del bloque B ni modifica RLS.

-- ---------------------------------------------------------------------------
-- 1. Conservar las implementaciones legacy y anteponerles un guard por tenant.
-- ---------------------------------------------------------------------------

alter function public.crear_hoja_costeo(text, text, text, text, text, text, date, numeric, text, jsonb, jsonb, jsonb, jsonb, numeric, numeric, numeric, numeric, numeric, numeric, numeric)
  rename to _crear_hoja_costeo_impl_414;
alter function public.aprobar_hoja_costeo_y_crear_cotizacion(text, text, text, text, text, text)
  rename to _aprobar_hoja_costeo_y_crear_cotizacion_impl_414;
alter function public.guardar_nomina_detalle_periodo(text, text, jsonb)
  rename to _guardar_nomina_detalle_periodo_impl_414;
alter function public.subir_version_documento(text, text, text, text, text, text, uuid, date, date, text, text, text, jsonb, text, jsonb, date, text, text, text, boolean, boolean, text)
  rename to _subir_version_documento_impl_414;
alter function public.renovar_documento(text, text, text, text, text, text, date, date, text, text, text, jsonb, text, jsonb, date, text, text)
  rename to _renovar_documento_impl_414;
alter function public.nuevo_contrato_periodo(text, text, text, text, text, text, date, date, text, jsonb, text, text, boolean, boolean, text)
  rename to _nuevo_contrato_periodo_impl_414;

revoke all on function public._crear_hoja_costeo_impl_414(text, text, text, text, text, text, date, numeric, text, jsonb, jsonb, jsonb, jsonb, numeric, numeric, numeric, numeric, numeric, numeric, numeric) from public, anon, authenticated, service_role;
revoke all on function public._aprobar_hoja_costeo_y_crear_cotizacion_impl_414(text, text, text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public._guardar_nomina_detalle_periodo_impl_414(text, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public._subir_version_documento_impl_414(text, text, text, text, text, text, uuid, date, date, text, text, text, jsonb, text, jsonb, date, text, text, text, boolean, boolean, text) from public, anon, authenticated, service_role;
revoke all on function public._renovar_documento_impl_414(text, text, text, text, text, text, date, date, text, text, text, jsonb, text, jsonb, date, text, text) from public, anon, authenticated, service_role;
revoke all on function public._nuevo_contrato_periodo_impl_414(text, text, text, text, text, text, date, date, text, jsonb, text, text, boolean, boolean, text) from public, anon, authenticated, service_role;

create function public.crear_hoja_costeo(
  p_empresa_id text,
  p_id text,
  p_numero text,
  p_oportunidad_id text default null,
  p_cuenta_id text default null,
  p_responsable_costeo text default null,
  p_fecha date default current_date,
  p_margen_objetivo_pct numeric default 35,
  p_notas text default null,
  p_mano_obra jsonb default '[]'::jsonb,
  p_materiales jsonb default '[]'::jsonb,
  p_servicios_terceros jsonb default '[]'::jsonb,
  p_logistica jsonb default '[]'::jsonb,
  p_total_mano_obra numeric default 0,
  p_total_materiales numeric default 0,
  p_total_servicios_terceros numeric default 0,
  p_total_logistica numeric default 0,
  p_costo_total numeric default 0,
  p_precio_sugerido_sin_igv numeric default 0,
  p_precio_sugerido_total numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tienes acceso al tenant %.', p_empresa_id;
  end if;
  if exists (select 1 from public.empresas where id = p_empresa_id and multisociedad_habilitado = true) then
    raise exception 'La RPC legacy crear_hoja_costeo no admite tenants multisociedad. Usa crear_hoja_costeo_sociedad.';
  end if;
  return public._crear_hoja_costeo_impl_414(
    p_empresa_id, p_id, p_numero, p_oportunidad_id, p_cuenta_id,
    p_responsable_costeo, p_fecha, p_margen_objetivo_pct, p_notas,
    p_mano_obra, p_materiales, p_servicios_terceros, p_logistica,
    p_total_mano_obra, p_total_materiales, p_total_servicios_terceros,
    p_total_logistica, p_costo_total, p_precio_sugerido_sin_igv,
    p_precio_sugerido_total
  );
end;
$$;

create function public.aprobar_hoja_costeo_y_crear_cotizacion(
  p_empresa_id text,
  p_hoja_costeo_id text,
  p_cotizacion_id text,
  p_numero text,
  p_moneda text default 'PEN',
  p_validez text default '30 dias'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tienes acceso al tenant %.', p_empresa_id;
  end if;
  if exists (select 1 from public.empresas where id = p_empresa_id and multisociedad_habilitado = true) then
    raise exception 'La RPC legacy de aprobacion no admite tenants multisociedad. Usa aprobar_hoja_costeo_y_crear_cotizacion_sociedad.';
  end if;
  return public._aprobar_hoja_costeo_y_crear_cotizacion_impl_414(
    p_empresa_id, p_hoja_costeo_id, p_cotizacion_id, p_numero, p_moneda, p_validez
  );
end;
$$;

create function public.guardar_nomina_detalle_periodo(
  p_empresa_id text,
  p_periodo_id text,
  p_filas jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tienes acceso al tenant %.', p_empresa_id;
  end if;
  if exists (select 1 from public.empresas where id = p_empresa_id and multisociedad_habilitado = true) then
    raise exception 'La RPC legacy de nomina no admite tenants multisociedad. Usa guardar_nomina_detalle_periodo_sociedad.';
  end if;
  return public._guardar_nomina_detalle_periodo_impl_414(p_empresa_id, p_periodo_id, p_filas);
end;
$$;

create function public.subir_version_documento(
  p_empresa_id text,
  p_personal_id text,
  p_personal_tipo text,
  p_tipo_doc text,
  p_nombre_archivo text,
  p_archivo_url text,
  p_periodo_grupo_id uuid,
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
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'Acceso denegado al tenant';
  end if;
  if exists (select 1 from public.empresas where id = p_empresa_id and multisociedad_habilitado = true) then
    raise exception 'La RPC legacy subir_version_documento no admite tenants multisociedad.';
  end if;
  return public._subir_version_documento_impl_414(
    p_empresa_id, p_personal_id, p_personal_tipo, p_tipo_doc,
    p_nombre_archivo, p_archivo_url, p_periodo_grupo_id, p_fecha_emision,
    p_fecha_vencimiento, p_notas, p_subido_desde, p_tipo_documento_id,
    p_condiciones_laborales, p_contrato_referencia_id, p_adenda_cambios,
    p_fecha_vigencia_cambio, p_seccion_documental, p_contrato_periodo_id,
    p_origen, p_es_indefinido, p_forzar_override, p_motivo_override
  );
end;
$$;

create function public.renovar_documento(
  p_empresa_id text,
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
  p_contrato_periodo_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'Acceso denegado al tenant';
  end if;
  if exists (select 1 from public.empresas where id = p_empresa_id and multisociedad_habilitado = true) then
    raise exception 'La RPC legacy renovar_documento no admite tenants multisociedad.';
  end if;
  return public._renovar_documento_impl_414(
    p_empresa_id, p_personal_id, p_personal_tipo, p_tipo_doc,
    p_nombre_archivo, p_archivo_url, p_fecha_emision, p_fecha_vencimiento,
    p_notas, p_subido_desde, p_tipo_documento_id, p_condiciones_laborales,
    p_contrato_referencia_id, p_adenda_cambios, p_fecha_vigencia_cambio,
    p_seccion_documental, p_contrato_periodo_id
  );
end;
$$;

create function public.nuevo_contrato_periodo(
  p_empresa_id text,
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
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'Acceso denegado al tenant';
  end if;
  if exists (select 1 from public.empresas where id = p_empresa_id and multisociedad_habilitado = true) then
    raise exception 'La RPC legacy nuevo_contrato_periodo no admite tenants multisociedad. Usa nuevo_contrato_periodo_sociedad.';
  end if;
  return public._nuevo_contrato_periodo_impl_414(
    p_empresa_id, p_personal_id, p_personal_tipo, p_tipo_doc,
    p_nombre_archivo, p_archivo_url, p_fecha_emision, p_fecha_vencimiento,
    p_notas, p_condiciones_laborales, p_tipo_documento_id,
    p_periodo_id_anterior, p_es_indefinido, p_forzar_override,
    p_motivo_override
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Nucleo documental: una sola insercion, con sociedad desde el inicio.
-- ---------------------------------------------------------------------------

create function public.subir_documento_personal_nucleo_414(
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
  v_usuario_id text;
  v_version integer;
  v_row public.personal_documentos;
  v_seccion text := coalesce(nullif(p_seccion_documental, ''), 'adicional');
  v_periodo_id text;
  v_es_contractual boolean;
  v_aprobados integer;
  v_permite_firma boolean;
  v_predecesor_id text;
  v_predecesor_nombre text;
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'Acceso denegado al tenant';
  end if;

  if p_forzar_override and not public.personal_documentos_puede_forzar_retro(p_empresa_id, p_personal_tipo) then
    raise exception 'No tiene autorizacion para forzar cambios retroactivos sobre nomina ya procesada.';
  end if;

  if p_origen = 'backoffice' then
    select id, nombre into v_predecesor_id, v_predecesor_nombre
    from public.tipos_documento_empresa
    where empresa_id = p_empresa_id
      and tipo_sucesor_id = (
        select id from public.tipos_documento_empresa
        where empresa_id = p_empresa_id
          and (id = p_tipo_documento_id or nombre = p_tipo_doc or codigo = p_tipo_doc)
        limit 1
      )
    limit 1;

    if v_predecesor_id is not null then
      select count(*) into v_aprobados
      from public.personal_documentos
      where empresa_id = p_empresa_id
        and sociedad_id is not distinct from p_sociedad_id
        and personal_id = p_personal_id
        and (tipo_documento_id = v_predecesor_id or tipo_doc = v_predecesor_id)
        and estado_validacion = 'aprobado'
        and activo = true;
      if v_aprobados = 0 then
        raise exception 'Debe existir un % aprobado antes de subir este documento.', v_predecesor_nombre;
      end if;
    end if;
  end if;

  if p_origen = 'portal_empleado' then
    select count(*) into v_aprobados
    from public.personal_documentos
    where empresa_id = p_empresa_id
      and sociedad_id is not distinct from p_sociedad_id
      and personal_id = p_personal_id
      and tipo_doc = p_tipo_doc
      and estado_validacion = 'aprobado'
      and activo = true;
    if v_aprobados = 0 then
      raise exception 'No existe contrato base aprobado. El primer contrato debe ser cargado por RRHH.';
    end if;

    select permite_firma_trabajador into v_permite_firma
    from public.tipos_documento_empresa
    where empresa_id = p_empresa_id
      and (id = p_tipo_documento_id or nombre = p_tipo_doc or codigo = p_tipo_doc)
    limit 1;
    if v_permite_firma is false then
      raise exception 'Este tipo de documento no permite la subida de versiones firmadas desde el portal.';
    end if;
  end if;

  select id into v_usuario_id
  from public.usuarios
  where id = auth.uid()::text
  limit 1;

  v_periodo_id := p_contrato_periodo_id;
  if v_periodo_id is null and p_contrato_referencia_id is not null then
    select contrato_periodo_id into v_periodo_id
    from public.personal_documentos
    where id = p_contrato_referencia_id
      and empresa_id = p_empresa_id
      and sociedad_id is not distinct from p_sociedad_id;
  end if;

  if v_periodo_id is null and p_tipo_documento_id is not null then
    select contrato_periodo_id into v_periodo_id
    from public.personal_documentos
    where empresa_id = p_empresa_id
      and sociedad_id is not distinct from p_sociedad_id
      and personal_id = p_personal_id
      and tipo_documento_id = p_tipo_documento_id
      and activo = true
    order by version desc
    limit 1;
  end if;

  if v_periodo_id is null then
    v_es_contractual := false;
    if p_tipo_documento_id is not null then
      select coalesce(t.captura_snapshot_laboral, false) into v_es_contractual
      from public.tipos_documento_empresa t
      where t.id = p_tipo_documento_id;
    end if;
    if not v_es_contractual then
      v_es_contractual := lower(coalesce(p_tipo_doc, '')) like '%contrato%'
                        or lower(coalesce(p_tipo_doc, '')) like '%adenda%';
    end if;
    if v_es_contractual then
      v_periodo_id := 'cper_' || gen_random_uuid()::text;
    end if;
  end if;

  select coalesce(max(version), 0) + 1 into v_version
  from public.personal_documentos
  where empresa_id = p_empresa_id
    and sociedad_id is not distinct from p_sociedad_id
    and personal_id = p_personal_id
    and (
      (p_tipo_documento_id is not null and tipo_documento_id = p_tipo_documento_id)
      or tipo_doc = p_tipo_doc
    );

  insert into public.personal_documentos (
    empresa_id, sociedad_id, personal_id, personal_tipo,
    tipo_doc, tipo_documento_id, nombre_archivo, archivo_url,
    fecha_emision, fecha_vencimiento, version, activo,
    estado_validacion, notas, subido_por, subido_desde,
    condiciones_laborales, contrato_referencia_id, adenda_cambios,
    fecha_vigencia_cambio, seccion_documental, contrato_periodo_id,
    periodo_fecha_inicio, periodo_fecha_fin, es_indefinido,
    retro_override_por, retro_override_motivo
  ) values (
    p_empresa_id, p_sociedad_id, p_personal_id, p_personal_tipo,
    p_tipo_doc, p_tipo_documento_id, p_nombre_archivo, p_archivo_url,
    p_fecha_emision, p_fecha_vencimiento, v_version, false,
    'pendiente', p_notas, v_usuario_id, p_subido_desde,
    coalesce(p_condiciones_laborales, '{}'::jsonb), p_contrato_referencia_id,
    coalesce(p_adenda_cambios, '{}'::jsonb), p_fecha_vigencia_cambio,
    v_seccion, v_periodo_id, p_fecha_emision, p_fecha_vencimiento,
    p_es_indefinido,
    case when p_forzar_override then v_usuario_id else null end,
    case when p_forzar_override then p_motivo_override else null end
  )
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.subir_documento_personal(
  p_empresa_id text,
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
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'Acceso denegado al tenant';
  end if;
  if exists (select 1 from public.empresas where id = p_empresa_id and multisociedad_habilitado = true) then
    raise exception 'La RPC legacy subir_documento_personal no admite tenants multisociedad. Usa subir_documento_personal_sociedad.';
  end if;
  return public.subir_documento_personal_nucleo_414(
    p_empresa_id, null, p_personal_id, p_personal_tipo, p_tipo_doc,
    p_nombre_archivo, p_archivo_url, p_fecha_emision, p_fecha_vencimiento,
    p_notas, p_subido_desde, p_tipo_documento_id, p_condiciones_laborales,
    p_contrato_referencia_id, p_adenda_cambios, p_fecha_vigencia_cambio,
    p_seccion_documental, p_contrato_periodo_id, p_origen,
    p_es_indefinido, p_forzar_override, p_motivo_override
  );
end;
$$;

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
  v_sociedad_contrato uuid;
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

  return public.subir_documento_personal_nucleo_414(
    p_empresa_id, p_sociedad_id, p_personal_id, p_personal_tipo,
    p_tipo_doc, p_nombre_archivo, p_archivo_url, p_fecha_emision,
    p_fecha_vencimiento, p_notas, p_subido_desde, p_tipo_documento_id,
    p_condiciones_laborales, p_contrato_referencia_id, p_adenda_cambios,
    p_fecha_vigencia_cambio, p_seccion_documental, p_contrato_periodo_id,
    p_origen, p_es_indefinido, p_forzar_override, p_motivo_override
  );
end;
$$;

-- Los wrappers siguen siendo las unicas entradas autenticadas. Las
-- implementaciones y el nucleo quedan invocables solo por su propietario.
revoke execute on function public.crear_hoja_costeo(text, text, text, text, text, text, date, numeric, text, jsonb, jsonb, jsonb, jsonb, numeric, numeric, numeric, numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.crear_hoja_costeo(text, text, text, text, text, text, date, numeric, text, jsonb, jsonb, jsonb, jsonb, numeric, numeric, numeric, numeric, numeric, numeric, numeric) to authenticated, service_role;
revoke execute on function public.aprobar_hoja_costeo_y_crear_cotizacion(text, text, text, text, text, text) from public, anon;
grant execute on function public.aprobar_hoja_costeo_y_crear_cotizacion(text, text, text, text, text, text) to authenticated, service_role;
revoke execute on function public.guardar_nomina_detalle_periodo(text, text, jsonb) from public, anon;
grant execute on function public.guardar_nomina_detalle_periodo(text, text, jsonb) to authenticated, service_role;
revoke execute on function public.subir_version_documento(text, text, text, text, text, text, uuid, date, date, text, text, text, jsonb, text, jsonb, date, text, text, text, boolean, boolean, text) from public, anon;
grant execute on function public.subir_version_documento(text, text, text, text, text, text, uuid, date, date, text, text, text, jsonb, text, jsonb, date, text, text, text, boolean, boolean, text) to authenticated, service_role;
revoke execute on function public.renovar_documento(text, text, text, text, text, text, date, date, text, text, text, jsonb, text, jsonb, date, text, text) from public, anon;
grant execute on function public.renovar_documento(text, text, text, text, text, text, date, date, text, text, text, jsonb, text, jsonb, date, text, text) to authenticated, service_role;
revoke execute on function public.nuevo_contrato_periodo(text, text, text, text, text, text, date, date, text, jsonb, text, text, boolean, boolean, text) from public, anon;
grant execute on function public.nuevo_contrato_periodo(text, text, text, text, text, text, date, date, text, jsonb, text, text, boolean, boolean, text) to authenticated, service_role;
revoke execute on function public.subir_documento_personal(text, text, text, text, text, text, date, date, text, text, text, jsonb, text, jsonb, date, text, text, text, boolean, boolean, text) from public, anon;
grant execute on function public.subir_documento_personal(text, text, text, text, text, text, date, date, text, text, text, jsonb, text, jsonb, date, text, text, text, boolean, boolean, text) to authenticated, service_role;
revoke execute on function public.subir_documento_personal_sociedad(text, uuid, text, text, text, text, text, date, date, text, text, text, jsonb, text, jsonb, date, text, text, text, boolean, boolean, text) from public, anon;
grant execute on function public.subir_documento_personal_sociedad(text, uuid, text, text, text, text, text, date, date, text, text, text, jsonb, text, jsonb, date, text, text, text, boolean, boolean, text) to authenticated, service_role;

revoke execute on function public.subir_documento_personal_nucleo_414(text, uuid, text, text, text, text, text, date, date, text, text, text, jsonb, text, jsonb, date, text, text, text, boolean, boolean, text) from public;
revoke execute on function public.subir_documento_personal_nucleo_414(text, uuid, text, text, text, text, text, date, date, text, text, text, jsonb, text, jsonb, date, text, text, text, boolean, boolean, text) from anon;
revoke execute on function public.subir_documento_personal_nucleo_414(text, uuid, text, text, text, text, text, date, date, text, text, text, jsonb, text, jsonb, date, text, text, text, boolean, boolean, text) from authenticated;
revoke execute on function public.subir_documento_personal_nucleo_414(text, uuid, text, text, text, text, text, date, date, text, text, text, jsonb, text, jsonb, date, text, text, text, boolean, boolean, text) from service_role;

select pg_notify('pgrst', 'reload schema');
