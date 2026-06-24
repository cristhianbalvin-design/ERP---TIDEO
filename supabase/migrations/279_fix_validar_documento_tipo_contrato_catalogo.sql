-- Al aprobar un Contrato Primigenio / contrato vigente / adenda, esta funcion
-- sincroniza el snapshot de condiciones_laborales hacia personal_operativo o
-- personal_administrativo. Desde la migracion 277 (Maestro de Tipos de
-- Contrato), el formulario captura el snapshot.tipo_contrato como el codigo
-- SUNAT del catalogo (ej. '1001' = "PLAZO FIJO - POR INICIO O INCREMENTO DE
-- ACTIVIDAD"), pero personal_operativo.tipo_contrato y
-- personal_administrativo.tipo_contrato siguen restringidos por un CHECK a
-- solo 4 valores legados ('indefinido','plazo_fijo','obra_determinada',
-- 'por_encargo'). Al aprobar, el UPDATE intentaba escribir el codigo SUNAT en
-- esa columna y violaba el CHECK -> 400 Bad Request, bloqueando la aprobacion
-- de cualquier documento que use el nuevo catalogo.
--
-- Fix 1: solo sincronizar tipo_contrato hacia la ficha cuando el valor del
-- snapshot es uno de los 4 valores legados que la columna acepta. El codigo
-- SUNAT preciso sigue disponible en el documento (condiciones_laborales), que
-- es su fuente de verdad legal; la ficha conserva su valor previo si el
-- snapshot trae un codigo del nuevo catalogo.
--
-- Fix 2: el bloque de personal_operativo tambien intentaba escribir
-- "modalidad", columna que no existe en esa tabla (solo existe
-- modalidad_contrato, que es un concepto distinto: planilla/honorarios). Esa
-- columna inexistente rompia el UPDATE con un error de SQL antes de llegar
-- siquiera al CHECK de tipo_contrato. personal_administrativo si tiene
-- "modalidad" (presencial/remoto/etc.), asi que ese bloque se deja igual.

create or replace function public.validar_documento_personal(p_documento_id text, p_decision text, p_motivo_rechazo text DEFAULT NULL::text)
 returns personal_documentos
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
          tipo_contrato   = case
            when v_cond ->> 'tipo_contrato' = any (array['indefinido','plazo_fijo','obra_determinada','por_encargo'])
              then v_cond ->> 'tipo_contrato'
            else tipo_contrato
          end,
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
          tipo_contrato   = case
            when v_cond ->> 'tipo_contrato' = any (array['indefinido','plazo_fijo','obra_determinada','por_encargo'])
              then v_cond ->> 'tipo_contrato'
            else tipo_contrato
          end,
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
$function$;

select pg_notify('pgrst', 'reload schema');
