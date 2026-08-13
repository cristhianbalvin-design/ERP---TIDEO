-- 430 · Evita que un snapshot contractual con un área histórica inválida
-- bloquee la aprobación del documento.
--
-- Algunos contratos antiguos guardaron el ID de una unidad organizacional en
-- condiciones_laborales.area_id. La ficha de personal, en cambio, referencia
-- exclusivamente areas_empresa. Se conserva el nombre histórico del área y se
-- descarta solo el ID que ya no es válido antes de sincronizar la ficha.

DROP FUNCTION IF EXISTS public.validar_documento_personal_multisoc(text, text, text);

CREATE OR REPLACE FUNCTION public.validar_documento_personal_multisoc(
  p_documento_id text,
  p_decision text,
  p_motivo_rechazo text default null
)
RETURNS public.personal_documentos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc public.personal_documentos;
  v_row public.personal_documentos;
  v_otros_activos text[];
  v_area_id text;
BEGIN
  SELECT * INTO v_doc
  FROM public.personal_documentos
  WHERE id = p_documento_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Documento no encontrado';
  END IF;

  IF NOT public.usuario_tiene_empresa(v_doc.empresa_id) THEN
    RAISE EXCEPTION 'Acceso denegado al tenant';
  END IF;

  -- No propagamos IDs de área que no pertenecen al catálogo de áreas del
  -- tenant. El texto area_nombre se mantiene como evidencia contractual.
  IF p_decision = 'aprobado' THEN
    v_area_id := NULLIF(v_doc.condiciones_laborales ->> 'area_id', '');
    IF v_area_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM public.areas_empresa a
         WHERE a.id = v_area_id
           AND a.empresa_id = v_doc.empresa_id
       ) THEN
      UPDATE public.personal_documentos
      SET condiciones_laborales = COALESCE(condiciones_laborales, '{}'::jsonb) - 'area_id'
      WHERE id = p_documento_id
      RETURNING * INTO v_doc;
    END IF;
  END IF;

  IF v_doc.sociedad_id IS NOT NULL AND p_decision = 'aprobado' THEN
    SELECT COALESCE(array_agg(id), ARRAY[]::text[])
      INTO v_otros_activos
    FROM public.personal_documentos
    WHERE empresa_id = v_doc.empresa_id
      AND personal_id = v_doc.personal_id
      AND id <> v_doc.id
      AND activo = true
      AND sociedad_id IS NOT NULL
      AND sociedad_id <> v_doc.sociedad_id
      AND (
        (v_doc.tipo_documento_id IS NOT NULL AND tipo_documento_id = v_doc.tipo_documento_id)
        OR tipo_doc = v_doc.tipo_doc
      );
  END IF;

  v_row := public.validar_documento_personal(
    p_documento_id => p_documento_id,
    p_decision => p_decision,
    p_motivo_rechazo => p_motivo_rechazo
  );

  IF COALESCE(array_length(v_otros_activos, 1), 0) > 0 THEN
    UPDATE public.personal_documentos
    SET activo = true
    WHERE id = ANY(v_otros_activos);
  END IF;

  SELECT * INTO v_row FROM public.personal_documentos WHERE id = p_documento_id;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.validar_documento_personal_multisoc(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validar_documento_personal_multisoc(text, text, text) TO authenticated, service_role;

SELECT pg_notify('pgrst', 'reload schema');
