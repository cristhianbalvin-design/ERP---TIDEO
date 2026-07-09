-- ============================================================================
-- 320 · Retro wall — bloquea altas/correcciones retroactivas de contrato o
-- adenda en personal_documentos cuando su rango de fechas se cruza con un
-- periodo de nomina que ya tiene registros en nomina_detalle para esa persona.
-- Bloqueo por defecto vía trigger BEFORE INSERT/UPDATE; override explícito y
-- trazable para usuarios autorizados (admin de empresa o rol con permiso
-- 'aprobar' en rrhh_operativo/rrhh_admin). No toca cálculo de nómina ni crea
-- tablas nuevas: reutiliza public.auditoria para el rastro de overrides.
-- ============================================================================

-- 1. Columnas de override en personal_documentos ----------------------------

ALTER TABLE public.personal_documentos
  ADD COLUMN IF NOT EXISTS retro_override_por text REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS retro_override_en timestamptz,
  ADD COLUMN IF NOT EXISTS retro_override_motivo text;

-- 2. Permiso para forzar el override -----------------------------------------
-- usuario_puede() ya cubre admin de empresa internamente (130_platform_superadmin_rules.sql),
-- por eso basta con mapear el tipo de personal a la pantalla RRHH correspondiente.

CREATE OR REPLACE FUNCTION public.personal_documentos_puede_forzar_retro(
  p_empresa_id text,
  p_personal_tipo text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.usuario_puede(
    p_empresa_id,
    CASE WHEN p_personal_tipo = 'operativo' THEN 'rrhh_operativo' ELSE 'rrhh_admin' END,
    'aprobar'
  );
$$;

-- 3. Trigger de bloqueo -------------------------------------------------------

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
  -- Solo documentos "contractuales" (contrato/adenda): capturan condiciones
  -- laborales que alimentan el cálculo de nómina. Se identifica por el
  -- catálogo (tipos_documento_empresa.captura_snapshot_laboral), nunca por el
  -- string tipo_doc directo (ese patrón ya causó un bug real, ver
  -- 210_correctivo_join_tipo_documento.sql). Fallback textual solo para filas
  -- legacy sin tipo_documento_id, igual al que ya usa validar_documento_personal
  -- (291_fix_validar_documento_modalidad_contrato.sql).
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

  -- Solo evaluar si realmente cambia alguna fecha de vigencia
  IF TG_OP = 'UPDATE' THEN
    v_cambia_fechas :=
      NEW.fecha_emision IS DISTINCT FROM OLD.fecha_emision
      OR NEW.fecha_vencimiento IS DISTINCT FROM OLD.fecha_vencimiento
      OR NEW.fecha_vigencia_cambio IS DISTINCT FROM OLD.fecha_vigencia_cambio
      OR NEW.periodo_fecha_inicio IS DISTINCT FROM OLD.periodo_fecha_inicio
      OR NEW.periodo_fecha_fin IS DISTINCT FROM OLD.periodo_fecha_fin;
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

  -- Periodos de nómina que ya tienen registros procesados para esta persona
  -- (la existencia de la fila en nomina_detalle es la señal, sin filtrar por
  -- periodos_nomina.estado) y cuyo rango de fechas se cruza con el del documento.
  -- periodos_nomina no guarda fecha_inicio propia: se deriva de anio/mes/quincena
  -- (limite de calendario) y se usa el fecha_corte ya almacenado como cierre real.
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

DROP TRIGGER IF EXISTS trg_bloquear_retro_documento_nomina ON public.personal_documentos;
CREATE TRIGGER trg_bloquear_retro_documento_nomina
BEFORE INSERT OR UPDATE ON public.personal_documentos
FOR EACH ROW
EXECUTE FUNCTION public.bloquear_retro_documento_nomina_procesada();

-- 4. RPCs: aceptar override explícito y trazable -----------------------------
-- Se agregan parámetros al final con DEFAULT (CREATE OR REPLACE conserva la
-- firma/OID y no rompe a los callers existentes que no los envían).

CREATE OR REPLACE FUNCTION public.subir_documento_personal(
  p_empresa_id              text,
  p_personal_id             text,
  p_personal_tipo           text,
  p_tipo_doc                text,
  p_nombre_archivo          text,
  p_archivo_url             text,
  p_fecha_emision           date     DEFAULT NULL,
  p_fecha_vencimiento       date     DEFAULT NULL,
  p_notas                   text     DEFAULT NULL,
  p_subido_desde            text     DEFAULT 'backoffice',
  p_tipo_documento_id       text     DEFAULT NULL,
  p_condiciones_laborales   jsonb    DEFAULT '{}'::jsonb,
  p_contrato_referencia_id  text     DEFAULT NULL,
  p_adenda_cambios          jsonb    DEFAULT '{}'::jsonb,
  p_fecha_vigencia_cambio   date     DEFAULT NULL,
  p_seccion_documental      text     DEFAULT NULL,
  p_contrato_periodo_id     text     DEFAULT NULL,
  p_origen                  text     DEFAULT 'backoffice',
  p_es_indefinido           boolean  DEFAULT false,
  p_forzar_override         boolean  DEFAULT false,
  p_motivo_override         text     DEFAULT NULL
)
RETURNS public.personal_documentos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usuario_id text;
  v_version    integer;
  v_row        public.personal_documentos;
  v_seccion    text := COALESCE(NULLIF(p_seccion_documental, ''), 'adicional');
  v_periodo_id text;
  v_aprobados  integer;
  v_permite_firma boolean;
  v_predecesor_id text;
  v_predecesor_nombre text;
BEGIN
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Acceso denegado al tenant';
  END IF;

  IF p_forzar_override AND NOT public.personal_documentos_puede_forzar_retro(p_empresa_id, p_personal_tipo) THEN
    RAISE EXCEPTION 'No tiene autorización para forzar cambios retroactivos sobre nómina ya procesada.';
  END IF;

  -- VALIDACIÓN REGLA 1: Backoffice - no subir si el predecesor no está aprobado
  IF p_origen = 'backoffice' THEN
    SELECT id, nombre INTO v_predecesor_id, v_predecesor_nombre
    FROM public.tipos_documento_empresa
    WHERE empresa_id = p_empresa_id AND tipo_sucesor_id = (
      SELECT id FROM public.tipos_documento_empresa
      WHERE empresa_id = p_empresa_id AND (id = p_tipo_documento_id OR nombre = p_tipo_doc OR codigo = p_tipo_doc)
      LIMIT 1
    )
    LIMIT 1;

    IF v_predecesor_id IS NOT NULL THEN
      SELECT count(*) INTO v_aprobados
      FROM public.personal_documentos
      WHERE empresa_id = p_empresa_id
        AND personal_id = p_personal_id
        AND (tipo_documento_id = v_predecesor_id OR tipo_doc = v_predecesor_id)
        AND estado_validacion = 'aprobado'
        AND activo = true;

      IF v_aprobados = 0 THEN
        RAISE EXCEPTION 'Debe existir un % aprobado antes de subir este documento.', v_predecesor_nombre;
      END IF;
    END IF;
  END IF;

  -- VALIDACIÓN GAP 3
  IF p_origen = 'portal_empleado' THEN
    SELECT count(*) INTO v_aprobados
    FROM public.personal_documentos
    WHERE empresa_id = p_empresa_id
      AND personal_id = p_personal_id
      AND tipo_doc = p_tipo_doc
      AND estado_validacion = 'aprobado'
      AND activo = true;

    IF v_aprobados = 0 THEN
      RAISE EXCEPTION 'No existe contrato base aprobado. El primer contrato debe ser cargado por RRHH.';
    END IF;

    SELECT permite_firma_trabajador INTO v_permite_firma
    FROM public.tipos_documento_empresa
    WHERE empresa_id = p_empresa_id AND (id = p_tipo_documento_id OR nombre = p_tipo_doc OR codigo = p_tipo_doc)
    LIMIT 1;

    IF v_permite_firma IS FALSE THEN
      RAISE EXCEPTION 'Este tipo de documento no permite la subida de versiones firmadas desde el portal.';
    END IF;
  END IF;

  SELECT id INTO v_usuario_id
  FROM public.usuarios
  WHERE id = auth.uid()::text
  LIMIT 1;

  v_periodo_id := p_contrato_periodo_id;
  IF v_periodo_id IS NULL AND p_tipo_documento_id IS NOT NULL THEN
    SELECT contrato_periodo_id INTO v_periodo_id
    FROM public.personal_documentos
    WHERE empresa_id       = p_empresa_id
      AND personal_id      = p_personal_id
      AND tipo_documento_id = p_tipo_documento_id
      AND activo = true
    ORDER BY version DESC
    LIMIT 1;
  END IF;

  SELECT COALESCE(MAX(version), 0) + 1 INTO v_version
  FROM public.personal_documentos
  WHERE empresa_id = p_empresa_id
    AND personal_id = p_personal_id
    AND (
      (p_tipo_documento_id IS NOT NULL AND tipo_documento_id = p_tipo_documento_id)
      OR tipo_doc = p_tipo_doc
    );

  INSERT INTO public.personal_documentos (
    empresa_id, personal_id, personal_tipo,
    tipo_doc, tipo_documento_id,
    nombre_archivo, archivo_url,
    fecha_emision, fecha_vencimiento,
    version, activo, estado_validacion, notas,
    subido_por, subido_desde,
    condiciones_laborales, contrato_referencia_id,
    adenda_cambios, fecha_vigencia_cambio, seccion_documental,
    contrato_periodo_id, periodo_fecha_inicio, periodo_fecha_fin,
    es_indefinido, retro_override_por, retro_override_motivo
  ) VALUES (
    p_empresa_id, p_personal_id, p_personal_tipo,
    p_tipo_doc, p_tipo_documento_id,
    p_nombre_archivo, p_archivo_url,
    p_fecha_emision, p_fecha_vencimiento,
    v_version, false, 'pendiente', p_notas,
    v_usuario_id, p_subido_desde,
    COALESCE(p_condiciones_laborales, '{}'::jsonb), p_contrato_referencia_id,
    COALESCE(p_adenda_cambios, '{}'::jsonb), p_fecha_vigencia_cambio, v_seccion,
    v_periodo_id, p_fecha_emision, p_fecha_vencimiento,
    p_es_indefinido,
    CASE WHEN p_forzar_override THEN v_usuario_id ELSE NULL END,
    CASE WHEN p_forzar_override THEN p_motivo_override ELSE NULL END
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.subir_version_documento(
  p_empresa_id         text,
  p_personal_id        text,
  p_personal_tipo      text,
  p_tipo_doc           text,
  p_nombre_archivo     text,
  p_archivo_url        text,
  p_periodo_grupo_id   uuid,
  p_fecha_emision      date     DEFAULT NULL,
  p_fecha_vencimiento  date     DEFAULT NULL,
  p_notas              text     DEFAULT NULL,
  p_subido_desde       text     DEFAULT 'backoffice',
  p_tipo_documento_id  text     DEFAULT NULL,
  p_condiciones_laborales jsonb DEFAULT '{}'::jsonb,
  p_contrato_referencia_id text DEFAULT NULL,
  p_adenda_cambios     jsonb    DEFAULT '{}'::jsonb,
  p_fecha_vigencia_cambio date  DEFAULT NULL,
  p_seccion_documental text     DEFAULT NULL,
  p_contrato_periodo_id text    DEFAULT NULL,
  p_origen             text     DEFAULT 'backoffice',
  p_es_indefinido      boolean  DEFAULT false,
  p_forzar_override    boolean  DEFAULT false,
  p_motivo_override    text     DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usuario_id  text;
  v_version     integer;
  v_row_id      uuid;
  v_grupo_id    uuid;
  v_renovable   boolean;
  v_aprobados   integer;
  v_permite_firma boolean;
  v_predecesor_id text;
  v_predecesor_nombre text;
BEGIN
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Acceso denegado al tenant';
  END IF;

  IF p_forzar_override AND NOT public.personal_documentos_puede_forzar_retro(p_empresa_id, p_personal_tipo) THEN
    RAISE EXCEPTION 'No tiene autorización para forzar cambios retroactivos sobre nómina ya procesada.';
  END IF;

  -- VALIDACIÓN REGLA 1: Backoffice - no subir si el predecesor no está aprobado
  IF p_origen = 'backoffice' THEN
    SELECT id, nombre INTO v_predecesor_id, v_predecesor_nombre
    FROM public.tipos_documento_empresa
    WHERE empresa_id = p_empresa_id AND tipo_sucesor_id = (
      SELECT id FROM public.tipos_documento_empresa
      WHERE empresa_id = p_empresa_id AND (id = p_tipo_documento_id OR nombre = p_tipo_doc OR codigo = p_tipo_doc)
      LIMIT 1
    )
    LIMIT 1;

    IF v_predecesor_id IS NOT NULL THEN
      SELECT count(*) INTO v_aprobados
      FROM public.personal_documentos
      WHERE empresa_id = p_empresa_id
        AND personal_id = p_personal_id
        AND (tipo_documento_id = v_predecesor_id OR tipo_doc = v_predecesor_id)
        AND estado_validacion = 'aprobado'
        AND activo = true;

      IF v_aprobados = 0 THEN
        RAISE EXCEPTION 'Debe existir un % aprobado antes de subir este documento.', v_predecesor_nombre;
      END IF;
    END IF;
  END IF;

  -- VALIDACIÓN GAP 3: Si viene del portal, exigir contrato base aprobado
  IF p_origen = 'portal_empleado' THEN
    SELECT count(*) INTO v_aprobados
    FROM public.personal_documentos
    WHERE empresa_id = p_empresa_id
      AND personal_id = p_personal_id
      AND tipo_doc = p_tipo_doc
      AND estado_validacion = 'aprobado'
      AND activo = true;

    IF v_aprobados = 0 THEN
      RAISE EXCEPTION 'No existe contrato base aprobado. El primer contrato debe ser cargado por RRHH.';
    END IF;

    SELECT permite_firma_trabajador INTO v_permite_firma
    FROM public.tipos_documento_empresa
    WHERE empresa_id = p_empresa_id AND (id = p_tipo_documento_id OR nombre = p_tipo_doc OR codigo = p_tipo_doc)
    LIMIT 1;

    IF v_permite_firma IS FALSE THEN
      RAISE EXCEPTION 'Este tipo de documento no permite la subida de versiones firmadas desde el portal.';
    END IF;
  END IF;

  SELECT id INTO v_usuario_id FROM public.usuarios WHERE id = auth.uid()::text LIMIT 1;

  v_grupo_id := p_periodo_grupo_id;
  IF v_grupo_id IS NULL THEN
      v_grupo_id := gen_random_uuid();
  END IF;

  SELECT renovable INTO v_renovable
  FROM public.tipos_documento_empresa
  WHERE empresa_id = p_empresa_id AND (id = p_tipo_documento_id OR nombre = p_tipo_doc OR codigo = p_tipo_doc) LIMIT 1;

  IF v_renovable IS NULL THEN v_renovable := false; END IF;

  UPDATE public.personal_documentos
  SET activo = false
  WHERE empresa_id = p_empresa_id
    AND personal_id = p_personal_id
    AND tipo_doc = p_tipo_doc
    AND periodo_grupo_id = v_grupo_id
    AND activo = true;

  SELECT coalesce(MAX(version), 0) + 1 INTO v_version
  FROM public.personal_documentos
  WHERE empresa_id = p_empresa_id
    AND personal_id = p_personal_id
    AND tipo_doc = p_tipo_doc
    AND periodo_grupo_id = v_grupo_id;

  INSERT INTO public.personal_documentos (
    empresa_id, personal_id, personal_tipo,
    tipo_doc, tipo_documento_id,
    nombre_archivo, archivo_url,
    fecha_emision, fecha_vencimiento,
    version, activo, estado_validacion, notas,
    subido_por, subido_desde,
    periodo_grupo_id, renovable,
    snapshot_laboral, contrato_referencia_id, adenda_cambios,
    fecha_vigencia_cambio, seccion_documental, contrato_periodo_id,
    es_indefinido, retro_override_por, retro_override_motivo
  ) VALUES (
    p_empresa_id, p_personal_id, p_personal_tipo,
    p_tipo_doc, p_tipo_documento_id,
    p_nombre_archivo, p_archivo_url,
    p_fecha_emision, p_fecha_vencimiento,
    v_version, true, 'pendiente', p_notas,
    v_usuario_id, p_subido_desde,
    v_grupo_id, v_renovable,
    p_condiciones_laborales, p_contrato_referencia_id, p_adenda_cambios,
    p_fecha_vigencia_cambio, p_seccion_documental, p_contrato_periodo_id,
    p_es_indefinido,
    CASE WHEN p_forzar_override THEN v_usuario_id ELSE NULL END,
    CASE WHEN p_forzar_override THEN p_motivo_override ELSE NULL END
  ) RETURNING id INTO v_row_id;

  RETURN v_row_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.nuevo_contrato_periodo(
  p_empresa_id              text,
  p_personal_id             text,
  p_personal_tipo           text,
  p_tipo_doc                text,
  p_nombre_archivo          text,
  p_archivo_url             text,
  p_fecha_emision           date     DEFAULT NULL,
  p_fecha_vencimiento       date     DEFAULT NULL,
  p_notas                   text     DEFAULT NULL,
  p_condiciones_laborales   jsonb    DEFAULT '{}'::jsonb,
  p_tipo_documento_id       text     DEFAULT NULL,
  p_periodo_id_anterior     text     DEFAULT NULL,
  p_es_indefinido           boolean  DEFAULT false,
  p_forzar_override         boolean  DEFAULT false,
  p_motivo_override         text     DEFAULT NULL
)
RETURNS public.personal_documentos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usuario_id      text;
  v_nuevo_periodo   text;
  v_nuevo_grupo_id  uuid;
  v_row             public.personal_documentos;
BEGIN
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Acceso denegado al tenant';
  END IF;

  IF p_forzar_override AND NOT public.personal_documentos_puede_forzar_retro(p_empresa_id, p_personal_tipo) THEN
    RAISE EXCEPTION 'No tiene autorización para forzar cambios retroactivos sobre nómina ya procesada.';
  END IF;

  SELECT id INTO v_usuario_id
  FROM public.usuarios
  WHERE id = auth.uid()::text
  LIMIT 1;

  v_nuevo_periodo  := 'cper_' || gen_random_uuid()::text;
  v_nuevo_grupo_id := gen_random_uuid();

  -- Archivar período anterior (por ID explícito o por el vigente del mismo tipo)
  IF p_periodo_id_anterior IS NOT NULL THEN
    UPDATE public.personal_documentos
    SET periodo_estado = 'archivado',
        activo         = false
    WHERE empresa_id          = p_empresa_id
      AND personal_id         = p_personal_id
      AND contrato_periodo_id = p_periodo_id_anterior;
  ELSE
    UPDATE public.personal_documentos
    SET periodo_estado = 'archivado',
        activo         = false
    WHERE empresa_id   = p_empresa_id
      AND personal_id  = p_personal_id
      AND periodo_estado = 'vigente'
      AND (
        (p_tipo_documento_id IS NOT NULL AND tipo_documento_id = p_tipo_documento_id)
        OR tipo_doc = p_tipo_doc
      );
  END IF;

  INSERT INTO public.personal_documentos (
    empresa_id, personal_id, personal_tipo,
    tipo_doc, tipo_documento_id,
    nombre_archivo, archivo_url,
    fecha_emision, fecha_vencimiento,
    version, activo, estado_validacion, notas,
    subido_por, subido_desde,
    condiciones_laborales,
    contrato_periodo_id, periodo_grupo_id,
    periodo_fecha_inicio, periodo_fecha_fin,
    periodo_estado, seccion_documental,
    es_indefinido, retro_override_por, retro_override_motivo
  ) VALUES (
    p_empresa_id, p_personal_id, p_personal_tipo,
    p_tipo_doc, p_tipo_documento_id,
    p_nombre_archivo, p_archivo_url,
    p_fecha_emision, p_fecha_vencimiento,
    1, true, 'pendiente', p_notas,
    v_usuario_id, 'backoffice',
    COALESCE(p_condiciones_laborales, '{}'::jsonb),
    v_nuevo_periodo, v_nuevo_grupo_id,
    p_fecha_emision, p_fecha_vencimiento,
    'vigente', 'requisito_cargo',
    p_es_indefinido,
    CASE WHEN p_forzar_override THEN v_usuario_id ELSE NULL END,
    CASE WHEN p_forzar_override THEN p_motivo_override ELSE NULL END
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.corregir_documento_personal(
  p_documento_id          text,
  p_fecha_emision         date     DEFAULT NULL,
  p_fecha_vencimiento     date     DEFAULT NULL,
  p_condiciones_laborales jsonb    DEFAULT NULL,
  p_notas                 text     DEFAULT NULL,
  p_archivo_url           text     DEFAULT NULL,
  p_nombre_archivo        text     DEFAULT NULL,
  p_forzar_override       boolean  DEFAULT false,
  p_motivo_override       text     DEFAULT NULL
)
RETURNS public.personal_documentos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_id   text;
  v_personal_tipo text;
  v_usuario_id   text;
  v_row          public.personal_documentos;
BEGIN
  SELECT empresa_id, personal_tipo INTO v_empresa_id, v_personal_tipo
  FROM public.personal_documentos
  WHERE id = p_documento_id;

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
  SET fecha_emision           = COALESCE(p_fecha_emision, fecha_emision),
      fecha_vencimiento       = p_fecha_vencimiento,
      condiciones_laborales   = COALESCE(p_condiciones_laborales, condiciones_laborales),
      notas                   = p_notas,
      archivo_url             = COALESCE(p_archivo_url, archivo_url),
      nombre_archivo          = COALESCE(p_nombre_archivo, nombre_archivo),
      es_correccion           = true,
      retro_override_por      = CASE WHEN p_forzar_override THEN v_usuario_id ELSE NULL END,
      retro_override_en       = CASE WHEN p_forzar_override THEN now() ELSE NULL END,
      retro_override_motivo   = CASE WHEN p_forzar_override THEN p_motivo_override ELSE NULL END
  WHERE id = p_documento_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

SELECT pg_notify('pgrst', 'reload schema');
