-- 429 · La sociedad empleadora se deriva del contrato vigente.
--
-- El formulario de corrección ya permitía elegir otra sociedad, pero la RPC
-- ignoraba ese dato. Esta versión persiste el cambio en la cadena contractual
-- y mantiene en la misma sociedad sus adendas vinculadas.

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
  p_es_indefinido         boolean  DEFAULT NULL,
  p_sociedad_id           uuid     DEFAULT NULL
)
RETURNS public.personal_documentos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_id       text;
  v_personal_tipo    text;
  v_personal_id      text;
  v_tipo_documento_id text;
  v_usuario_id       text;
  v_es_contrato_base boolean;
  v_sociedad_actual  uuid;
  v_multisociedad    boolean;
  v_alcance          uuid[];
  v_row              public.personal_documentos;
BEGIN
  SELECT d.empresa_id,
         d.personal_tipo,
         d.personal_id,
         d.tipo_documento_id,
         d.sociedad_id,
         (
           (COALESCE(t.captura_snapshot_laboral, false) AND t.documento_padre_tipo_id IS NULL)
           OR (
             lower(COALESCE(d.tipo_doc, '')) LIKE '%contrato%'
             AND lower(COALESCE(d.tipo_doc, '')) NOT LIKE '%adenda%'
           )
         )
    INTO v_empresa_id, v_personal_tipo, v_personal_id, v_tipo_documento_id,
         v_sociedad_actual, v_es_contrato_base
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

  IF p_sociedad_id IS NOT NULL AND p_sociedad_id IS DISTINCT FROM v_sociedad_actual THEN
    IF NOT v_es_contrato_base THEN
      RAISE EXCEPTION 'La sociedad empleadora solo se puede corregir desde un contrato base.';
    END IF;

    SELECT COALESCE(multisociedad_habilitado, false)
      INTO v_multisociedad
    FROM public.empresas
    WHERE id = v_empresa_id;

    IF NOT COALESCE(v_multisociedad, false) THEN
      RAISE EXCEPTION 'El tenant no tiene multisociedad habilitada.';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.sociedades s
      WHERE s.id = p_sociedad_id
        AND s.empresa_id = v_empresa_id
        AND s.activa = true
    ) THEN
      RAISE EXCEPTION 'La sociedad empleadora no pertenece al tenant o está inactiva.';
    END IF;

    -- SECURITY DEFINER no debe permitir saltar el alcance societario. Para
    -- trasladar el contrato se debe poder operar tanto el origen como el destino.
    v_alcance := public.usuario_alcance_sociedades(v_empresa_id);
    IF v_alcance IS NOT NULL
       AND (
         (v_sociedad_actual IS NOT NULL AND NOT (v_sociedad_actual = ANY(v_alcance)))
         OR NOT (p_sociedad_id = ANY(v_alcance))
       ) THEN
      RAISE EXCEPTION 'No tiene acceso a la sociedad de origen o destino del contrato.';
    END IF;
  END IF;

  UPDATE public.personal_documentos
  SET fecha_emision         = COALESCE(p_fecha_emision, fecha_emision),
      fecha_vencimiento     = p_fecha_vencimiento,
      condiciones_laborales = COALESCE(p_condiciones_laborales, condiciones_laborales),
      notas                 = p_notas,
      archivo_url           = COALESCE(p_archivo_url, archivo_url),
      nombre_archivo        = COALESCE(p_nombre_archivo, nombre_archivo),
      es_indefinido         = COALESCE(p_es_indefinido, es_indefinido),
      sociedad_id           = COALESCE(p_sociedad_id, sociedad_id),
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

  -- Contrato Primigenio es histórico cuando existe su sucesor. Para que la
  -- persona se traslade efectivamente, movemos los sucesores de la misma
  -- cadena y sociedad de origen, además de sus adendas. No se alteran los
  -- contratos simultáneos que el trabajador tenga en otra sociedad.
  IF p_sociedad_id IS NOT NULL AND p_sociedad_id IS DISTINCT FROM v_sociedad_actual THEN
    WITH RECURSIVE tipos_cadena AS (
      SELECT t.id, t.tipo_sucesor_id
      FROM public.tipos_documento_empresa t
      WHERE t.id = v_tipo_documento_id

      UNION

      SELECT sucesor.id, sucesor.tipo_sucesor_id
      FROM public.tipos_documento_empresa sucesor
      JOIN tipos_cadena anterior ON anterior.tipo_sucesor_id = sucesor.id
    ), contratos_cadena AS (
      SELECT d.id
      FROM public.personal_documentos d
      WHERE d.empresa_id = v_empresa_id
        AND d.personal_id = v_personal_id
        AND d.sociedad_id = v_sociedad_actual
        AND d.tipo_documento_id IN (SELECT id FROM tipos_cadena)
    )
    UPDATE public.personal_documentos d
       SET sociedad_id = p_sociedad_id
     WHERE d.empresa_id = v_empresa_id
       AND d.sociedad_id = v_sociedad_actual
       AND (
         d.id IN (SELECT id FROM contratos_cadena)
         OR d.contrato_referencia_id = p_documento_id
         OR d.contrato_referencia_id IN (SELECT id FROM contratos_cadena)
       );
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.corregir_documento_personal(
  text, date, date, jsonb, text, text, text, boolean, text, boolean, uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.corregir_documento_personal(
  text, date, date, jsonb, text, text, text, boolean, text, boolean, uuid
) TO authenticated, service_role;

SELECT pg_notify('pgrst', 'reload schema');
