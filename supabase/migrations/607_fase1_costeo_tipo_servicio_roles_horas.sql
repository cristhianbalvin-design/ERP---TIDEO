-- 607: Fase 1 del rediseño Diagnóstico Técnico → Hoja de Costeo.
-- Clasifica el tipo de servicio y los roles del catálogo sin backfill de diagnósticos.
-- Las horas de plantilla son horas-hombre estimadas por tarea, no horas máquina.
-- Aplicada en producción el 2026-10-09 tras ensayo con ROLLBACK y revisión.

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $pre$
DECLARE
  v_ambiguas text;
  v_faltantes text;
BEGIN
  ASSERT to_regclass('public.diagnosticos_tecnicos') IS NOT NULL,
    'PRECONDITION_FAILED: falta diagnosticos_tecnicos';
  ASSERT to_regclass('public.tipos_servicio_interno') IS NOT NULL,
    'PRECONDITION_FAILED: falta tipos_servicio_interno';
  ASSERT to_regclass('public.plantillas_actividad') IS NOT NULL,
    'PRECONDITION_FAILED: falta plantillas_actividad';
  ASSERT to_regclass('public.diagnostico_tecnico_lineas') IS NOT NULL,
    'PRECONDITION_FAILED: falta diagnostico_tecnico_lineas';
  ASSERT to_regclass('public.hoja_costeo_lineas_mano_obra') IS NOT NULL,
    'PRECONDITION_FAILED: falta hoja_costeo_lineas_mano_obra';
  ASSERT to_regprocedure('public.usuario_tiene_empresa(text)') IS NOT NULL
    AND to_regprocedure('public.usuario_puede(text,text,text)') IS NOT NULL,
    'PRECONDITION_FAILED: faltan helpers de permisos';
  ASSERT NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND (
      (table_name='diagnosticos_tecnicos' AND column_name='tipo_servicio') OR
      (table_name='tipos_servicio_interno' AND column_name='rol') OR
      (table_name='plantillas_actividad' AND column_name='horas')
    )
  ), 'PRECONDITION_FAILED: ya existe una columna que agrega esta migración';

  -- Los tres códigos conocidos tienen uso en ambos papeles; se conservarán como actividad.
  WITH referencias AS (
    SELECT actividad_id AS id, true AS es_actividad, false AS es_tarea
      FROM public.plantillas_actividad WHERE actividad_id IS NOT NULL
    UNION ALL
    SELECT tarea_id, false, true
      FROM public.plantillas_actividad WHERE tarea_id IS NOT NULL
    UNION ALL
    SELECT actividad_id, true, false
      FROM public.diagnostico_tecnico_lineas WHERE actividad_id IS NOT NULL
    UNION ALL
    SELECT tarea_id, false, true
      FROM public.diagnostico_tecnico_lineas WHERE tarea_id IS NOT NULL
    UNION ALL
    SELECT actividad_id, true, false
      FROM public.hoja_costeo_lineas_mano_obra WHERE actividad_id IS NOT NULL
    UNION ALL
    SELECT tarea_id, false, true
      FROM public.hoja_costeo_lineas_mano_obra WHERE tarea_id IS NOT NULL
  ), uso AS (
    SELECT id,bool_or(es_actividad) AS es_actividad,bool_or(es_tarea) AS es_tarea
    FROM referencias GROUP BY id
  )
  SELECT string_agg(t.id, ', ' ORDER BY t.id)
    INTO v_ambiguas
  FROM uso u
  JOIN public.tipos_servicio_interno t ON t.id=u.id
  WHERE u.es_actividad AND u.es_tarea
    AND NOT (
      (t.empresa_id='emp_2000000000' AND t.codigo='COD-001') OR
      (t.empresa_id='emp_20513453711' AND t.codigo IN ('CAM-002','GEN-002'))
    );
  ASSERT v_ambiguas IS NULL,
    format('PRECONDITION_FAILED: hay usos ambiguos no decididos: %s',v_ambiguas);

  WITH esperados(empresa_id,codigo) AS (VALUES
    ('emp_2000000000','COD-001'),
    ('emp_20513453711','CAM-002'),
    ('emp_20513453711','GEN-002')
  )
  SELECT string_agg(e.empresa_id||'/'||e.codigo, ', ' ORDER BY e.empresa_id,e.codigo)
    INTO v_faltantes
  FROM esperados e
  LEFT JOIN public.tipos_servicio_interno t
    ON t.empresa_id=e.empresa_id AND t.codigo=e.codigo
  WHERE t.id IS NULL;
  ASSERT v_faltantes IS NULL,
    format('PRECONDITION_FAILED: no se encontraron los códigos ambiguos esperados: %s',v_faltantes);

  -- La nueva regla de línea admite actividad, tarea o ambas; falla solo si falta todo.
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.diagnostico_tecnico_lineas
    WHERE actividad_id IS NULL AND tarea_id IS NULL
  ), 'PRECONDITION_FAILED: hay líneas de diagnóstico sin actividad ni tarea';
