-- 634: firma interna del empleador en contratos y plantillas por modalidad contractual.
-- Aditiva: columna nueva, dos tablas nuevas, RPC nuevas (solo service_role) y
-- ampliación del trigger de protección (CREATE OR REPLACE desde la versión vigente).

-- 1) Modalidad contractual a la que aplica cada tipo de documento de contrato.
ALTER TABLE public.tipos_documento_electronico
  ADD COLUMN IF NOT EXISTS modalidad_contractual text NOT NULL DEFAULT 'planilla';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tipos_documento_electronico_modalidad_contractual_check') THEN
    ALTER TABLE public.tipos_documento_electronico
      ADD CONSTRAINT tipos_documento_electronico_modalidad_contractual_check
      CHECK (modalidad_contractual IN ('planilla', 'honorarios'));
  END IF;
END $$;
COMMENT ON COLUMN public.tipos_documento_electronico.modalidad_contractual IS
  'planilla = contrato de trabajo; honorarios = locación de servicios. Filtra las plantillas de renovación según la modalidad del colaborador.';

-- 2) Firmantes autorizados por la empresa (representantes que firman contratos).
CREATE TABLE IF NOT EXISTS public.contrato_firmantes_autorizados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id text NOT NULL,
  sociedad_id uuid NULL,
  usuario_id uuid NOT NULL,
  nombre text NOT NULL,
  documento text NOT NULL,
  cargo text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cfa_empresa_sociedad_usuario
  ON public.contrato_firmantes_autorizados (empresa_id, coalesce(sociedad_id, '00000000-0000-0000-0000-000000000000'::uuid), usuario_id);
CREATE INDEX IF NOT EXISTS idx_cfa_empresa ON public.contrato_firmantes_autorizados (empresa_id) WHERE activo;
ALTER TABLE public.contrato_firmantes_autorizados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cfa_select ON public.contrato_firmantes_autorizados;
CREATE POLICY cfa_select ON public.contrato_firmantes_autorizados FOR SELECT TO authenticated
  USING (public.usuario_tiene_empresa(empresa_id));
DROP POLICY IF EXISTS cfa_insert ON public.contrato_firmantes_autorizados;
CREATE POLICY cfa_insert ON public.contrato_firmantes_autorizados FOR INSERT TO authenticated
  WITH CHECK (public.usuario_es_admin_empresa(empresa_id));
DROP POLICY IF EXISTS cfa_update ON public.contrato_firmantes_autorizados;
CREATE POLICY cfa_update ON public.contrato_firmantes_autorizados FOR UPDATE TO authenticated
  USING (public.usuario_es_admin_empresa(empresa_id)) WITH CHECK (public.usuario_es_admin_empresa(empresa_id));

-- 3) Firma del empleador por documento (paso previo a la firma del trabajador).
CREATE TABLE IF NOT EXISTS public.contrato_firma_empleador (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id text NOT NULL,
  sociedad_id uuid NULL,
  documento_id text NOT NULL,
  personal_id text NOT NULL,
  personal_tipo text NOT NULL CHECK (personal_tipo IN ('operativo', 'administrativo')),
  firmante_id uuid NOT NULL REFERENCES public.contrato_firmantes_autorizados(id),
  firmante_usuario_id uuid NOT NULL,
  firmante_nombre text NOT NULL,
  firmante_documento text NOT NULL,
  firmante_cargo text NOT NULL,
  canales_trabajador text[] NOT NULL DEFAULT '{}'::text[],
  pdf_bucket text NOT NULL DEFAULT 'documentos-privados',
  pdf_path text NOT NULL,
  pdf_sha256 text NOT NULL,
  otp_hash text NULL,
  otp_expira_en timestamptz NULL,
  otp_intentos integer NOT NULL DEFAULT 0,
  otp_envios integer NOT NULL DEFAULT 0,
  otp_verificado_en timestamptz NULL,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'otp_enviado', 'firmado', 'anulado')),
  firmado_en timestamptz NULL,
  firmado_ip text NULL,
  firmado_user_agent text NULL,
  pdf_firmado_path text NULL,
  pdf_firmado_sha256 text NULL,
  evidencia jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cfe_documento_vivo
  ON public.contrato_firma_empleador (documento_id) WHERE estado IN ('pendiente', 'otp_enviado', 'firmado');
CREATE INDEX IF NOT EXISTS idx_cfe_empresa ON public.contrato_firma_empleador (empresa_id);
ALTER TABLE public.contrato_firma_empleador ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cfe_select ON public.contrato_firma_empleador;
CREATE POLICY cfe_select ON public.contrato_firma_empleador FOR SELECT TO authenticated
  USING (public.usuario_tiene_empresa(empresa_id));
