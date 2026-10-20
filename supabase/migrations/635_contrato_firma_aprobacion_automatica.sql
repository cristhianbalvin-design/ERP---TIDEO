-- 635: Aprobacion automatica del contrato de renovacion al completarse la doble firma
-- (empresa + trabajador) y nombre de archivo "(firmado empresa y trabajador)".
-- Solo aplica cuando existe firma del empleador en estado firmado (flujo de renovacion digital);
-- las firmas solo-trabajador previas conservan su comportamiento (validacion manual por RRHH).

-- 1) Nucleo interno de aprobacion: replica la rama 'aprobado' de validar_documento_personal
--    (que exige auth.uid y no puede llamarse desde service_role). No se modifica validar_documento_personal.
create or replace function public._aprobar_documento_personal_interno(p_documento_id text, p_usuario_id text)
returns public.personal_documentos
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row              public.personal_documentos;
  v_empresa_id       text;
  v_captura_snapshot boolean := false;
  v_es_vinculado     boolean := false;
  v_tiene_sucesor    boolean := false;
  v_cond             jsonb;
begin
  update public.personal_documentos
     set estado_validacion = 'aprobado',
         motivo_rechazo    = null,
         revisado_por      = p_usuario_id,
         revisado_en       = now()
   where id = p_documento_id
  returning * into v_row;
  if not found then
    raise exception 'Documento no encontrado' using errcode = 'P0002';
  end if;
  v_empresa_id := v_row.empresa_id;

  update public.personal_documentos
     set activo = false
   where empresa_id  = v_empresa_id
     and personal_id = v_row.personal_id
     and id          <> p_documento_id
     and ((v_row.tipo_documento_id is not null and tipo_documento_id = v_row.tipo_documento_id)
          or tipo_doc = v_row.tipo_doc);

  update public.personal_documentos set activo = true where id = p_documento_id;
  v_row.activo := true;

  if v_row.tipo_documento_id is not null then
    select coalesce(t.captura_snapshot_laboral, false),
           t.documento_padre_tipo_id is not null,
           t.tipo_sucesor_id is not null
      into v_captura_snapshot, v_es_vinculado, v_tiene_sucesor
      from public.tipos_documento_empresa t
     where t.id = v_row.tipo_documento_id;
  end if;
  if not v_captura_snapshot then
    if lower(coalesce(v_row.tipo_doc, '')) like '%contrato%' then
      v_captura_snapshot := true;
    end if;
  end if;

  -- Renovacion: contrato vigente (no adenda, no primigenio) sincroniza la ficha
  if v_captura_snapshot and not v_tiene_sucesor and not v_es_vinculado then
    v_cond := coalesce(v_row.condiciones_laborales, '{}'::jsonb);
    if v_row.personal_tipo = 'operativo' then
      update public.personal_operativo
      set cargo             = coalesce(nullif(coalesce(v_cond ->> 'cargo_nombre', v_cond ->> 'cargo'), ''), cargo),
          cargo_id          = coalesce(nullif(v_cond ->> 'cargo_id', ''), cargo_id),
          sueldo_base       = coalesce(nullif(v_cond ->> 'remuneracion_base', '')::numeric, sueldo_base),
          monto_mensual     = coalesce(nullif(v_cond ->> 'remuneracion_base', '')::numeric, monto_mensual),
          tipo_contrato     = case
            when v_cond ->> 'tipo_contrato' = any (array['indefinido','plazo_fijo','obra_determinada','por_encargo'])
              then v_cond ->> 'tipo_contrato'
            when v_cond ->> 'tipo_contrato' = 'honorarios' then 'por_encargo'
            else tipo_contrato
          end,
          modalidad_contrato = case
            when v_cond ->> 'modalidad_contrato' = any (array['planilla','honorarios'])
              then v_cond ->> 'modalidad_contrato'
            when v_cond ->> 'tipo_contrato' = 'honorarios' then 'honorarios'
            else modalidad_contrato
          end,
          sede              = coalesce(nullif(coalesce(v_cond ->> 'sede_nombre', v_cond ->> 'sede'), ''), sede),
          sede_id           = coalesce(nullif(v_cond ->> 'sede_id', ''), sede_id),
          area              = coalesce(nullif(coalesce(v_cond ->> 'area_nombre', v_cond ->> 'area'), ''), area),
          area_id           = coalesce(nullif(v_cond ->> 'area_id', ''), area_id),
          regimen_jornada   = coalesce(nullif(v_cond ->> 'regimen_jornada', ''), regimen_jornada)
      where id = v_row.personal_id and empresa_id = v_empresa_id;
    else
      update public.personal_administrativo
      set cargo             = coalesce(nullif(coalesce(v_cond ->> 'cargo_nombre', v_cond ->> 'cargo'), ''), cargo),
          cargo_id          = coalesce(nullif(v_cond ->> 'cargo_id', ''), cargo_id),
          sueldo_base       = coalesce(nullif(v_cond ->> 'remuneracion_base', '')::numeric, sueldo_base),
          remuneracion      = coalesce(nullif(v_cond ->> 'remuneracion_base', '')::numeric, remuneracion),
          monto_mensual     = coalesce(nullif(v_cond ->> 'remuneracion_base', '')::numeric, monto_mensual),
          tipo_contrato     = case
            when v_cond ->> 'tipo_contrato' = any (array['indefinido','plazo_fijo','obra_determinada','por_encargo'])
              then v_cond ->> 'tipo_contrato'
            when v_cond ->> 'tipo_contrato' = 'honorarios' then 'por_encargo'
            else tipo_contrato
          end,
          modalidad_contrato = case
            when v_cond ->> 'modalidad_contrato' = any (array['planilla','honorarios'])
              then v_cond ->> 'modalidad_contrato'
            when v_cond ->> 'tipo_contrato' = 'honorarios' then 'honorarios'
            else modalidad_contrato
          end,
          modalidad         = coalesce(nullif(v_cond ->> 'modalidad', ''), modalidad),
          sede              = coalesce(nullif(coalesce(v_cond ->> 'sede_nombre', v_cond ->> 'sede'), ''), sede),
          sede_id           = coalesce(nullif(v_cond ->> 'sede_id', ''), sede_id),
          area              = coalesce(nullif(coalesce(v_cond ->> 'area_nombre', v_cond ->> 'area'), ''), area),
          area_id           = coalesce(nullif(v_cond ->> 'area_id', ''), area_id),
          regimen_jornada   = coalesce(nullif(v_cond ->> 'regimen_jornada', ''), regimen_jornada)
      where id = v_row.personal_id and empresa_id = v_empresa_id;
    end if;
  end if;
  return v_row;
