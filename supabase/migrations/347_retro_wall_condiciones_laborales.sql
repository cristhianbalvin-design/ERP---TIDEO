-- ============================================================================
-- 347 · Retro wall — ampliar la guarda a condiciones_laborales
-- ============================================================================
-- bloquear_retro_documento_nomina_procesada() (320_retro_wall_documentos_nomina.sql)
-- solo evaluaba conflicto con nomina ya procesada cuando cambiaban 5 columnas de
-- fecha. Un UPDATE que solo modificara condiciones_laborales (regimen, sueldo,
-- cargo, etc.) salia del trigger sin pasar por la validacion de nomina cerrada,
-- permitiendo editar en silencio las condiciones contractuales de un periodo ya
-- procesado. Caso real: correccion del regimen minero de Juan (pop_1783959070510)
-- sobre julio 2026 ya cerrado, sin bloqueo ni exigencia de autorizacion.
-- Se amplia v_cambia_fechas para que tambien cuente como cambio relevante un
-- IS DISTINCT FROM en condiciones_laborales. El resto del trigger (deteccion de
-- documento contractual, busqueda de periodos en conflicto, exigencia de
-- retro_override_por/personal_documentos_puede_forzar_retro, registro en
-- auditoria) queda exactamente igual.

CREATE OR REPLACE FUNCTION public.bloquear_retro_documento_nomina_procesada()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_tipo_contractual boolean := false;
  v_cambia_fechas    boolean;
  v_rango_inicio     date;
  v_rango_fin        date;
  v_conflictos       text;
  v_nombre           text;
BEGIN
  IF NEW.tipo_documento_id IS NOT NULL THEN
    SELECT COALESCE(t.captura_snapshot_laboral, false)
    INTO v_tipo_contractual
    FROM public.tipos_documento_empresa t
    WHERE t.id = NEW.tipo_documento_id;
  END IF;

  IF NOT v_tipo_contractual THEN
    IF lower(COALESCE(NEW.tipo_doc, '')) LIKE '%contrato%'
       OR lower(COALESCE(NEW.tipo_doc, '')) LIKE '%adenda%' THEN
      v_tipo_contractual := true;
    END IF;
  END IF;

  IF NOT v_tipo_contractual THEN
    RETURN NEW;
  END IF;

  -- Evaluar si cambia alguna fecha de vigencia, o las condiciones laborales
  -- (regimen, sueldo, cargo, etc.) que alimentan el calculo de nomina.
  IF TG_OP = 'UPDATE' THEN
    v_cambia_fechas :=
      NEW.fecha_emision IS DISTINCT FROM OLD.fecha_emision
      OR NEW.fecha_vencimiento IS DISTINCT FROM OLD.fecha_vencimiento
      OR NEW.fecha_vigencia_cambio IS DISTINCT FROM OLD.fecha_vigencia_cambio
      OR NEW.periodo_fecha_inicio IS DISTINCT FROM OLD.periodo_fecha_inicio
      OR NEW.periodo_fecha_fin IS DISTINCT FROM OLD.periodo_fecha_fin
      OR NEW.condiciones_laborales IS DISTINCT FROM OLD.condiciones_laborales;
    IF NOT v_cambia_fechas THEN
      RETURN NEW;
    END IF;
  END IF;

  v_rango_inicio := COALESCE(NEW.fecha_vigencia_cambio, NEW.periodo_fecha_inicio, NEW.fecha_emision);
  v_rango_fin := CASE WHEN NEW.es_indefinido THEN NULL
                       ELSE COALESCE(NEW.periodo_fecha_fin, NEW.fecha_vencimiento) END;

  IF v_rango_inicio IS NULL THEN
    RETURN NEW;
  END IF;

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

    RAISE EXCEPTION 'RETRO_WALL: no se puede modificar la vigencia de % porque se cruza con nómina ya procesada en el/los periodo(s): %. Requiere autorización para forzar el cambio.',
      COALESCE(v_nombre, NEW.personal_id), v_conflictos;
  END IF;

  IF NOT public.personal_documentos_puede_forzar_retro(NEW.empresa_id, NEW.personal_tipo) THEN
    RAISE EXCEPTION 'RETRO_WALL_PERMISO: no tiene autorización para forzar cambios retroactivos sobre nómina ya procesada.';
  END IF;

  NEW.retro_override_en := COALESCE(NEW.retro_override_en, now());

  INSERT INTO public.auditoria (empresa_id, user_id, modulo, entidad, entidad_id, accion, valor_nuevo)
  VALUES (
    NEW.empresa_id, auth.uid(), 'rrhh', 'personal_documentos', NEW.id, 'retro_override_autorizado',
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

SELECT pg_notify('pgrst', 'reload schema');