-- Sin políticas de escritura: todo se escribe desde la edge function con service_role.
REVOKE ALL ON public.contrato_firma_empleador FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.contrato_firma_empleador FROM authenticated;
GRANT SELECT ON public.contrato_firma_empleador TO authenticated;
GRANT ALL ON public.contrato_firma_empleador TO service_role;
REVOKE ALL ON public.contrato_firmantes_autorizados FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.contrato_firmantes_autorizados TO authenticated;
GRANT ALL ON public.contrato_firmantes_autorizados TO service_role;

-- 4) RPC de OTP y cierre para la firma del empleador (solo service_role).
CREATE OR REPLACE FUNCTION public.registrar_otp_firma_empleador(p_firma_id uuid, p_otp text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare f public.contrato_firma_empleador%rowtype;
begin
  select * into f from public.contrato_firma_empleador where id = p_firma_id for update;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'no_existe'); end if;
  if f.estado in ('firmado', 'anulado') then return jsonb_build_object('ok', false, 'motivo', f.estado); end if;
  if f.otp_envios >= 5 then return jsonb_build_object('ok', false, 'motivo', 'limite_envios'); end if;
  update public.contrato_firma_empleador
     set otp_hash = encode(extensions.digest(p_otp || ':' || f.id::text, 'sha256'), 'hex'),
         otp_expira_en = now() + interval '10 minutes', otp_intentos = 0,
         otp_envios = otp_envios + 1, otp_verificado_en = null, estado = 'otp_enviado', updated_at = now()
   where id = f.id;
  return jsonb_build_object('ok', true, 'otp_expira_en', now() + interval '10 minutes', 'envios_restantes', 4 - f.otp_envios);
end $function$;

CREATE OR REPLACE FUNCTION public.verificar_otp_firma_empleador(p_firma_id uuid, p_otp text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare f public.contrato_firma_empleador%rowtype; v_hash text;
begin
  select * into f from public.contrato_firma_empleador where id = p_firma_id for update;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'no_existe'); end if;
  if f.estado <> 'otp_enviado' or f.otp_hash is null then return jsonb_build_object('ok', false, 'motivo', 'sin_otp_vigente'); end if;
  if f.otp_expira_en < now() then
    update public.contrato_firma_empleador set otp_hash = null, updated_at = now() where id = f.id;
    return jsonb_build_object('ok', false, 'motivo', 'otp_expirado');
  end if;
  if f.otp_intentos >= 5 then
    update public.contrato_firma_empleador set otp_hash = null, updated_at = now() where id = f.id;
    return jsonb_build_object('ok', false, 'motivo', 'intentos_agotados');
  end if;
  v_hash := encode(extensions.digest(coalesce(p_otp, '') || ':' || f.id::text, 'sha256'), 'hex');
  if v_hash = f.otp_hash then
    update public.contrato_firma_empleador set otp_verificado_en = now(), otp_hash = null, updated_at = now() where id = f.id;
    return jsonb_build_object('ok', true);
  end if;
  update public.contrato_firma_empleador
     set otp_intentos = otp_intentos + 1,
         otp_hash = case when otp_intentos + 1 >= 5 then null else otp_hash end, updated_at = now()
   where id = f.id;
  return jsonb_build_object('ok', false, 'motivo', 'codigo_incorrecto', 'intentos_restantes', greatest(0, 4 - f.otp_intentos));
end $function$;

