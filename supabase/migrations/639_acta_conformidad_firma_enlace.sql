-- 639: Firma del cliente por enlace para el acta móvil con conformidad pendiente.
--   1. cierres_tecnicos.acta_pdf_firmado_path / _sha256: PDF firmado (original + anexo de conformidad).
--   2. trg_proteger_acta_cierre_tecnico: permite registrar UNA vez la conformidad del cliente y el PDF firmado.
--   3. acta_conformidad_objeto_bloqueado: protege también el PDF firmado.
--   4. registrar_conformidad_ot (flujo antiguo, anónimo): ya no acepta actas móviles.
--   5. firmar_conformidad_acta / registrar_pdf_firmado_acta: solo para la función acta-conformidad-firmar (service_role).

alter table public.cierres_tecnicos add column if not exists acta_pdf_firmado_path text;
alter table public.cierres_tecnicos add column if not exists acta_pdf_firmado_sha256 text;
comment on column public.cierres_tecnicos.acta_pdf_firmado_path is 'PDF del acta con la página anexa de conformidad del cliente firmada por enlace. Se registra una sola vez.';

-- 2. Protección del acta (parte de pg_get_functiondef vigente; se agregan los campos de la firma por enlace).
create or replace function public.trg_proteger_acta_cierre_tecnico()
 returns trigger
 language plpgsql
 set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_permitidas text[] := array[
    'updated_at', 'sociedad_id',
    'acta_pdf_path', 'acta_pdf_sha256',
    'acta_pdf_firmado_path', 'acta_pdf_firmado_sha256',
    'correo_estado', 'correo_enviado_en', 'correo_detalle',
    'conformidad_nombre', 'conformidad_dni', 'conformidad_fecha', 'conformidad_ip',
    'conformidad_resultado', 'conformidad_observaciones', 'conformidad_cliente'
  ];
begin
  if tg_op = 'DELETE' then
    if old.acta_bloqueada then
      raise exception using errcode = '42501',
        message = 'ACTA_BLOQUEADA: un cierre con acta emitida no se puede eliminar.';
    end if;
    return old;
  end if;

  if not old.acta_bloqueada then
    return new;
  end if;

  if (to_jsonb(new) - v_permitidas) is distinct from (to_jsonb(old) - v_permitidas) then
    raise exception using errcode = '42501',
      message = 'ACTA_BLOQUEADA: el acta emitida no se puede modificar.';
  end if;

  if old.acta_pdf_path is not null
     and (new.acta_pdf_path is distinct from old.acta_pdf_path
          or new.acta_pdf_sha256 is distinct from old.acta_pdf_sha256) then
    raise exception using errcode = '42501',
      message = 'ACTA_BLOQUEADA: el PDF del acta ya fue registrado.';
  end if;

  if old.acta_pdf_firmado_path is not null
     and (new.acta_pdf_firmado_path is distinct from old.acta_pdf_firmado_path
          or new.acta_pdf_firmado_sha256 is distinct from old.acta_pdf_firmado_sha256) then
    raise exception using errcode = '42501',
      message = 'ACTA_BLOQUEADA: el PDF firmado del acta ya fue registrado.';
  end if;

  if (new.conformidad_nombre, new.conformidad_dni, new.conformidad_fecha, new.conformidad_ip,
      new.conformidad_resultado, new.conformidad_observaciones, new.conformidad_cliente)
     is distinct from (old.conformidad_nombre, old.conformidad_dni, old.conformidad_fecha, old.conformidad_ip,
      old.conformidad_resultado, old.conformidad_observaciones, old.conformidad_cliente)
     and not (old.conformidad_resultado = 'pendiente' and old.conformidad_fecha is null) then
    raise exception using errcode = '42501',
      message = 'ACTA_BLOQUEADA: la conformidad del acta ya fue registrada.';
  end if;

  if new.conformidad_resultado is distinct from old.conformidad_resultado
     and new.conformidad_resultado not in ('conforme', 'observaciones') then
    raise exception using errcode = '42501',
      message = 'ACTA_BLOQUEADA: la conformidad pendiente solo pasa a conforme o con observaciones.';
  end if;

  return new;