END
$pre$;

ALTER TABLE public.diagnosticos_tecnicos
  ADD COLUMN tipo_servicio text,
  ADD CONSTRAINT diagnosticos_tecnicos_tipo_servicio_check
    CHECK (tipo_servicio IS NULL OR tipo_servicio IN ('preventivo','reparacion','reacondicionamiento')),
  ADD CONSTRAINT diagnosticos_tecnicos_tipo_servicio_mantenimiento_check
    CHECK (tipo_servicio IS NULL OR tipo='mantenimiento');
COMMENT ON COLUMN public.diagnosticos_tecnicos.tipo_servicio IS
  'Clasificación del servicio de mantenimiento; NULL significa sin clasificar.';

ALTER TABLE public.tipos_servicio_interno
  ADD COLUMN rol text,
  ADD CONSTRAINT tipos_servicio_interno_rol_check
    CHECK (rol IS NULL OR rol IN ('actividad','tarea'));
COMMENT ON COLUMN public.tipos_servicio_interno.rol IS
  'Papel del tipo de servicio interno: actividad o tarea; NULL significa sin clasificar.';

-- Inferir roles por referencias históricas. Los tres cruces conocidos se fijan como actividad.
WITH referencias AS (
  SELECT actividad_id AS id, true AS es_actividad, false AS es_tarea
    FROM public.plantillas_actividad WHERE actividad_id IS NOT NULL
  UNION ALL
  SELECT tarea_id, false, true
    FROM public.plantillas_actividad WHERE tarea_id IS NOT NULL
  UNION ALL
  SELECT actividad_id, true, false
    FROM public.diagnostico_tecnico_lineas WHERE actividad_id IS NOT NULL
  UNION ALL
  SELECT tarea_id, false, true
    FROM public.diagnostico_tecnico_lineas WHERE tarea_id IS NOT NULL
  UNION ALL
  SELECT actividad_id, true, false
    FROM public.hoja_costeo_lineas_mano_obra WHERE actividad_id IS NOT NULL
  UNION ALL
  SELECT tarea_id, false, true
    FROM public.hoja_costeo_lineas_mano_obra WHERE tarea_id IS NOT NULL
), uso AS (
  SELECT id,bool_or(es_actividad) AS es_actividad,bool_or(es_tarea) AS es_tarea
  FROM referencias GROUP BY id
)
UPDATE public.tipos_servicio_interno t
SET rol=CASE
  WHEN (t.empresa_id='emp_2000000000' AND t.codigo='COD-001')
    OR (t.empresa_id='emp_20513453711' AND t.codigo IN ('CAM-002','GEN-002'))
    THEN 'actividad'
  WHEN u.es_actividad AND NOT u.es_tarea THEN 'actividad'
  WHEN u.es_tarea AND NOT u.es_actividad THEN 'tarea'
  ELSE NULL