CREATE OR REPLACE FUNCTION public.finalizar_firma_empleador(p_firma_id uuid, p_pdf_firmado_path text, p_pdf_firmado_sha256 text, p_ip text, p_user_agent text, p_evidencia jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare f public.contrato_firma_empleador%rowtype;
begin
  select * into f from public.contrato_firma_empleador where id = p_firma_id for update;
  if not found then raise exception 'Firma del empleador no existe.' using errcode = 'P0002'; end if;
  if f.estado <> 'otp_enviado' or f.otp_verificado_en is null or f.otp_verificado_en < now() - interval '15 minutes' then
    raise exception 'La firma del empleador no tiene un OTP verificado vigente.' using errcode = '42501';
  end if;
  if p_pdf_firmado_path is null or p_pdf_firmado_sha256 is null or p_pdf_firmado_path not like '%/contratos-firmados/%' then
    raise exception 'Ruta o hash del PDF firmado invalido.' using errcode = '22023';
  end if;
  update public.contrato_firma_empleador
     set estado = 'firmado', firmado_en = now(), firmado_ip = p_ip, firmado_user_agent = p_user_agent,
         pdf_firmado_path = p_pdf_firmado_path, pdf_firmado_sha256 = p_pdf_firmado_sha256,
         evidencia = coalesce(p_evidencia, '{}'::jsonb) || jsonb_build_object('user_agent', p_user_agent, 'metodo', 'sesion_otp', 'firmado_en', now()),
         otp_hash = null, updated_at = now()
   where id = f.id;
  update public.personal_documentos
     set archivo_url = p_pdf_firmado_path, bucket = f.pdf_bucket,
         nombre_archivo = regexp_replace(nombre_archivo, '\.pdf$', '', 'i') || ' (firmado empresa).pdf'
   where id = f.documento_id and empresa_id = f.empresa_id
     and coalesce(estado_firma, 'no_requiere') <> 'firmado_trabajador';
  if not found then raise exception 'Documento del contrato no disponible para la firma del empleador.' using errcode = 'P0002'; end if;
  return jsonb_build_object('ok', true, 'firmado_en', now());
end $function$;

REVOKE ALL ON FUNCTION public.registrar_otp_firma_empleador(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verificar_otp_firma_empleador(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalizar_firma_empleador(uuid, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_otp_firma_empleador(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.verificar_otp_firma_empleador(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalizar_firma_empleador(uuid, text, text, text, text, jsonb) TO service_role;

-- 5) Protección ampliada: un contrato firmado por el empleador (aún sin firma del
--    trabajador) tampoco puede ser eliminado ni reemplazado por usuarios finales.
--    Parte de la versión vigente (631) sin cambios en su rama original.
CREATE OR REPLACE FUNCTION public.proteger_contrato_firmado()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_empleador_firmo boolean := false;
begin
  if tg_op = 'DELETE' then
    if old.firma_solicitud_id is not null and old.estado_firma = 'firmado_trabajador' then
      raise exception 'Contrato firmado electronicamente: no se puede eliminar (documento %).', old.id
        using errcode = '42501';
    end if;
    if current_user in ('authenticated', 'anon') and exists (
         select 1 from public.contrato_firma_empleador f where f.documento_id = old.id and f.estado = 'firmado') then
      raise exception 'Contrato firmado por la empresa: no se puede eliminar; anula primero la firma de la empresa (documento %).', old.id
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

  if current_user in ('authenticated', 'anon') then
    select exists (select 1 from public.contrato_firma_empleador f where f.documento_id = old.id and f.estado = 'firmado')
      into v_empleador_firmo;
    if v_empleador_firmo and row(new.archivo_url, new.bucket, new.nombre_archivo, new.tipo_doc, new.tipo_documento_id,
           new.personal_id, new.personal_tipo, new.empresa_id, new.sociedad_id,
           new.fecha_emision, new.fecha_vencimiento, new.periodo_fecha_inicio, new.periodo_fecha_fin,
           new.es_indefinido, new.contrato_periodo_id, new.contrato_referencia_id, new.version,
           new.condiciones_laborales)
       is distinct from
       row(old.archivo_url, old.bucket, old.nombre_archivo, old.tipo_doc, old.tipo_documento_id,
           old.personal_id, old.personal_tipo, old.empresa_id, old.sociedad_id,
           old.fecha_emision, old.fecha_vencimiento, old.periodo_fecha_inicio, old.periodo_fecha_fin,
           old.es_indefinido, old.contrato_periodo_id, old.contrato_referencia_id, old.version,
           old.condiciones_laborales)
    then
      raise exception 'Contrato firmado por la empresa: el documento no se puede modificar ni reemplazar (documento %).', old.id
        using errcode = '42501';
    end if;
  end if;
  return new;
end $function$;

-- 6) Comprobación.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tipos_documento_electronico' AND column_name='modalidad_contractual') THEN
    RAISE EXCEPTION '634: falta tipos_documento_electronico.modalidad_contractual';
  END IF;
  IF to_regclass('public.contrato_firmantes_autorizados') IS NULL OR to_regclass('public.contrato_firma_empleador') IS NULL THEN
    RAISE EXCEPTION '634: faltan tablas de firma del empleador';
  END IF;
  IF to_regprocedure('public.finalizar_firma_empleador(uuid,text,text,text,text,jsonb)') IS NULL THEN
    RAISE EXCEPTION '634: falta finalizar_firma_empleador';
  END IF;
  IF has_function_privilege('authenticated', 'public.finalizar_firma_empleador(uuid,text,text,text,text,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION '634: finalizar_firma_empleador no debe ser ejecutable por authenticated';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'aa_proteger_contrato_firmado' AND tgrelid = 'public.personal_documentos'::regclass) THEN
    RAISE EXCEPTION '634: falta el trigger de protección';
  END IF;
END $$;
