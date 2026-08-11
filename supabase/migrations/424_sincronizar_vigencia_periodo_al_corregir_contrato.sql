-- 424 · Mantener alineada la vigencia efectiva al corregir un contrato base.
--
-- La pestaña Contrato muestra fecha_emision, mientras que Jornada valida
-- periodo_fecha_inicio. Al corregir un contrato existente, la RPC anterior
-- modificaba solo la primera fecha y podía dejar ambas vigencias divergentes.

DROP FUNCTION IF EXISTS public.corregir_documento_personal(
  text, date, date, jsonb, text, text, text, boolean, text, boolean
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
  v_empresa_id       text;
  v_personal_tipo    text;
  v_usuario_id       text;
  v_es_contrato_base boolean;
  v_row              public.personal_documentos;
BEGIN
  SELECT d.empresa_id,
         d.personal_tipo,
         (
           (COALESCE(t.captura_snapshot_laboral, false) AND t.documento_padre_tipo_id IS NULL)
           OR (
             lower(COALESCE(d.tipo_doc, '')) LIKE '%contrato%'
             AND lower(COALESCE(d.tipo_doc, '')) NOT LIKE '%adenda%'
           )
         )
    INTO v_empresa_id, v_personal_tipo, v_es_contrato_base
  FROM public.personal_documentos d
  LEFT JOIN public.tipos_documento_empresa t ON t.id = d.tipo_documento_id
  WHERE d.id = p_documento_id;

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
  SET fecha_emision         = COALESCE(p_fecha_emision, fecha_emision),
      fecha_vencimiento     = p_fecha_vencimiento,
      condiciones_laborales = COALESCE(p_condiciones_laborales, condiciones_laborales),
      notas                 = p_notas,
      archivo_url           = COALESCE(p_archivo_url, archivo_url),
      nombre_archivo        = COALESCE(p_nombre_archivo, nombre_archivo),
      es_indefinido         = COALESCE(p_es_indefinido, es_indefinido),
      -- El período contractual es la fuente de la cobertura de Jornada.
      -- En contratos base siempre debe reflejar la fecha corregida.
      periodo_fecha_inicio  = CASE
        WHEN v_es_contrato_base AND p_fecha_emision IS NOT NULL THEN p_fecha_emision
        ELSE periodo_fecha_inicio
      END,
      periodo_fecha_fin     = CASE
        WHEN v_es_contrato_base THEN
          CASE WHEN COALESCE(p_es_indefinido, es_indefinido) THEN NULL ELSE p_fecha_vencimiento END
        ELSE periodo_fecha_fin
      END,
      es_correccion         = true,
      retro_override_por    = CASE WHEN p_forzar_override THEN v_usuario_id ELSE NULL END,
      retro_override_en     = CASE WHEN p_forzar_override THEN now() ELSE NULL END,
      retro_override_motivo = CASE WHEN p_forzar_override THEN p_motivo_override ELSE NULL END
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
) TO authenticated, service_role;

SELECT pg_notify('pgrst', 'reload schema');