END
FROM uso u
WHERE t.id=u.id;

-- Control visible de los tres casos ambiguos resueltos como actividad.
SELECT e.empresa_id,e.codigo,t.id,t.nombre,t.rol
FROM (VALUES
  ('emp_2000000000','COD-001'),
  ('emp_20513453711','CAM-002'),
  ('emp_20513453711','GEN-002')
) AS e(empresa_id,codigo)
LEFT JOIN public.tipos_servicio_interno t
  ON t.empresa_id=e.empresa_id AND t.codigo=e.codigo
ORDER BY e.empresa_id,e.codigo;

ALTER TABLE public.diagnostico_tecnico_lineas
  ALTER COLUMN tarea_id DROP NOT NULL,
  ADD CONSTRAINT diagnostico_tecnico_lineas_actividad_o_tarea_check
    CHECK (actividad_id IS NOT NULL OR tarea_id IS NOT NULL);

ALTER TABLE public.plantillas_actividad
  ADD COLUMN horas numeric NOT NULL DEFAULT 0,
  ADD CONSTRAINT plantillas_actividad_horas_check CHECK (horas >= 0);
COMMENT ON COLUMN public.plantillas_actividad.horas IS
  'Horas-hombre estimadas por tarea dentro de la receta de actividad; no son horas máquina.';

-- La comprobación se ejecuta antes de agregar el CHECK de nivel de costo.
DO $pre_mano_obra$
DECLARE
  v_total bigint;
  v_violaciones bigint;
BEGIN
  SELECT count(*),count(*) FILTER (
    WHERE (actividad_id IS NOT NULL) = (tarea_id IS NOT NULL)
  ) INTO v_total,v_violaciones
  FROM public.hoja_costeo_lineas_mano_obra;
  RAISE NOTICE 'Mano de obra existente: % filas; % violaciones del XOR actividad/tarea.',v_total,v_violaciones;
  IF v_violaciones > 0 THEN
    RAISE EXCEPTION 'PRECONDITION_FAILED: % filas de mano de obra tienen ambos niveles o ninguno.',v_violaciones;
  END IF;
END
$pre_mano_obra$;

ALTER TABLE public.hoja_costeo_lineas_mano_obra
  ADD CONSTRAINT hoja_costeo_lineas_mano_obra_nivel_costo_xor_check
    CHECK ((actividad_id IS NOT NULL) <> (tarea_id IS NOT NULL));

