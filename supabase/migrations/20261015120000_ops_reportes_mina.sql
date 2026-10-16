-- Reportes de mina: parte diario por turno de los equipos en mina.
-- Se guardan en partes_diarios (origen_registro = 'mina') con el detalle de mina
-- en la columna jsonb datos_mina, para que cuenten como partes de la OT
-- (aprobación, cierre de OT y costos) sin crear una tabla paralela.
-- Migración aditiva: una columna, un índice parcial y funciones nuevas.

ALTER TABLE public.partes_diarios ADD COLUMN IF NOT EXISTS datos_mina jsonb;

COMMENT ON COLUMN public.partes_diarios.datos_mina IS
  'Detalle del reporte de mina (turno, horómetros, distribución de horas, mantenimiento, estado del equipo, lubricantes, pedido, backlog, revisión). Solo para origen_registro = mina.';

CREATE INDEX IF NOT EXISTS partes_diarios_mina_empresa_fecha_idx
  ON public.partes_diarios (empresa_id, fecha DESC, created_at DESC)
  WHERE origen_registro = 'mina';

-- Convierte un texto a número; NULL si está vacío; error legible si no es número.
CREATE OR REPLACE FUNCTION public.ops_rm_numero(p_valor text, p_campo text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_valor IS NULL OR btrim(p_valor) = '' THEN
    RETURN NULL;
  END IF;
  RETURN replace(btrim(p_valor), ',', '.')::numeric;
EXCEPTION WHEN others THEN
  RAISE EXCEPTION 'El valor de % no es un número válido.', p_campo;
END $function$;

-- Contexto para un reporte nuevo: OT de mina disponibles y técnico del usuario.
CREATE OR REPLACE FUNCTION public.ops_reportes_mina_contexto(p_empresa_id text, p_sociedad_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_alcance uuid[];
  v_ots jsonb;
  v_tecnico jsonb;
  v_tecnicos jsonb;
BEGIN
  PERFORM public.wms_exigir_permiso(p_empresa_id, 'partes', 'ver');
  v_alcance := public.usuario_alcance_sociedades(p_empresa_id);

  SELECT coalesce(jsonb_agg(x ORDER BY x->>'numero'), '[]'::jsonb) INTO v_ots
  FROM (
    SELECT jsonb_build_object(
      'id', o.id, 'numero', o.numero, 'estado', o.estado, 'sociedad_id', o.sociedad_id,
      'descripcion', o.descripcion, 'avance_pct', coalesce(o.avance_pct, 0),
      'proyecto_id', p.id, 'proyecto_codigo', p.codigo, 'proyecto_nombre', p.nombre,
      'mina_id', m.id, 'mina_codigo', m.codigo, 'mina_nombre', m.nombre,
      'equipo_id', a.id, 'equipo_codigo', a.codigo, 'equipo_nombre', a.nombre,
      'equipo_marca', a.marca, 'equipo_modelo', a.modelo, 'equipo_serie', a.placa_serie,
      'horometro_actual', a.horometro_actual,
      'ultimo_reporte', (
        SELECT jsonb_build_object('numero', pd.numero, 'horometros', pd.datos_mina->'horometros', 'avance_pct', pd.avance_pct, 'estado', pd.estado)
        FROM public.partes_diarios pd
        JOIN public.ordenes_trabajo o2 ON o2.id = pd.orden_trabajo_id
        WHERE pd.empresa_id = p_empresa_id AND pd.origen_registro = 'mina'
          AND pd.estado IN ('en_revision', 'aprobado')
          AND o2.equipo_id IS NOT DISTINCT FROM o.equipo_id AND o.equipo_id IS NOT NULL
        ORDER BY pd.fecha DESC, pd.created_at DESC LIMIT 1),
      'ultimo_avance_validado', (
        SELECT jsonb_build_object('numero', pd.numero, 'avance_pct', pd.avance_pct)
        FROM public.partes_diarios pd
        WHERE pd.empresa_id = p_empresa_id AND pd.orden_trabajo_id = o.id AND pd.estado = 'aprobado'
        ORDER BY pd.fecha DESC, pd.created_at DESC LIMIT 1)
    ) AS x
    FROM public.ordenes_trabajo o
    JOIN public.proyectos p ON p.id = o.proyecto_id
    JOIN public.minas m ON m.id = p.mina_id
    LEFT JOIN public.activos a ON a.id = o.equipo_id
    WHERE o.empresa_id = p_empresa_id
      AND o.estado IN ('programada', 'ejecucion')
      AND (v_alcance IS NULL OR o.sociedad_id = ANY (v_alcance))
      AND (p_sociedad_id IS NULL OR o.sociedad_id = p_sociedad_id)
  ) t;

  SELECT jsonb_build_object('id', po.id, 'nombre', po.nombre) INTO v_tecnico
  FROM public.personal_operativo po
  WHERE po.empresa_id = p_empresa_id AND po.auth_user_id = auth.uid()
  LIMIT 1;

  -- Quien no está vinculado a personal operativo (p. ej. un administrador) elige al técnico.
  IF v_tecnico IS NULL THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', po.id, 'nombre', po.nombre) ORDER BY po.nombre), '[]'::jsonb)
      INTO v_tecnicos
    FROM public.personal_operativo po
    WHERE po.empresa_id = p_empresa_id AND coalesce(po.estado, 'disponible') <> 'inactivo';
  END IF;

  RETURN jsonb_build_object(
    'ots', v_ots,
    'tecnico', v_tecnico,
    'tecnicos', coalesce(v_tecnicos, '[]'::jsonb),
    'duracion_turno', 12,
    'permisos', jsonb_build_object(
      'crear', public.usuario_puede(p_empresa_id, 'partes', 'crear'),
      'aprobar', public.usuario_puede(p_empresa_id, 'partes', 'aprobar'))
  );
END $function$;

-- Listado de reportes de mina visibles para el usuario.
CREATE OR REPLACE FUNCTION public.ops_reportes_mina_listar(p_empresa_id text, p_sociedad_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_alcance uuid[];
  v_reportes jsonb;
BEGIN
  PERFORM public.wms_exigir_permiso(p_empresa_id, 'partes', 'ver');
  v_alcance := public.usuario_alcance_sociedades(p_empresa_id);

  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'fecha') DESC, (x->>'created_at') DESC), '[]'::jsonb) INTO v_reportes
  FROM (
    SELECT jsonb_build_object(
      'id', pd.id, 'numero', pd.numero, 'fecha', pd.fecha, 'estado', pd.estado,
      'created_at', pd.created_at, 'updated_at', pd.updated_at, 'aprobado_at', pd.aprobado_at,
      'tecnico_id', pd.tecnico_id, 'tecnico_nombre', pd.tecnico_nombre,
      'es_propio', coalesce(po.auth_user_id = auth.uid(), false),
      'ot_id', o.id, 'ot_numero', o.numero, 'ot_estado', o.estado, 'sociedad_id', o.sociedad_id,
      'proyecto_codigo', p.codigo, 'proyecto_nombre', p.nombre,
      'mina_id', m.id, 'mina_nombre', m.nombre,
      'equipo_id', a.id, 'equipo_codigo', a.codigo, 'equipo_nombre', a.nombre,
      'equipo_marca', a.marca, 'equipo_modelo', a.modelo, 'equipo_serie', a.placa_serie,
      'actividad', pd.actividad, 'avance_pct', pd.avance_pct,
      'horas_normales', pd.horas_normales,
      'materiales', coalesce(pd.materiales, '[]'::jsonb),
      'evidencias', coalesce(pd.evidencias, '[]'::jsonb),
      'datos_mina', coalesce(pd.datos_mina, '{}'::jsonb)
    ) AS x
    FROM public.partes_diarios pd
    JOIN public.ordenes_trabajo o ON o.id = pd.orden_trabajo_id
    LEFT JOIN public.proyectos p ON p.id = o.proyecto_id
    LEFT JOIN public.minas m ON m.id = p.mina_id
    LEFT JOIN public.activos a ON a.id = o.equipo_id
    LEFT JOIN public.personal_operativo po ON po.id = pd.tecnico_id AND po.empresa_id = pd.empresa_id
    WHERE pd.empresa_id = p_empresa_id
      AND pd.origen_registro = 'mina'
      AND (v_alcance IS NULL OR pd.sociedad_id = ANY (v_alcance))
      AND (p_sociedad_id IS NULL OR pd.sociedad_id = p_sociedad_id)
      AND public.usuario_puede_ver_registro(p_empresa_id, po.auth_user_id)
      AND (pd.estado <> 'borrador' OR po.auth_user_id = auth.uid() OR public.usuario_puede(p_empresa_id, 'partes', 'editar'))
    ORDER BY pd.fecha DESC, pd.created_at DESC
    LIMIT 300
  ) t;

  RETURN jsonb_build_object(
    'reportes', v_reportes,
    'permisos', jsonb_build_object(
      'crear', public.usuario_puede(p_empresa_id, 'partes', 'crear'),
      'editar', public.usuario_puede(p_empresa_id, 'partes', 'editar'),
      'aprobar', public.usuario_puede(p_empresa_id, 'partes', 'aprobar'))
  );
