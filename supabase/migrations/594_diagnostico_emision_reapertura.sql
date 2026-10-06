-- 594: emisión, reapertura y bloqueo de mutaciones del Diagnóstico Técnico.
-- Requiere fase2 y 592. No reconstruye historial de estados anteriores.
-- diagnosticoTecnicoService.js crea el borrador (linea 127) y edita sus
-- lineas/materiales (lineas 290 y 328); el frontend actual no actualiza el
-- estado. La UI para emitir/reabrir aun no existe y se construira sobre
-- emitir_diagnostico_tecnico() y reabrir_diagnostico_tecnico().
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $pre$
BEGIN
  IF to_regclass('public.diagnosticos_tecnicos') IS NULL THEN RAISE EXCEPTION 'PRECONDITION_FAILED: falta diagnosticos_tecnicos'; END IF;
  IF to_regclass('public.diagnostico_tecnico_lineas') IS NULL THEN RAISE EXCEPTION 'PRECONDITION_FAILED: falta diagnostico_tecnico_lineas'; END IF;
  IF to_regclass('public.diagnostico_tecnico_linea_materiales') IS NULL THEN RAISE EXCEPTION 'PRECONDITION_FAILED: falta diagnostico_tecnico_linea_materiales'; END IF;
  IF to_regprocedure('public.validar_diagnostico_tecnico_referencias()') IS NULL THEN RAISE EXCEPTION 'PRECONDITION_FAILED: falta el trigger existente de cabecera'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.diagnosticos_tecnicos'::regclass AND tgname='trg_validar_diagnostico_tecnico_referencias' AND NOT tgisinternal) THEN RAISE EXCEPTION 'PRECONDITION_FAILED: falta el trigger de cabecera esperado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.diagnosticos_tecnicos'::regclass AND polname='diagnosticos_tecnicos_update') THEN RAISE EXCEPTION 'PRECONDITION_FAILED: falta la policy UPDATE de fase2'; END IF;
  IF to_regclass('public.diagnostico_tecnico_estado_historial') IS NOT NULL THEN RAISE EXCEPTION 'PRECONDITION_FAILED: ya existe diagnostico_tecnico_estado_historial'; END IF;
  IF to_regclass('public.diagnostico_tecnico_transicion_rpc') IS NOT NULL THEN RAISE EXCEPTION 'PRECONDITION_FAILED: ya existe la tabla de autorización interna'; END IF;
  IF to_regprocedure('public.emitir_diagnostico_tecnico(text)') IS NOT NULL THEN RAISE EXCEPTION 'PRECONDITION_FAILED: ya existe emitir_diagnostico_tecnico(text)'; END IF;
  IF to_regprocedure('public.reabrir_diagnostico_tecnico(text,text)') IS NOT NULL THEN RAISE EXCEPTION 'PRECONDITION_FAILED: ya existe reabrir_diagnostico_tecnico(text,text)'; END IF;
END
$pre$;

-- Registro interno no consultable ni modificable por roles de aplicación.
-- La autorización vive solo durante la transacción del RPC y queda ligada al
-- xid, usuario, diagnóstico y transición; un GUC arbitrario no la falsifica.
CREATE TABLE public.diagnostico_tecnico_transicion_rpc (
  xid bigint NOT NULL,
  diagnostico_id text NOT NULL,
  accion text NOT NULL CHECK (accion IN ('emitir','reabrir')),
  usuario_id uuid NOT NULL,
  PRIMARY KEY (xid, diagnostico_id, accion)
);
REVOKE ALL ON public.diagnostico_tecnico_transicion_rpc FROM PUBLIC, anon, authenticated;

CREATE TABLE public.diagnostico_tecnico_estado_historial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id text NOT NULL REFERENCES public.empresas(id),
  diagnostico_id text NOT NULL REFERENCES public.diagnosticos_tecnicos(id),
  estado_anterior text NOT NULL CHECK (estado_anterior IN ('borrador','emitido')),
  estado_nuevo text NOT NULL CHECK (estado_nuevo IN ('borrador','emitido')),
  motivo text,
  usuario_id uuid NOT NULL,
  ocurrido_en timestamptz NOT NULL DEFAULT now(),
  CHECK (estado_anterior IS DISTINCT FROM estado_nuevo),
  CHECK ((estado_nuevo='emitido' AND motivo IS NULL) OR (estado_nuevo='borrador' AND nullif(btrim(motivo),'') IS NOT NULL))
);
CREATE INDEX diagnostico_tecnico_estado_historial_empresa_diagnostico_idx
  ON public.diagnostico_tecnico_estado_historial (empresa_id, diagnostico_id, ocurrido_en);
ALTER TABLE public.diagnostico_tecnico_estado_historial ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.diagnostico_tecnico_estado_historial FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.diagnostico_tecnico_estado_historial FROM authenticated;
GRANT SELECT ON public.diagnostico_tecnico_estado_historial TO authenticated;
CREATE POLICY diagnostico_tecnico_estado_historial_select
  ON public.diagnostico_tecnico_estado_historial FOR SELECT TO authenticated
  USING (public.usuario_tiene_empresa(empresa_id)
         AND public.usuario_puede(empresa_id,'diagnostico_tecnico','ver'));

