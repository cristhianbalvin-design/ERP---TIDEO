-- 631_contrato_firma_electronica.sql
-- Firma electrónica simple (enlace + OTP) para renovaciones de contrato de personal.
-- Aditiva. El OTP y el token se guardan solo como hash. Las escrituras de firma pasan
-- por RPC SECURITY DEFINER ejecutables únicamente por service_role (edge functions).
-- Tras firmarse, el contrato queda bloqueado contra reemplazo y borrado (BD y Storage).

-- 1) Columnas aditivas ---------------------------------------------------------------
alter table public.personal_documentos
  add column if not exists firma_solicitud_id uuid;

alter table public.portal_contrato_firma_registros
  add column if not exists solicitud_id uuid,
  add column if not exists firmado_ip text,
  add column if not exists pdf_firmado_path text,
  add column if not exists pdf_firmado_sha256 text;

-- 2) Solicitudes de firma --------------------------------------------------------------
create table if not exists public.contrato_firma_solicitudes (
  id uuid primary key default gen_random_uuid(),
  empresa_id text not null,
  sociedad_id uuid,
  personal_id text not null,
  personal_tipo text not null check (personal_tipo in ('operativo','administrativo')),
  documento_id text not null,
  pdf_bucket text not null default 'documentos-privados',
  pdf_path text not null,
  pdf_sha256 text not null,
  token_hash text not null,
  canales text[] not null default '{}',
  destino_email_mask text,
  destino_telefono_mask text,
  otp_hash text,
  otp_expira_en timestamptz,
  otp_intentos integer not null default 0,
  otp_envios integer not null default 0,
  otp_verificado_en timestamptz,
  estado text not null default 'pendiente'
    check (estado in ('pendiente','otp_enviado','firmado','expirado','anulado')),
  expira_en timestamptz not null,
  firmado_en timestamptz,
  firmado_ip text,
  firmado_user_agent text,
  pdf_firmado_path text,
  pdf_firmado_sha256 text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contrato_firma_solicitudes_token_hash_key unique (token_hash)
);

create index if not exists idx_cfs_empresa_documento
  on public.contrato_firma_solicitudes (empresa_id, documento_id);
create index if not exists idx_cfs_empresa_personal
  on public.contrato_firma_solicitudes (empresa_id, personal_id);
create unique index if not exists uq_cfs_documento_vivo
  on public.contrato_firma_solicitudes (documento_id)
  where estado in ('pendiente','otp_enviado');

alter table public.contrato_firma_solicitudes enable row level security;

drop policy if exists cfs_select on public.contrato_firma_solicitudes;
create policy cfs_select on public.contrato_firma_solicitudes
  for select using (
    public.usuario_tiene_empresa(empresa_id)
    or public.es_mi_personal_rrhh(empresa_id, personal_id)
  );

-- Sin INSERT/UPDATE/DELETE para clientes; sin lectura de token_hash ni otp_hash.
revoke all on table public.contrato_firma_solicitudes from anon, authenticated;
grant select (
  id, empresa_id, sociedad_id, personal_id, personal_tipo, documento_id,
  canales, destino_email_mask, destino_telefono_mask, estado, otp_envios,
  expira_en, firmado_en, pdf_sha256, pdf_firmado_path, pdf_firmado_sha256,
  created_at, updated_at
) on public.contrato_firma_solicitudes to authenticated;

comment on table public.contrato_firma_solicitudes is
  'Solicitudes de firma electrónica simple (enlace + OTP) de contratos de personal. token_hash y otp_hash son SHA-256; nunca se guarda el valor en claro.';

-- 3) Bloqueo del contrato firmado en personal_documentos ---------------------------------
create or replace function public.proteger_contrato_firmado()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    if old.firma_solicitud_id is not null and old.estado_firma = 'firmado_trabajador' then
      raise exception 'Contrato firmado electronicamente: no se puede eliminar (documento %).', old.id
        using errcode = '42501';
    end if;
    return old;
  end if;

  if old.firma_solicitud_id is not null and old.estado_firma = 'firmado_trabajador' then
    if row(new.archivo_url, new.bucket, new.nombre_archivo, new.tipo_doc, new.tipo_documento_id,
           new.personal_id, new.personal_tipo, new.empresa_id, new.sociedad_id,
           new.fecha_emision, new.fecha_vencimiento, new.periodo_fecha_inicio, new.periodo_fecha_fin,
           new.es_indefinido, new.contrato_periodo_id, new.contrato_referencia_id, new.version,
           new.estado_firma, new.firma_solicitud_id, new.condiciones_laborales)
       is distinct from
       row(old.archivo_url, old.bucket, old.nombre_archivo, old.tipo_doc, old.tipo_documento_id,
           old.personal_id, old.personal_tipo, old.empresa_id, old.sociedad_id,
           old.fecha_emision, old.fecha_vencimiento, old.periodo_fecha_inicio, old.periodo_fecha_fin,
           old.es_indefinido, old.contrato_periodo_id, old.contrato_referencia_id, old.version,
           old.estado_firma, old.firma_solicitud_id, old.condiciones_laborales)
    then
      raise exception 'Contrato firmado electronicamente: el documento no se puede modificar ni reemplazar (documento %).', old.id
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists aa_proteger_contrato_firmado on public.personal_documentos;
create trigger aa_proteger_contrato_firmado
  before update or delete on public.personal_documentos
  for each row execute function public.proteger_contrato_firmado();

