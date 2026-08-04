-- ============================================================================
-- 399 · Eliminar asignación de jornada vigente y Retro Wall
-- ============================================================================
-- Elimina una asignación de jornada si es la vigente (fecha_fin IS NULL).
-- Reabre el tramo anterior (seteando fecha_fin = NULL).
-- Soporta Retro Wall de forma manual para el DELETE, y mediante trigger para el UPDATE.

CREATE OR REPLACE FUNCTION public.eliminar_asignacion_jornada(
  p_id text,
  p_forzar_override boolean DEFAULT false,
  p_motivo_override text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_row public.personal_asignaciones_jornada;
  v_prev_id text;
  v_conflictos text;
  v_nombre text;
  v_usuario_id text;
BEGIN
  -- 1. Obtener el registro
  SELECT * INTO v_row
  FROM public.personal_asignaciones_jornada
  WHERE id = p_id;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Asignación de jornada no encontrada.';
  END IF;

  -- 2. Permisos (requiere acceso de edición a asistencia)
  IF NOT public.usuario_tiene_empresa(v_row.empresa_id) OR NOT public.usuario_puede(v_row.empresa_id, 'asistencia', 'editar') THEN
    RAISE EXCEPTION 'Acceso denegado para eliminar asignación de jornada.';
  END IF;

  -- 3. Solo permitir eliminar el tramo vigente
  IF v_row.fecha_fin IS NOT NULL THEN
    RAISE EXCEPTION 'Solo se permite eliminar el tramo vigente (el último del historial). Los tramos cerrados no se pueden eliminar.';
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
  -- (Si hay un tramo anterior, el trigger 'trg_bloquear_retro_asignacion_jornada' 
  -- reaccionará al UPDATE de reapertura. Sin embargo, si NO hay tramo anterior,
  -- el UPDATE no se ejecuta y el DELETE podría evadir la protección si no la validamos aquí).
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
        COALESCE(v_nombre, v_row.personal_id), v_conflictos;
    END IF;

    IF NOT public.personal_documentos_puede_forzar_retro(v_row.empresa_id, v_row.personal_tipo) THEN
      RAISE EXCEPTION 'RETRO_WALL_PERMISO: no tiene autorización para forzar cambios retroactivos sobre nómina ya procesada.';
    END IF;

    SELECT id INTO v_usuario_id FROM public.usuarios WHERE id = auth.uid()::text LIMIT 1;
    
    -- Inyectar rastro de auditoría para el DELETE
    INSERT INTO public.auditoria (empresa_id, user_id, modulo, entidad, entidad_id, accion, valor_nuevo)
    VALUES (
      v_row.empresa_id, v_usuario_id, 'rrhh', 'personal_asignaciones_jornada', v_row.id, 'retro_override_autorizado',
      jsonb_build_object(
        'accion', 'eliminar_tramo',
        'personal_id', v_row.personal_id,
        'personal_tipo', v_row.personal_tipo,
        'periodos', v_conflictos,
        'motivo', p_motivo_override
      )
    );
  END IF;

  -- 6. Ejecutar el DELETE
  DELETE FROM public.personal_asignaciones_jornada WHERE id = p_id;

  -- 7. Reabrir el tramo anterior (si existe)
  IF v_prev_id IS NOT NULL THEN
    -- Al hacer este UPDATE, el trigger `trg_bloquear_retro_asignacion_jornada` va a detectar un cambio en fecha_fin.
    -- Para que el trigger lo deje pasar si hay conflictos, debemos inyectar las credenciales de override.
    UPDATE public.personal_asignaciones_jornada
    SET fecha_fin = NULL,
        retro_override_por = CASE WHEN p_forzar_override AND v_conflictos IS NOT NULL THEN v_usuario_id ELSE retro_override_por END,
        retro_override_en = CASE WHEN p_forzar_override AND v_conflictos IS NOT NULL THEN now() ELSE retro_override_en END,
        retro_override_motivo = CASE WHEN p_forzar_override AND v_conflictos IS NOT NULL THEN p_motivo_override ELSE retro_override_motivo END
    WHERE id = v_prev_id;
  END IF;

END;
$$;

SELECT pg_notify('pgrst', 'reload schema');
