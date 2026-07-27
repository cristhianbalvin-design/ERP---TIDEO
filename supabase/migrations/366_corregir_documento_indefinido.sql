-- 366 · Persistir la condición indefinida al corregir un documento existente.
-- La completitud documentaria sigue siendo responsabilidad de
-- calcular_habilitaciones_personal; esta migración solo corrige el guardado.

DROP FUNCTION IF EXISTS public.corregir_documento_personal(
  text, date, date, jsonb, text, text, text, boolean, text
);

CREATE OR REPLACE FUNCTION public.corregir_documento_personal(
  p_documento_id          text,
  p_fecha_emision         date     DEFAULT NULL,
  p_fecha_vencimiento     date     DEFAULT NULL,
  p_condiciones_laborales jsonb    DEFAULT NULL,
  p_notas                 text     DEFAULT NULL,
  p_archivo_url           text     DEFAULT NULL,
  p_nombre_archivo        text     DEFAULT NULL,
  p_forzar_override       boolean  DEFAULT false,
  p_motivo_override       text     DEFAULT NULL,
  p_es_indefinido         boolean  DEFAULT NULL
)
RETURNS public.personal_documentos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_id    text;
  v_personal_tipo text;
  v_usuario_id    text;
  v_row           public.personal_documentos;
BEGIN
  SELECT empresa_id, personal_tipo INTO v_empresa_id, v_personal_tipo
  FROM public.personal_documentos
  WHERE id = p_documento_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Documento no encontrado';
  END IF;

  IF NOT public.usuario_tiene_empresa(v_empresa_id) THEN
    RAISE EXCEPTION 'Acceso denegado al tenant';
  END IF;

  IF p_forzar_override AND NOT public.personal_documentos_puede_forzar_retro(v_empresa_id, v_personal_tipo) THEN
    RAISE EXCEPTION 'No tiene autorización para forzar cambios retroactivos sobre nómina ya procesada.';
  END IF;

  IF p_forzar_override THEN
    SELECT id INTO v_usuario_id FROM public.usuarios WHERE id = auth.uid()::text LIMIT 1;
  END IF;

  UPDATE public.personal_documentos
  SET fecha_emision           = COALESCE(p_fecha_emision, fecha_emision),
      fecha_vencimiento       = p_fecha_vencimiento,
      condiciones_laborales   = COALESCE(p_condiciones_laborales, condiciones_laborales),
      notas                   = p_notas,
      archivo_url             = COALESCE(p_archivo_url, archivo_url),
      nombre_archivo          = COALESCE(p_nombre_archivo, nombre_archivo),
      es_indefinido           = COALESCE(p_es_indefinido, es_indefinido),
      es_correccion           = true,
      retro_override_por      = CASE WHEN p_forzar_override THEN v_usuario_id ELSE NULL END,
      retro_override_en       = CASE WHEN p_forzar_override THEN now() ELSE NULL END,
      retro_override_motivo   = CASE WHEN p_forzar_override THEN p_motivo_override ELSE NULL END
  WHERE id = p_documento_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.corregir_documento_personal(
  text, date, date, jsonb, text, text, text, boolean, text, boolean
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.corregir_documento_personal(
  text, date, date, jsonb, text, text, text, boolean, text, boolean
) TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