-- 4) RPC de OTP y cierre de firma (solo service_role) -------------------------------------
create or replace function public.registrar_otp_firma(p_solicitud_id uuid, p_otp text)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare s public.contrato_firma_solicitudes%rowtype;
begin
  select * into s from public.contrato_firma_solicitudes where id = p_solicitud_id for update;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'no_existe'); end if;
  if s.estado in ('firmado','anulado','expirado') then
    return jsonb_build_object('ok', false, 'motivo', s.estado);
  end if;
  if s.expira_en < now() then
    update public.contrato_firma_solicitudes set estado = 'expirado', updated_at = now() where id = s.id;
    return jsonb_build_object('ok', false, 'motivo', 'expirado');
  end if;
  if s.otp_envios >= 3 then
    return jsonb_build_object('ok', false, 'motivo', 'limite_envios');
  end if;
  update public.contrato_firma_solicitudes
     set otp_hash = encode(extensions.digest(p_otp || ':' || s.id::text, 'sha256'), 'hex'),
         otp_expira_en = now() + interval '10 minutes',
         otp_intentos = 0,
         otp_envios = otp_envios + 1,
         otp_verificado_en = null,
         estado = 'otp_enviado',
         updated_at = now()
   where id = s.id;
  return jsonb_build_object('ok', true, 'otp_expira_en', now() + interval '10 minutes', 'envios_restantes', 2 - s.otp_envios);
end $$;

create or replace function public.verificar_otp_firma(p_solicitud_id uuid, p_otp text)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare s public.contrato_firma_solicitudes%rowtype; v_hash text;
begin
  select * into s from public.contrato_firma_solicitudes where id = p_solicitud_id for update;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'no_existe'); end if;
  if s.estado <> 'otp_enviado' or s.otp_hash is null then
    return jsonb_build_object('ok', false, 'motivo', 'sin_otp_vigente');
  end if;
  if s.expira_en < now() then
    update public.contrato_firma_solicitudes set estado = 'expirado', otp_hash = null, updated_at = now() where id = s.id;
    return jsonb_build_object('ok', false, 'motivo', 'expirado');
  end if;
  if s.otp_expira_en < now() then
    update public.contrato_firma_solicitudes set otp_hash = null, updated_at = now() where id = s.id;
    return jsonb_build_object('ok', false, 'motivo', 'otp_expirado');
  end if;
  if s.otp_intentos >= 5 then
    update public.contrato_firma_solicitudes set otp_hash = null, updated_at = now() where id = s.id;
    return jsonb_build_object('ok', false, 'motivo', 'intentos_agotados');
  end if;
  v_hash := encode(extensions.digest(coalesce(p_otp, '') || ':' || s.id::text, 'sha256'), 'hex');
  if v_hash = s.otp_hash then
    update public.contrato_firma_solicitudes
       set otp_verificado_en = now(), otp_hash = null, updated_at = now()
     where id = s.id;
    return jsonb_build_object('ok', true);
  end if;
  update public.contrato_firma_solicitudes
     set otp_intentos = otp_intentos + 1,
         otp_hash = case when otp_intentos + 1 >= 5 then null else otp_hash end,
         updated_at = now()
   where id = s.id;
  return jsonb_build_object('ok', false, 'motivo', 'codigo_incorrecto', 'intentos_restantes', greatest(0, 4 - s.otp_intentos));
end $$;

