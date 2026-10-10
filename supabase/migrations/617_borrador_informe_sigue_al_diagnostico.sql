-- 617: permite que el borrador de informe siga al diagnóstico de mantenimiento
-- que el usuario está editando, sin habilitar cambios directos ni tocar informes emitidos.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $pre$
BEGIN
  ASSERT to_regprocedure('public.obtener_o_crear_borrador_informe(text)') IS NOT NULL,
    'PRECONDITION_FAILED: falta obtener_o_crear_borrador_informe(text)';
  ASSERT to_regclass('public.diagnostico_informe_transicion_rpc') IS NOT NULL,
    'PRECONDITION_FAILED: falta la tabla privada de transiciones';
  ASSERT to_regprocedure('public.proteger_diagnostico_informe()') IS NOT NULL,
    'PRECONDITION_FAILED: falta proteger_diagnostico_informe()';
END
$pre$;

-- La columna diagnostico_id solo cambia con una marca interna colocada por la
-- RPC de abajo. Empresa y recepción siguen siendo inmutables.
CREATE OR REPLACE FUNCTION public.proteger_diagnostico_informe()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.estado = 'emitido' THEN
      RAISE EXCEPTION 'Un informe emitido es inmutable.' USING ERRCODE='42501';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.empresa_id IS DISTINCT FROM OLD.empresa_id
     OR NEW.recepcion_id IS DISTINCT FROM OLD.recepcion_id THEN
    RAISE EXCEPTION 'empresa_id y recepcion_id son inmutables.' USING ERRCODE='23514';
  END IF;
  IF OLD.estado = 'emitido' THEN
    RAISE EXCEPTION 'Un informe emitido es inmutable.' USING ERRCODE='42501';
  END IF;
  IF NEW.diagnostico_id IS DISTINCT FROM OLD.diagnostico_id
     AND NOT EXISTS (
       SELECT 1 FROM public.diagnostico_informe_transicion_rpc a
       WHERE a.xid=txid_current() AND a.informe_id=OLD.id AND a.usuario_id=auth.uid()
     ) THEN
    RAISE EXCEPTION 'diagnostico_id solo puede cambiar mediante la RPC autorizada.' USING ERRCODE='23514';
  END IF;
  IF NEW.opciones->>'conclusion' IS DISTINCT FROM OLD.opciones->>'conclusion' THEN
    NEW.opciones := jsonb_set(NEW.opciones, '{conclusion_confirmada}', 'false'::jsonb, true);
  END IF;
  IF (NEW.estado IS DISTINCT FROM OLD.estado OR NEW.version IS DISTINCT FROM OLD.version
      OR NEW.snapshot IS DISTINCT FROM OLD.snapshot
      OR NEW.emitido_por IS DISTINCT FROM OLD.emitido_por OR NEW.emitido_en IS DISTINCT FROM OLD.emitido_en
      OR NEW.emisor_nombre IS DISTINCT FROM OLD.emisor_nombre OR NEW.emisor_cargo IS DISTINCT FROM OLD.emisor_cargo)
     AND NOT EXISTS (
       SELECT 1 FROM public.diagnostico_informe_transicion_rpc a
       WHERE a.xid=txid_current() AND a.informe_id=OLD.id AND a.usuario_id=auth.uid()
     ) THEN
    RAISE EXCEPTION 'Estado y snapshot solo pueden cambiar mediante emitir_informe_diagnostico().' USING ERRCODE='42501';
  END IF;
  NEW.actualizado_por := auth.uid();
  NEW.actualizado_en := now();
  RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION public.proteger_diagnostico_informe() FROM PUBLIC, anon, authenticated;

-- La firma de dos argumentos tiene el segundo opcional: llamadas existentes con
-- solo p_recepcion_id siguen funcionando y conservan la selección automática.
DROP FUNCTION public.obtener_o_crear_borrador_informe(text);
CREATE FUNCTION public.obtener_o_crear_borrador_informe(
  p_recepcion_id text,
  p_diagnostico_id text DEFAULT NULL
)
RETURNS public.diagnostico_informes
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE
  v_usuario uuid := auth.uid();
  v_empresa text;
  v_diagnostico text;
  v_result public.diagnostico_informes%ROWTYPE;
