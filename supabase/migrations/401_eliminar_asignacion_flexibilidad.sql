-- Migración 401: Flexibilizar eliminación de asignación de jornada para tramos delimitados
-- Permite eliminar un tramo aunque tenga fecha_fin, siempre que sea cronológicamente el último del trabajador.

CREATE OR REPLACE FUNCTION public.eliminar_asignacion_jornada(
  p_id text,
  p_forzar_override boolean DEFAULT false,
  p_motivo_override text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row record;
  v_prev_id text;
  v_conflictos text;
  v_nombre text;
BEGIN
  -- 1. Obtener el tramo a eliminar
  SELECT * INTO v_row
  FROM public.personal_asignaciones_jornada
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Asignación de jornada no encontrada.';
  END IF;

  -- 2. Permisos (requiere acceso de edición a asistencia)
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.usuario_tiene_empresa(v_row.empresa_id) OR NOT public.usuario_puede(v_row.empresa_id, 'asistencia', 'editar') THEN
      RAISE EXCEPTION 'Acceso denegado para eliminar asignación de jornada.';
    END IF;
  END IF;

  -- 3. Solo permitir eliminar el último tramo cronológico (bloquear tramos intermedios)
  IF EXISTS (
    SELECT 1 FROM public.personal_asignaciones_jornada
    WHERE empresa_id = v_row.empresa_id
      AND personal_id = v_row.personal_id
      AND personal_tipo = v_row.personal_tipo
      AND fecha_inicio > v_row.fecha_inicio
  ) THEN
    RAISE EXCEPTION 'Solo se permite eliminar el último tramo cronológico del historial. No se pueden eliminar tramos intermedios.';
  END IF;

  -- 4. Buscar el tramo inmediatamente anterior para reabrirlo
  SELECT id INTO v_prev_id
  FROM public.personal_asignaciones_jornada
  WHERE empresa_id = v_row.empresa_id
    AND personal_id = v_row.personal_id
    AND personal_tipo = v_row.personal_tipo
    AND id <> p_id
  ORDER BY fecha_inicio DESC
  LIMIT 1;

  -- 5. Chequeo de Retro Wall EXPRESO para el tramo que estamos borrando
  SELECT string_agg(pn.periodo, ', ' ORDER BY pn.anio, pn.mes, pn.quincena)
  INTO v_conflictos
  FROM public.periodos_nomina pn
  WHERE pn.empresa_id = v_row.empresa_id
    AND EXISTS (
      SELECT 1 FROM public.nomina_detalle nd
      WHERE nd.periodo_id = pn.id::text
        AND nd.trabajador_id = v_row.personal_id
        AND nd.trabajador_tipo = v_row.personal_tipo
    )
    AND (CASE WHEN pn.quincena = 2 THEN make_date(pn.anio, pn.mes, 16)
              ELSE make_date(pn.anio, pn.mes, 1) END) <= COALESCE(v_row.fecha_fin, 'infinity'::date)
    AND COALESCE(pn.fecha_corte, (make_date(pn.anio, pn.mes, 1) + interval '1 month - 1 day')::date)
        >= v_row.fecha_inicio;

  IF v_conflictos IS NOT NULL THEN
    IF NOT p_forzar_override THEN
      IF v_row.personal_tipo = 'operativo' THEN
        SELECT nombre INTO v_nombre FROM public.personal_operativo WHERE id = v_row.personal_id;
      ELSE
        SELECT nombre INTO v_nombre FROM public.personal_administrativo WHERE id = v_row.personal_id;
      END IF;
      RAISE EXCEPTION 'RETRO_WALL: no se puede eliminar la asignación de jornada de % porque se cruza con nómina ya procesada en el/los periodo(s): %. Requiere autorización para forzar el cambio.',
        v_nombre, v_conflictos;
    ELSE
      IF p_motivo_override IS NULL OR trim(p_motivo_override) = '' THEN
        RAISE EXCEPTION 'Debe proporcionar un motivo para forzar la eliminación retroactiva.';
      END IF;
      -- Registrar en el log de auditoría
      INSERT INTO public.auditoria_cambios_nomina (
        empresa_id,
        trabajador_id,
        trabajador_tipo,
        accion,
        descripcion,
        motivo,
        usuario_id
      ) VALUES (
        v_row.empresa_id,
        v_row.personal_id,
        v_row.personal_tipo,
        'eliminar_asignacion_jornada_retroactiva',
        'Se forzó la eliminación del tramo (Inicio: ' || v_row.fecha_inicio::text || ', Fin: ' || COALESCE(v_row.fecha_fin::text, 'Vigente') || ', Régimen: ' || v_row.regimen_jornada || ') cruzando periodos: ' || v_conflictos,
        p_motivo_override,
        auth.uid()
      );
    END IF;
  END IF;

  -- 6. Eliminar el tramo actual
  DELETE FROM public.personal_asignaciones_jornada
  WHERE id = p_id;

  -- 7. Reabrir el tramo anterior (si lo hay)
  IF v_prev_id IS NOT NULL THEN
    UPDATE public.personal_asignaciones_jornada
    SET fecha_fin = NULL
    WHERE id = v_prev_id;
  END IF;

END;
$$;