end $function$;

revoke all on function public._aprobar_documento_personal_interno(text, text) from public, anon, authenticated;
grant execute on function public._aprobar_documento_personal_interno(text, text) to service_role;

-- 2) finalizar_firma_contrato: parte de pg_get_functiondef remoto vigente.
--    Cambios: nombre de archivo y aprobacion automatica cuando hay firma del empleador.
create or replace function public.finalizar_firma_contrato(p_solicitud_id uuid, p_pdf_firmado_path text, p_pdf_firmado_sha256 text, p_ip text, p_user_agent text, p_evidencia jsonb default '{}'::jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare s public.contrato_firma_solicitudes%rowtype; v_registro text;
        v_firmante_usuario text; v_aprobado boolean := false;
begin
  select * into s from public.contrato_firma_solicitudes where id = p_solicitud_id for update;
  if not found then raise exception 'Solicitud de firma no existe.' using errcode = 'P0002'; end if;
  if s.estado <> 'otp_enviado' or s.otp_verificado_en is null
     or s.otp_verificado_en < now() - interval '15 minutes' then
    raise exception 'La solicitud no tiene un OTP verificado vigente.' using errcode = '42501';
  end if;
  if s.expira_en < now() then
    raise exception 'La solicitud de firma expiro.' using errcode = '42501';
  end if;
  if p_pdf_firmado_path is null or p_pdf_firmado_sha256 is null
     or p_pdf_firmado_path not like '%/contratos-firmados/%' then
    raise exception 'Ruta o hash del PDF firmado invalido.' using errcode = '22023';
  end if;

  update public.contrato_firma_solicitudes
     set estado = 'firmado', firmado_en = now(), firmado_ip = p_ip, firmado_user_agent = p_user_agent,
         pdf_firmado_path = p_pdf_firmado_path, pdf_firmado_sha256 = p_pdf_firmado_sha256,
         otp_hash = null, updated_at = now()
   where id = s.id;

  update public.personal_documentos
     set archivo_url = p_pdf_firmado_path,
         bucket = s.pdf_bucket,
         nombre_archivo = case
           when nombre_archivo ~* ' \(firmado empresa\)\.pdf$'
             then regexp_replace(nombre_archivo, ' \(firmado empresa\)\.pdf$', '', 'i') || ' (firmado empresa y trabajador).pdf'
           else regexp_replace(nombre_archivo, '\.pdf$', '', 'i') || ' (firmado).pdf'
         end,
         estado_firma = 'firmado_trabajador',
         firma_solicitud_id = s.id
   where id = s.documento_id and empresa_id = s.empresa_id;
  if not found then
    raise exception 'Documento del contrato no encontrado para la solicitud.' using errcode = 'P0002';
  end if;

  insert into public.portal_contrato_firma_registros
    (empresa_id, contrato_documento_id, personal_id, personal_tipo, solicitud_id, canal_otp,
     hash_original, hash_firmado, tsa_estado, firmado_ip, pdf_firmado_path, pdf_firmado_sha256, evidencia)
  values
    (s.empresa_id, s.documento_id, s.personal_id, s.personal_tipo, s.id, array_to_string(s.canales, '+'),
     s.pdf_sha256, p_pdf_firmado_sha256, 'no_configurado', p_ip, p_pdf_firmado_path, p_pdf_firmado_sha256,
     coalesce(p_evidencia, '{}'::jsonb)
       || jsonb_build_object('user_agent', p_user_agent, 'metodo', 'enlace_otp', 'firmado_en', now()))
  returning id into v_registro;

  -- Doble firma completa (empresa firmo el mismo PDF que firmo el trabajador): aprobacion automatica
  select f.firmante_usuario_id::text into v_firmante_usuario
    from public.contrato_firma_empleador f
   where f.documento_id = s.documento_id and f.estado = 'firmado' and f.pdf_firmado_path = s.pdf_path
   limit 1;
  if found and exists (select 1 from public.personal_documentos d
                        where d.id = s.documento_id and d.estado_validacion = 'pendiente') then
    perform public._aprobar_documento_personal_interno(s.documento_id, v_firmante_usuario);
    v_aprobado := true;
  end if;

  return jsonb_build_object('ok', true, 'registro_id', v_registro, 'firmado_en', now(), 'aprobado_automatico', v_aprobado);
end $function$;

revoke all on function public.finalizar_firma_contrato(uuid, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.finalizar_firma_contrato(uuid, text, text, text, text, jsonb) to service_role;

-- 3) Comprobacion
do $$
begin
  if not exists (select 1 from pg_proc where proname = '_aprobar_documento_personal_interno') then
    raise exception '635: falta _aprobar_documento_personal_interno';
  end if;
  if position('aprobado_automatico' in pg_get_functiondef('public.finalizar_firma_contrato(uuid,text,text,text,text,jsonb)'::regprocedure)) = 0 then
    raise exception '635: finalizar_firma_contrato no quedo actualizado';
  end if;
  if has_function_privilege('authenticated', 'public._aprobar_documento_personal_interno(text,text)', 'execute') then
    raise exception '635: authenticated no debe ejecutar el nucleo interno';
  end if;
end $$;