CREATE FUNCTION public.proteger_diagnostico_tecnico_estado()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE v_accion text;
BEGIN
  IF NEW.estado IS NOT DISTINCT FROM OLD.estado THEN RETURN NEW; END IF;
  v_accion := CASE WHEN OLD.estado='borrador' AND NEW.estado='emitido' THEN 'emitir'
                   WHEN OLD.estado='emitido' AND NEW.estado='borrador' THEN 'reabrir'
                   ELSE NULL END;
  IF v_accion IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.diagnostico_tecnico_transicion_rpc a
    WHERE a.xid=txid_current() AND a.diagnostico_id=OLD.id
      AND a.accion=v_accion AND a.usuario_id=auth.uid()
  ) THEN
    RAISE EXCEPTION 'El estado solo puede cambiar mediante los RPC autorizados.' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION public.proteger_diagnostico_tecnico_estado() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER zzz_594_proteger_diagnostico_tecnico_estado
  BEFORE UPDATE OF estado ON public.diagnosticos_tecnicos
  FOR EACH ROW EXECUTE FUNCTION public.proteger_diagnostico_tecnico_estado();

CREATE FUNCTION public.proteger_diagnostico_tecnico_historial()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
BEGIN
  RAISE EXCEPTION 'El historial del Diagnóstico Técnico es inmutable.' USING ERRCODE='42501';
END
$fn$;
REVOKE ALL ON FUNCTION public.proteger_diagnostico_tecnico_historial() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER diagnostico_tecnico_estado_historial_inmutable
  BEFORE UPDATE OR DELETE ON public.diagnostico_tecnico_estado_historial
  FOR EACH ROW EXECUTE FUNCTION public.proteger_diagnostico_tecnico_historial();

