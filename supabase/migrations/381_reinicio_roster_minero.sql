-- ============================================================================
-- 381 · Reinicio transaccional de roster minero por UM y período
-- ============================================================================
-- Alcance inicial: solo DIFESMAQ (emp_20601829101).
-- No modifica registros_asistencia ni roster_minero_ajustes.

-- 1. Cerrar el hueco del retro wall para DELETE ------------------------------

CREATE OR REPLACE FUNCTION public.bloquear_retro_asignacion_jornada_nomina_procesada()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_cambio_relevante boolean := true;
  v_rango_inicio date;
  v_rango_fin date;
  v_empresa_id text;
  v_personal_id text;
  v_personal_tipo text;
  v_override_por text;
  v_override_motivo text;
  v_entidad_id text;
  v_conflictos text;
  v_nombre text;
BEGIN
  -- El RPC de reinicio valida el rango exacto que se retira antes de dividir
  -- los tramos. Sus escrituras internas no deben volver a evaluar las partes
  -- que se conservan fuera del período.
  IF current_user = 'postgres'
     AND current_setting('tideo.reinicio_roster_interno', true) = '1' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_rango_inicio := OLD.fecha_inicio;
    v_rango_fin := OLD.fecha_fin;
    v_empresa_id := OLD.empresa_id;
    v_personal_id := OLD.personal_id;
    v_personal_tipo := OLD.personal_tipo;
    v_entidad_id := OLD.id;
  ELSE
    IF TG_OP = 'UPDATE' THEN
      v_cambio_relevante :=
        NEW.fecha_inicio IS DISTINCT FROM OLD.fecha_inicio
        OR NEW.fecha_fin IS DISTINCT FROM OLD.fecha_fin
        OR NEW.tipo_tramo IS DISTINCT FROM OLD.tipo_tramo
        OR NEW.regimen_jornada IS DISTINCT FROM OLD.regimen_jornada
        OR NEW.dias_ciclo_trabajo IS DISTINCT FROM OLD.dias_ciclo_trabajo
        OR NEW.dias_ciclo_descanso IS DISTINCT FROM OLD.dias_ciclo_descanso
        OR NEW.fecha_inicio_ciclo IS DISTINCT FROM OLD.fecha_inicio_ciclo;
      IF NOT v_cambio_relevante THEN RETURN NEW; END IF;
    END IF;

    v_rango_inicio := NEW.fecha_inicio;
    v_rango_fin := NEW.fecha_fin;
    v_empresa_id := NEW.empresa_id;
    v_personal_id := NEW.personal_id;
    v_personal_tipo := NEW.personal_tipo;
    v_override_por := NEW.retro_override_por;
    v_override_motivo := NEW.retro_override_motivo;
    v_entidad_id := NEW.id;
  END IF;

  IF v_rango_inicio IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  SELECT string_agg(pn.periodo, ', ' ORDER BY pn.anio, pn.mes, pn.quincena)
  INTO v_conflictos
  FROM public.periodos_nomina pn
  WHERE pn.empresa_id = v_empresa_id
    AND EXISTS (
      SELECT 1
      FROM public.nomina_detalle nd
      WHERE nd.periodo_id = pn.id::text
        AND nd.trabajador_id = v_personal_id
        AND nd.trabajador_tipo = v_personal_tipo
    )
    AND (CASE WHEN pn.quincena = 2 THEN make_date(pn.anio, pn.mes, 16)
              ELSE make_date(pn.anio, pn.mes, 1) END)
        <= COALESCE(v_rango_fin, 'infinity'::date)
    AND COALESCE(
      pn.fecha_corte,
      (make_date(pn.anio, pn.mes, 1) + interval '1 month - 1 day')::date
    ) >= v_rango_inicio;

  IF v_conflictos IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF v_personal_tipo = 'operativo' THEN
    SELECT nombre INTO v_nombre
    FROM public.personal_operativo
    WHERE id = v_personal_id AND empresa_id = v_empresa_id;
  ELSE
    SELECT nombre INTO v_nombre
    FROM public.personal_administrativo
    WHERE id = v_personal_id AND empresa_id = v_empresa_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'RETRO_WALL_DELETE: no se puede eliminar la asignación de jornada de % porque se cruza con nómina ya procesada en el/los periodo(s): %.',
      COALESCE(v_nombre, v_personal_id), v_conflictos;
  END IF;

  IF v_override_por IS NULL THEN
    RAISE EXCEPTION
      'RETRO_WALL: no se puede modificar la asignación de jornada de % porque se cruza con nómina ya procesada en el/los periodo(s): %. Requiere autorización para forzar el cambio.',
      COALESCE(v_nombre, v_personal_id), v_conflictos;
  END IF;

  IF NOT public.personal_documentos_puede_forzar_retro(v_empresa_id, v_personal_tipo) THEN
    RAISE EXCEPTION
      'RETRO_WALL_PERMISO: no tiene autorización para forzar cambios retroactivos sobre nómina ya procesada.';
  END IF;

  NEW.retro_override_en := COALESCE(NEW.retro_override_en, now());

  INSERT INTO public.auditoria (
    empresa_id, user_id, modulo, entidad, entidad_id, accion, valor_nuevo
  ) VALUES (
    v_empresa_id,
    auth.uid(),
    'rrhh',
    'personal_asignaciones_jornada',
    v_entidad_id,
    'retro_override_autorizado',
    jsonb_build_object(
      'personal_id', v_personal_id,
      'personal_tipo', v_personal_tipo,
      'periodos', v_conflictos,
      'motivo', v_override_motivo
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bloquear_retro_asignacion_jornada
  ON public.personal_asignaciones_jornada;
CREATE TRIGGER trg_bloquear_retro_asignacion_jornada
BEFORE INSERT OR UPDATE OR DELETE ON public.personal_asignaciones_jornada
FOR EACH ROW
EXECUTE FUNCTION public.bloquear_retro_asignacion_jornada_nomina_procesada();

-- El permiso de DELETE deja de ser solo pertenencia al tenant. INSERT/UPDATE
-- conservan el comportamiento previo; DELETE exige administrar Asistencia.
DROP POLICY IF EXISTS "asig_jornada_tenant_aislamiento"
  ON public.personal_asignaciones_jornada;
DROP POLICY IF EXISTS asig_jornada_select ON public.personal_asignaciones_jornada;
DROP POLICY IF EXISTS asig_jornada_insert ON public.personal_asignaciones_jornada;
DROP POLICY IF EXISTS asig_jornada_update ON public.personal_asignaciones_jornada;
DROP POLICY IF EXISTS asig_jornada_delete ON public.personal_asignaciones_jornada;

CREATE POLICY asig_jornada_select
  ON public.personal_asignaciones_jornada FOR SELECT
  USING (public.usuario_tiene_empresa(empresa_id));
CREATE POLICY asig_jornada_insert
  ON public.personal_asignaciones_jornada FOR INSERT
  WITH CHECK (public.usuario_tiene_empresa(empresa_id));
CREATE POLICY asig_jornada_update
  ON public.personal_asignaciones_jornada FOR UPDATE
  USING (public.usuario_tiene_empresa(empresa_id))
  WITH CHECK (public.usuario_tiene_empresa(empresa_id));
CREATE POLICY asig_jornada_delete
  ON public.personal_asignaciones_jornada FOR DELETE
  USING (
    public.usuario_tiene_empresa(empresa_id)
    AND public.usuario_puede(empresa_id, 'asistencia', 'editar')
  );

-- 2. Impacto canónico compartido por preview y ejecución ---------------------

CREATE OR REPLACE FUNCTION public.reinicio_roster_minero_impactos(
  p_empresa_id text,
  p_sede_id text,
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
  WITH um_intervalos AS (
    SELECT
      um.personal_id,
      um.personal_tipo,
      greatest(um.fecha_inicio, p_fecha_inicio) AS fecha_inicio,
      least(COALESCE(um.fecha_fin, p_fecha_fin), p_fecha_fin) AS fecha_fin
    FROM public.personal_asignaciones_um um
    WHERE um.empresa_id = p_empresa_id
      AND um.sede_id = p_sede_id
      AND um.fecha_inicio <= p_fecha_fin
      AND COALESCE(um.fecha_fin, 'infinity'::date) >= p_fecha_inicio
  ),
  cruces AS (
    SELECT
      j.id AS jornada_id,
      j.personal_id,
      j.personal_tipo,
      j.fecha_inicio AS jornada_fecha_inicio,
      j.fecha_fin AS jornada_fecha_fin,
      greatest(j.fecha_inicio, um.fecha_inicio) AS retiro_inicio,
      least(COALESCE(j.fecha_fin, um.fecha_fin), um.fecha_fin) AS retiro_fin
    FROM public.personal_asignaciones_jornada j
    JOIN um_intervalos um
      ON um.personal_id = j.personal_id
     AND um.personal_tipo = j.personal_tipo
    WHERE j.empresa_id = p_empresa_id
      AND j.fecha_inicio <= um.fecha_fin
      AND COALESCE(j.fecha_fin, 'infinity'::date) >= um.fecha_inicio
  ),
  agrupados AS (
    SELECT
      c.jornada_id,
      c.personal_id,
      c.personal_tipo,
      c.jornada_fecha_inicio,
      c.jornada_fecha_fin,
      range_agg(daterange(c.retiro_inicio, c.retiro_fin, '[]')) AS remociones
    FROM cruces c
    WHERE c.retiro_inicio <= c.retiro_fin
    GROUP BY
      c.jornada_id,
      c.personal_id,
      c.personal_tipo,
      c.jornada_fecha_inicio,
      c.jornada_fecha_fin
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
    a.jornada_id,
    a.personal_id,
    a.personal_tipo,
    a.jornada_fecha_inicio,
    a.jornada_fecha_fin,
    a.remociones,
    isempty(
      datemultirange(
        CASE
          WHEN a.jornada_fecha_fin IS NULL
            THEN daterange(a.jornada_fecha_inicio, NULL, '[)')
          ELSE daterange(a.jornada_fecha_inicio, a.jornada_fecha_fin, '[]')
        END
      ) - a.remociones
    ) AS eliminar_completa,
    COALESCE(b.periodos, ARRAY[]::text[]) AS periodos_bloqueados
  FROM agrupados a
  LEFT JOIN bloqueos b ON b.jornada_id = a.jornada_id
  ORDER BY a.personal_id, a.jornada_fecha_inicio, a.jornada_id;
$$;

REVOKE ALL ON FUNCTION public.reinicio_roster_minero_impactos(
  text, text, date, date
) FROM PUBLIC, anon, authenticated;

-- 3. Previsualización exacta -------------------------------------------------

CREATE OR REPLACE FUNCTION public.previsualizar_reinicio_roster_minero(
  p_empresa_id text,
  p_sede_id text,
  p_fecha_inicio date,
  p_fecha_fin date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_sede_nombre text;
  v_resultado jsonb;
BEGIN
  IF p_empresa_id <> 'emp_20601829101' THEN
    RAISE EXCEPTION
      'REINICIO_ROSTER_TENANT_NO_AUTORIZADO: esta acción solo está habilitada para DIFESMAQ.';
  END IF;
  IF NOT public.usuario_tiene_empresa(p_empresa_id)
     OR NOT public.usuario_puede(p_empresa_id, 'asistencia', 'editar') THEN
    RAISE EXCEPTION
      'REINICIO_ROSTER_PERMISO: requiere permiso editar en Control de Asistencia.';
  END IF;
  IF p_fecha_inicio IS NULL OR p_fecha_fin IS NULL OR p_fecha_fin < p_fecha_inicio THEN
    RAISE EXCEPTION 'REINICIO_ROSTER_RANGO_INVALIDO: el rango de fechas no es válido.';
  END IF;
  IF date_trunc('month', p_fecha_inicio)::date <> p_fecha_inicio
     OR (date_trunc('month', p_fecha_inicio) + interval '1 month - 1 day')::date <> p_fecha_fin THEN
    RAISE EXCEPTION
      'REINICIO_ROSTER_PERIODO_INVALIDO: debe seleccionar un mes calendario completo.';
  END IF;

  SELECT s.nombre INTO v_sede_nombre
  FROM public.sedes s
  WHERE s.id = p_sede_id
    AND s.empresa_id = p_empresa_id
    AND s.tipo = 'unidad_minera';
  IF v_sede_nombre IS NULL THEN
    RAISE EXCEPTION
      'REINICIO_ROSTER_UM_INVALIDA: la unidad minera no existe o no pertenece a DIFESMAQ.';
  END IF;

  WITH impactos AS (
    SELECT *
    FROM public.reinicio_roster_minero_impactos(
      p_empresa_id, p_sede_id, p_fecha_inicio, p_fecha_fin
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
    'sede_id', p_sede_id,
    'unidad_minera', v_sede_nombre,
    'fecha_inicio', p_fecha_inicio,
    'fecha_fin', p_fecha_fin,
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

REVOKE ALL ON FUNCTION public.previsualizar_reinicio_roster_minero(
  text, text, date, date
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.previsualizar_reinicio_roster_minero(
  text, text, date, date
) TO authenticated;

-- 4. Ejecución todo-o-nada ---------------------------------------------------

CREATE OR REPLACE FUNCTION public.reiniciar_roster_minero(
  p_empresa_id text,
  p_sede_id text,
  p_fecha_inicio date,
  p_fecha_fin date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_preview jsonb;
  v_bloqueos jsonb;
  v_impacto record;
  v_jornada public.personal_asignaciones_jornada%ROWTYPE;
  v_rango_original daterange;
  v_restantes datemultirange;
  v_segmento daterange;
  v_primero boolean;
  v_segmentos_conservados integer;
  v_eliminadas integer := 0;
  v_divididas integer := 0;
  v_snapshots_eliminados integer := 0;
  v_trabajadores integer := 0;
  v_jornadas_ids jsonb := '[]'::jsonb;
BEGIN
  -- Reutiliza todas las validaciones de tenant, permiso, UM y rango.
  v_preview := public.previsualizar_reinicio_roster_minero(
    p_empresa_id, p_sede_id, p_fecha_inicio, p_fecha_fin
  );
  v_bloqueos := COALESCE(v_preview->'bloqueos', '[]'::jsonb);

  IF COALESCE((v_preview->>'jornadas_bloqueadas')::integer, 0) > 0 THEN
    INSERT INTO public.auditoria (
      empresa_id, user_id, modulo, entidad, entidad_id, accion, valor_nuevo
    ) VALUES (
      p_empresa_id,
      auth.uid(),
      'rrhh',
      'personal_asignaciones_jornada',
      p_sede_id,
      'reinicio_roster_bloqueado',
      jsonb_build_object(
        'unidad_minera_id', p_sede_id,
        'unidad_minera', v_preview->>'unidad_minera',
        'fecha_inicio', p_fecha_inicio,
        'fecha_fin', p_fecha_fin,
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

  DROP TABLE IF EXISTS pg_temp.reinicio_roster_impactos_tx;

  CREATE TEMP TABLE reinicio_roster_impactos_tx
  ON COMMIT DROP
  AS
  SELECT *
  FROM public.reinicio_roster_minero_impactos(
    p_empresa_id, p_sede_id, p_fecha_inicio, p_fecha_fin
  );

  -- Serializa las jornadas afectadas. Si cambiaron entre preview y ejecución,
  -- toda la operación usa el impacto recalculado dentro de esta transacción.
  PERFORM 1
  FROM public.personal_asignaciones_jornada j
  WHERE j.id IN (SELECT jornada_id FROM reinicio_roster_impactos_tx)
  ORDER BY j.id
  FOR UPDATE;

  SELECT count(DISTINCT personal_id),
         COALESCE(jsonb_agg(jornada_id ORDER BY jornada_id), '[]'::jsonb)
  INTO v_trabajadores, v_jornadas_ids
  FROM reinicio_roster_impactos_tx;

  IF NOT EXISTS (SELECT 1 FROM reinicio_roster_impactos_tx) THEN
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
    FROM reinicio_roster_impactos_tx
    WHERE cardinality(periodos_bloqueados) > 0
  ) THEN
    RAISE EXCEPTION
      'RETRO_WALL: el impacto cambió durante la confirmación y ahora se cruza con nómina procesada. No se modificó ningún dato.';
  END IF;

  PERFORM set_config('tideo.reinicio_roster_interno', '1', true);

  FOR v_impacto IN
    SELECT * FROM reinicio_roster_impactos_tx
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
      DELETE FROM public.personal_asignaciones_jornada
      WHERE id = v_jornada.id;
      v_eliminadas := v_eliminadas + 1;
      CONTINUE;
    END IF;

    v_divididas := v_divididas + 1;
    v_primero := true;
    v_segmentos_conservados := 0;

    FOR v_segmento IN SELECT unnest(v_restantes)
    LOOP
      v_segmentos_conservados := v_segmentos_conservados + 1;
      IF v_primero THEN
        UPDATE public.personal_asignaciones_jornada
        SET fecha_inicio = lower(v_segmento),
            fecha_fin = CASE
              WHEN upper_inf(v_segmento) THEN NULL
              ELSE upper(v_segmento) - 1
            END
        WHERE id = v_jornada.id;
        v_primero := false;
      ELSE
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
        );
      END IF;
    END LOOP;

    IF v_segmentos_conservados = 0 THEN
      RAISE EXCEPTION 'REINICIO_ROSTER_ERROR_INTERNO: no se generaron segmentos conservados.';
    END IF;
  END LOOP;

  PERFORM set_config('tideo.reinicio_roster_interno', '0', true);

  DELETE FROM public.roster_minero_snapshots s
  WHERE s.empresa_id = p_empresa_id
    AND s.periodo_anio = extract(year FROM p_fecha_inicio)::integer
    AND s.periodo_mes = extract(month FROM p_fecha_inicio)::integer
    AND s.personal_id IN (
      SELECT DISTINCT personal_id FROM reinicio_roster_impactos_tx
    );
  GET DIAGNOSTICS v_snapshots_eliminados = ROW_COUNT;

  INSERT INTO public.auditoria (
    empresa_id, user_id, modulo, entidad, entidad_id, accion, valor_nuevo
  ) VALUES (
    p_empresa_id,
    auth.uid(),
    'rrhh',
    'personal_asignaciones_jornada',
    p_sede_id,
    'reinicio_roster_minero',
    jsonb_build_object(
      'unidad_minera_id', p_sede_id,
      'unidad_minera', v_preview->>'unidad_minera',
      'fecha_inicio', p_fecha_inicio,
      'fecha_fin', p_fecha_fin,
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

REVOKE ALL ON FUNCTION public.reiniciar_roster_minero(
  text, text, date, date
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reiniciar_roster_minero(
  text, text, date, date
) TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