create or replace function public.finalizar_firma_contrato(
  p_solicitud_id uuid,
  p_pdf_firmado_path text,
  p_pdf_firmado_sha256 text,
  p_ip text,
  p_user_agent text,
  p_evidencia jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare s public.contrato_firma_solicitudes%rowtype; v_registro text;
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
         nombre_archivo = regexp_replace(nombre_archivo, '\.pdf$', '', 'i') || ' (firmado).pdf',
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

  return jsonb_build_object('ok', true, 'registro_id', v_registro, 'firmado_en', now());
end $$;

revoke all on function public.registrar_otp_firma(uuid, text) from public, anon, authenticated;
revoke all on function public.verificar_otp_firma(uuid, text) from public, anon, authenticated;
revoke all on function public.finalizar_firma_contrato(uuid, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.registrar_otp_firma(uuid, text) to service_role;
grant execute on function public.verificar_otp_firma(uuid, text) to service_role;
grant execute on function public.finalizar_firma_contrato(uuid, text, text, text, text, jsonb) to service_role;

-- 5) Storage: lo firmado solo lo escribe service_role y nadie lo reemplaza ni borra -----------
-- Ruta: {empresa_id}/personal/{personal_id}/contratos-firmados/{solicitud_id}.pdf
alter policy storage_docs_privados_insert on storage.objects
  with check (
    bucket_id = 'documentos-privados'
    and public.usuario_tiene_empresa(split_part(name, '/', 1))
    and name not like '%/contratos-firmados/%'
  );
alter policy storage_docs_privados_update on storage.objects
  using (
    bucket_id = 'documentos-privados'
    and public.usuario_tiene_empresa(split_part(name, '/', 1))
    and name not like '%/contratos-firmados/%'
  )
  with check (
    bucket_id = 'documentos-privados'
    and public.usuario_tiene_empresa(split_part(name, '/', 1))
    and name not like '%/contratos-firmados/%'
  );
alter policy storage_docs_privados_delete on storage.objects
  using (
    bucket_id = 'documentos-privados'
    and public.usuario_tiene_empresa(split_part(name, '/', 1))
    and name not like '%/contratos-firmados/%'
  );

-- 6) Plantilla base del contrato laboral de renovación (estructura; texto a validar por legal) --
create or replace function public.crear_plantilla_contrato_renovacion(p_empresa_id text, p_sociedad_id uuid default null)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_tipo uuid; v_plantilla uuid; v_content jsonb; c record;
begin
  select id into v_tipo from public.tipos_documento_electronico
   where empresa_id = p_empresa_id and codigo = 'CONTRATO_LABORAL_RENOVACION' limit 1;
  if v_tipo is null then
    insert into public.tipos_documento_electronico
      (empresa_id, sociedad_id, codigo, nombre, categoria_base, es_default_para_categoria, activo, motor_contenido)
    values
      (p_empresa_id, p_sociedad_id, 'CONTRATO_LABORAL_RENOVACION', 'Contrato laboral - Renovación', 'contrato_laboral',
       not exists (select 1 from public.tipos_documento_electronico t
                    where t.empresa_id = p_empresa_id and t.categoria_base = 'contrato_laboral' and t.es_default_para_categoria),
       true, 'constructor_bloques')
    returning id into v_tipo;
  end if;

  select id into v_plantilla from public.plantillas_documento_bloques
   where tipo_documento_id = v_tipo order by version desc limit 1;
  if v_plantilla is not null then return v_plantilla; end if;

  insert into public.plantillas_documento_bloques
    (empresa_id, sociedad_id, tipo_documento_id, nombre_interno, version, estado,
     encabezado_texto_plano, pie_texto_plano, encabezado_alcance, pie_alcance)
  values
    (p_empresa_id, p_sociedad_id, v_tipo, 'Contrato laboral de renovación - base', 1, 'borrador',
     '', 'Documento firmado electrónicamente mediante enlace seguro y código de un solo uso (OTP).', 'todas', 'todas')
  returning id into v_plantilla;

  for c in
    select * from (values
      (1, 'CONTRATO DE TRABAJO - RENOVACIÓN', 'Conste por el presente documento la renovación del contrato de trabajo que celebran, de una parte, {{empresa.razon_social}}, con RUC {{empresa.ruc}} y domicilio en {{empresa.direccion}}, a quien en adelante se denominará EL EMPLEADOR; y, de la otra parte, {{empleado.nombre}}, identificado(a) con documento de identidad {{empleado.documento}} y domicilio en {{empleado.direccion}}, a quien en adelante se denominará EL TRABAJADOR, en los términos y condiciones siguientes.', true),
      (2, 'PRIMERA: ANTECEDENTES', 'EL TRABAJADOR presta servicios para EL EMPLEADOR desde el {{empleado.fecha_ingreso}}. Las partes acuerdan renovar la relación laboral conforme a las condiciones que se detallan en el presente documento.', false),
      (3, 'SEGUNDA: CARGO Y FUNCIONES', 'EL TRABAJADOR desempeñará el cargo de {{cargo.nombre}} en el área de {{cargo.area}}, ejecutando las funciones propias del puesto y las que razonablemente se le asignen dentro de su ámbito de competencia.', false),
      (4, 'TERCERA: PLAZO', 'El presente contrato es de tipo {{contrato.tipo}} y tendrá vigencia desde el {{contrato.fecha_inicio}} hasta el {{contrato.fecha_fin}}, salvo que se resuelva anticipadamente conforme a ley.', false),
      (5, 'CUARTA: REMUNERACIÓN', 'EL EMPLEADOR abonará a EL TRABAJADOR una remuneración base de {{contrato.moneda}} {{contrato.remuneracion_base}}, sujeta a los descuentos y aportes de ley, más los beneficios que correspondan.', false),
      (6, 'QUINTA: MODALIDAD Y JORNADA', 'EL TRABAJADOR prestará sus servicios bajo la modalidad {{contrato.modalidad}}, cumpliendo la jornada y el horario establecidos por EL EMPLEADOR de acuerdo con la normativa vigente y su reglamento interno.', false),
      (7, 'SEXTA: OBLIGACIONES', 'EL TRABAJADOR se obliga a cumplir el reglamento interno de trabajo, las políticas de seguridad y salud en el trabajo y las demás normas internas de EL EMPLEADOR, así como a guardar reserva sobre la información confidencial a la que tenga acceso.', false),
      (8, 'SÉPTIMA: FIRMA ELECTRÓNICA', 'Las partes acuerdan que el presente contrato se suscribe por medios electrónicos. EL TRABAJADOR declara que accedió al documento mediante un enlace personal y confirmó su identidad con un código de un solo uso enviado a los datos de contacto registrados, y reconoce que su aceptación mediante este procedimiento manifiesta su voluntad y tiene plena validez. La evidencia de la firma (fecha, hora, dirección IP y huella digital del documento) queda registrada y adjunta al documento firmado.', false),
      (9, 'OCTAVA: DISPOSICIONES FINALES', 'En todo lo no previsto en este contrato rigen las disposiciones laborales vigentes. Cualquier controversia se someterá a la jurisdicción de los jueces competentes del domicilio de EL EMPLEADOR.', false)
    ) as x(orden, titulo, cuerpo, centrar)
    order by orden
  loop
    v_content := jsonb_build_array(
      jsonb_build_object('type', 'paragraph',
        'attrs', jsonb_build_object('textAlign', case when c.centrar then 'center' else 'left' end),
        'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', c.titulo,
          'marks', jsonb_build_array(jsonb_build_object('type', 'bold'))))),
      jsonb_build_object('type', 'paragraph',
        'attrs', jsonb_build_object('textAlign', 'justify'),
        'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', c.cuerpo)))
    );
    insert into public.documento_bloques
      (plantilla_documento_id, tipo_bloque, titulo, contenido_json, contenido_texto_plano, orden, activo)
    values
      (v_plantilla, 'texto_rico', null, jsonb_build_object('type', 'doc', 'content', v_content),
       c.titulo || E'\n' || c.cuerpo, c.orden, true);
  end loop;

  return v_plantilla;