CREATE FUNCTION public.emitir_diagnostico_tecnico(p_id text)
RETURNS TABLE(id text, estado text, emitido_por uuid, emitido_en timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE v_d public.diagnosticos_tecnicos%ROWTYPE; v_usuario uuid := auth.uid();
BEGIN
  IF v_usuario IS NULL THEN RAISE EXCEPTION 'Se requiere una sesión autenticada.' USING ERRCODE='42501'; END IF;
  SELECT d.* INTO v_d FROM public.diagnosticos_tecnicos d WHERE d.id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El diagnóstico no existe.' USING ERRCODE='P0002'; END IF;
  IF NOT public.usuario_tiene_empresa(v_d.empresa_id)
     OR NOT public.usuario_puede(v_d.empresa_id,'diagnostico_tecnico','aprobar') THEN
    RAISE EXCEPTION 'No autorizado para emitir este diagnóstico.' USING ERRCODE='42501';
  END IF;
  IF v_d.estado IS DISTINCT FROM 'borrador' THEN
    RAISE EXCEPTION 'Solo se puede emitir un diagnóstico en borrador.' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.diagnostico_tecnico_transicion_rpc VALUES (txid_current(),v_d.id,'emitir',v_usuario);
  UPDATE public.diagnosticos_tecnicos d SET estado='emitido' WHERE d.id=v_d.id
    RETURNING d.* INTO v_d;
  DELETE FROM public.diagnostico_tecnico_transicion_rpc WHERE xid=txid_current() AND diagnostico_id=v_d.id AND accion='emitir';
  INSERT INTO public.diagnostico_tecnico_estado_historial
    (empresa_id,diagnostico_id,estado_anterior,estado_nuevo,motivo,usuario_id)
  VALUES (v_d.empresa_id,v_d.id,'borrador','emitido',NULL,v_usuario);
  RETURN QUERY SELECT v_d.id,v_d.estado,v_d.emitido_por,v_d.emitido_en;
END
$fn$;
REVOKE ALL ON FUNCTION public.emitir_diagnostico_tecnico(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.emitir_diagnostico_tecnico(text) TO authenticated;

CREATE FUNCTION public.reabrir_diagnostico_tecnico(p_id text,p_motivo text)
RETURNS TABLE(id text, estado text, emitido_por uuid, emitido_en timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE v_d public.diagnosticos_tecnicos%ROWTYPE; v_usuario uuid := auth.uid(); v_motivo text := btrim(coalesce(p_motivo,''));
BEGIN
  IF v_usuario IS NULL THEN RAISE EXCEPTION 'Se requiere una sesión autenticada.' USING ERRCODE='42501'; END IF;
  IF char_length(v_motivo)<10 THEN RAISE EXCEPTION 'El motivo de reapertura debe tener al menos 10 caracteres.' USING ERRCODE='22023'; END IF;
  SELECT d.* INTO v_d FROM public.diagnosticos_tecnicos d WHERE d.id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El diagnóstico no existe.' USING ERRCODE='P0002'; END IF;
  IF NOT public.usuario_tiene_empresa(v_d.empresa_id)
     OR NOT public.usuario_puede(v_d.empresa_id,'diagnostico_tecnico','aprobar') THEN
    RAISE EXCEPTION 'No autorizado para reabrir este diagnóstico.' USING ERRCODE='42501';
  END IF;
  IF v_d.estado IS DISTINCT FROM 'emitido' THEN
    RAISE EXCEPTION 'Solo se puede reabrir un diagnóstico emitido.' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.diagnostico_tecnico_transicion_rpc VALUES (txid_current(),v_d.id,'reabrir',v_usuario);
  UPDATE public.diagnosticos_tecnicos d SET estado='borrador' WHERE d.id=v_d.id
    RETURNING d.* INTO v_d;
  DELETE FROM public.diagnostico_tecnico_transicion_rpc WHERE xid=txid_current() AND diagnostico_id=v_d.id AND accion='reabrir';
  INSERT INTO public.diagnostico_tecnico_estado_historial
    (empresa_id,diagnostico_id,estado_anterior,estado_nuevo,motivo,usuario_id)
  VALUES (v_d.empresa_id,v_d.id,'emitido','borrador',v_motivo,v_usuario);
  RETURN QUERY SELECT v_d.id,v_d.estado,v_d.emitido_por,v_d.emitido_en;
END
$fn$;
REVOKE ALL ON FUNCTION public.reabrir_diagnostico_tecnico(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reabrir_diagnostico_tecnico(text,text) TO authenticated;

-- Bloqueo coordinado con la fila padre: FOR SHARE serializa cambios hijos y emisión.
CREATE FUNCTION public.bloquear_linea_diagnostico_emitido_594()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE v_id text; v_estado text;
BEGIN
  v_id := CASE WHEN TG_OP='DELETE' THEN OLD.diagnostico_id ELSE NEW.diagnostico_id END;
  SELECT d.estado INTO v_estado FROM public.diagnosticos_tecnicos d WHERE d.id=v_id FOR SHARE;
  IF NOT FOUND AND TG_OP<>'DELETE' THEN RAISE EXCEPTION 'El diagnóstico no existe.' USING ERRCODE='23503'; END IF;
  IF v_estado='emitido' THEN RAISE EXCEPTION 'No se pueden modificar líneas de un Diagnóstico Técnico emitido.' USING ERRCODE='42501'; END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END
$fn$;
REVOKE ALL ON FUNCTION public.bloquear_linea_diagnostico_emitido_594() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER a_594_bloquear_linea_diagnostico_emitido
  BEFORE INSERT OR UPDATE OR DELETE ON public.diagnostico_tecnico_lineas
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_linea_diagnostico_emitido_594();

CREATE FUNCTION public.bloquear_material_diagnostico_emitido_594()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE v_linea uuid; v_id text; v_estado text;
BEGIN
  v_linea := CASE WHEN TG_OP='DELETE' THEN OLD.linea_id ELSE NEW.linea_id END;
  SELECT l.diagnostico_id INTO v_id FROM public.diagnostico_tecnico_lineas l WHERE l.id=v_linea FOR SHARE;
  IF NOT FOUND AND TG_OP<>'DELETE' THEN RAISE EXCEPTION 'La línea del diagnóstico no existe.' USING ERRCODE='23503'; END IF;
  SELECT d.estado INTO v_estado FROM public.diagnosticos_tecnicos d WHERE d.id=v_id FOR SHARE;
  IF v_estado='emitido' THEN RAISE EXCEPTION 'No se pueden modificar materiales de un Diagnóstico Técnico emitido.' USING ERRCODE='42501'; END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END
$fn$;
REVOKE ALL ON FUNCTION public.bloquear_material_diagnostico_emitido_594() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER a_594_bloquear_material_diagnostico_emitido
  BEFORE INSERT OR UPDATE OR DELETE ON public.diagnostico_tecnico_linea_materiales
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_material_diagnostico_emitido_594();

-- Impide que el permiso editar convierta un borrador en emitido por UPDATE directo.
DROP POLICY diagnosticos_tecnicos_update ON public.diagnosticos_tecnicos;
CREATE POLICY diagnosticos_tecnicos_update ON public.diagnosticos_tecnicos
  FOR UPDATE TO authenticated
  USING (public.usuario_tiene_empresa(diagnosticos_tecnicos.empresa_id)
         AND (public.usuario_puede(diagnosticos_tecnicos.empresa_id,'diagnostico_tecnico','editar')
              OR (diagnosticos_tecnicos.estado='emitido' AND public.usuario_puede(diagnosticos_tecnicos.empresa_id,'diagnostico_tecnico','aprobar'))))
  WITH CHECK (public.usuario_tiene_empresa(diagnosticos_tecnicos.empresa_id)
              AND ((diagnosticos_tecnicos.estado='borrador'
                    AND (public.usuario_puede(diagnosticos_tecnicos.empresa_id,'diagnostico_tecnico','editar')
                         OR public.usuario_puede(diagnosticos_tecnicos.empresa_id,'diagnostico_tecnico','aprobar')))
                   OR (diagnosticos_tecnicos.estado='emitido'
                       AND public.usuario_puede(diagnosticos_tecnicos.empresa_id,'diagnostico_tecnico','aprobar'))));

COMMIT;