-- Horas se acepta como número no negativo; si el cliente aún no lo envía, se guarda cero.
-- La validación mantiene permisos de maestros/editar, tenant, unicidad y rol de actividad/tarea.
CREATE OR REPLACE FUNCTION public.reemplazar_receta_actividad(
  p_empresa_id text,
  p_actividad_id text,
  p_filas jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $fn$
DECLARE
  v_fila jsonb;
  v_tarea_id text;
  v_cargo_id text;
  v_orden integer;
  v_horas numeric;
  v_rol text;
  v_tareas text[] := ARRAY[]::text[];
  v_insertadas integer := 0;
  v_actualizadas integer := 0;
  v_eliminadas integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Se requiere una sesión autenticada.' USING ERRCODE='42501';
  END IF;
  IF NOT public.usuario_tiene_empresa(p_empresa_id)
     OR NOT public.usuario_puede(p_empresa_id,'maestros','editar') THEN
    RAISE EXCEPTION 'No autorizado para modificar recetas de actividad.' USING ERRCODE='42501';
  END IF;
  IF p_empresa_id IS NULL OR p_actividad_id IS NULL THEN
    RAISE EXCEPTION 'La empresa y la actividad son obligatorias.' USING ERRCODE='22023';
  END IF;
  IF jsonb_typeof(p_filas) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Las filas de receta deben ser un arreglo JSON.' USING ERRCODE='22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('receta-actividad:'||p_empresa_id||':'||p_actividad_id,0));

  SELECT rol INTO v_rol FROM public.tipos_servicio_interno
  WHERE id=p_actividad_id AND empresa_id=p_empresa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La actividad no pertenece a la empresa.' USING ERRCODE='23514';
  END IF;
  IF v_rol IS DISTINCT FROM 'actividad' THEN
    RAISE EXCEPTION 'El tipo de servicio principal debe tener rol actividad.' USING ERRCODE='23514';
  END IF;

  FOR v_fila IN SELECT value FROM jsonb_array_elements(p_filas)
  LOOP
    IF jsonb_typeof(v_fila) IS DISTINCT FROM 'object'
       OR NOT (v_fila ? 'tarea_id') OR nullif(v_fila->>'tarea_id','') IS NULL
       OR NOT (v_fila ? 'orden') OR jsonb_typeof(v_fila->'orden') IS DISTINCT FROM 'number'
       OR ((v_fila ? 'horas') AND jsonb_typeof(v_fila->'horas') IS DISTINCT FROM 'number') THEN
      RAISE EXCEPTION 'Cada fila requiere tarea_id y orden numérico; horas debe ser un número si se envía.' USING ERRCODE='22023';
    END IF;
    v_tarea_id := v_fila->>'tarea_id';
    v_orden := (v_fila->>'orden')::integer;
    v_horas := coalesce((v_fila->>'horas')::numeric,0);
    IF v_orden < 1 OR (v_fila->>'orden')::numeric <> v_orden THEN
      RAISE EXCEPTION 'El orden debe ser un entero positivo.' USING ERRCODE='22023';
    END IF;
    IF v_horas < 0 THEN
      RAISE EXCEPTION 'Las horas estimadas no pueden ser negativas.' USING ERRCODE='22023';
    END IF;
    IF v_tarea_id=p_actividad_id THEN
      RAISE EXCEPTION 'Una actividad no puede agregarse como tarea de su propia receta.' USING ERRCODE='23514';
    END IF;
    IF v_tarea_id=ANY(v_tareas) THEN
      RAISE EXCEPTION 'La receta no puede repetir tareas.' USING ERRCODE='23505';
    END IF;
    v_tareas := array_append(v_tareas,v_tarea_id);
    v_cargo_id := nullif(v_fila->>'cargo_id','');
    SELECT rol INTO v_rol FROM public.tipos_servicio_interno
      WHERE id=v_tarea_id AND empresa_id=p_empresa_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La tarea debe pertenecer a la misma empresa.' USING ERRCODE='23514';
    END IF;
    IF v_rol IS DISTINCT FROM 'tarea' THEN
      RAISE EXCEPTION 'Cada elemento de la receta debe tener rol tarea.' USING ERRCODE='23514';
    END IF;
    IF v_cargo_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.cargos_empresa
      WHERE id=v_cargo_id AND empresa_id=p_empresa_id
    ) THEN
      RAISE EXCEPTION 'El cargo debe pertenecer a la misma empresa.' USING ERRCODE='23514';
    END IF;
  END LOOP;

  DELETE FROM public.plantillas_actividad pa
  WHERE pa.empresa_id=p_empresa_id AND pa.actividad_id=p_actividad_id
    AND NOT (pa.tarea_id=ANY(v_tareas));
  GET DIAGNOSTICS v_eliminadas = ROW_COUNT;

  UPDATE public.plantillas_actividad pa
  SET cargo_id=nullif(f.cargo_id,''), orden=f.orden, horas=coalesce(f.horas,0)
  FROM jsonb_to_recordset(p_filas) AS f(tarea_id text,cargo_id text,orden integer,horas numeric)
  WHERE pa.empresa_id=p_empresa_id AND pa.actividad_id=p_actividad_id
    AND pa.tarea_id=f.tarea_id
    AND (pa.cargo_id IS DISTINCT FROM nullif(f.cargo_id,'')
      OR pa.orden IS DISTINCT FROM f.orden OR pa.horas IS DISTINCT FROM coalesce(f.horas,0));
  GET DIAGNOSTICS v_actualizadas = ROW_COUNT;

  INSERT INTO public.plantillas_actividad(empresa_id,actividad_id,tarea_id,cargo_id,orden,horas)
  SELECT p_empresa_id,p_actividad_id,f.tarea_id,nullif(f.cargo_id,''),f.orden,coalesce(f.horas,0)
  FROM jsonb_to_recordset(p_filas) AS f(tarea_id text,cargo_id text,orden integer,horas numeric)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.plantillas_actividad pa
    WHERE pa.empresa_id=p_empresa_id AND pa.actividad_id=p_actividad_id AND pa.tarea_id=f.tarea_id
  );
  GET DIAGNOSTICS v_insertadas = ROW_COUNT;

  RETURN jsonb_build_object('insertadas',v_insertadas,'actualizadas',v_actualizadas,'eliminadas',v_eliminadas);
