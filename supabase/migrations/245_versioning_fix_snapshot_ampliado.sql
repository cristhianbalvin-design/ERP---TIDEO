-- 245 — Fix versioning + snapshot contractual ampliado
-- Tres cambios coordinados:
-- 1. subir_documento_personal: nuevo doc empieza activo=false (pendiente de validación)
-- 2. validar_documento_personal: al aprobar, activa el doc y desactiva los demás;
--    además actualiza regimen_jornada y area_id en la ficha
-- 3. corregir_documento_personal: nuevo RPC para editar metadatos sin nueva versión

-- ── 1. Columna area_id (separada en migración independiente para evitar FK fails)
-- Ver 246_area_id_personal.sql si la tabla areas_empresa ya existe en el tenant.

-- ── 2. Fix subir_documento_personal ──────────────────────────────────────────
-- Nuevo registro empieza activo=false. La activación ocurre solo al aprobar.

create or replace function public.subir_documento_personal(
  p_empresa_id              text,
  p_personal_id             text,
  p_personal_tipo           text,
  p_tipo_doc                text,
  p_nombre_archivo          text,
  p_archivo_url             text,
  p_fecha_emision           date     default null,
  p_fecha_vencimiento       date     default null,
  p_notas                   text     default null,
  p_subido_desde            text     default 'backoffice',
  p_tipo_documento_id       text     default null,
  p_condiciones_laborales   jsonb    default '{}'::jsonb,
  p_contrato_referencia_id  text     default null,
  p_adenda_cambios          jsonb    default '{}'::jsonb,
  p_fecha_vigencia_cambio   date     default null,
  p_seccion_documental      text     default null
)
returns public.personal_documentos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id text;
  v_version    integer;
  v_row        public.personal_documentos;
  v_seccion    text := coalesce(nullif(p_seccion_documental, ''), 'adicional');
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'Acceso denegado al tenant';
  end if;

  select id into v_usuario_id
  from public.usuarios
  where id = auth.uid()::text
  limit 1;

  -- Calcular siguiente número de versión sin tocar activo del anterior
  select coalesce(max(version), 0) + 1 into v_version
  from public.personal_documentos
  where empresa_id = p_empresa_id
    and personal_id = p_personal_id
    and (
      (p_tipo_documento_id is not null and tipo_documento_id = p_tipo_documento_id)
      or tipo_doc = p_tipo_doc
    );

  -- Insertar nuevo doc con activo=false — queda en pendiente hasta aprobación
  insert into public.personal_documentos (
    empresa_id, personal_id, personal_tipo,
    tipo_doc, tipo_documento_id,
    nombre_archivo, archivo_url,
    fecha_emision, fecha_vencimiento,
    version, activo, estado_validacion, notas,
    subido_por, subido_desde,
    condiciones_laborales, contrato_referencia_id,
    adenda_cambios, fecha_vigencia_cambio, seccion_documental
  ) values (
    p_empresa_id, p_personal_id, p_personal_tipo,
    p_tipo_doc, p_tipo_documento_id,
    p_nombre_archivo, p_archivo_url,
    p_fecha_emision, p_fecha_vencimiento,
    v_version, false, 'pendiente', p_notas,
    v_usuario_id, p_subido_desde,
    coalesce(p_condiciones_laborales, '{}'::jsonb), p_contrato_referencia_id,
    coalesce(p_adenda_cambios, '{}'::jsonb), p_fecha_vigencia_cambio, v_seccion
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.subir_documento_personal(text,text,text,text,text,text,date,date,text,text,text,jsonb,text,jsonb,date,text) from public;
grant execute on function public.subir_documento_personal(text,text,text,text,text,text,date,date,text,text,text,jsonb,text,jsonb,date,text) to authenticated;

-- ── 3. Fix validar_documento_personal ────────────────────────────────────────
-- Al aprobar: desactiva todos los del mismo tipo + activa el aprobado.
-- Actualiza ficha con todos los campos del snapshot incluyendo regimen_jornada y area_id.

create or replace function public.validar_documento_personal(
  p_documento_id   text,
  p_decision       text,
  p_motivo_rechazo text default null
)
returns public.personal_documentos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id       text;
  v_empresa_id       text;
  v_row              public.personal_documentos;
  v_captura_snapshot boolean := false;
  v_es_vinculado     boolean := false;
  v_cond             jsonb;
  v_cambios          jsonb;
  v_patch            jsonb;
  v_aplicar          boolean;
begin
  select empresa_id into v_empresa_id
  from public.personal_documentos
  where id = p_documento_id;

  if not found then
    raise exception 'Documento no encontrado';
  end if;

  if not public.usuario_tiene_empresa(v_empresa_id) then
    raise exception 'Acceso denegado al tenant';
  end if;

  if p_decision not in ('aprobado', 'rechazado') then
    raise exception 'Decision invalida. Use aprobado o rechazado';
  end if;

  select id into v_usuario_id
  from public.usuarios
  where id = auth.uid()::text
  limit 1;

  update public.personal_documentos
  set estado_validacion = p_decision,
      motivo_rechazo    = case when p_decision = 'rechazado' then p_motivo_rechazo else null end,
      revisado_por      = v_usuario_id,
      revisado_en       = now()
  where id = p_documento_id
  returning * into v_row;

  -- Cambio de activo: solo al aprobar
  if p_decision = 'aprobado' then
    -- Desactivar todos los demás del mismo colaborador + tipo
    update public.personal_documentos
    set activo = false
    where empresa_id  = v_empresa_id
      and personal_id = v_row.personal_id
      and id          <> p_documento_id
      and (
        (v_row.tipo_documento_id is not null and tipo_documento_id = v_row.tipo_documento_id)
        or tipo_doc = v_row.tipo_doc
      );

    -- Activar el doc recién aprobado
    update public.personal_documentos
    set activo = true
    where id = p_documento_id;

    v_row.activo := true;
  end if;

  -- Resolver si captura snapshot desde el catálogo
  if v_row.tipo_documento_id is not null then
    select
      coalesce(t.captura_snapshot_laboral, false),
      t.documento_padre_tipo_id is not null
    into v_captura_snapshot, v_es_vinculado
    from public.tipos_documento_empresa t
    where t.id = v_row.tipo_documento_id;
  end if;

  -- Fallback por nombre para tipos sin tipo_documento_id
  if not v_captura_snapshot then
    if lower(coalesce(v_row.tipo_doc, '')) like '%contrato%'
       or lower(coalesce(v_row.tipo_doc, '')) like '%adenda%' then
      v_captura_snapshot := true;
      v_es_vinculado := lower(coalesce(v_row.tipo_doc, '')) like '%adenda%';
    end if;
  end if;

  if p_decision = 'aprobado' and v_captura_snapshot then
    v_cond    := coalesce(v_row.condiciones_laborales, '{}'::jsonb);
    v_cambios := coalesce(v_row.adenda_cambios, '{}'::jsonb);
    v_aplicar := v_row.fecha_vigencia_cambio is null or v_row.fecha_vigencia_cambio <= current_date;

    if v_es_vinculado then
      if not v_aplicar then
        return v_row;
      end if;
      -- Documento vinculado (adenda): aplicar solo campos marcados como cambiados
      v_patch := '{}'::jsonb;
      if coalesce((v_cambios ->> 'cargo')::boolean, false) then
        v_patch := v_patch || jsonb_build_object(
          'cargo', v_cond ->> 'cargo',
          'cargo_id', v_cond ->> 'cargo_id',
          'cargo_nombre', coalesce(v_cond ->> 'cargo_nombre', v_cond ->> 'cargo')
        );
      end if;
      if coalesce((v_cambios ->> 'remuneracion')::boolean, false) then
        v_patch := v_patch || jsonb_build_object('remuneracion_base', v_cond ->> 'remuneracion_base');
      end if;
      if coalesce((v_cambios ->> 'modalidad')::boolean, false) then
        v_patch := v_patch || jsonb_build_object('modalidad', v_cond ->> 'modalidad');
      end if;
      if coalesce((v_cambios ->> 'sede')::boolean, false) then
        v_patch := v_patch || jsonb_build_object(
          'sede', v_cond ->> 'sede',
          'sede_id', v_cond ->> 'sede_id',
          'sede_nombre', coalesce(v_cond ->> 'sede_nombre', v_cond ->> 'sede')
        );
      end if;
      v_cond := v_patch;
    end if;

    if v_row.personal_tipo = 'operativo' then
      update public.personal_operativo
      set cargo           = coalesce(nullif(coalesce(v_cond ->> 'cargo_nombre', v_cond ->> 'cargo'), ''), cargo),
          cargo_id        = coalesce(nullif(v_cond ->> 'cargo_id', ''), cargo_id),
          sueldo_base     = coalesce(nullif(v_cond ->> 'remuneracion_base', '')::numeric, sueldo_base),
          monto_mensual   = coalesce(nullif(v_cond ->> 'remuneracion_base', '')::numeric, monto_mensual),
          tipo_contrato   = coalesce(nullif(v_cond ->> 'tipo_contrato', ''), tipo_contrato),
          modalidad       = coalesce(nullif(v_cond ->> 'modalidad', ''), modalidad),
          sede            = coalesce(nullif(coalesce(v_cond ->> 'sede_nombre', v_cond ->> 'sede'), ''), sede),
          sede_id         = coalesce(nullif(v_cond ->> 'sede_id', ''), sede_id),
          regimen_jornada = coalesce(nullif(v_cond ->> 'regimen_jornada', ''), regimen_jornada)
      where id = v_row.personal_id and empresa_id = v_empresa_id;
    else
      update public.personal_administrativo
      set cargo           = coalesce(nullif(coalesce(v_cond ->> 'cargo_nombre', v_cond ->> 'cargo'), ''), cargo),
          cargo_id        = coalesce(nullif(v_cond ->> 'cargo_id', ''), cargo_id),
          sueldo_base     = coalesce(nullif(v_cond ->> 'remuneracion_base', '')::numeric, sueldo_base),
          remuneracion    = coalesce(nullif(v_cond ->> 'remuneracion_base', '')::numeric, remuneracion),
          monto_mensual   = coalesce(nullif(v_cond ->> 'remuneracion_base', '')::numeric, monto_mensual),
          tipo_contrato   = coalesce(nullif(v_cond ->> 'tipo_contrato', ''), tipo_contrato),
          modalidad       = coalesce(nullif(v_cond ->> 'modalidad', ''), modalidad),
          sede            = coalesce(nullif(coalesce(v_cond ->> 'sede_nombre', v_cond ->> 'sede'), ''), sede),
          sede_id         = coalesce(nullif(v_cond ->> 'sede_id', ''), sede_id),
          regimen_jornada = coalesce(nullif(v_cond ->> 'regimen_jornada', ''), regimen_jornada)
      where id = v_row.personal_id and empresa_id = v_empresa_id;
    end if;
  end if;

  return v_row;
end;
$$;

revoke all on function public.validar_documento_personal(text,text,text) from public;
grant execute on function public.validar_documento_personal(text,text,text) to authenticated;

-- ── 4. Nuevo RPC: corregir_documento_personal ─────────────────────────────────
-- Actualiza metadatos de un documento existente sin crear nueva versión.
-- Si p_archivo_url no es null, actualiza también el archivo.

create or replace function public.corregir_documento_personal(
  p_documento_id          text,
  p_fecha_emision         date     default null,
  p_fecha_vencimiento     date     default null,
  p_condiciones_laborales jsonb    default null,
  p_notas                 text     default null,
  p_archivo_url           text     default null,
  p_nombre_archivo        text     default null
)
returns public.personal_documentos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id text;
  v_row        public.personal_documentos;
begin
  select empresa_id into v_empresa_id
  from public.personal_documentos
  where id = p_documento_id;

  if not found then
    raise exception 'Documento no encontrado';
  end if;

  if not public.usuario_tiene_empresa(v_empresa_id) then
    raise exception 'Acceso denegado al tenant';
  end if;

  update public.personal_documentos
  set fecha_emision           = coalesce(p_fecha_emision, fecha_emision),
      fecha_vencimiento       = p_fecha_vencimiento,
      condiciones_laborales   = coalesce(p_condiciones_laborales, condiciones_laborales),
      notas                   = p_notas,
      archivo_url             = coalesce(p_archivo_url, archivo_url),
      nombre_archivo          = coalesce(p_nombre_archivo, nombre_archivo)
  where id = p_documento_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.corregir_documento_personal(text,date,date,jsonb,text,text,text) from public;
grant execute on function public.corregir_documento_personal(text,date,date,jsonb,text,text,text) to authenticated;

-- ── 5. Limpieza de activo en registros históricos ────────────────────────────
-- Para cada colaborador+tipo, deja activo=true solo en el aprobado más reciente.
-- Los pendientes quedan activo=false hasta que sean aprobados.
-- NOTA: ejecutar manualmente en Supabase tras verificar los IDs afectados.
--
-- UPDATE public.personal_documentos pd
-- SET activo = false
-- WHERE activo = true
--   AND estado_validacion = 'pendiente';
--
-- UPDATE public.personal_documentos pd
-- SET activo = true
-- WHERE id IN (
--   SELECT DISTINCT ON (empresa_id, personal_id, tipo_doc) id
--   FROM public.personal_documentos
--   WHERE estado_validacion = 'aprobado'
--   ORDER BY empresa_id, personal_id, tipo_doc, version DESC
-- );

select pg_notify('pgrst', 'reload schema');
