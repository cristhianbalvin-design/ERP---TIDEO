-- 606: Crear una Hoja de Costeo editable desde un Diagnóstico Técnico emitido.
-- Los costos quedan en cero y pendientes de valoración por Comercial.
-- Aplicada en producción el 2026-10-09 tras ensayo con ROLLBACK y revisión.
-- Numeración: 603 a 605 pertenecen a la línea del asistente (origin/main); 606 era el siguiente prefijo libre.
--
-- Supuestos revisados en el repositorio: crear_hoja_costeo y
-- crear_hoja_costeo_sociedad son los wrappers vigentes; diagnostico_id usa text,
-- informe_id uuid, y el ID de cabecera conserva el formato hc_###### del frontend.
-- Mantenimiento conserva el default PEN; fabricación toma la moneda de la oportunidad.

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $pre$
DECLARE
  v_tipo text;
  v_columnas_faltantes text;
BEGIN
  ASSERT to_regclass('public.hojas_costeo') IS NOT NULL,
    'PRECONDITION_FAILED: falta hojas_costeo';
  ASSERT to_regclass('public.hoja_costeo_lineas_mano_obra') IS NOT NULL,
    'PRECONDITION_FAILED: falta hoja_costeo_lineas_mano_obra';
  ASSERT to_regclass('public.hoja_costeo_lineas_materiales') IS NOT NULL,
    'PRECONDITION_FAILED: falta hoja_costeo_lineas_materiales';
  ASSERT to_regclass('public.hoja_costeo_lineas_activos') IS NOT NULL,
    'PRECONDITION_FAILED: falta hoja_costeo_lineas_activos';
  ASSERT to_regclass('public.diagnosticos_tecnicos') IS NOT NULL,
    'PRECONDITION_FAILED: falta diagnosticos_tecnicos';
  ASSERT to_regclass('public.diagnostico_tecnico_lineas') IS NOT NULL,
    'PRECONDITION_FAILED: falta diagnostico_tecnico_lineas';
  ASSERT to_regclass('public.diagnostico_tecnico_linea_materiales') IS NOT NULL,
    'PRECONDITION_FAILED: falta diagnostico_tecnico_linea_materiales';
  ASSERT to_regclass('public.diagnostico_informes') IS NOT NULL,
    'PRECONDITION_FAILED: falta diagnostico_informes';
  ASSERT to_regclass('public.recepciones_activos_cliente') IS NOT NULL
    AND to_regclass('public.activos') IS NOT NULL
    AND to_regclass('public.oportunidades') IS NOT NULL
    AND to_regclass('public.empresas') IS NOT NULL
    AND to_regclass('public.sociedades') IS NOT NULL
    AND to_regclass('public.cuentas') IS NOT NULL
    AND to_regclass('public.materiales') IS NOT NULL
    AND to_regclass('public.familia_trabajo') IS NOT NULL
    AND to_regclass('public.tipos_servicio_interno') IS NOT NULL,
    'PRECONDITION_FAILED: falta una tabla padre o catálogo requerido';
  ASSERT to_regprocedure('public.usuario_tiene_empresa(text)') IS NOT NULL
    AND to_regprocedure('public.usuario_puede(text,text,text)') IS NOT NULL
    AND to_regprocedure('public.usuario_puede_ver_diagnostico_padre(text,text,text,text)') IS NOT NULL
    AND to_regprocedure('public.usuario_alcance_sociedades(text)') IS NOT NULL,
    'PRECONDITION_FAILED: faltan funciones de validación o permisos';
  ASSERT to_regprocedure('public.crear_hoja_costeo(text,text,text,text,text,text,date,numeric,text,jsonb,jsonb,jsonb,jsonb,numeric,numeric,numeric,numeric,numeric,numeric,numeric)') IS NOT NULL
    AND to_regprocedure('public.crear_hoja_costeo_sociedad(text,uuid,text,text,text,text,text,date,numeric,text,jsonb,jsonb,jsonb,jsonb,numeric,numeric,numeric,numeric,numeric,numeric,numeric)') IS NOT NULL,
    'PRECONDITION_FAILED: faltan los wrappers vigentes de creación de Hojas de Costeo';
  SELECT string_agg(format('%s.%s', esperado.tabla, esperado.columna), ', '
                    ORDER BY esperado.tabla, esperado.columna)
    INTO v_columnas_faltantes
    FROM (VALUES
      ('diagnosticos_tecnicos','id'),('diagnosticos_tecnicos','empresa_id'),
      ('diagnosticos_tecnicos','tipo'),('diagnosticos_tecnicos','estado'),
      ('diagnosticos_tecnicos','oportunidad_id'),('diagnosticos_tecnicos','recepcion_id'),
      ('diagnosticos_tecnicos','activo_id'),
      ('diagnostico_tecnico_lineas','id'),('diagnostico_tecnico_lineas','empresa_id'),
      ('diagnostico_tecnico_lineas','diagnostico_id'),('diagnostico_tecnico_lineas','familia_trabajo_id'),
      ('diagnostico_tecnico_lineas','actividad_id'),('diagnostico_tecnico_lineas','tarea_id'),
      ('diagnostico_tecnico_lineas','cargo_id'),('diagnostico_tecnico_lineas','horas_mano_obra'),
      ('diagnostico_tecnico_lineas','activo_id'),('diagnostico_tecnico_lineas','horas_maquina'),
      ('diagnostico_tecnico_lineas','orden'),
      ('diagnostico_tecnico_linea_materiales','id'),('diagnostico_tecnico_linea_materiales','empresa_id'),
      ('diagnostico_tecnico_linea_materiales','linea_id'),('diagnostico_tecnico_linea_materiales','material_id'),
      ('diagnostico_tecnico_linea_materiales','descripcion'),('diagnostico_tecnico_linea_materiales','cantidad'),
      ('diagnostico_tecnico_linea_materiales','unidad'),('diagnostico_tecnico_linea_materiales','orden'),
      ('diagnostico_informes','id'),('diagnostico_informes','empresa_id'),
      ('diagnostico_informes','diagnostico_id'),('diagnostico_informes','estado'),
      ('diagnostico_informes','version'),('diagnostico_informes','emitido_en'),
      ('recepciones_activos_cliente','id'),('recepciones_activos_cliente','empresa_id'),
      ('recepciones_activos_cliente','activo_id'),('recepciones_activos_cliente','sociedad_id'),
      ('activos','id'),('activos','empresa_id'),('activos','cliente_propietario_id'),
      ('oportunidades','id'),('oportunidades','empresa_id'),('oportunidades','cuenta_id'),
      ('oportunidades','moneda'),
      ('empresas','multisociedad_habilitado'),
      ('sociedades','id'),('sociedades','empresa_id'),('sociedades','activa'),
      ('materiales','id'),('materiales','empresa_id'),('materiales','descripcion'),
      ('hojas_costeo','id'),('hojas_costeo','empresa_id'),('hojas_costeo','numero'),
      ('hojas_costeo','oportunidad_id'),('hojas_costeo','cuenta_id'),('hojas_costeo','sociedad_id'),
      ('hojas_costeo','recepcion_id'),('hojas_costeo','activo_id'),('hojas_costeo','moneda'),
      ('hojas_costeo','estado'),('hojas_costeo','mano_obra'),('hojas_costeo','materiales'),
      ('hojas_costeo','servicios_terceros'),('hojas_costeo','logistica'),
      ('hoja_costeo_lineas_mano_obra','id'),('hoja_costeo_lineas_mano_obra','hoja_costeo_id'),
      ('hoja_costeo_lineas_mano_obra','familia_trabajo_id'),('hoja_costeo_lineas_mano_obra','actividad_id'),
      ('hoja_costeo_lineas_mano_obra','cargo_id'),('hoja_costeo_lineas_mano_obra','horas'),
      ('hoja_costeo_lineas_mano_obra','metodo_usado'),('hoja_costeo_lineas_mano_obra','costo_hora_snapshot'),
      ('hoja_costeo_lineas_mano_obra','subtotal'),('hoja_costeo_lineas_mano_obra','orden'),
      ('hoja_costeo_lineas_materiales','id'),('hoja_costeo_lineas_materiales','hoja_costeo_id'),
      ('hoja_costeo_lineas_materiales','material_id'),('hoja_costeo_lineas_materiales','cantidad'),
      ('hoja_costeo_lineas_materiales','costo_unitario_snapshot'),('hoja_costeo_lineas_materiales','subtotal'),
      ('hoja_costeo_lineas_materiales','fue_manual'),('hoja_costeo_lineas_materiales','orden'),
      ('hoja_costeo_lineas_activos','id'),('hoja_costeo_lineas_activos','hoja_costeo_id'),
      ('hoja_costeo_lineas_activos','activo_id'),('hoja_costeo_lineas_activos','horas_uso_estimadas'),
      ('hoja_costeo_lineas_activos','depreciacion_asignada'),('hoja_costeo_lineas_activos','fue_manual'),
      ('hoja_costeo_lineas_activos','orden')
    ) AS esperado(tabla,columna)
    LEFT JOIN information_schema.columns c
      ON c.table_schema='public' AND c.table_name=esperado.tabla
      AND c.column_name=esperado.columna
    WHERE c.column_name IS NULL;
  ASSERT v_columnas_faltantes IS NULL,
    format('PRECONDITION_FAILED: faltan columnas requeridas por la RPC: %s', v_columnas_faltantes);

  SELECT data_type INTO v_tipo FROM information_schema.columns
    WHERE table_schema='public' AND table_name='diagnostico_tecnico_linea_materiales' AND column_name='id';
  ASSERT v_tipo = 'uuid', format('PRECONDITION_FAILED: diagnostico_tecnico_linea_materiales.id debe ser uuid; se encontró %s', coalesce(v_tipo,'NULL'));
  SELECT data_type INTO v_tipo FROM information_schema.columns
    WHERE table_schema='public' AND table_name='diagnostico_tecnico_lineas' AND column_name='id';
  ASSERT v_tipo = 'uuid', 'PRECONDITION_FAILED: diagnostico_tecnico_lineas.id debe ser uuid';
  SELECT data_type INTO v_tipo FROM information_schema.columns
    WHERE table_schema='public' AND table_name='diagnosticos_tecnicos' AND column_name='id';
  ASSERT v_tipo = 'text', 'PRECONDITION_FAILED: diagnosticos_tecnicos.id debe ser text';
  SELECT data_type INTO v_tipo FROM information_schema.columns
    WHERE table_schema='public' AND table_name='diagnostico_informes' AND column_name='id';
  ASSERT v_tipo = 'uuid', 'PRECONDITION_FAILED: diagnostico_informes.id debe ser uuid';
  SELECT data_type INTO v_tipo FROM information_schema.columns
    WHERE table_schema='public' AND table_name='diagnostico_informes' AND column_name='diagnostico_id';
  ASSERT v_tipo = 'text', 'PRECONDITION_FAILED: diagnostico_informes.diagnostico_id debe ser text';
  SELECT data_type INTO v_tipo FROM information_schema.columns
    WHERE table_schema='public' AND table_name='hojas_costeo' AND column_name='id';
  ASSERT v_tipo = 'text', 'PRECONDITION_FAILED: hojas_costeo.id debe ser text';
  SELECT data_type INTO v_tipo FROM information_schema.columns
    WHERE table_schema='public' AND table_name='hojas_costeo' AND column_name='sociedad_id';
  ASSERT v_tipo = 'uuid', 'PRECONDITION_FAILED: hojas_costeo.sociedad_id debe ser uuid';
  ASSERT NOT EXISTS (
    SELECT 1 FROM (VALUES
      ('diagnostico_tecnico_linea_materiales','id','uuid'),
      ('diagnostico_tecnico_lineas','id','uuid'),
      ('diagnosticos_tecnicos','id','text'),
      ('diagnostico_informes','id','uuid'),
      ('diagnostico_informes','diagnostico_id','text'),
      ('hojas_costeo','id','text'),
      ('hojas_costeo','sociedad_id','uuid'),
      ('hojas_costeo','recepcion_id','text'),
      ('hojas_costeo','activo_id','text'),
      ('tipos_servicio_interno','id','text'),
      ('hoja_costeo_lineas_mano_obra','id','uuid'),
      ('hoja_costeo_lineas_mano_obra','hoja_costeo_id','text'),
      ('hoja_costeo_lineas_materiales','id','uuid'),
      ('hoja_costeo_lineas_materiales','hoja_costeo_id','text'),
      ('hoja_costeo_lineas_activos','id','uuid'),
      ('hoja_costeo_lineas_activos','hoja_costeo_id','text')
    ) AS esperado(tabla,columna,tipo)
    LEFT JOIN information_schema.columns c
      ON c.table_schema='public' AND c.table_name=esperado.tabla
      AND c.column_name=esperado.columna AND c.data_type=esperado.tipo
    WHERE c.column_name IS NULL
  ), 'PRECONDITION_FAILED: los tipos de columnas de producción no coinciden';
  ASSERT NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND (
      (table_name='hojas_costeo' AND column_name IN ('diagnostico_id','informe_id')) OR
      (table_name IN ('hoja_costeo_lineas_mano_obra','hoja_costeo_lineas_materiales','hoja_costeo_lineas_activos')
        AND column_name IN ('pendiente_valoracion','tarea_id','diagnostico_linea_id','diagnostico_material_id','costo_hora_equipo'))
    )
  ), 'PRECONDITION_FAILED: ya existe alguna columna nueva de esta migración';