END $function$;

-- Guarda (borrador) o envía a revisión un reporte de mina.
CREATE OR REPLACE FUNCTION public.ops_guardar_reporte_mina(p_empresa_id text, p_reporte jsonb, p_enviar boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c_turno CONSTANT numeric := 12;
  v_alcance uuid[];
  v_ot public.ordenes_trabajo%rowtype;
  v_mina_id text;
  v_actual public.partes_diarios%rowtype;
  v_existe boolean := false;
  v_id text;
  v_numero text;
  v_tecnico_id text;
  v_tecnico_nombre text;
  v_tecnico_auth uuid;
  v_fecha date;
  v_turno text;
  v_hor jsonb := '{}'::jsonb;
  v_contador text;
  v_ini numeric;
  v_fin numeric;
  v_horas jsonb := '{}'::jsonb;
  v_campo text;
  v_valor numeric;
  v_total numeric := 0;
  v_mant numeric := 0;
  v_dm numeric;
  v_tipos jsonb;
  v_estado_eq text;
  v_motivo text;
  v_actividad text;
  v_avance numeric;
  v_item jsonb;
  v_mat public.materiales%rowtype;
  v_materiales jsonb := '[]'::jsonb;
  v_pedido jsonb := '[]'::jsonb;
  v_backlog jsonb := '[]'::jsonb;
  v_lubricantes jsonb := '[]'::jsonb;
  v_evidencias jsonb;
  v_vistos text[] := '{}';
  v_datos jsonb;
  v_resultado_pedido jsonb;
  v_estado_nuevo text;
  v_year text := to_char(current_date, 'YYYY');
  v_max int;
BEGIN
  PERFORM public.wms_exigir_permiso(p_empresa_id, 'partes', 'crear');
  IF p_reporte IS NULL OR jsonb_typeof(p_reporte) <> 'object' THEN
    RAISE EXCEPTION 'Faltan los datos del reporte.';
  END IF;
  v_alcance := public.usuario_alcance_sociedades(p_empresa_id);

  -- OT de mina
  SELECT * INTO v_ot FROM public.ordenes_trabajo
   WHERE id = p_reporte->>'ot_id' AND empresa_id = p_empresa_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Selecciona una orden de trabajo de mina.'; END IF;
  IF v_alcance IS NOT NULL AND NOT (v_ot.sociedad_id = ANY (v_alcance)) THEN
    RAISE EXCEPTION 'No tienes alcance sobre la sociedad de esta OT.';
  END IF;
  SELECT p.mina_id INTO v_mina_id FROM public.proyectos p WHERE p.id = v_ot.proyecto_id;
  IF v_mina_id IS NULL THEN RAISE EXCEPTION 'La OT % no tiene un proyecto de mina.', v_ot.numero; END IF;

  -- Reporte existente
  v_id := nullif(btrim(coalesce(p_reporte->>'id', '')), '');
  IF v_id IS NOT NULL THEN
    SELECT * INTO v_actual FROM public.partes_diarios WHERE id = v_id FOR UPDATE;
    v_existe := FOUND;
  END IF;
  IF v_existe THEN
    IF v_actual.empresa_id <> p_empresa_id OR coalesce(v_actual.origen_registro, '') <> 'mina' THEN
      RAISE EXCEPTION 'El reporte no pertenece a esta empresa.';
    END IF;
    IF v_actual.estado NOT IN ('borrador', 'observado') THEN
      RAISE EXCEPTION 'Solo se puede editar un reporte en borrador u observado.';
    END IF;
    SELECT po.auth_user_id INTO v_tecnico_auth FROM public.personal_operativo po WHERE po.id = v_actual.tecnico_id;
    IF v_tecnico_auth IS DISTINCT FROM auth.uid() AND NOT public.usuario_puede(p_empresa_id, 'partes', 'editar') THEN
      RAISE EXCEPTION 'Solo el técnico que lo registró puede editar este reporte.';
    END IF;
    IF v_actual.orden_trabajo_id <> v_ot.id THEN
      RAISE EXCEPTION 'No se puede cambiar la OT de un reporte ya guardado.';
    END IF;
  ELSE
    IF v_ot.estado NOT IN ('programada', 'ejecucion') THEN
      RAISE EXCEPTION 'Solo se reporta sobre una OT programada o en ejecución.';
    END IF;
    v_id := coalesce(v_id, 'pd_' || gen_random_uuid()::text);
  END IF;

  -- Técnico: el propio usuario; si no está vinculado, el indicado (con permiso de edición).
  SELECT po.id, po.nombre INTO v_tecnico_id, v_tecnico_nombre
    FROM public.personal_operativo po
   WHERE po.empresa_id = p_empresa_id AND po.auth_user_id = auth.uid() LIMIT 1;
  IF v_existe THEN
    v_tecnico_id := v_actual.tecnico_id; v_tecnico_nombre := v_actual.tecnico_nombre;
  ELSIF v_tecnico_id IS NULL THEN
    SELECT po.id, po.nombre INTO v_tecnico_id, v_tecnico_nombre
      FROM public.personal_operativo po
     WHERE po.empresa_id = p_empresa_id AND po.id = p_reporte->>'tecnico_id';
    IF v_tecnico_id IS NULL THEN RAISE EXCEPTION 'Selecciona el técnico del reporte.'; END IF;
  END IF;

  -- Cabecera
  BEGIN
    v_fecha := (p_reporte->>'fecha')::date;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'La fecha del reporte no es válida.';
  END;
  IF v_fecha IS NULL THEN RAISE EXCEPTION 'Ingresa la fecha del reporte.'; END IF;
  IF v_fecha > current_date + 1 THEN RAISE EXCEPTION 'La fecha del reporte no puede ser futura.'; END IF;
  v_turno := lower(coalesce(p_reporte->>'turno', 'dia'));
  IF v_turno NOT IN ('dia', 'noche') THEN RAISE EXCEPTION 'El turno debe ser día o noche.'; END IF;

  -- Horómetros
  FOREACH v_contador IN ARRAY ARRAY['motor', 'percusion', 'electrico'] LOOP
    v_ini := public.ops_rm_numero(p_reporte->'horometros'->v_contador->>'inicial', 'horómetro ' || v_contador || ' inicial');
    v_fin := public.ops_rm_numero(p_reporte->'horometros'->v_contador->>'final', 'horómetro ' || v_contador || ' final');
    IF (v_ini IS NOT NULL AND v_ini < 0) OR (v_fin IS NOT NULL AND v_fin < 0) THEN
      RAISE EXCEPTION 'Los horómetros no pueden ser negativos.';
    END IF;
    IF v_ini IS NOT NULL AND v_fin IS NOT NULL AND v_fin < v_ini THEN
      RAISE EXCEPTION 'El horómetro % final no puede ser menor que el inicial.', v_contador;
    END IF;
    IF p_enviar AND v_contador = 'motor' AND (v_ini IS NULL OR v_fin IS NULL) THEN
      RAISE EXCEPTION 'Ingresa el horómetro de motor inicial y final.';
    END IF;
    IF p_enviar AND ((v_ini IS NULL) <> (v_fin IS NULL)) THEN
      RAISE EXCEPTION 'Completa el horómetro % inicial y final, o deja ambos vacíos.', v_contador;
    END IF;
    v_hor := v_hor || jsonb_build_object(v_contador, jsonb_build_object('inicial', v_ini, 'final', v_fin));
  END LOOP;

  -- Distribución del turno
  FOREACH v_campo IN ARRAY ARRAY['trabajadas', 'prev_programado', 'preventivo', 'correctivo', 'accidente', 'standby'] LOOP
    v_valor := coalesce(public.ops_rm_numero(p_reporte->'horas'->>v_campo, 'horas ' || v_campo), 0);
    IF v_valor < 0 OR v_valor > c_turno THEN RAISE EXCEPTION 'Las horas de % deben estar entre 0 y %.', v_campo, c_turno; END IF;
    v_horas := v_horas || jsonb_build_object(v_campo, v_valor);
    v_total := v_total + v_valor;
    IF v_campo IN ('prev_programado', 'preventivo', 'correctivo', 'accidente') THEN v_mant := v_mant + v_valor; END IF;
  END LOOP;
  IF p_enviar AND v_total <> c_turno THEN
    RAISE EXCEPTION 'Las horas del turno deben sumar % h (hoy suman %).', c_turno, v_total;
  END IF;
  v_dm := round(greatest(c_turno - v_mant, 0) / c_turno * 100, 1);

  -- Mantenimiento y estado del equipo
  v_tipos := coalesce(p_reporte->'tipos_mantenimiento', '[]'::jsonb);
  IF jsonb_typeof(v_tipos) <> 'array' THEN RAISE EXCEPTION 'Tipo de mantenimiento no válido.'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(v_tipos) t WHERE t NOT IN ('prev_programado', 'preventivo', 'correctivo', 'accidente')
  ) THEN RAISE EXCEPTION 'Tipo de mantenimiento no válido.'; END IF;
  v_estado_eq := nullif(p_reporte->>'estado_equipo', '');
  IF v_estado_eq IS NOT NULL AND v_estado_eq NOT IN ('operativo', 'espera', 'inoperativo', 'retorno') THEN
    RAISE EXCEPTION 'Estado del equipo no válido.';
  END IF;
  IF p_enviar AND v_estado_eq IS NULL THEN RAISE EXCEPTION 'Indica el estado del equipo al cierre.'; END IF;
  v_motivo := nullif(btrim(coalesce(p_reporte->>'motivo_retorno', '')), '');
  IF p_enviar AND v_estado_eq = 'retorno' AND v_motivo IS NULL THEN
    RAISE EXCEPTION 'Indica el motivo del retorno a taller.';
  END IF;

  v_actividad := nullif(btrim(coalesce(p_reporte->>'actividad', '')), '');
  IF p_enviar AND v_actividad IS NULL THEN RAISE EXCEPTION 'Describe los trabajos realizados.'; END IF;
  v_avance := coalesce(public.ops_rm_numero(p_reporte->>'avance_pct', 'avance'), 0);
  IF v_avance < 0 OR v_avance > 100 THEN RAISE EXCEPTION 'El avance debe estar entre 0 y 100.'; END IF;

  -- Repuestos utilizados (solo registro, no mueve stock)
  FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(p_reporte->'repuestos', '[]'::jsonb)) LOOP
    SELECT * INTO v_mat FROM public.materiales WHERE id = v_item->>'material_id' AND empresa_id = p_empresa_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Un repuesto utilizado no existe en el catálogo.'; END IF;
    v_valor := public.ops_rm_numero(v_item->>'cantidad', 'cantidad de ' || v_mat.codigo);
    IF v_valor IS NULL OR v_valor <= 0 THEN RAISE EXCEPTION 'La cantidad de % debe ser mayor a cero.', v_mat.codigo; END IF;
    IF v_mat.id = ANY (v_vistos) THEN RAISE EXCEPTION 'No repitas % en los repuestos utilizados.', v_mat.codigo; END IF;
    v_vistos := v_vistos || v_mat.id;
    v_materiales := v_materiales || jsonb_build_array(jsonb_build_object(
      'tipo', 'repuesto', 'material_id', v_mat.id, 'item_id', v_mat.codigo, 'descripcion', v_mat.descripcion,
      'cantidad', v_valor, 'unidad', coalesce(v_item->>'unidad', v_mat.unidad),
      'costo_unitario', coalesce(public.ops_rm_numero(v_item->>'costo_unitario', 'costo'), 0)));
  END LOOP;

  -- Lubricantes (solo los que tienen cantidad)
  FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(p_reporte->'lubricantes', '[]'::jsonb)) LOOP
    v_valor := public.ops_rm_numero(v_item->>'cantidad', 'cantidad de ' || coalesce(v_item->>'tipo', 'lubricante'));
    IF v_valor IS NOT NULL AND v_valor < 0 THEN RAISE EXCEPTION 'La cantidad de lubricante no puede ser negativa.'; END IF;
    IF coalesce(v_valor, 0) > 0 THEN
      v_lubricantes := v_lubricantes || jsonb_build_array(jsonb_build_object('tipo', v_item->>'tipo', 'unidad', v_item->>'unidad', 'cantidad', v_valor));
      v_materiales := v_materiales || jsonb_build_array(jsonb_build_object(
        'tipo', 'fluido', 'descripcion', v_item->>'tipo', 'motivo', 'lubricación', 'cantidad', v_valor, 'unidad', v_item->>'unidad'));
    END IF;
  END LOOP;

  -- Pedido de repuestos
  v_vistos := '{}';
  FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(p_reporte->'pedido', '[]'::jsonb)) LOOP
    SELECT * INTO v_mat FROM public.materiales WHERE id = v_item->>'material_id' AND empresa_id = p_empresa_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Un material del pedido no existe en el catálogo.'; END IF;
    v_valor := public.ops_rm_numero(v_item->>'cantidad', 'cantidad pedida de ' || v_mat.codigo);
    IF v_valor IS NULL OR v_valor <= 0 THEN RAISE EXCEPTION 'La cantidad pedida de % debe ser mayor a cero.', v_mat.codigo; END IF;
    IF round(v_valor, 2) <> v_valor THEN RAISE EXCEPTION 'La cantidad pedida admite hasta 2 decimales.'; END IF;
    IF v_mat.id = ANY (v_vistos) THEN RAISE EXCEPTION 'No repitas % en el pedido.', v_mat.codigo; END IF;
    v_vistos := v_vistos || v_mat.id;
    v_pedido := v_pedido || jsonb_build_array(jsonb_build_object(
      'material_id', v_mat.id, 'codigo', v_mat.codigo, 'descripcion', v_mat.descripcion,
      'unidad', v_mat.unidad, 'cantidad', v_valor, 'urgente', coalesce((v_item->>'urgente')::boolean, false)));
  END LOOP;

  -- Backlog
  FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(p_reporte->'backlog', '[]'::jsonb)) LOOP
    IF nullif(btrim(coalesce(v_item->>'descripcion', '')), '') IS NULL THEN
      RAISE EXCEPTION 'Cada hallazgo del backlog necesita una descripción.';
    END IF;
    IF coalesce(v_item->>'prioridad', 'media') NOT IN ('baja', 'media', 'alta', 'critica') THEN
      RAISE EXCEPTION 'Prioridad de backlog no válida.';
    END IF;
    v_backlog := v_backlog || jsonb_build_array(jsonb_build_object(
      'descripcion', btrim(v_item->>'descripcion'), 'detalle', nullif(btrim(coalesce(v_item->>'detalle', '')), ''),
      'prioridad', coalesce(v_item->>'prioridad', 'media')));
  END LOOP;

  v_evidencias := coalesce(p_reporte->'evidencias', '[]'::jsonb);
  IF jsonb_typeof(v_evidencias) <> 'array' THEN RAISE EXCEPTION 'Las fotos del reporte no son válidas.'; END IF;

  v_datos := coalesce(v_actual.datos_mina, '{}'::jsonb) || jsonb_build_object(
    'turno', v_turno,
    'duracion_turno', c_turno,
    'supervisor_cliente', nullif(btrim(coalesce(p_reporte->>'supervisor_cliente', '')), ''),
    'horometros', v_hor,
    'horas', v_horas,
    'horas_total', v_total,
    'disponibilidad_mecanica', v_dm,
    'tipos_mantenimiento', v_tipos,
    'estado_equipo', v_estado_eq,
    'motivo_retorno', CASE WHEN v_estado_eq = 'retorno' THEN v_motivo END,
    'lubricantes', v_lubricantes,
    'pedido', v_pedido,
    'backlog', v_backlog,
    'comentarios', nullif(btrim(coalesce(p_reporte->>'comentarios', '')), ''),
    'mina_id', v_mina_id
  );

  v_estado_nuevo := CASE WHEN p_enviar THEN 'en_revision' ELSE 'borrador' END;

  IF v_existe THEN
    UPDATE public.partes_diarios SET
      fecha = v_fecha, horas_normales = v_mant, horas_extra = 0, actividad = v_actividad,
      avance_pct = v_avance, materiales = v_materiales, evidencias = v_evidencias,
      datos_mina = v_datos, estado = v_estado_nuevo, updated_at = now()
    WHERE id = v_id
    RETURNING numero INTO v_numero;
  ELSE
    PERFORM pg_advisory_xact_lock(hashtext('ops_reporte_mina_numero:' || p_empresa_id));
    SELECT coalesce(max(CASE WHEN numero ~ ('^RM-' || v_year || '-[0-9]+$') THEN split_part(numero, '-', 3)::int END), 0)
      INTO v_max FROM public.partes_diarios WHERE empresa_id = p_empresa_id;
    v_numero := 'RM-' || v_year || '-' || lpad((v_max + 1)::text, 4, '0');
    INSERT INTO public.partes_diarios (
      id, numero, empresa_id, orden_trabajo_id, tecnico_id, tecnico_nombre, fecha,
      horas_normales, horas_extra, actividad, avance_pct, materiales, evidencias,
      origen_registro, estado, datos_mina
    ) VALUES (
      v_id, v_numero, p_empresa_id, v_ot.id, v_tecnico_id, v_tecnico_nombre, v_fecha,
      v_mant, 0, v_actividad, v_avance, v_materiales, v_evidencias,
      'mina', v_estado_nuevo, v_datos
    );
  END IF;

  -- Al enviar, el pedido entra a la reserva de la OT (periférico de la mina → central → SOLPE).
  IF p_enviar AND jsonb_array_length(v_pedido) > 0 THEN
    v_resultado_pedido := public.wms_pedir_repuestos_parte(
      p_empresa_id, v_ot.id, v_id,
      (SELECT jsonb_agg(jsonb_build_object('material_id', e->>'material_id', 'cantidad', (e->>'cantidad')::numeric)) FROM jsonb_array_elements(v_pedido) e));
    UPDATE public.partes_diarios
       SET datos_mina = datos_mina || jsonb_build_object('pedido_resultado', v_resultado_pedido)
     WHERE id = v_id;
  END IF;

  RETURN jsonb_build_object('id', v_id, 'numero', v_numero, 'estado', v_estado_nuevo, 'pedido_resultado', v_resultado_pedido);
