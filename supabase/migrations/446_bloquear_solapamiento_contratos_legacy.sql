-- 446 · Bloquear solapamiento de contratos al subir documentos en tenants sin multisociedad.
--
-- La validación vive en el wrapper legacy subir_documento_personal para proteger
-- cualquier caller autenticado sin afectar la ruta subir_documento_personal_sociedad.

CREATE OR REPLACE FUNCTION public.subir_documento_personal(
  p_empresa_id text,
  p_personal_id text,
  p_personal_tipo text,
  p_tipo_doc text,
  p_nombre_archivo text,
  p_archivo_url text,
  p_fecha_emision date default null,
  p_fecha_vencimiento date default null,
  p_notas text default null,
  p_subido_desde text default 'backoffice',
  p_tipo_documento_id text default null,
  p_condiciones_laborales jsonb default '{}'::jsonb,
  p_contrato_referencia_id text default null,
  p_adenda_cambios jsonb default '{}'::jsonb,
  p_fecha_vigencia_cambio date default null,
  p_seccion_documental text default null,
  p_contrato_periodo_id text default null,
  p_origen text default 'backoffice',
  p_es_indefinido boolean default false,
  p_forzar_override boolean default false,
  p_motivo_override text default null
)
RETURNS public.personal_documentos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_es_contrato_nuevo boolean := false;
  v_conflicto_id text;
  v_conflicto_tipo text;
  v_conflicto_inicio date;
  v_conflicto_fin date;
BEGIN
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Acceso denegado al tenant';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.empresas
    WHERE id = p_empresa_id
      AND multisociedad_habilitado = true
  ) THEN
    RAISE EXCEPTION 'La RPC legacy subir_documento_personal no admite tenants multisociedad. Usa subir_documento_personal_sociedad.';
  END IF;

  -- Mismo criterio de contrato base de nominaSociedadService.js:
  -- sin contrato de referencia, no adenda, y clasificacion por catalogo
  -- (nombre/categoria/captura_snapshot_laboral) o fallback textual legado.
  IF p_contrato_referencia_id IS NULL THEN
    SELECT (
      t.documento_padre_tipo_id IS NULL
      AND lower(concat_ws(' ', t.codigo, t.nombre, t.id, p_tipo_doc)) NOT LIKE '%adenda%'
      AND (
        lower(concat_ws(' ', t.codigo, t.nombre, t.id, p_tipo_doc)) LIKE '%contrato%'
        OR lower(COALESCE(t.categoria, '')) = 'contractual'
        OR COALESCE(t.captura_snapshot_laboral, false)
      )
    )
    INTO v_es_contrato_nuevo
    FROM public.tipos_documento_empresa t
    WHERE t.id = COALESCE(p_tipo_documento_id, p_tipo_doc)
    LIMIT 1;

    IF NOT FOUND THEN
      v_es_contrato_nuevo := (
        lower(COALESCE(p_tipo_doc, '')) LIKE '%contrato%'
        AND lower(COALESCE(p_tipo_doc, '')) NOT LIKE '%adenda%'
      );
    END IF;
  END IF;

  IF v_es_contrato_nuevo THEN
    SELECT
      d.id,
      COALESCE(t.nombre, d.tipo_doc),
      COALESCE(d.periodo_fecha_inicio, d.fecha_emision),
      CASE
        WHEN d.es_indefinido THEN NULL
        ELSE COALESCE(d.periodo_fecha_fin, d.fecha_vencimiento)
      END
    INTO
      v_conflicto_id,
      v_conflicto_tipo,
      v_conflicto_inicio,
      v_conflicto_fin
    FROM public.personal_documentos d
    LEFT JOIN public.tipos_documento_empresa t
      ON t.id = COALESCE(d.tipo_documento_id, d.tipo_doc)
    WHERE d.empresa_id = p_empresa_id
      AND d.personal_id = p_personal_id
      AND d.sociedad_id IS NOT DISTINCT FROM NULL
      AND d.activo = true
      AND d.estado_validacion = 'aprobado'
      AND COALESCE(d.periodo_estado, 'vigente') <> 'archivado'
      AND d.contrato_referencia_id IS NULL
      AND (
        (
          t.id IS NOT NULL
          AND t.documento_padre_tipo_id IS NULL
          AND lower(concat_ws(' ', t.codigo, t.nombre, t.id, d.tipo_doc)) NOT LIKE '%adenda%'
          AND (
            lower(concat_ws(' ', t.codigo, t.nombre, t.id, d.tipo_doc)) LIKE '%contrato%'
            OR lower(COALESCE(t.categoria, '')) = 'contractual'
            OR COALESCE(t.captura_snapshot_laboral, false)
          )
        )
        OR (
          t.id IS NULL
          AND lower(COALESCE(d.tipo_doc, '')) LIKE '%contrato%'
          AND lower(COALESCE(d.tipo_doc, '')) NOT LIKE '%adenda%'
        )
      )
      -- Fechas nulas son limites abiertos, igual que vigenteDurantePeriodo.
      AND (
        d.es_indefinido
        OR COALESCE(d.periodo_fecha_fin, d.fecha_vencimiento) IS NULL
        OR p_fecha_emision IS NULL
        OR COALESCE(d.periodo_fecha_fin, d.fecha_vencimiento) >= p_fecha_emision
      )
      AND (
        p_es_indefinido
        OR p_fecha_vencimiento IS NULL
        OR COALESCE(d.periodo_fecha_inicio, d.fecha_emision) IS NULL
        OR COALESCE(d.periodo_fecha_inicio, d.fecha_emision) <= p_fecha_vencimiento
      )
    ORDER BY COALESCE(d.periodo_fecha_inicio, d.fecha_emision, d.creado_en::date) DESC
    LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION
        'No se puede registrar el contrato: se superpone con el documento % (%), vigente de % a %.',
        v_conflicto_id,
        v_conflicto_tipo,
        COALESCE(v_conflicto_inicio::text, 'sin fecha de inicio'),
        COALESCE(v_conflicto_fin::text, 'sin fecha de fin');
    END IF;
  END IF;

  RETURN public.subir_documento_personal_nucleo_414(
    p_empresa_id, NULL, p_personal_id, p_personal_tipo, p_tipo_doc,
    p_nombre_archivo, p_archivo_url, p_fecha_emision, p_fecha_vencimiento,
    p_notas, p_subido_desde, p_tipo_documento_id, p_condiciones_laborales,
    p_contrato_referencia_id, p_adenda_cambios, p_fecha_vigencia_cambio,
    p_seccion_documental, p_contrato_periodo_id, p_origen,
    p_es_indefinido, p_forzar_override, p_motivo_override
  );
END;
$$;

REVOKE ALL ON FUNCTION public.subir_documento_personal(
  text, text, text, text, text, text, date, date, text, text, text, jsonb,
  text, jsonb, date, text, text, text, boolean, boolean, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.subir_documento_personal(
  text, text, text, text, text, text, date, date, text, text, text, jsonb,
  text, jsonb, date, text, text, text, boolean, boolean, text
) TO authenticated, service_role;

SELECT pg_notify('pgrst', 'reload schema');
