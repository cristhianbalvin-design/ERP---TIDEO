-- Reportes de mina: al reenviar un reporte observado, el pedido procesa solo las líneas nuevas.
-- Las líneas ya enviadas a la reserva se conservan tal cual (cantidad incluida) aunque el formulario
-- las quite o cambie. Parte de la versión vigente de ops_guardar_reporte_mina (pg_get_functiondef).
DO $m$
DECLARE
  v_def text := pg_get_functiondef('public.ops_guardar_reporte_mina(text,jsonb,boolean)'::regprocedure);
  v_viejo_decl text := E'  v_max int;\n';
  v_viejo_pedido text := E'  IF p_enviar AND jsonb_array_length(v_pedido) > 0 THEN\n    v_resultado_pedido := public.wms_pedir_repuestos_parte(\n      p_empresa_id, v_ot.id, v_id,\n      (SELECT jsonb_agg(jsonb_build_object(''material_id'', e->>''material_id'', ''cantidad'', (e->>''cantidad'')::numeric)) FROM jsonb_array_elements(v_pedido) e));\n    UPDATE public.partes_diarios\n       SET datos_mina = datos_mina || jsonb_build_object(''pedido_resultado'', v_resultado_pedido)\n     WHERE id = v_id;\n  END IF;\n';
  v_viejo_evid text := E'  v_evidencias := coalesce(p_reporte->''evidencias'', ''[]''::jsonb);\n';
BEGIN
  IF position('v_nuevas' IN v_def) > 0 THEN
    RETURN; -- ya aplicada
  END IF;
  IF position(v_viejo_decl IN v_def) = 0 OR position(v_viejo_pedido IN v_def) = 0 OR position(v_viejo_evid IN v_def) = 0 THEN
    RAISE EXCEPTION 'ops_guardar_reporte_mina no coincide con la versión esperada; revisar antes de aplicar';
  END IF;

  v_def := replace(v_def, v_viejo_decl, v_viejo_decl || E'  v_nuevas jsonb;\n  v_previo jsonb;\n');

  -- Las líneas ya procesadas mandan: se quitan del formulario y se reponen desde lo guardado.
  v_def := replace(v_def, v_viejo_evid, E'  IF v_existe THEN\n'
    || E'    v_pedido := coalesce((SELECT jsonb_agg(q) FROM jsonb_array_elements(v_pedido) q\n'
    || E'                           WHERE NOT EXISTS (SELECT 1 FROM public.ot_segmento_repuestos l\n'
    || E'                                              WHERE l.parte_diario_id = v_id AND l.material_id = q->>''material_id'')), ''[]''::jsonb)\n'
    || E'             || coalesce((SELECT jsonb_agg(p) FROM jsonb_array_elements(coalesce(v_actual.datos_mina->''pedido'', ''[]''::jsonb)) p\n'
    || E'                           WHERE EXISTS (SELECT 1 FROM public.ot_segmento_repuestos l\n'
    || E'                                          WHERE l.parte_diario_id = v_id AND l.material_id = p->>''material_id'')), ''[]''::jsonb);\n'
    || E'  END IF;\n\n' || v_viejo_evid);

  v_def := replace(v_def, v_viejo_pedido,
       E'  IF p_enviar AND jsonb_array_length(v_pedido) > 0 THEN\n'
    || E'    SELECT jsonb_agg(jsonb_build_object(''material_id'', e->>''material_id'', ''cantidad'', (e->>''cantidad'')::numeric))\n'
    || E'      INTO v_nuevas\n'
    || E'      FROM jsonb_array_elements(v_pedido) e\n'
    || E'     WHERE NOT EXISTS (SELECT 1 FROM public.ot_segmento_repuestos l\n'
    || E'                        WHERE l.parte_diario_id = v_id AND l.material_id = e->>''material_id'');\n'
    || E'    IF v_nuevas IS NOT NULL THEN\n'
    || E'      IF EXISTS (SELECT 1 FROM public.ot_segmento_repuestos l WHERE l.parte_diario_id = v_id) THEN\n'
    || E'        -- Reenvío: wms_pedir_repuestos_parte es idempotente por parte, así que las líneas nuevas\n'
    || E'        -- se piden sin parte y luego se vinculan a este reporte.\n'
    || E'        v_previo := coalesce(v_datos->''pedido_resultado''->''lineas'', ''[]''::jsonb);\n'
    || E'        v_resultado_pedido := public.wms_pedir_repuestos_parte(p_empresa_id, v_ot.id, NULL, v_nuevas);\n'
    || E'        UPDATE public.ot_segmento_repuestos SET parte_diario_id = v_id\n'
    || E'         WHERE id::text IN (SELECT x->>''linea_id'' FROM jsonb_array_elements(v_resultado_pedido->''lineas'') x);\n'
    || E'        v_resultado_pedido := v_resultado_pedido\n'
    || E'          || jsonb_build_object(''parte_id'', v_id, ''lineas'', v_previo || coalesce(v_resultado_pedido->''lineas'', ''[]''::jsonb));\n'
    || E'      ELSE\n'
    || E'        v_resultado_pedido := public.wms_pedir_repuestos_parte(p_empresa_id, v_ot.id, v_id, v_nuevas);\n'
    || E'      END IF;\n'
    || E'      UPDATE public.partes_diarios\n'
    || E'         SET datos_mina = datos_mina || jsonb_build_object(''pedido_resultado'', v_resultado_pedido)\n'
    || E'       WHERE id = v_id;\n'
    || E'    END IF;\n'
    || E'  END IF;\n');

  EXECUTE v_def;

  IF position('v_nuevas' IN pg_get_functiondef('public.ops_guardar_reporte_mina(text,jsonb,boolean)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'No se aplicó el reenvío de pedido en ops_guardar_reporte_mina';
  END IF;
END $m$;