END $function$;

-- Revisión del supervisor: aprobar u observar.
CREATE OR REPLACE FUNCTION public.ops_revisar_reporte_mina(p_empresa_id text, p_parte_id text, p_accion text, p_observacion text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_alcance uuid[];
  v_pd public.partes_diarios%rowtype;
  v_ot public.ordenes_trabajo%rowtype;
  v_obs text := nullif(btrim(coalesce(p_observacion, '')), '');
  v_motor numeric;
  v_item jsonb;
  v_backlog int := 0;
  v_equipo text;
BEGIN
  PERFORM public.wms_exigir_permiso(p_empresa_id, 'partes', 'aprobar');
  IF p_accion NOT IN ('aprobar', 'observar') THEN RAISE EXCEPTION 'Acción de revisión no válida.'; END IF;
  v_alcance := public.usuario_alcance_sociedades(p_empresa_id);

  SELECT * INTO v_pd FROM public.partes_diarios
   WHERE id = p_parte_id AND empresa_id = p_empresa_id AND origen_registro = 'mina' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El reporte de mina no existe.'; END IF;
  IF v_alcance IS NOT NULL AND NOT (v_pd.sociedad_id = ANY (v_alcance)) THEN
    RAISE EXCEPTION 'No tienes alcance sobre la sociedad de este reporte.';
  END IF;
  IF v_pd.estado <> 'en_revision' THEN RAISE EXCEPTION 'Solo se revisa un reporte en revisión.'; END IF;

  IF p_accion = 'observar' THEN
    IF v_obs IS NULL THEN RAISE EXCEPTION 'Escribe la observación para el técnico.'; END IF;
    UPDATE public.partes_diarios
       SET estado = 'observado', updated_at = now(),
           datos_mina = coalesce(datos_mina, '{}'::jsonb) || jsonb_build_object('revision', jsonb_build_object(
             'accion', 'observar', 'observacion', v_obs, 'por', auth.uid(), 'at', now()))
     WHERE id = v_pd.id;
    RETURN jsonb_build_object('id', v_pd.id, 'estado', 'observado');
  END IF;

  SELECT * INTO v_ot FROM public.ordenes_trabajo WHERE id = v_pd.orden_trabajo_id FOR UPDATE;

  UPDATE public.partes_diarios
     SET estado = 'aprobado', aprobado_por = auth.uid(), aprobado_at = now(), updated_at = now(),
         datos_mina = coalesce(datos_mina, '{}'::jsonb) || jsonb_build_object('revision', jsonb_build_object(
           'accion', 'aprobar', 'observacion', v_obs, 'por', auth.uid(), 'at', now()))
   WHERE id = v_pd.id;

  -- Horómetro del equipo (el de motor final, solo si avanza)
  v_motor := public.ops_rm_numero(v_pd.datos_mina->'horometros'->'motor'->>'final', 'horómetro motor final');
  IF v_motor IS NOT NULL AND v_ot.equipo_id IS NOT NULL THEN
    UPDATE public.activos
       SET horometro_actual = v_motor, updated_at = now()
     WHERE id = v_ot.equipo_id AND empresa_id = p_empresa_id
       AND (horometro_actual IS NULL OR horometro_actual < v_motor);
  END IF;

  -- Avance de la OT (acumulado: nunca retrocede)
  IF coalesce(v_pd.avance_pct, 0) > coalesce(v_ot.avance_pct, 0) THEN
    UPDATE public.ordenes_trabajo SET avance_pct = v_pd.avance_pct WHERE id = v_ot.id;
  END IF;

  -- Backlog de campo
  SELECT nullif(concat_ws(' ', a.codigo, a.nombre), '') INTO v_equipo FROM public.activos a WHERE a.id = v_ot.equipo_id;
  FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(v_pd.datos_mina->'backlog', '[]'::jsonb)) LOOP
    INSERT INTO public.backlog (id, empresa_id, os_cliente_id, cuenta_id, descripcion, prioridad, estado)
    VALUES (
      'bkl_' || gen_random_uuid()::text, p_empresa_id, v_ot.os_cliente_id, v_ot.cuenta_id,
      concat_ws(' — ', v_item->>'descripcion', v_item->>'detalle')
        || ' (' || concat_ws(' · ', v_pd.numero, v_ot.numero, v_equipo) || ')',
      coalesce(v_item->>'prioridad', 'media'), 'pendiente');
    v_backlog := v_backlog + 1;
  END LOOP;

  RETURN jsonb_build_object('id', v_pd.id, 'estado', 'aprobado', 'horometro', v_motor, 'backlog_creados', v_backlog);
END $function$;

REVOKE ALL ON FUNCTION public.ops_rm_numero(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ops_reportes_mina_contexto(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ops_reportes_mina_listar(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ops_guardar_reporte_mina(text, jsonb, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ops_revisar_reporte_mina(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ops_rm_numero(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ops_reportes_mina_contexto(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ops_reportes_mina_listar(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ops_guardar_reporte_mina(text, jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ops_revisar_reporte_mina(text, text, text, text) TO authenticated;

DO $check$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'partes_diarios' AND column_name = 'datos_mina') THEN
    RAISE EXCEPTION 'Falta la columna partes_diarios.datos_mina';
  END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname IN ('ops_rm_numero', 'ops_reportes_mina_contexto', 'ops_reportes_mina_listar', 'ops_guardar_reporte_mina', 'ops_revisar_reporte_mina')) <> 5 THEN
    RAISE EXCEPTION 'Faltan funciones de reportes de mina';
  END IF;
  IF has_function_privilege('anon', 'public.ops_guardar_reporte_mina(text, jsonb, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon no debe ejecutar ops_guardar_reporte_mina';
  END IF;
END $check$;