END
$fn$;

REVOKE ALL ON FUNCTION public.reemplazar_receta_actividad(text,text,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.reemplazar_receta_actividad(text,text,jsonb) TO authenticated;
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

  -- Una línea con tarea genera una fila de tarea; la actividad solo se conserva
  -- cuando la línea no tiene tarea. Así, actividad_id y tarea_id son excluyentes.
  INSERT INTO public.hoja_costeo_lineas_mano_obra
    (hoja_costeo_id,familia_trabajo_id,actividad_id,cargo_id,horas,metodo_usado,
     costo_hora_snapshot,subtotal,orden,pendiente_valoracion,tarea_id,diagnostico_linea_id)
  SELECT v_hoja_id,l.familia_trabajo_id,
    CASE WHEN l.tarea_id IS NULL THEN l.actividad_id ELSE NULL END,
    l.cargo_id,l.horas_mano_obra,'manual',0,0,l.orden,true,l.tarea_id,l.id
  FROM public.diagnostico_tecnico_lineas l
  WHERE l.empresa_id=v_d.empresa_id AND l.diagnostico_id=v_d.id
  ORDER BY l.orden,l.id;
  GET DIAGNOSTICS v_mano_obra=ROW_COUNT;

  -- Activos y materiales se atribuyen una sola vez a su línea de diagnóstico;
  -- conservan tarea_id cuando existe y el vínculo de origen aunque no haya tarea.
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

-- Consultas de verificación post-aplicación:
-- SELECT tipo,tipo_servicio,count(*) FROM public.diagnosticos_tecnicos GROUP BY tipo,tipo_servicio ORDER BY tipo,tipo_servicio;
-- SELECT rol,count(*) FROM public.tipos_servicio_interno GROUP BY rol ORDER BY rol;
-- SELECT empresa_id,codigo,id,nombre,rol FROM public.tipos_servicio_interno
-- WHERE (empresa_id='emp_2000000000' AND codigo='COD-001')
--    OR (empresa_id='emp_20513453711' AND codigo IN ('CAM-002','GEN-002')) ORDER BY empresa_id,codigo;
-- SELECT count(*) AS lineas_sin_actividad_ni_tarea FROM public.diagnostico_tecnico_lineas
-- WHERE actividad_id IS NULL AND tarea_id IS NULL;
-- SELECT count(*) AS plantillas_horas_invalidas FROM public.plantillas_actividad WHERE horas < 0 OR horas IS NULL;
-- SELECT count(*) AS mano_obra_nivel_invalido FROM public.hoja_costeo_lineas_mano_obra
-- WHERE (actividad_id IS NOT NULL) = (tarea_id IS NOT NULL);
-- SELECT id,empresa_id,actividad_id,tarea_id,orden,horas FROM public.plantillas_actividad ORDER BY empresa_id,actividad_id,orden;

COMMIT;

