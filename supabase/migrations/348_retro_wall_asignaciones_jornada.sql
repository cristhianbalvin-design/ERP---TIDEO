-- ============================================================================
-- 348 · Retro wall para personal_asignaciones_jornada
-- ============================================================================
-- crear_asignacion_jornada() (RPC detras del panel "+ Nueva asignacion") no
-- tenia ninguna proteccion contra crear o cerrar un tramo de jornada sobre un
-- periodo de nomina ya procesado, a diferencia de personal_documentos (retro
-- wall desde 320_retro_wall_documentos_nomina.sql, ampliado en 347 para cubrir
-- tambien condiciones_laborales). Se replica el mismo patron aqui: bloqueo por
-- defecto vía trigger BEFORE INSERT/UPDATE, override explicito y trazable para
-- usuarios autorizados, reutilizando personal_documentos_puede_forzar_retro()
-- (su logica no depende de personal_documentos, solo valida permiso 'aprobar'
-- sobre rrhh_operativo/rrhh_admin; no hace falta duplicarla ni renombrarla).
--
-- Nota para el registro: los tramos de Juan (pop_1783959070510) y Mariano
-- Cardenas (pop_1780692098054) en emp_2000000000 se crearon el 22/07/2026 vía
-- crear_asignacion_jornada() ANTES de que esta proteccion existiera. Ambos
-- cruzan el periodo "Julio 2026" (ya cerrado, con nomina_detalle calculada
-- para los dos) y no tienen fila de override registrada porque el mecanismo
-- de autorizacion simplemente no existia todavia en ese momento. El dato final
-- de ambos es correcto (confirmado por auditoria cruzada contra personal_
-- operativo y asistencia_ciclos_mineros); lo que falta, a diferencia de los
-- demas overrides de esta sesion, es el rastro de auditoria y justificacion.
-- Se deja anotado aqui en vez de fabricar retroactivamente una fila de
-- auditoria falsa.

-- 1. Columnas de override (mismo patron que personal_documentos) -------------

ALTER TABLE public.personal_asignaciones_jornada
  ADD COLUMN IF NOT EXISTS retro_override_por text REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS retro_override_en timestamptz,
  ADD COLUMN IF NOT EXISTS retro_override_motivo text;

-- 2. Trigger de bloqueo -------------------------------------------------------

CREATE OR REPLACE FUNCTION public.bloquear_retro_asignacion_jornada_nomina_procesada()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_cambio_relevante boolean;
  v_rango_inicio     date;
  v_rango_fin        date;
  v_conflictos       text;
  v_nombre           text;