end;
$function$;

-- 3. Objetos protegidos del bucket (se agrega el PDF firmado).
create or replace function public.acta_conformidad_objeto_bloqueado(p_name text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'pg_catalog', 'public'
as $function$
  select exists (select 1 from public.cierre_tecnico_firmas f where f.firma_path = p_name)
      or exists (select 1 from public.cierre_tecnico_evidencias e where e.path = p_name)
      or exists (select 1 from public.cierres_tecnicos c where c.acta_pdf_path = p_name or c.acta_pdf_firmado_path = p_name);
$function$;

-- 4. Flujo antiguo: no aplica a actas móviles (esas se firman con acta-conformidad-firmar).
create or replace function public.registrar_conformidad_ot(p_token uuid, p_nombre text, p_dni text, p_ip text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public'
as $function$
begin
  update cierres_tecnicos set
    conformidad_nombre = p_nombre,
    conformidad_dni    = p_dni,
    conformidad_fecha  = now(),
    conformidad_ip     = p_ip
  where token_conformidad = p_token
    and conformidad_fecha is null
    and modalidad_acta is distinct from 'acta_movil'
    and (token_conformidad_expira_en is null or token_conformidad_expira_en > now());

  if not found then
    return jsonb_build_object('ok', false, 'error', 'ya_firmada_o_invalida');
  end if;
  return jsonb_build_object('ok', true);
end;
$function$;

-- 5a. Registrar la firma del cliente (solo service_role).
create or replace function public.firmar_conformidad_acta(p_token uuid, p_datos jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_cierre public.cierres_tecnicos%rowtype;
  v_resultado text := p_datos ->> 'resultado';
  v_obs text := nullif(btrim(coalesce(p_datos ->> 'observaciones', '')), '');
  v_nombre text := btrim(coalesce(p_datos ->> 'nombre', ''));
  v_documento text := upper(btrim(coalesce(p_datos ->> 'documento', '')));
  v_cargo text := nullif(btrim(coalesce(p_datos ->> 'cargo', '')), '');
  v_path text := p_datos ->> 'firma_path';
  v_sha text := lower(coalesce(p_datos ->> 'firma_sha256', ''));
  v_ip text := left(coalesce(p_datos ->> 'ip', 'desconocida'), 80);
  v_ahora timestamptz := now();
begin
  if session_user = 'authenticator' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'ACTA_ENLACE_SOLO_SERVICIO: uso exclusivo de la función de firma.';
  end if;

  select * into v_cierre from public.cierres_tecnicos where token_conformidad = p_token for update;
  if not found or v_cierre.modalidad_acta is distinct from 'acta_movil' or not v_cierre.acta_bloqueada then
    raise exception using errcode = 'P0002', message = 'ACTA_ENLACE_INVALIDO: el enlace no es válido.';
  end if;
  if v_cierre.conformidad_resultado <> 'pendiente' or v_cierre.conformidad_fecha is not null then
    raise exception using errcode = 'P0001', message = 'ACTA_ENLACE_YA_FIRMADA: esta conformidad ya fue registrada.';
  end if;
  if v_cierre.token_conformidad_expira_en is not null and v_cierre.token_conformidad_expira_en <= v_ahora then
    raise exception using errcode = 'P0001', message = 'ACTA_ENLACE_VENCIDO: el enlace venció.';
  end if;

  if v_resultado not in ('conforme', 'observaciones') then
    raise exception using errcode = '22023', message = 'ACTA_ENLACE_DATOS: elige conforme o con observaciones.';
  end if;
  if v_resultado = 'observaciones' and v_obs is null then
    raise exception using errcode = '22023', message = 'ACTA_ENLACE_DATOS: escribe las observaciones.';
  end if;
  if length(v_nombre) < 3 or v_documento !~ '^[0-9A-Z-]{6,15}$' then
    raise exception using errcode = '22023', message = 'ACTA_ENLACE_DATOS: revisa tu nombre y documento.';
  end if;
  if v_path is null or v_path not like (v_cierre.empresa_id || '/' || v_cierre.orden_trabajo_id || '/%')
     or v_sha !~ '^[0-9a-f]{64}$'
     or not exists (select 1 from storage.objects o where o.bucket_id = 'actas-conformidad' and o.name = v_path) then
    raise exception using errcode = '22023', message = 'ACTA_ENLACE_DATOS: la firma no se pudo verificar.';
  end if;

  insert into public.cierre_tecnico_firmas (
    empresa_id, sociedad_id, cierre_id, orden_trabajo_id, rol, nombre, documento, cargo,
    firma_path, firma_sha256, dispositivo, geo, ip, firmado_en, usuario_id
  ) values (
    v_cierre.empresa_id, v_cierre.sociedad_id, v_cierre.id, v_cierre.orden_trabajo_id, 'cliente',
    v_nombre, v_documento, v_cargo, v_path, v_sha,
    coalesce(p_datos -> 'dispositivo', '{}'::jsonb), null, v_ip, v_ahora, null
  );

  update public.cierres_tecnicos set
    conformidad_resultado = v_resultado,
    conformidad_observaciones = v_obs,
    conformidad_nombre = v_nombre,
    conformidad_dni = v_documento,
    conformidad_fecha = v_ahora,
    conformidad_ip = v_ip,
    conformidad_cliente = jsonb_build_object('tipo', 'acta_movil', 'resultado', v_resultado, 'canal', 'enlace'),
    updated_at = v_ahora
  where id = v_cierre.id;

  return jsonb_build_object(
    'ok', true, 'cierre_id', v_cierre.id, 'empresa_id', v_cierre.empresa_id,
    'orden_trabajo_id', v_cierre.orden_trabajo_id, 'acta_numero', v_cierre.acta_numero,
    'firmado_en', v_ahora, 'resultado', v_resultado
  );
end;
$function$;

-- 5b. Registrar el PDF firmado (solo service_role, una vez).
create or replace function public.registrar_pdf_firmado_acta(p_cierre_id text, p_path text, p_sha256 text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_cierre public.cierres_tecnicos%rowtype;
begin
  if session_user = 'authenticator' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'ACTA_ENLACE_SOLO_SERVICIO: uso exclusivo de la función de firma.';
  end if;
  select * into v_cierre from public.cierres_tecnicos where id = p_cierre_id for update;
  if not found or v_cierre.conformidad_fecha is null or v_cierre.acta_pdf_firmado_path is not null then
    raise exception using errcode = 'P0001', message = 'ACTA_ENLACE_PDF: el PDF firmado no se puede registrar.';
  end if;
  if p_path not like (v_cierre.empresa_id || '/' || v_cierre.orden_trabajo_id || '/%')
     or lower(coalesce(p_sha256, '')) !~ '^[0-9a-f]{64}$'
     or not exists (select 1 from storage.objects o where o.bucket_id = 'actas-conformidad' and o.name = p_path) then
    raise exception using errcode = '22023', message = 'ACTA_ENLACE_PDF: el PDF firmado no se pudo verificar.';
  end if;
  update public.cierres_tecnicos
     set acta_pdf_firmado_path = p_path, acta_pdf_firmado_sha256 = lower(p_sha256), updated_at = now()
   where id = p_cierre_id;
  return jsonb_build_object('ok', true);
end;
$function$;

-- Comprobación
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'cierres_tecnicos' and column_name = 'acta_pdf_firmado_path') then
    raise exception 'Falta cierres_tecnicos.acta_pdf_firmado_path';
  end if;
  if to_regprocedure('public.firmar_conformidad_acta(uuid,jsonb)') is null
     or to_regprocedure('public.registrar_pdf_firmado_acta(text,text,text)') is null then
    raise exception 'Faltan las funciones de firma por enlace';
  end if;
  if position('acta_movil' in pg_get_functiondef('public.registrar_conformidad_ot(uuid,text,text,text)'::regprocedure)) = 0 then
    raise exception 'registrar_conformidad_ot no excluye el acta móvil';
  end if;
end $$;

select pg_notify('pgrst', 'reload schema');