end $$;

revoke all on function public.crear_plantilla_contrato_renovacion(text, uuid) from public, anon, authenticated;
grant execute on function public.crear_plantilla_contrato_renovacion(text, uuid) to service_role;

-- 7) Comprobación -----------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.contrato_firma_solicitudes') is null then raise exception 'falta contrato_firma_solicitudes'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'aa_proteger_contrato_firmado' and not tgisinternal) then
    raise exception 'falta trigger aa_proteger_contrato_firmado'; end if;
  if has_table_privilege('authenticated', 'public.contrato_firma_solicitudes', 'INSERT')
     or has_table_privilege('authenticated', 'public.contrato_firma_solicitudes', 'UPDATE')
     or has_table_privilege('authenticated', 'public.contrato_firma_solicitudes', 'DELETE') then
    raise exception 'authenticated no debe escribir en contrato_firma_solicitudes'; end if;
  if has_column_privilege('authenticated', 'public.contrato_firma_solicitudes', 'token_hash', 'SELECT')
     or has_column_privilege('authenticated', 'public.contrato_firma_solicitudes', 'otp_hash', 'SELECT') then
    raise exception 'authenticated no debe leer token_hash/otp_hash'; end if;
  if has_function_privilege('authenticated', 'public.finalizar_firma_contrato(uuid,text,text,text,text,jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'public.verificar_otp_firma(uuid,text)', 'EXECUTE') then
    raise exception 'RPC de firma expuesta a clientes'; end if;
  if (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
        and policyname in ('storage_docs_privados_insert','storage_docs_privados_update','storage_docs_privados_delete')
        and coalesce(qual, '') || coalesce(with_check, '') like '%contratos-firmados%') <> 3 then
    raise exception 'politicas de storage sin exclusion de contratos-firmados'; end if;
end $$;
