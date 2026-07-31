-- ============================================================================
-- 383 · Reinicio de jornada por trabajadores, sin depender de una UM
-- ============================================================================
-- Variante independiente del reinicio por UM. No modifica
-- reiniciar_roster_minero: reutiliza sus mismas garantías (tenant, permiso,
-- retro wall, ejecución atómica y orden seguro al dividir tramos abiertos).
-- No toca registros_asistencia ni roster_minero_ajustes.

-- 1. Impacto canónico compartido por preview y ejecución ---------------------

CREATE OR REPLACE FUNCTION public.reinicio_jornada_trabajadores_impactos(
  p_empresa_id text,
  p_personal_ids text[],
  p_fecha_inicio date,
  p_fecha_fin date
)
RETURNS TABLE (
  jornada_id text,
  personal_id text,
  personal_tipo text,
  jornada_fecha_inicio date,
  jornada_fecha_fin date,
  remociones datemultirange,
  eliminar_completa boolean,
  periodos_bloqueados text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  WITH seleccionados AS (
    SELECT DISTINCT btrim(x.personal_id) AS personal_id
    FROM unnest(COALESCE(p_personal_ids, ARRAY[]::text[])) AS x(personal_id)
    WHERE NULLIF(btrim(x.personal_id), '') IS NOT NULL
  ),
  cruces AS (
    SELECT
      j.id AS jornada_id,
      j.personal_id,
      j.personal_tipo,
      j.fecha_inicio AS jornada_fecha_inicio,
      j.fecha_fin AS jornada_fecha_fin,
      greatest(j.fecha_inicio, p_fecha_inicio) AS retiro_inicio,
      least(COALESCE(j.fecha_fin, p_fecha_fin), p_fecha_fin) AS retiro_fin
    FROM public.personal_asignaciones_jornada j
    JOIN seleccionados s ON s.personal_id = j.personal_id
    WHERE j.empresa_id = p_empresa_id
      AND j.fecha_inicio <= p_fecha_fin
      AND COALESCE(j.fecha_fin, 'infinity'::date) >= p_fecha_inicio
  ),
  impactos AS (
    SELECT
      c.jornada_id,
      c.personal_id,
      c.personal_tipo,
      c.jornada_fecha_inicio,
      c.jornada_fecha_fin,
      datemultirange(daterange(c.retiro_inicio, c.retiro_fin, '[]')) AS remociones
    FROM cruces c
    WHERE c.retiro_inicio <= c.retiro_fin
  ),
  bloqueos AS (
    SELECT
      c.jornada_id,
      array_agg(DISTINCT pn.periodo ORDER BY pn.periodo) AS periodos
    FROM cruces c
    JOIN public.periodos_nomina pn
      ON pn.empresa_id = p_empresa_id
     AND (CASE WHEN pn.quincena = 2 THEN make_date(pn.anio, pn.mes, 16)
               ELSE make_date(pn.anio, pn.mes, 1) END) <= c.retiro_fin
     AND COALESCE(
       pn.fecha_corte,
       (make_date(pn.anio, pn.mes, 1) + interval '1 month - 1 day')::date
     ) >= c.retiro_inicio
    WHERE EXISTS (
      SELECT 1
      FROM public.nomina_detalle nd
      WHERE nd.periodo_id = pn.id::text
        AND nd.trabajador_id = c.personal_id
        AND nd.trabajador_tipo = c.personal_tipo
    )
    GROUP BY c.jornada_id
  )
  SELECT
    i.jornada_id,
    i.personal_id,
    i.personal_tipo,
    i.jornada_fecha_inicio,
    i.jornada_fecha_fin,
    i.remociones,
    isempty(
      datemultirange(
        CASE
          WHEN i.jornada_fecha_fin IS NULL
            THEN daterange(i.jornada_fecha_inicio, NULL, '[)')
          ELSE daterange(i.jornada_fecha_inicio, i.jornada_fecha_fin, '[]')
        END
      ) - i.remociones
    ) AS eliminar_completa,
    COALESCE(b.periodos, ARRAY[]::text[]) AS periodos_bloqueados
  FROM impactos i
  LEFT JOIN bloqueos b ON b.jornada_id = i.jornada_id
  ORDER BY i.personal_id, i.jornada_fecha_inicio, i.jornada_id;
$$;

REVOKE ALL ON FUNCTION public.reinicio_jornada_trabajadores_impactos(
  text, text[], date, date
) FROM PUBLIC, anon, authenticated;

-- 2. Previsualización exacta -------------------------------------------------

CREATE OR REPLACE FUNCTION public.previsualizar_reinicio_jornada_trabajadores(
  p_empresa_id text,
  p_personal_ids text[],
  p_fecha_inicio date,
  p_fecha_fin date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_personal_ids text[];
  v_invalidos text;
  v_resultado jsonb;
BEGIN
  IF p_empresa_id <> 'emp_20601829101' THEN
    RAISE EXCEPTION
      'REINICIO_JORNADA_TENANT_NO_AUTORIZADO: esta acción solo está habilitada para DIFESMAQ.';
  END IF;
  IF NOT public.usuario_tiene_empresa(p_empresa_id)
     OR NOT public.usuario_puede(p_empresa_id, 'asistencia', 'editar') THEN
    RAISE EXCEPTION
      'REINICIO_JORNADA_PERMISO: requiere permiso editar en Control de Asistencia.';
  END IF;
  IF p_fecha_inicio IS NULL OR p_fecha_fin IS NULL OR p_fecha_fin < p_fecha_inicio THEN
    RAISE EXCEPTION 'REINICIO_JORNADA_RANGO_INVALIDO: el rango de fechas no es válido.';
  END IF;
  IF date_trunc('month', p_fecha_inicio)::date <> p_fecha_inicio
     OR (date_trunc('month', p_fecha_inicio) + interval '1 month - 1 day')::date <> p_fecha_fin THEN
    RAISE EXCEPTION
      'REINICIO_JORNADA_PERIODO_INVALIDO: debe seleccionar un mes calendario completo.';
  END IF;

  SELECT COALESCE(array_agg(x.personal_id ORDER BY x.personal_id), ARRAY[]::text[])
  INTO v_personal_ids
  FROM (
    SELECT DISTINCT btrim(u.personal_id) AS personal_id
    FROM unnest(COALESCE(p_personal_ids, ARRAY[]::text[])) AS u(personal_id)
    WHERE NULLIF(btrim(u.personal_id), '') IS NOT NULL
  ) x;

  IF cardinality(v_personal_ids) = 0 THEN
    RAISE EXCEPTION
      'REINICIO_JORNADA_SELECCION_VACIA: seleccione al menos un trabajador.';
  END IF;

  SELECT string_agg(x.personal_id, ', ' ORDER BY x.personal_id)
  INTO v_invalidos
  FROM unnest(v_personal_ids) AS x(personal_id)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.personal_operativo po
    WHERE po.empresa_id = p_empresa_id AND po.id = x.personal_id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.personal_administrativo pa
    WHERE pa.empresa_id = p_empresa_id AND pa.id = x.personal_id
  );

  IF v_invalidos IS NOT NULL THEN
    RAISE EXCEPTION
      'REINICIO_JORNADA_PERSONAL_INVALIDO: trabajador(es) inexistente(s) o ajeno(s) a DIFESMAQ: %.',
      v_invalidos;
  END IF;

  WITH impactos AS (
    SELECT *
    FROM public.reinicio_jornada_trabajadores_impactos(
      p_empresa_id, v_personal_ids, p_fecha_inicio, p_fecha_fin
    )
  ),
  personas AS (
    SELECT
      i.personal_id,
      i.personal_tipo,
      COALESCE(po.nombre, pa.nombre, i.personal_id) AS nombre
    FROM impactos i
    LEFT JOIN public.personal_operativo po
      ON i.personal_tipo = 'operativo'
     AND po.id = i.personal_id
     AND po.empresa_id = p_empresa_id
    LEFT JOIN public.personal_administrativo pa
      ON i.personal_tipo = 'administrativo'
     AND pa.id = i.personal_id
     AND pa.empresa_id = p_empresa_id
    GROUP BY i.personal_id, i.personal_tipo, po.nombre, pa.nombre
  )
  SELECT jsonb_build_object(
    'empresa_id', p_empresa_id,
    'personal_ids', to_jsonb(v_personal_ids),
    'fecha_inicio', p_fecha_inicio,
    'fecha_fin', p_fecha_fin,
    'trabajadores_seleccionados', cardinality(v_personal_ids),
    'trabajadores_afectados', (SELECT count(*) FROM personas),
    'jornadas_afectadas', (SELECT count(*) FROM impactos),
    'jornadas_eliminar', (
      SELECT count(*) FROM impactos WHERE eliminar_completa
    ),
    'jornadas_dividir', (
      SELECT count(*) FROM impactos WHERE NOT eliminar_completa
    ),
    'jornadas_bloqueadas', (
      SELECT count(*) FROM impactos WHERE cardinality(periodos_bloqueados) > 0
    ),
    'trabajadores', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'personal_id', personal_id,
          'personal_tipo', personal_tipo,
          'nombre', nombre
        ) ORDER BY nombre
      ) FROM personas
    ), '[]'::jsonb),
    'bloqueos', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'jornada_id', i.jornada_id,
          'personal_id', i.personal_id,
          'personal_tipo', i.personal_tipo,
          'nombre', COALESCE(po.nombre, pa.nombre, i.personal_id),
          'periodos', i.periodos_bloqueados,
          'motivo', 'La jornada se cruza con nómina ya procesada.'
        ) ORDER BY COALESCE(po.nombre, pa.nombre, i.personal_id), i.jornada_fecha_inicio
      )
      FROM impactos i
      LEFT JOIN public.personal_operativo po
        ON i.personal_tipo = 'operativo'
       AND po.id = i.personal_id
       AND po.empresa_id = p_empresa_id
      LEFT JOIN public.personal_administrativo pa
        ON i.personal_tipo = 'administrativo'
       AND pa.id = i.personal_id
       AND pa.empresa_id = p_empresa_id
      WHERE cardinality(i.periodos_bloqueados) > 0
    ), '[]'::jsonb)
  ) INTO v_resultado;

  RETURN v_resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.previsualizar_reinicio_jornada_trabajadores(
  text, text[], date, date
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.previsualizar_reinicio_jornada_trabajadores(
  text, text[], date, date
) TO authenticated;

-- 3. Ejecución todo-o-nada ---------------------------------------------------

CREATE OR REPLACE FUNCTION public.reiniciar_jornada_trabajadores(
  p_empresa_id text,
  p_personal_ids text[],
  p_fecha_inicio date,
  p_fecha_fin date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_personal_ids text[];
  v_entidad_id text;
  v_preview jsonb;
  v_bloqueos jsonb;
  v_impacto record;
  v_jornada public.personal_asignaciones_jornada%ROWTYPE;
  v_rango_original daterange;
  v_restantes datemultirange;
  v_segmento daterange;
  v_segmentos_conservados integer;
  v_primer_nuevo_id text;
  v_nuevo_id text;
  v_eliminadas integer := 0;
  v_divididas integer := 0;
  v_snapshots_eliminados integer := 0;
  v_trabajadores integer := 0;
  v_jornadas_ids jsonb := '[]'::jsonb;
BEGIN
  SELECT COALESCE(array_agg(x.personal_id ORDER BY x.personal_id), ARRAY[]::text[])
  INTO v_personal_ids
  FROM (
    SELECT DISTINCT btrim(u.personal_id) AS personal_id
    FROM unnest(COALESCE(p_personal_ids, ARRAY[]::text[])) AS u(personal_id)
    WHERE NULLIF(btrim(u.personal_id), '') IS NOT NULL
  ) x;

  -- Reutiliza la validación canónica de tenant, permiso, selección y período.
  v_preview := public.previsualizar_reinicio_jornada_trabajadores(
    p_empresa_id, v_personal_ids, p_fecha_inicio, p_fecha_fin
  );
  v_bloqueos := COALESCE(v_preview->'bloqueos', '[]'::jsonb);
  v_entidad_id := CASE
    WHEN cardinality(v_personal_ids) = 1 THEN v_personal_ids[1]
    ELSE p_empresa_id
  END;

  IF COALESCE((v_preview->>'jornadas_bloqueadas')::integer, 0) > 0 THEN
    INSERT INTO public.auditoria (
      empresa_id, user_id, modulo, entidad, entidad_id, accion, valor_nuevo
    ) VALUES (
      p_empresa_id,
      auth.uid(),
      'rrhh',
      'personal_asignaciones_jornada',
      v_entidad_id,
      'reinicio_jornada_trabajadores_bloqueado',
      jsonb_build_object(
        'personal_ids', to_jsonb(v_personal_ids),
        'trabajadores', v_preview->'trabajadores',
        'fecha_inicio', p_fecha_inicio,
        'fecha_fin', p_fecha_fin,
        'resultado', 'bloqueado',
        'bloqueos', v_bloqueos
      )
    );
    RETURN jsonb_build_object(
      'ok', false,
      'codigo', 'RETRO_WALL',
      'mensaje', 'El reinicio se cruza con nómina ya procesada. No se modificó ningún dato.',
      'bloqueos', v_bloqueos
    );
  END IF;

  DROP TABLE IF EXISTS pg_temp.reinicio_jornada_trabajadores_impactos_tx;
  DROP TABLE IF EXISTS pg_temp.reinicio_jornada_trabajadores_documentos_tx;

  CREATE TEMP TABLE reinicio_jornada_trabajadores_impactos_tx
  ON COMMIT DROP
  AS
  SELECT *
  FROM public.reinicio_jornada_trabajadores_impactos(
    p_empresa_id, v_personal_ids, p_fecha_inicio, p_fecha_fin
  );

  CREATE TEMP TABLE reinicio_jornada_trabajadores_documentos_tx (
    jornada_original_id text PRIMARY KEY,
    jornada_nueva_id text NOT NULL,
    documento_origen_id text NOT NULL
  ) ON COMMIT DROP;

  PERFORM 1
  FROM public.personal_asignaciones_jornada j
  WHERE j.id IN (
    SELECT jornada_id FROM reinicio_jornada_trabajadores_impactos_tx
  )
  ORDER BY j.id
  FOR UPDATE;

  SELECT count(DISTINCT personal_id),
         COALESCE(jsonb_agg(jornada_id ORDER BY jornada_id), '[]'::jsonb)
  INTO v_trabajadores, v_jornadas_ids
  FROM reinicio_jornada_trabajadores_impactos_tx;

  IF NOT EXISTS (SELECT 1 FROM reinicio_jornada_trabajadores_impactos_tx) THEN
    RETURN jsonb_build_object(
      'ok', true,
      'trabajadores_afectados', 0,
      'jornadas_eliminadas', 0,
      'jornadas_divididas', 0,
      'snapshots_eliminados', 0
    );
  END IF;

  -- La comprobación se repite bajo los locks antes de mutar.
  IF EXISTS (
    SELECT 1
    FROM reinicio_jornada_trabajadores_impactos_tx
    WHERE cardinality(periodos_bloqueados) > 0
  ) THEN
    RAISE EXCEPTION
      'RETRO_WALL: el impacto cambió durante la confirmación y ahora se cruza con nómina procesada. No se modificó ningún dato.';
  END IF;

  PERFORM set_config('tideo.reinicio_roster_interno', '1', true);

  -- Fase 1: crea todos los segmentos conservados mientras todas las jornadas
  -- originales siguen disponibles. Esto también cubre a una persona con varios
  -- tramos consecutivos: ninguno de ellos pierde antes de tiempo la cobertura
  -- que los triggers derivados necesitan para validar el ancla del ciclo.
  FOR v_impacto IN
    SELECT *
    FROM reinicio_jornada_trabajadores_impactos_tx
    ORDER BY personal_id, jornada_fecha_inicio, jornada_id
  LOOP
    SELECT * INTO STRICT v_jornada
    FROM public.personal_asignaciones_jornada
    WHERE id = v_impacto.jornada_id
    FOR UPDATE;

    v_rango_original := CASE
      WHEN v_jornada.fecha_fin IS NULL
        THEN daterange(v_jornada.fecha_inicio, NULL, '[)')
      ELSE daterange(v_jornada.fecha_inicio, v_jornada.fecha_fin, '[]')
    END;
    v_restantes := datemultirange(v_rango_original) - v_impacto.remociones;

    IF isempty(v_restantes) THEN
      v_eliminadas := v_eliminadas + 1;
      CONTINUE;
    END IF;

    v_divididas := v_divididas + 1;
    v_segmentos_conservados := 0;
    v_primer_nuevo_id := NULL;

    -- Mismo orden validado por 382: insertar mientras la original conserva la
    -- cobertura del ancla; eliminar la original solo al final.
    FOR v_segmento IN SELECT unnest(v_restantes)
    LOOP
      INSERT INTO public.personal_asignaciones_jornada (
        empresa_id, personal_id, personal_tipo, tipo_tramo,
        fecha_inicio, fecha_fin, regimen_jornada,
        dias_ciclo_trabajo, dias_ciclo_descanso, fecha_inicio_ciclo,
        turno_id, motivo, created_at,
        retro_override_por, retro_override_en, retro_override_motivo
      ) VALUES (
        v_jornada.empresa_id,
        v_jornada.personal_id,
        v_jornada.personal_tipo,
        v_jornada.tipo_tramo,
        lower(v_segmento),
        CASE WHEN upper_inf(v_segmento) THEN NULL ELSE upper(v_segmento) - 1 END,
        v_jornada.regimen_jornada,
        v_jornada.dias_ciclo_trabajo,
        v_jornada.dias_ciclo_descanso,
        v_jornada.fecha_inicio_ciclo,
        v_jornada.turno_id,
        v_jornada.motivo,
        v_jornada.created_at,
        v_jornada.retro_override_por,
        v_jornada.retro_override_en,
        v_jornada.retro_override_motivo
      )
      RETURNING id INTO v_nuevo_id;

      v_segmentos_conservados := v_segmentos_conservados + 1;
      v_primer_nuevo_id := COALESCE(v_primer_nuevo_id, v_nuevo_id);
    END LOOP;

    IF v_segmentos_conservados = 0 THEN
      RAISE EXCEPTION
        'REINICIO_JORNADA_ERROR_INTERNO: no se generaron segmentos conservados.';
    END IF;

    IF v_jornada.documento_origen_id IS NOT NULL THEN
      INSERT INTO reinicio_jornada_trabajadores_documentos_tx (
        jornada_original_id, jornada_nueva_id, documento_origen_id
      ) VALUES (
        v_jornada.id, v_primer_nuevo_id, v_jornada.documento_origen_id
      );
    END IF;
  END LOOP;

  -- Fase 2: una vez validados todos los inserts, elimina todas las fuentes.
  DELETE FROM public.personal_asignaciones_jornada j
  WHERE j.id IN (
    SELECT jornada_id FROM reinicio_jornada_trabajadores_impactos_tx
  );

  -- El vínculo documental es único y se transfiere después de retirar la fuente.
  UPDATE public.personal_asignaciones_jornada j
  SET documento_origen_id = m.documento_origen_id
  FROM reinicio_jornada_trabajadores_documentos_tx m
  WHERE j.id = m.jornada_nueva_id;

  PERFORM set_config('tideo.reinicio_roster_interno', '0', true);

  DELETE FROM public.roster_minero_snapshots s
  WHERE s.empresa_id = p_empresa_id
    AND s.periodo_anio = extract(year FROM p_fecha_inicio)::integer
    AND s.periodo_mes = extract(month FROM p_fecha_inicio)::integer
    AND s.personal_id IN (
      SELECT DISTINCT personal_id
      FROM reinicio_jornada_trabajadores_impactos_tx
    );
  GET DIAGNOSTICS v_snapshots_eliminados = ROW_COUNT;

  INSERT INTO public.auditoria (
    empresa_id, user_id, modulo, entidad, entidad_id, accion, valor_nuevo
  ) VALUES (
    p_empresa_id,
    auth.uid(),
    'rrhh',
    'personal_asignaciones_jornada',
    v_entidad_id,
    'reinicio_jornada_trabajadores',
    jsonb_build_object(
      'personal_ids', to_jsonb(v_personal_ids),
      'trabajadores', v_preview->'trabajadores',
      'fecha_inicio', p_fecha_inicio,
      'fecha_fin', p_fecha_fin,
      'resultado', 'ejecutado',
      'trabajadores_afectados', v_trabajadores,
      'jornadas_eliminadas', v_eliminadas,
      'jornadas_divididas', v_divididas,
      'snapshots_eliminados', v_snapshots_eliminados,
      'jornadas_ids', v_jornadas_ids,
      'bloqueos', '[]'::jsonb
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'trabajadores_afectados', v_trabajadores,
    'jornadas_eliminadas', v_eliminadas,
    'jornadas_divididas', v_divididas,
    'snapshots_eliminados', v_snapshots_eliminados
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reiniciar_jornada_trabajadores(
  text, text[], date, date
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reiniciar_jornada_trabajadores(
  text, text[], date, date
) TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