BEGIN
  IF v_usuario IS NULL THEN RAISE EXCEPTION 'Se requiere una sesión autenticada.' USING ERRCODE='42501'; END IF;
  SELECT r.empresa_id INTO v_empresa FROM public.recepciones_activos_cliente r WHERE r.id=p_recepcion_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'La recepción no existe.' USING ERRCODE='P0002'; END IF;
  IF NOT public.usuario_tiene_empresa(v_empresa) THEN RAISE EXCEPTION 'La recepción no pertenece a una empresa accesible.' USING ERRCODE='42501'; END IF;
  IF NOT public.usuario_puede(v_empresa,'diagnostico_tecnico','editar')
     OR NOT public.usuario_puede(v_empresa,'informe_diagnostico','editar') THEN
    RAISE EXCEPTION 'No autorizado para crear o editar el informe.' USING ERRCODE='42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('informe:'||v_empresa||':'||p_recepcion_id,0));

  IF p_diagnostico_id IS NOT NULL THEN
    SELECT d.id INTO v_diagnostico FROM public.diagnosticos_tecnicos d
      WHERE d.id=p_diagnostico_id AND d.empresa_id=v_empresa
        AND d.recepcion_id=p_recepcion_id AND d.tipo='mantenimiento'
        AND d.estado='borrador'
        AND public.usuario_puede_ver_diagnostico_padre(d.tipo,d.empresa_id,d.recepcion_id,d.oportunidad_id);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No existe un diagnóstico de mantenimiento en borrador para esta recepción.' USING ERRCODE='P0002';
    END IF;
  END IF;

  SELECT i.* INTO v_result FROM public.diagnostico_informes i
    WHERE i.empresa_id=v_empresa AND i.recepcion_id=p_recepcion_id AND i.estado='borrador'
    FOR UPDATE;
  IF FOUND THEN
    IF p_diagnostico_id IS NOT NULL AND v_result.diagnostico_id IS DISTINCT FROM p_diagnostico_id THEN
      INSERT INTO public.diagnostico_informe_transicion_rpc(xid,informe_id,usuario_id)
        VALUES (txid_current(),v_result.id,v_usuario);
      UPDATE public.diagnostico_informes
        SET diagnostico_id=p_diagnostico_id
        WHERE id=v_result.id AND empresa_id=v_empresa AND recepcion_id=p_recepcion_id AND estado='borrador'
        RETURNING * INTO v_result;
      DELETE FROM public.diagnostico_informe_transicion_rpc
        WHERE xid=txid_current() AND informe_id=v_result.id AND usuario_id=v_usuario;
    END IF;
    RETURN v_result;
  END IF;

  IF p_diagnostico_id IS NULL THEN
    SELECT d.id INTO v_diagnostico FROM public.diagnosticos_tecnicos d
      WHERE d.empresa_id=v_empresa AND d.recepcion_id=p_recepcion_id AND d.tipo='mantenimiento'
        AND public.usuario_puede_ver_diagnostico_padre(d.tipo,d.empresa_id,d.recepcion_id,d.oportunidad_id)
      ORDER BY d.created_at DESC, d.id LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'No existe un diagnóstico de mantenimiento para esta recepción.' USING ERRCODE='P0002'; END IF;
  END IF;

  INSERT INTO public.diagnostico_informes(empresa_id,recepcion_id,diagnostico_id,creado_por)
    VALUES (v_empresa,p_recepcion_id,v_diagnostico,v_usuario)
    RETURNING * INTO v_result;
  RETURN v_result;
END
$fn$;
REVOKE ALL ON FUNCTION public.obtener_o_crear_borrador_informe(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obtener_o_crear_borrador_informe(text,text) TO authenticated;

DO $verify$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef('public.obtener_o_crear_borrador_informe(text,text)'::regprocedure)
    INTO v_def;
  ASSERT position('p_diagnostico_id text DEFAULT NULL' IN v_def) > 0
    AND position('d.estado' IN v_def) > 0 AND position('borrador' IN v_def) > 0
    AND position('diagnostico_informe_transicion_rpc' IN v_def) > 0,
    'VERIFY_FAILED: la RPC no valida ni reasigna el borrador como se espera';
  ASSERT has_function_privilege('authenticated', 'public.obtener_o_crear_borrador_informe(text,text)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.obtener_o_crear_borrador_informe(text,text)', 'EXECUTE'),
    'VERIFY_FAILED: grants incorrectos en obtener_o_crear_borrador_informe';
END
$verify$;

COMMIT;
