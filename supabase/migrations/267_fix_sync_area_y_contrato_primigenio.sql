-- ============================================================================
-- 267 · Fix: sync de área en ficha + Contrato Primigenio no debe sobrescribir
-- la ficha vigente
-- ============================================================================
-- Bug 1: validar_documento_personal (245) sincronizaba cargo/sueldo/sede/
--        modalidad/tipo_contrato/regimen_jornada hacia personal_operativo y
--        personal_administrativo al aprobar un contrato, pero se olvidó de
--        area_id/area. Resultado: el Área vigente en la ficha nunca se
--        actualizaba aunque el contrato sí la capturara.
--
-- Bug 2: un "Contrato Primigenio" (tipo histórico, con tipo_sucesor_id
--        apuntando a "Contrato Laboral") es por definición una foto del
--        cargo/sueldo/sede que tenía el colaborador al momento de subirlo
--        ("se capturará el cargo y remuneración actual del trabajador").
--        Al aprobarlo, el RPC empujaba esos datos históricos de vuelta a la
--        ficha vigente, pudiendo borrar ascensos/cambios posteriores
--        (ej: promovido de Practicante a Operador, de Piura a Lima).
--        Ahora solo sincronizan la ficha los tipos sin tipo_sucesor_id
--        (el contrato vigente, ej. "Contrato Laboral") y las adendas.

-- Columna area_id (idempotente — puede que ya exista en el tenant)
alter table public.personal_operativo add column if not exists area_id text;
alter table public.personal_administrativo add column if not exists area_id text;

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
  v_tiene_sucesor    boolean := false;
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
      t.documento_padre_tipo_id is not null,
      t.tipo_sucesor_id is not null
    into v_captura_snapshot, v_es_vinculado, v_tiene_sucesor
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

  -- Un Contrato Primigenio (tiene tipo_sucesor_id) es histórico: captura el
  -- estado de la ficha al subirlo, pero no debe empujarlo de vuelta al
  -- aprobarlo. Solo el contrato vigente (sin sucesor) y las adendas sincronizan.
  if p_decision = 'aprobado' and v_captura_snapshot and not v_tiene_sucesor then
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
          area            = coalesce(nullif(coalesce(v_cond ->> 'area_nombre', v_cond ->> 'area'), ''), area),
          area_id         = coalesce(nullif(v_cond ->> 'area_id', ''), area_id),
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
          area            = coalesce(nullif(coalesce(v_cond ->> 'area_nombre', v_cond ->> 'area'), ''), area),
          area_id         = coalesce(nullif(v_cond ->> 'area_id', ''), area_id),
          regimen_jornada = coalesce(nullif(v_cond ->> 'regimen_jornada', ''), regimen_jornada)
      where id = v_row.personal_id and empresa_id = v_empresa_id;
    end if;
  end if;

  return v_row;
end;
$$;

revoke all on function public.validar_documento_personal(text,text,text) from public;
grant execute on function public.validar_documento_personal(text,text,text) to authenticated;

select pg_notify('pgrst', 'reload schema');
