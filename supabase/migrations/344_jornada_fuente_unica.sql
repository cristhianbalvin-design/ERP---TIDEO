-- ============================================================================
-- 344 · Jornada como fuente única escribible
-- ============================================================================
-- personal_asignaciones_jornada conserva el formato que consume nómina
-- (general | ciclo_acumulativo). La identidad comercial minero_* se deriva de
-- la pareja fija de días; no se admiten ciclos personalizados.

ALTER TABLE public.personal_asignaciones_jornada
  ADD COLUMN IF NOT EXISTS documento_origen_id text
    REFERENCES public.personal_documentos(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_asignacion_jornada_documento_origen
  ON public.personal_asignaciones_jornada(documento_origen_id)
  WHERE documento_origen_id IS NOT NULL;

ALTER TABLE public.personal_asignaciones_jornada
  DROP CONSTRAINT IF EXISTS chk_asig_jornada_preset;
ALTER TABLE public.personal_asignaciones_jornada
  ADD CONSTRAINT chk_asig_jornada_preset CHECK (
    tipo_tramo = 'suspension_perfecta'
    OR (regimen_jornada = 'general'
        AND dias_ciclo_trabajo IS NULL
        AND dias_ciclo_descanso IS NULL
        AND fecha_inicio_ciclo IS NULL)
    OR (regimen_jornada = 'ciclo_acumulativo'
        AND (dias_ciclo_trabajo, dias_ciclo_descanso) IN ((14,7),(20,10),(28,14),(2,1))
        AND fecha_inicio_ciclo IS NOT NULL)
  ) NOT VALID;

CREATE OR REPLACE FUNCTION public.codigo_regimen_desde_jornada(
  p_regimen text,
  p_trabajo integer,
  p_descanso integer
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_regimen = 'general' THEN RETURN 'general'; END IF;
  IF p_regimen <> 'ciclo_acumulativo' THEN RETURN NULL; END IF;
  RETURN CASE
    WHEN (p_trabajo, p_descanso) = (14, 7)  THEN 'minero_14x7'
    WHEN (p_trabajo, p_descanso) = (20, 10) THEN 'minero_20x10'
    WHEN (p_trabajo, p_descanso) = (28, 14) THEN 'minero_28x14'
    WHEN (p_trabajo, p_descanso) = (2, 1)   THEN 'minero_2x1'
    ELSE NULL
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.sincronizar_jornada_derivados(p_asignacion_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_asig public.personal_asignaciones_jornada%ROWTYPE;
  v_codigo text;
  v_nombre text;
  v_ciclo_id text;
BEGIN
  SELECT * INTO v_asig
  FROM public.personal_asignaciones_jornada
  WHERE id = p_asignacion_id;

  IF NOT FOUND OR v_asig.fecha_fin IS NOT NULL OR v_asig.tipo_tramo <> 'normal' THEN
    RETURN;
  END IF;

  v_codigo := public.codigo_regimen_desde_jornada(
    v_asig.regimen_jornada, v_asig.dias_ciclo_trabajo, v_asig.dias_ciclo_descanso
  );
  IF v_codigo IS NULL THEN
    RAISE EXCEPTION 'JORNADA_PRESET_INVALIDO: solo se permiten general, 14x7, 20x10, 28x14 o 2x1';
  END IF;

  IF v_asig.personal_tipo = 'operativo' THEN
    UPDATE public.personal_operativo
    SET regimen_jornada = v_codigo,
        dias_ciclo_trabajo = v_asig.dias_ciclo_trabajo,
        dias_ciclo_descanso = v_asig.dias_ciclo_descanso,
        fecha_inicio_ciclo = v_asig.fecha_inicio_ciclo
    WHERE id = v_asig.personal_id AND empresa_id = v_asig.empresa_id
    RETURNING nombre INTO v_nombre;
  ELSE
    UPDATE public.personal_administrativo
    SET regimen_jornada = v_codigo,
        dias_ciclo_trabajo = v_asig.dias_ciclo_trabajo,
        dias_ciclo_descanso = v_asig.dias_ciclo_descanso,
        fecha_inicio_ciclo = v_asig.fecha_inicio_ciclo
    WHERE id = v_asig.personal_id AND empresa_id = v_asig.empresa_id
    RETURNING nombre INTO v_nombre;
  END IF;

  -- La tabla de ciclos solo aplica a ciclos mineros. Se actualiza el ancla
  -- correspondiente al tramo actual o se crea si todavía no existe.
  IF v_asig.regimen_jornada = 'ciclo_acumulativo' THEN
    SELECT id INTO v_ciclo_id
    FROM public.asistencia_ciclos_mineros
    WHERE empresa_id = v_asig.empresa_id
      AND personal_id = v_asig.personal_id
    ORDER BY fecha_inicio_ciclo DESC, created_at DESC
    LIMIT 1;

    IF v_ciclo_id IS NULL THEN
      INSERT INTO public.asistencia_ciclos_mineros (
        id, empresa_id, personal_id, personal_nombre, personal_tipo,
        regimen_jornada, fecha_inicio_ciclo, fecha_fin_ciclo,
        dias_ciclo_trabajo, dias_ciclo_descanso
      ) VALUES (
        'ciclo_' || replace(gen_random_uuid()::text, '-', ''),
        v_asig.empresa_id, v_asig.personal_id, v_nombre, v_asig.personal_tipo,
        v_codigo, v_asig.fecha_inicio_ciclo,
        v_asig.fecha_inicio_ciclo + (v_asig.dias_ciclo_trabajo + v_asig.dias_ciclo_descanso - 1),
        v_asig.dias_ciclo_trabajo, v_asig.dias_ciclo_descanso
      );
    ELSE
      UPDATE public.asistencia_ciclos_mineros
      SET regimen_jornada = v_codigo,
          fecha_inicio_ciclo = v_asig.fecha_inicio_ciclo,
          fecha_fin_ciclo = v_asig.fecha_inicio_ciclo
            + (v_asig.dias_ciclo_trabajo + v_asig.dias_ciclo_descanso - 1),
          dias_ciclo_trabajo = v_asig.dias_ciclo_trabajo,
          dias_ciclo_descanso = v_asig.dias_ciclo_descanso,
          updated_at = now()
      WHERE id = v_ciclo_id;
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_sincronizar_jornada_derivados()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.sincronizar_jornada_derivados(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sincronizar_jornada_derivados
  ON public.personal_asignaciones_jornada;
CREATE TRIGGER trg_sincronizar_jornada_derivados
AFTER INSERT OR UPDATE OF regimen_jornada, dias_ciclo_trabajo,
  dias_ciclo_descanso, fecha_inicio_ciclo, fecha_fin
ON public.personal_asignaciones_jornada
FOR EACH ROW EXECUTE FUNCTION public.trg_sincronizar_jornada_derivados();

-- Impide que la ficha vuelva a convertirse en una fuente independiente. Una
-- actualización genérica conserva siempre el espejo del tramo abierto.
CREATE OR REPLACE FUNCTION public.trg_proteger_espejo_jornada()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_asig public.personal_asignaciones_jornada%ROWTYPE;
BEGIN
  SELECT * INTO v_asig
  FROM public.personal_asignaciones_jornada
  WHERE empresa_id = NEW.empresa_id
    AND personal_id = NEW.id
    AND personal_tipo = TG_ARGV[0]
    AND fecha_fin IS NULL
    AND tipo_tramo = 'normal'
  ORDER BY fecha_inicio DESC
  LIMIT 1;

  IF FOUND THEN
    NEW.regimen_jornada := public.codigo_regimen_desde_jornada(
      v_asig.regimen_jornada, v_asig.dias_ciclo_trabajo, v_asig.dias_ciclo_descanso
    );
    NEW.dias_ciclo_trabajo := v_asig.dias_ciclo_trabajo;
    NEW.dias_ciclo_descanso := v_asig.dias_ciclo_descanso;
    NEW.fecha_inicio_ciclo := v_asig.fecha_inicio_ciclo;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_espejo_jornada_operativo ON public.personal_operativo;
CREATE TRIGGER trg_proteger_espejo_jornada_operativo
BEFORE UPDATE OF regimen_jornada, dias_ciclo_trabajo, dias_ciclo_descanso, fecha_inicio_ciclo
ON public.personal_operativo
FOR EACH ROW EXECUTE FUNCTION public.trg_proteger_espejo_jornada('operativo');

DROP TRIGGER IF EXISTS trg_proteger_espejo_jornada_admin ON public.personal_administrativo;
CREATE TRIGGER trg_proteger_espejo_jornada_admin
BEFORE UPDATE OF regimen_jornada, dias_ciclo_trabajo, dias_ciclo_descanso, fecha_inicio_ciclo
ON public.personal_administrativo
FOR EACH ROW EXECUTE FUNCTION public.trg_proteger_espejo_jornada('administrativo');

-- Cualquier alta (UI, importación o script) parte de la ficha inicial, pero el
-- primer tramo se crea inmediatamente y desde allí pasa a ser la fuente.
CREATE OR REPLACE FUNCTION public.trg_crear_jornada_alta_personal()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_regimen text;
  v_t integer;
  v_d integer;
  v_fecha date;
BEGIN
  v_fecha := COALESCE(NEW.fecha_ingreso, NEW.fecha_inicio_ciclo);
  IF v_fecha IS NULL THEN RETURN NEW; END IF;

  IF NEW.regimen_jornada = 'general' THEN
    v_regimen := 'general'; v_t := NULL; v_d := NULL;
  ELSIF NEW.regimen_jornada = 'minero_14x7' THEN
    v_regimen := 'ciclo_acumulativo'; v_t := 14; v_d := 7;
  ELSIF NEW.regimen_jornada = 'minero_20x10' THEN
    v_regimen := 'ciclo_acumulativo'; v_t := 20; v_d := 10;
  ELSIF NEW.regimen_jornada = 'minero_28x14' THEN
    v_regimen := 'ciclo_acumulativo'; v_t := 28; v_d := 14;
  ELSIF NEW.regimen_jornada = 'minero_2x1' THEN
    v_regimen := 'ciclo_acumulativo'; v_t := 2; v_d := 1;
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.personal_asignaciones_jornada (
    empresa_id, personal_id, personal_tipo, tipo_tramo, fecha_inicio,
    regimen_jornada, dias_ciclo_trabajo, dias_ciclo_descanso,
    fecha_inicio_ciclo, motivo
  ) VALUES (
    NEW.empresa_id, NEW.id, TG_ARGV[0], 'normal', v_fecha,
    v_regimen, v_t, v_d,
    CASE WHEN v_regimen = 'ciclo_acumulativo'
         THEN COALESCE(NEW.fecha_inicio_ciclo, v_fecha) ELSE NULL END,
    'Asignación inicial de jornada'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crear_jornada_alta_operativo ON public.personal_operativo;
CREATE TRIGGER trg_crear_jornada_alta_operativo
AFTER INSERT ON public.personal_operativo
FOR EACH ROW EXECUTE FUNCTION public.trg_crear_jornada_alta_personal('operativo');

DROP TRIGGER IF EXISTS trg_crear_jornada_alta_admin ON public.personal_administrativo;
CREATE TRIGGER trg_crear_jornada_alta_admin
AFTER INSERT ON public.personal_administrativo
FOR EACH ROW EXECUTE FUNCTION public.trg_crear_jornada_alta_personal('administrativo');

-- asistencia_ciclos_mineros ya no acepta régimen/días/fecha como entrada
-- independiente: los sustituye por los del tramo vigente para esa fecha.
CREATE OR REPLACE FUNCTION public.trg_derivar_ciclo_desde_jornada()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_asig public.personal_asignaciones_jornada%ROWTYPE;
  v_codigo text;
BEGIN
  SELECT * INTO v_asig
  FROM public.personal_asignaciones_jornada
  WHERE empresa_id = NEW.empresa_id
    AND personal_id = NEW.personal_id
    AND personal_tipo = NEW.personal_tipo
    AND tipo_tramo = 'normal'
    AND regimen_jornada = 'ciclo_acumulativo'
    AND fecha_inicio <= NEW.fecha_inicio_ciclo
    AND (fecha_fin IS NULL OR fecha_fin >= NEW.fecha_inicio_ciclo)
  ORDER BY fecha_inicio DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'JORNADA_NO_ASIGNADA: registre primero un tramo minero vigente para el trabajador y la fecha';
  END IF;

  v_codigo := public.codigo_regimen_desde_jornada(
    v_asig.regimen_jornada, v_asig.dias_ciclo_trabajo, v_asig.dias_ciclo_descanso
  );
  NEW.regimen_jornada := v_codigo;
  NEW.fecha_inicio_ciclo := v_asig.fecha_inicio_ciclo;
  NEW.dias_ciclo_trabajo := v_asig.dias_ciclo_trabajo;
  NEW.dias_ciclo_descanso := v_asig.dias_ciclo_descanso;
  NEW.fecha_fin_ciclo := v_asig.fecha_inicio_ciclo
    + (v_asig.dias_ciclo_trabajo + v_asig.dias_ciclo_descanso - 1);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_derivar_ciclo_desde_jornada ON public.asistencia_ciclos_mineros;
CREATE TRIGGER trg_derivar_ciclo_desde_jornada
BEFORE INSERT OR UPDATE OF regimen_jornada, fecha_inicio_ciclo, fecha_fin_ciclo,
  dias_ciclo_trabajo, dias_ciclo_descanso
ON public.asistencia_ciclos_mineros
FOR EACH ROW EXECUTE FUNCTION public.trg_derivar_ciclo_desde_jornada();

-- Aprobación de contrato/adenda -> tramo. Al ser trigger cubre UI, importación,
-- scripts y cualquier otra ruta que cambie estado_validacion.
CREATE OR REPLACE FUNCTION public.trg_documento_aprobado_crear_jornada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_regimen_codigo text;
  v_regimen_asig text;
  v_t integer;
  v_d integer;
  v_fecha date;
  v_inicio_ciclo date;
  v_anterior public.personal_asignaciones_jornada%ROWTYPE;
  v_existente public.personal_asignaciones_jornada%ROWTYPE;
  v_captura boolean := false;
  v_tiene_sucesor boolean := false;
BEGIN
  IF NEW.estado_validacion <> 'aprobado'
     OR (TG_OP = 'UPDATE' AND OLD.estado_validacion = 'aprobado') THEN
    RETURN NEW;
  END IF;

  IF NEW.tipo_documento_id IS NOT NULL THEN
    SELECT COALESCE(captura_snapshot_laboral, false), tipo_sucesor_id IS NOT NULL
    INTO v_captura, v_tiene_sucesor
    FROM public.tipos_documento_empresa
    WHERE id = NEW.tipo_documento_id;
  END IF;
  IF NOT v_captura THEN
    v_captura := lower(COALESCE(NEW.tipo_doc, '')) LIKE '%contrato%'
      OR lower(COALESCE(NEW.tipo_doc, '')) LIKE '%adenda%';
  END IF;
  IF NOT v_captura OR v_tiene_sucesor THEN RETURN NEW; END IF;

  v_regimen_codigo := NULLIF(NEW.condiciones_laborales ->> 'regimen_jornada', '');
  IF v_regimen_codigo IS NULL THEN RETURN NEW; END IF;

  CASE v_regimen_codigo
    WHEN 'general' THEN v_regimen_asig := 'general'; v_t := NULL; v_d := NULL;
    WHEN 'minero_14x7' THEN v_regimen_asig := 'ciclo_acumulativo'; v_t := 14; v_d := 7;
    WHEN 'minero_20x10' THEN v_regimen_asig := 'ciclo_acumulativo'; v_t := 20; v_d := 10;
    WHEN 'minero_28x14' THEN v_regimen_asig := 'ciclo_acumulativo'; v_t := 28; v_d := 14;
    WHEN 'minero_2x1' THEN v_regimen_asig := 'ciclo_acumulativo'; v_t := 2; v_d := 1;
    ELSE RAISE EXCEPTION 'JORNADA_PRESET_INVALIDO: régimen contractual % no reconocido', v_regimen_codigo;
  END CASE;

  v_fecha := COALESCE(NEW.fecha_vigencia_cambio, NEW.periodo_fecha_inicio, NEW.fecha_emision);
  IF v_fecha IS NULL THEN
    RAISE EXCEPTION 'JORNADA_SIN_FECHA: el contrato aprobado no tiene una fecha real para iniciar el tramo';
  END IF;

  SELECT * INTO v_existente
  FROM public.personal_asignaciones_jornada
  WHERE documento_origen_id = NEW.id
  LIMIT 1;

  SELECT * INTO v_anterior
  FROM public.personal_asignaciones_jornada
  WHERE empresa_id = NEW.empresa_id
    AND personal_id = NEW.personal_id
    AND personal_tipo = NEW.personal_tipo
    AND fecha_inicio <= v_fecha
  ORDER BY fecha_inicio DESC
  LIMIT 1;

  v_inicio_ciclo := NULL;
  IF v_regimen_asig = 'ciclo_acumulativo' THEN
    IF v_anterior.regimen_jornada = 'ciclo_acumulativo'
       AND (v_anterior.dias_ciclo_trabajo, v_anterior.dias_ciclo_descanso) = (v_t, v_d)
       AND v_anterior.fecha_inicio_ciclo IS NOT NULL THEN
      v_inicio_ciclo := v_anterior.fecha_inicio_ciclo;
    ELSE
      v_inicio_ciclo := v_fecha;
    END IF;
  END IF;

  IF v_existente.id IS NOT NULL THEN
    UPDATE public.personal_asignaciones_jornada
    SET fecha_inicio = v_fecha,
        regimen_jornada = v_regimen_asig,
        dias_ciclo_trabajo = v_t,
        dias_ciclo_descanso = v_d,
        fecha_inicio_ciclo = v_inicio_ciclo,
        motivo = 'Régimen derivado de contrato aprobado'
    WHERE id = v_existente.id;
    RETURN NEW;
  END IF;

  UPDATE public.personal_asignaciones_jornada
  SET fecha_fin = v_fecha - 1
  WHERE empresa_id = NEW.empresa_id
    AND personal_id = NEW.personal_id
    AND personal_tipo = NEW.personal_tipo
    AND fecha_fin IS NULL
    AND fecha_inicio < v_fecha;

  INSERT INTO public.personal_asignaciones_jornada (
    empresa_id, personal_id, personal_tipo, tipo_tramo, fecha_inicio,
    regimen_jornada, dias_ciclo_trabajo, dias_ciclo_descanso,
    fecha_inicio_ciclo, motivo, documento_origen_id
  ) VALUES (
    NEW.empresa_id, NEW.personal_id, NEW.personal_tipo, 'normal', v_fecha,
    v_regimen_asig, v_t, v_d, v_inicio_ciclo,
    'Régimen derivado de contrato aprobado', NEW.id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_documento_aprobado_crear_jornada ON public.personal_documentos;
CREATE TRIGGER trg_documento_aprobado_crear_jornada
AFTER INSERT OR UPDATE OF estado_validacion ON public.personal_documentos
FOR EACH ROW EXECUTE FUNCTION public.trg_documento_aprobado_crear_jornada();

-- RPC manual: conserva firma pública, pero valida catálogo y evita dos tramos
-- abiertos si se corrige una asignación con la misma fecha de inicio.
CREATE OR REPLACE FUNCTION public.crear_asignacion_jornada(
  p_empresa_id text, p_personal_id text, p_personal_tipo text,
  p_tipo_tramo text, p_fecha_inicio date,
  p_regimen_jornada text DEFAULT NULL,
  p_dias_ciclo_trabajo integer DEFAULT NULL,
  p_dias_ciclo_descanso integer DEFAULT NULL,
  p_fecha_inicio_ciclo date DEFAULT NULL,
  p_turno_id text DEFAULT NULL,
  p_motivo text DEFAULT NULL
)
RETURNS public.personal_asignaciones_jornada
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.personal_asignaciones_jornada;
BEGIN
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Acceso denegado al tenant';
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
  SET fecha_fin = p_fecha_inicio - 1
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
        turno_id = p_turno_id, motivo = p_motivo
    WHERE id = v_row.id RETURNING * INTO v_row;
  ELSE
    INSERT INTO public.personal_asignaciones_jornada (
      empresa_id, personal_id, personal_tipo, tipo_tramo, fecha_inicio,
      regimen_jornada, dias_ciclo_trabajo, dias_ciclo_descanso,
      fecha_inicio_ciclo, turno_id, motivo
    ) VALUES (
      p_empresa_id, p_personal_id, p_personal_tipo, p_tipo_tramo, p_fecha_inicio,
      p_regimen_jornada, p_dias_ciclo_trabajo, p_dias_ciclo_descanso,
      p_fecha_inicio_ciclo, p_turno_id, p_motivo
    ) RETURNING * INTO v_row;
  END IF;
  RETURN v_row;
END;
$$;

ALTER TABLE public.personal_asignaciones_jornada
  VALIDATE CONSTRAINT chk_asig_jornada_preset;

SELECT pg_notify('pgrst', 'reload schema');