BEGIN
  -- Solo evaluar si realmente cambia algo que afecte el calculo de nomina:
  -- vigencia del tramo (fecha_inicio/fecha_fin, incluye el cierre retroactivo
  -- de un tramo anterior) o su contenido (tipo_tramo, regimen y dias de ciclo).
  IF TG_OP = 'UPDATE' THEN
    v_cambio_relevante :=
      NEW.fecha_inicio IS DISTINCT FROM OLD.fecha_inicio
      OR NEW.fecha_fin IS DISTINCT FROM OLD.fecha_fin
      OR NEW.tipo_tramo IS DISTINCT FROM OLD.tipo_tramo
      OR NEW.regimen_jornada IS DISTINCT FROM OLD.regimen_jornada
      OR NEW.dias_ciclo_trabajo IS DISTINCT FROM OLD.dias_ciclo_trabajo
      OR NEW.dias_ciclo_descanso IS DISTINCT FROM OLD.dias_ciclo_descanso
      OR NEW.fecha_inicio_ciclo IS DISTINCT FROM OLD.fecha_inicio_ciclo;
    IF NOT v_cambio_relevante THEN
      RETURN NEW;
    END IF;
  END IF;

  v_rango_inicio := NEW.fecha_inicio;
  v_rango_fin := NEW.fecha_fin; -- NULL = tramo vigente/indefinido

  IF v_rango_inicio IS NULL THEN
    RETURN NEW;
  END IF;

  -- Mismo criterio de conflicto que bloquear_retro_documento_nomina_procesada:
  -- existe fila en nomina_detalle para este trabajador en un periodo cuyo
  -- rango de fechas se cruza con el del tramo.
  SELECT string_agg(pn.periodo, ', ' ORDER BY pn.anio, pn.mes, pn.quincena)
  INTO v_conflictos
  FROM public.periodos_nomina pn
  WHERE pn.empresa_id = NEW.empresa_id
    AND EXISTS (
      SELECT 1 FROM public.nomina_detalle nd
      WHERE nd.periodo_id = pn.id::text
        AND nd.trabajador_id = NEW.personal_id
        AND nd.trabajador_tipo = NEW.personal_tipo
    )
    AND (CASE WHEN pn.quincena = 2 THEN make_date(pn.anio, pn.mes, 16)
              ELSE make_date(pn.anio, pn.mes, 1) END) <= COALESCE(v_rango_fin, 'infinity'::date)
    AND COALESCE(pn.fecha_corte, (make_date(pn.anio, pn.mes, 1) + interval '1 month - 1 day')::date)
        >= v_rango_inicio;

  IF v_conflictos IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.retro_override_por IS NULL THEN
    IF NEW.personal_tipo = 'operativo' THEN
      SELECT nombre INTO v_nombre FROM public.personal_operativo WHERE id = NEW.personal_id;
    ELSE
      SELECT nombre INTO v_nombre FROM public.personal_administrativo WHERE id = NEW.personal_id;
    END IF;

    RAISE EXCEPTION 'RETRO_WALL: no se puede modificar la asignación de jornada de % porque se cruza con nómina ya procesada en el/los periodo(s): %. Requiere autorización para forzar el cambio.',
      COALESCE(v_nombre, NEW.personal_id), v_conflictos;
  END IF;

  IF NOT public.personal_documentos_puede_forzar_retro(NEW.empresa_id, NEW.personal_tipo) THEN
    RAISE EXCEPTION 'RETRO_WALL_PERMISO: no tiene autorización para forzar cambios retroactivos sobre nómina ya procesada.';
  END IF;

  NEW.retro_override_en := COALESCE(NEW.retro_override_en, now());

  INSERT INTO public.auditoria (empresa_id, user_id, modulo, entidad, entidad_id, accion, valor_nuevo)
  VALUES (
    NEW.empresa_id, auth.uid(), 'rrhh', 'personal_asignaciones_jornada', NEW.id, 'retro_override_autorizado',
    jsonb_build_object(
      'personal_id', NEW.personal_id,
      'personal_tipo', NEW.personal_tipo,
      'periodos', v_conflictos,
      'motivo', NEW.retro_override_motivo
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bloquear_retro_asignacion_jornada ON public.personal_asignaciones_jornada;
CREATE TRIGGER trg_bloquear_retro_asignacion_jornada
BEFORE INSERT OR UPDATE ON public.personal_asignaciones_jornada
FOR EACH ROW
EXECUTE FUNCTION public.bloquear_retro_asignacion_jornada_nomina_procesada();

-- 3. crear_asignacion_jornada: aceptar override explicito y trazable --------
-- A diferencia de las RPC de personal_documentos (320), agregar parametros
-- aqui SI crea un overload nuevo en vez de reemplazar la funcion (Postgres
-- distingue por lista de tipos, no por nombre): hay que tumbar explicitamente
-- la firma vieja de 11 parametros o PostgREST/psql quedan con dos candidatas
-- ambiguas para llamadas posicionales de 11 argumentos.
DROP FUNCTION IF EXISTS public.crear_asignacion_jornada(
  text, text, text, text, date, text, integer, integer, date, text, text
);

CREATE OR REPLACE FUNCTION public.crear_asignacion_jornada(
  p_empresa_id text,
  p_personal_id text,
  p_personal_tipo text,
  p_tipo_tramo text,
  p_fecha_inicio date,
  p_regimen_jornada text DEFAULT NULL,
  p_dias_ciclo_trabajo integer DEFAULT NULL,
  p_dias_ciclo_descanso integer DEFAULT NULL,
  p_fecha_inicio_ciclo date DEFAULT NULL,
  p_turno_id text DEFAULT NULL,
  p_motivo text DEFAULT NULL,
  p_forzar_override boolean DEFAULT false,
  p_motivo_override text DEFAULT NULL
)
RETURNS public.personal_asignaciones_jornada
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.personal_asignaciones_jornada;
  v_usuario_id text;
BEGIN
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Acceso denegado al tenant';
  END IF;

  IF p_forzar_override AND NOT public.personal_documentos_puede_forzar_retro(p_empresa_id, p_personal_tipo) THEN
    RAISE EXCEPTION 'No tiene autorización para forzar cambios retroactivos sobre nómina ya procesada.';
  END IF;

  IF p_forzar_override THEN
    SELECT id INTO v_usuario_id FROM public.usuarios WHERE id = auth.uid()::text LIMIT 1;
  END IF;

  IF p_tipo_tramo = 'normal' AND NOT (
    (p_regimen_jornada = 'general' AND p_dias_ciclo_trabajo IS NULL
      AND p_dias_ciclo_descanso IS NULL AND p_fecha_inicio_ciclo IS NULL)
    OR (p_regimen_jornada = 'ciclo_acumulativo'
      AND (p_dias_ciclo_trabajo, p_dias_ciclo_descanso) IN ((14,7),(20,10),(28,14),(2,1))
      AND p_fecha_inicio_ciclo IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'JORNADA_PRESET_INVALIDO: seleccione un régimen predefinido';
  END IF;

  UPDATE public.personal_asignaciones_jornada
  SET fecha_fin = p_fecha_inicio - 1,
      retro_override_por    = CASE WHEN p_forzar_override THEN v_usuario_id ELSE NULL END,
      retro_override_en     = CASE WHEN p_forzar_override THEN now() ELSE NULL END,
      retro_override_motivo = CASE WHEN p_forzar_override THEN p_motivo_override ELSE NULL END
  WHERE empresa_id = p_empresa_id AND personal_id = p_personal_id
    AND personal_tipo = p_personal_tipo AND fecha_fin IS NULL
    AND fecha_inicio < p_fecha_inicio;

  SELECT * INTO v_row FROM public.personal_asignaciones_jornada
  WHERE empresa_id = p_empresa_id AND personal_id = p_personal_id
    AND personal_tipo = p_personal_tipo AND fecha_inicio = p_fecha_inicio
  ORDER BY created_at DESC LIMIT 1;

  IF v_row.id IS NOT NULL THEN
    UPDATE public.personal_asignaciones_jornada
    SET tipo_tramo = p_tipo_tramo, fecha_fin = NULL,
        regimen_jornada = p_regimen_jornada,
        dias_ciclo_trabajo = p_dias_ciclo_trabajo,
        dias_ciclo_descanso = p_dias_ciclo_descanso,
        fecha_inicio_ciclo = p_fecha_inicio_ciclo,
        turno_id = p_turno_id, motivo = p_motivo,
        retro_override_por    = CASE WHEN p_forzar_override THEN v_usuario_id ELSE NULL END,
        retro_override_en     = CASE WHEN p_forzar_override THEN now() ELSE NULL END,
        retro_override_motivo = CASE WHEN p_forzar_override THEN p_motivo_override ELSE NULL END
    WHERE id = v_row.id RETURNING * INTO v_row;
  ELSE
    INSERT INTO public.personal_asignaciones_jornada (
      empresa_id, personal_id, personal_tipo, tipo_tramo, fecha_inicio,
      regimen_jornada, dias_ciclo_trabajo, dias_ciclo_descanso,
      fecha_inicio_ciclo, turno_id, motivo,
      retro_override_por, retro_override_en, retro_override_motivo
    ) VALUES (
      p_empresa_id, p_personal_id, p_personal_tipo, p_tipo_tramo, p_fecha_inicio,
      p_regimen_jornada, p_dias_ciclo_trabajo, p_dias_ciclo_descanso,
      p_fecha_inicio_ciclo, p_turno_id, p_motivo,
      CASE WHEN p_forzar_override THEN v_usuario_id ELSE NULL END,
      CASE WHEN p_forzar_override THEN now() ELSE NULL END,
      CASE WHEN p_forzar_override THEN p_motivo_override ELSE NULL END
    ) RETURNING * INTO v_row;
  END IF;
  RETURN v_row;
END;
$function$;

SELECT pg_notify('pgrst', 'reload schema');