END
$pre$;

-- Traza de origen en la cabecera y bloqueo de duplicados por diagnóstico.
ALTER TABLE public.hojas_costeo
  ADD COLUMN diagnostico_id text,
  ADD COLUMN informe_id uuid,
  ADD CONSTRAINT hojas_costeo_diagnostico_id_fkey
    FOREIGN KEY (diagnostico_id) REFERENCES public.diagnosticos_tecnicos(id) ON DELETE RESTRICT,
  ADD CONSTRAINT hojas_costeo_informe_id_fkey
    FOREIGN KEY (informe_id) REFERENCES public.diagnostico_informes(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX hojas_costeo_diagnostico_uidx
  ON public.hojas_costeo(diagnostico_id) WHERE diagnostico_id IS NOT NULL;

-- Valores pendientes distinguen de forma explícita costos aún no valorados.
ALTER TABLE public.hoja_costeo_lineas_mano_obra
  ALTER COLUMN actividad_id DROP NOT NULL,
  ALTER COLUMN cargo_id DROP NOT NULL,
  ADD COLUMN pendiente_valoracion boolean NOT NULL DEFAULT false,
  ADD COLUMN tarea_id text,
  ADD COLUMN diagnostico_linea_id uuid,
  ADD CONSTRAINT hoja_costeo_mo_tarea_id_fkey
    FOREIGN KEY (tarea_id) REFERENCES public.tipos_servicio_interno(id) ON DELETE SET NULL,
  ADD CONSTRAINT hoja_costeo_mo_diagnostico_linea_id_fkey
    FOREIGN KEY (diagnostico_linea_id) REFERENCES public.diagnostico_tecnico_lineas(id) ON DELETE SET NULL,
  ADD CONSTRAINT hoja_costeo_mo_cargo_pendiente_check
    CHECK (pendiente_valoracion OR cargo_id IS NOT NULL);

ALTER TABLE public.hoja_costeo_lineas_materiales
  ALTER COLUMN material_id DROP NOT NULL,
  ADD COLUMN descripcion text,
  ADD COLUMN unidad text,
  ADD COLUMN pendiente_valoracion boolean NOT NULL DEFAULT false,
  ADD COLUMN tarea_id text,
  ADD COLUMN diagnostico_linea_id uuid,
  ADD COLUMN diagnostico_material_id uuid,
  ADD CONSTRAINT hoja_costeo_material_tarea_id_fkey
    FOREIGN KEY (tarea_id) REFERENCES public.tipos_servicio_interno(id) ON DELETE SET NULL,
  ADD CONSTRAINT hoja_costeo_material_diagnostico_linea_id_fkey
    FOREIGN KEY (diagnostico_linea_id) REFERENCES public.diagnostico_tecnico_lineas(id) ON DELETE SET NULL,
  ADD CONSTRAINT hoja_costeo_material_diagnostico_material_id_fkey
    FOREIGN KEY (diagnostico_material_id) REFERENCES public.diagnostico_tecnico_linea_materiales(id) ON DELETE SET NULL,
  ADD CONSTRAINT hoja_costeo_material_origen_check
    CHECK (material_id IS NOT NULL OR nullif(btrim(descripcion),'') IS NOT NULL);

ALTER TABLE public.hoja_costeo_lineas_activos
  ADD COLUMN pendiente_valoracion boolean NOT NULL DEFAULT false,
  ADD COLUMN tarea_id text,
  ADD COLUMN diagnostico_linea_id uuid,
  ADD COLUMN costo_hora_equipo numeric,
  ADD CONSTRAINT hoja_costeo_activo_tarea_id_fkey
    FOREIGN KEY (tarea_id) REFERENCES public.tipos_servicio_interno(id) ON DELETE SET NULL,
  ADD CONSTRAINT hoja_costeo_activo_diagnostico_linea_id_fkey
    FOREIGN KEY (diagnostico_linea_id) REFERENCES public.diagnostico_tecnico_lineas(id) ON DELETE SET NULL,
  ADD CONSTRAINT hoja_costeo_activo_costo_hora_equipo_check
    CHECK (costo_hora_equipo IS NULL OR costo_hora_equipo >= 0);

COMMENT ON COLUMN public.hojas_costeo.diagnostico_id IS
  'Diagnóstico Técnico emitido que originó esta Hoja de Costeo.';
COMMENT ON COLUMN public.hojas_costeo.informe_id IS
  'Versión emitida más reciente del informe al momento de crear la Hoja de Costeo.';
COMMENT ON COLUMN public.hoja_costeo_lineas_mano_obra.pendiente_valoracion IS
  'Indica que Comercial aún debe asignar el costo de la línea.';
COMMENT ON COLUMN public.hoja_costeo_lineas_materiales.pendiente_valoracion IS
  'Indica que Comercial aún debe asignar el costo de la línea.';
COMMENT ON COLUMN public.hoja_costeo_lineas_activos.pendiente_valoracion IS
  'Indica que Comercial aún debe asignar el costo de la línea.';

CREATE OR REPLACE FUNCTION public.bloquear_hoja_costeo_sin_valorar()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $fn$
DECLARE
  v_mano_obra integer;
  v_materiales integer;
  v_activos integer;
  v_total integer;
BEGIN
  IF OLD.estado IS DISTINCT FROM NEW.estado
     AND NEW.estado IN ('en_revision','aprobada') THEN
    SELECT count(*) INTO v_mano_obra FROM public.hoja_costeo_lineas_mano_obra
      WHERE hoja_costeo_id=NEW.id AND pendiente_valoracion=true;
    SELECT count(*) INTO v_materiales FROM public.hoja_costeo_lineas_materiales
      WHERE hoja_costeo_id=NEW.id AND pendiente_valoracion=true;
    SELECT count(*) INTO v_activos FROM public.hoja_costeo_lineas_activos
      WHERE hoja_costeo_id=NEW.id AND pendiente_valoracion=true;
    v_total := v_mano_obra + v_materiales + v_activos;
    IF v_total > 0 THEN
      RAISE EXCEPTION
        'No se puede enviar ni aprobar la Hoja de Costeo: quedan % líneas pendientes de valoración (mano de obra %, materiales %, activos %).',
        v_total, v_mano_obra, v_materiales, v_activos
        USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION public.bloquear_hoja_costeo_sin_valorar() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER trg_bloquear_hoja_costeo_sin_valorar
BEFORE UPDATE OF estado ON public.hojas_costeo
FOR EACH ROW EXECUTE FUNCTION public.bloquear_hoja_costeo_sin_valorar();

CREATE OR REPLACE FUNCTION public.generar_hoja_costeo_desde_diagnostico(
  p_diagnostico_id text,
  p_sociedad_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $fn$
DECLARE
  v_usuario uuid := auth.uid();
  v_d public.diagnosticos_tecnicos%ROWTYPE;
  v_recepcion public.recepciones_activos_cliente%ROWTYPE;
  v_oportunidad public.oportunidades%ROWTYPE;
  v_activo public.activos%ROWTYPE;
  v_empresa_multisociedad boolean;
  v_cuenta_id text;
  v_sociedad_id uuid;
  v_activo_id text;
  v_moneda text;
  v_informe_id uuid;
  v_hoja_id text;
  v_numero text;
  v_intento integer;
  v_mano_obra integer := 0;
  v_materiales integer := 0;
  v_activos integer := 0;
  v_resultado jsonb;
BEGIN
  IF v_usuario IS NULL THEN
    RAISE EXCEPTION 'Se requiere una sesión autenticada.' USING ERRCODE='42501';
  END IF;
  IF p_diagnostico_id IS NULL OR btrim(p_diagnostico_id)='' THEN
    RAISE EXCEPTION 'El identificador del diagnóstico es obligatorio.' USING ERRCODE='22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('hoja-costeo-diagnostico:'||p_diagnostico_id,0));
  SELECT d.* INTO v_d FROM public.diagnosticos_tecnicos d
    WHERE d.id=p_diagnostico_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe el Diagnóstico Técnico solicitado.' USING ERRCODE='P0002';
  END IF;
  IF NOT public.usuario_tiene_empresa(v_d.empresa_id)
     OR NOT public.usuario_puede(v_d.empresa_id,'hoja_costeo','crear') THEN
    RAISE EXCEPTION 'No autorizado para crear una Hoja de Costeo en esta empresa.' USING ERRCODE='42501';
  END IF;
  IF NOT public.usuario_puede_ver_diagnostico_padre(
       v_d.tipo,v_d.empresa_id,v_d.recepcion_id,v_d.oportunidad_id) THEN
    RAISE EXCEPTION 'No tiene acceso al padre del Diagnóstico Técnico.' USING ERRCODE='42501';
  END IF;
  IF v_d.estado IS DISTINCT FROM 'emitido' THEN
    RAISE EXCEPTION 'Solo se puede generar una Hoja de Costeo desde un diagnóstico emitido.' USING ERRCODE='22023';
  END IF;

  -- La llave única es la garantía final; el advisory lock hace idempotente el flujo.
  SELECT h.id,h.numero,h.informe_id INTO v_hoja_id,v_numero,v_informe_id
    FROM public.hojas_costeo h WHERE h.diagnostico_id=v_d.id;
  IF FOUND THEN
    SELECT count(*) INTO v_mano_obra FROM public.hoja_costeo_lineas_mano_obra WHERE hoja_costeo_id=v_hoja_id;
    SELECT count(*) INTO v_materiales FROM public.hoja_costeo_lineas_materiales WHERE hoja_costeo_id=v_hoja_id;
    SELECT count(*) INTO v_activos FROM public.hoja_costeo_lineas_activos WHERE hoja_costeo_id=v_hoja_id;
    RETURN jsonb_build_object('hoja_costeo_id',v_hoja_id,'numero',v_numero,'creada',false,
      'informe_id',v_informe_id,'mano_obra',v_mano_obra,'materiales',v_materiales,'activos',v_activos);
  END IF;

  SELECT coalesce(e.multisociedad_habilitado,false) INTO v_empresa_multisociedad
    FROM public.empresas e WHERE e.id=v_d.empresa_id;
  IF v_d.tipo='mantenimiento' THEN
    SELECT r.* INTO v_recepcion FROM public.recepciones_activos_cliente r
      WHERE r.id=v_d.recepcion_id AND r.empresa_id=v_d.empresa_id FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La recepción del diagnóstico no existe o no pertenece a la empresa.' USING ERRCODE='23514';
    END IF;
    v_activo_id := v_recepcion.activo_id;
    v_moneda := NULL;
    SELECT a.* INTO v_activo FROM public.activos a
      WHERE a.id=v_activo_id AND a.empresa_id=v_d.empresa_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'El activo de la recepción no existe o no pertenece a la empresa.' USING ERRCODE='23514';
    END IF;
    v_cuenta_id := v_activo.cliente_propietario_id;
    v_sociedad_id := v_recepcion.sociedad_id;
    IF p_sociedad_id IS NOT NULL AND p_sociedad_id IS DISTINCT FROM v_sociedad_id THEN
      RAISE EXCEPTION 'La sociedad indicada no coincide con la sociedad de la recepción.' USING ERRCODE='23514';
    END IF;
  ELSIF v_d.tipo='fabricacion' THEN
    SELECT o.* INTO v_oportunidad FROM public.oportunidades o
      WHERE o.id=v_d.oportunidad_id AND o.empresa_id=v_d.empresa_id FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La oportunidad del diagnóstico no existe o no pertenece a la empresa.' USING ERRCODE='23514';
    END IF;
    v_cuenta_id := v_oportunidad.cuenta_id;
    v_activo_id := v_d.activo_id;
    v_moneda := coalesce(nullif(btrim(v_oportunidad.moneda),''),'PEN');
    v_sociedad_id := p_sociedad_id;
  ELSE
    RAISE EXCEPTION 'El tipo de diagnóstico no permite crear una Hoja de Costeo.' USING ERRCODE='23514';
  END IF;

  IF v_sociedad_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.sociedades s WHERE s.id=v_sociedad_id AND s.empresa_id=v_d.empresa_id AND s.activa=true
  ) THEN
    RAISE EXCEPTION 'La sociedad debe estar activa y pertenecer a la empresa.' USING ERRCODE='23514';
  END IF;
  IF v_empresa_multisociedad AND v_sociedad_id IS NULL THEN
    RAISE EXCEPTION 'Selecciona una sociedad para crear la Hoja de Costeo de este tenant multisociedad.' USING ERRCODE='22023';
  END IF;
  IF v_sociedad_id IS NOT NULL AND public.usuario_alcance_sociedades(v_d.empresa_id) IS NOT NULL
     AND NOT v_sociedad_id=ANY(public.usuario_alcance_sociedades(v_d.empresa_id)) THEN
    RAISE EXCEPTION 'No tiene acceso a la sociedad seleccionada.' USING ERRCODE='42501';
  END IF;

  SELECT i.id INTO v_informe_id FROM public.diagnostico_informes i
    WHERE i.empresa_id=v_d.empresa_id AND i.diagnostico_id=v_d.id AND i.estado='emitido'
    ORDER BY i.version DESC,i.emitido_en DESC,i.id DESC LIMIT 1;

  -- La cabecera se crea mediante el wrapper vigente, que vuelve a validar
  -- empresa/permisos y aplica los triggers comerciales y societarios existentes.
  -- Si el wrapper rechaza la solicitud, se aborta; INSERT directo eludiría ese contrato.
  FOR v_intento IN 1..10 LOOP
    v_numero := 'HC-'||to_char(current_date,'YYYY')||'-'||lpad((1000+floor(random()*999000))::integer::text,4,'0');
    v_hoja_id := 'hc_'||lpad(floor(random()*1000000)::integer::text,6,'0');
    IF EXISTS (SELECT 1 FROM public.hojas_costeo WHERE empresa_id=v_d.empresa_id AND numero=v_numero) THEN
      CONTINUE;
    END IF;
    BEGIN
      IF v_empresa_multisociedad THEN
        v_resultado := public.crear_hoja_costeo_sociedad(
          v_d.empresa_id,v_sociedad_id,v_hoja_id,v_numero,v_d.oportunidad_id,v_cuenta_id,
          NULL,current_date,35,'Generada desde Diagnóstico Técnico emitido.',
          '[]'::jsonb,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb,0,0,0,0,0,0,0);
      ELSE
        v_resultado := public.crear_hoja_costeo(
          v_d.empresa_id,v_hoja_id,v_numero,v_d.oportunidad_id,v_cuenta_id,
          NULL,current_date,35,'Generada desde Diagnóstico Técnico emitido.',
          '[]'::jsonb,'[]'::jsonb,'[]'::jsonb,'[]'::jsonb,0,0,0,0,0,0,0);
      END IF;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF EXISTS (SELECT 1 FROM public.hojas_costeo WHERE empresa_id=v_d.empresa_id AND numero=v_numero)
         OR EXISTS (SELECT 1 FROM public.hojas_costeo WHERE id=v_hoja_id) THEN
        IF v_intento=10 THEN
          RAISE EXCEPTION 'No se pudo reservar un número único para la Hoja de Costeo después de 10 intentos.' USING ERRCODE='23505';
        END IF;
      ELSE
        RAISE;
      END IF;
    END;
  END LOOP;
  IF v_resultado IS NULL THEN
    RAISE EXCEPTION 'No se pudo crear la cabecera de la Hoja de Costeo.' USING ERRCODE='23505';
  END IF;

  IF v_moneda IS NOT NULL THEN
    UPDATE public.hojas_costeo SET diagnostico_id=v_d.id,informe_id=v_informe_id,
      recepcion_id=v_d.recepcion_id,activo_id=v_activo_id,moneda=v_moneda
      WHERE id=v_hoja_id AND empresa_id=v_d.empresa_id;
  ELSE
    UPDATE public.hojas_costeo SET diagnostico_id=v_d.id,informe_id=v_informe_id,
      recepcion_id=v_d.recepcion_id,activo_id=v_activo_id
      WHERE id=v_hoja_id AND empresa_id=v_d.empresa_id;
  END IF;

  -- Cada línea del diagnóstico genera una fila de mano de obra, incluso con cero horas.
  -- diagnostico_linea_id y pendiente_valoracion=true marcan el origen; metodo_usado='manual'
  -- satisface el CHECK existente. Horas se copian, costos quedan en cero y el orden conserva el origen.
  INSERT INTO public.hoja_costeo_lineas_mano_obra
    (hoja_costeo_id,familia_trabajo_id,actividad_id,cargo_id,horas,metodo_usado,
     costo_hora_snapshot,subtotal,orden,pendiente_valoracion,tarea_id,diagnostico_linea_id)
  SELECT v_hoja_id,l.familia_trabajo_id,l.actividad_id,l.cargo_id,l.horas_mano_obra,
    'manual',0,0,l.orden,true,l.tarea_id,l.id
  FROM public.diagnostico_tecnico_lineas l
  WHERE l.empresa_id=v_d.empresa_id AND l.diagnostico_id=v_d.id
  ORDER BY l.orden,l.id;
  GET DIAGNOSTICS v_mano_obra=ROW_COUNT;

  INSERT INTO public.hoja_costeo_lineas_activos
    (hoja_costeo_id,activo_id,horas_uso_estimadas,depreciacion_asignada,fue_manual,
     orden,pendiente_valoracion,tarea_id,diagnostico_linea_id,costo_hora_equipo)
  SELECT v_hoja_id,l.activo_id,l.horas_maquina,0,false,l.orden,true,l.tarea_id,l.id,NULL
  FROM public.diagnostico_tecnico_lineas l
  WHERE l.empresa_id=v_d.empresa_id AND l.diagnostico_id=v_d.id
    AND l.activo_id IS NOT NULL AND l.horas_maquina>0
  ORDER BY l.orden,l.id;
  GET DIAGNOSTICS v_activos=ROW_COUNT;

  INSERT INTO public.hoja_costeo_lineas_materiales
    (hoja_costeo_id,material_id,descripcion,unidad,cantidad,costo_unitario_snapshot,
     subtotal,fue_manual,orden,pendiente_valoracion,tarea_id,diagnostico_linea_id,diagnostico_material_id)
  SELECT v_hoja_id,m.material_id,
    coalesce(nullif(btrim(m.descripcion),''),nullif(btrim(mat.descripcion),'')),
    m.unidad,m.cantidad,0,0,false,m.orden,true,l.tarea_id,l.id,m.id
  FROM public.diagnostico_tecnico_linea_materiales m
  JOIN public.diagnostico_tecnico_lineas l ON l.id=m.linea_id AND l.empresa_id=m.empresa_id
  LEFT JOIN public.materiales mat ON mat.id=m.material_id AND mat.empresa_id=m.empresa_id
  WHERE l.empresa_id=v_d.empresa_id AND l.diagnostico_id=v_d.id
  ORDER BY l.orden,l.id,m.orden,m.id;
  GET DIAGNOSTICS v_materiales=ROW_COUNT;

  RETURN jsonb_build_object('hoja_costeo_id',v_hoja_id,'numero',v_numero,'creada',true,
    'informe_id',v_informe_id,'mano_obra',v_mano_obra,'materiales',v_materiales,'activos',v_activos);
END
$fn$;

REVOKE ALL ON FUNCTION public.generar_hoja_costeo_desde_diagnostico(text,uuid)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.generar_hoja_costeo_desde_diagnostico(text,uuid)
  TO authenticated;

COMMIT;
-- Verificación manual posterior a revisión/aplicación en entorno controlado:
-- 1. Diagnóstico emitido/autorizado: comprobar una sola hoja y creada=false al repetir la RPC.
-- 2. Revisar informe, cuenta/sociedad y moneda (PEN en mantenimiento; oportunidad en fabricación), trazabilidad, orden y arrays JSONB vacíos.
-- 3. Confirmar costos cero, marcas pendientes y rechazo de en_revision/aprobada con conteo.
