-- ============================================================================
-- 282 · Fix nuevo_contrato_periodo: activa el nuevo período y lo agrupa
-- ============================================================================
-- Bug: nuevo_contrato_periodo insertaba el nuevo período con activo=false y
-- solo marcaba periodo_estado='archivado' en el anterior (sin activo=false).
-- Como calcular_habilitaciones_personal filtra por activo=true, el contrato
-- viejo seguía apareciendo como vigente y el nuevo quedaba invisible hasta
-- que la migración 281 agregó una prioridad por estado_validacion='pendiente'
-- como paliativo a nivel de consulta. Este fix corrige el origen: el período
-- anterior pasa a activo=false y el nuevo nace activo=true.
-- Tampoco se seteaba periodo_grupo_id, por lo que getHistorialPorGrupo (tab
-- "Versiones" del previsualizador) no reconocía el nuevo período como grupo
-- propio y lo mostraba en "Documentos anteriores al sistema".

CREATE OR REPLACE FUNCTION public.nuevo_contrato_periodo(
  p_empresa_id              text,
  p_personal_id             text,
  p_personal_tipo           text,
  p_tipo_doc                text,
  p_nombre_archivo          text,
  p_archivo_url             text,
  p_fecha_emision           date     DEFAULT NULL,
  p_fecha_vencimiento       date     DEFAULT NULL,
  p_notas                   text     DEFAULT NULL,
  p_condiciones_laborales   jsonb    DEFAULT '{}'::jsonb,
  p_tipo_documento_id       text     DEFAULT NULL,
  p_periodo_id_anterior     text     DEFAULT NULL,
  p_es_indefinido           boolean  DEFAULT false
)
RETURNS public.personal_documentos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usuario_id      text;
  v_nuevo_periodo   text;
  v_nuevo_grupo_id  uuid;
  v_row             public.personal_documentos;
BEGIN
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Acceso denegado al tenant';
  END IF;

  SELECT id INTO v_usuario_id
  FROM public.usuarios
  WHERE id = auth.uid()::text
  LIMIT 1;

  v_nuevo_periodo  := 'cper_' || gen_random_uuid()::text;
  v_nuevo_grupo_id := gen_random_uuid();

  -- Archivar período anterior (por ID explícito o por el vigente del mismo tipo)
  IF p_periodo_id_anterior IS NOT NULL THEN
    UPDATE public.personal_documentos
    SET periodo_estado = 'archivado',
        activo         = false
    WHERE empresa_id          = p_empresa_id
      AND personal_id         = p_personal_id
      AND contrato_periodo_id = p_periodo_id_anterior;
  ELSE
    UPDATE public.personal_documentos
    SET periodo_estado = 'archivado',
        activo         = false
    WHERE empresa_id   = p_empresa_id
      AND personal_id  = p_personal_id
      AND periodo_estado = 'vigente'
      AND (
        (p_tipo_documento_id IS NOT NULL AND tipo_documento_id = p_tipo_documento_id)
        OR tipo_doc = p_tipo_doc
      );
  END IF;

  INSERT INTO public.personal_documentos (
    empresa_id, personal_id, personal_tipo,
    tipo_doc, tipo_documento_id,
    nombre_archivo, archivo_url,
    fecha_emision, fecha_vencimiento,
    version, activo, estado_validacion, notas,
    subido_por, subido_desde,
    condiciones_laborales,
    contrato_periodo_id, periodo_grupo_id,
    periodo_fecha_inicio, periodo_fecha_fin,
    periodo_estado, seccion_documental,
    es_indefinido
  ) VALUES (
    p_empresa_id, p_personal_id, p_personal_tipo,
    p_tipo_doc, p_tipo_documento_id,
    p_nombre_archivo, p_archivo_url,
    p_fecha_emision, p_fecha_vencimiento,
    1, true, 'pendiente', p_notas,
    v_usuario_id, 'backoffice',
    COALESCE(p_condiciones_laborales, '{}'::jsonb),
    v_nuevo_periodo, v_nuevo_grupo_id,
    p_fecha_emision, p_fecha_vencimiento,
    'vigente', 'requisito_cargo',
    p_es_indefinido
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.nuevo_contrato_periodo(text,text,text,text,text,text,date,date,text,jsonb,text,text,boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.nuevo_contrato_periodo(text,text,text,text,text,text,date,date,text,jsonb,text,text,boolean) TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
