-- 638: Trazabilidad Diagnóstico Técnico ↔ Hoja de Costeo, aviso de desfase al
-- reabrir/reemitir, actualización de hojas en borrador, nueva versión para hojas
-- aprobadas o cotizadas, y firma del emisor congelada en el informe emitido.
--
-- Reglas:
--  * Una hoja está desfasada cuando el diagnóstico se reemitió después de la
--    última sincronización (o está reabierto, en edición).
--  * Hoja en borrador o en revisión y sin cotización: "Actualizar desde el
--    diagnóstico" trae lo nuevo, quita lo eliminado y actualiza horas y
--    cantidades conservando las tarifas ya valoradas. Lo agregado a mano en la
--    hoja no se toca. Si estaba en revisión, vuelve a borrador.
--  * Hoja aprobada o con cotización: nunca se modifica. Se crea una nueva
--    versión (HC-…-V2) desde el diagnóstico vigente y la anterior queda
--    marcada como reemplazada.
--  * El informe emitido guarda la referencia al adjunto de firma usado; ese
--    adjunto ya no se puede borrar ni cambiar de archivo.

BEGIN;

-- 1. Columnas de trazabilidad y versión -------------------------------------
ALTER TABLE public.hojas_costeo
  ADD COLUMN IF NOT EXISTS diagnostico_sincronizado_en timestamptz,
  ADD COLUMN IF NOT EXISTS hoja_origen_id text,
  ADD COLUMN IF NOT EXISTS reemplazada_por_id text,
  ADD COLUMN IF NOT EXISTS reemplazada_en timestamptz;

DO $fk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='hojas_costeo_hoja_origen_fkey') THEN
    ALTER TABLE public.hojas_costeo ADD CONSTRAINT hojas_costeo_hoja_origen_fkey
      FOREIGN KEY (hoja_origen_id) REFERENCES public.hojas_costeo(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='hojas_costeo_reemplazada_por_fkey') THEN
    ALTER TABLE public.hojas_costeo ADD CONSTRAINT hojas_costeo_reemplazada_por_fkey
      FOREIGN KEY (reemplazada_por_id) REFERENCES public.hojas_costeo(id) ON DELETE SET NULL
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END
$fk$;

COMMENT ON COLUMN public.hojas_costeo.diagnostico_sincronizado_en IS
  'Emisión del diagnóstico con la que la hoja quedó sincronizada por última vez.';
COMMENT ON COLUMN public.hojas_costeo.hoja_origen_id IS
  'Hoja anterior a la que esta versión reemplaza.';
COMMENT ON COLUMN public.hojas_costeo.reemplazada_por_id IS
  'Nueva versión que reemplaza a esta hoja (la hoja reemplazada no se modifica).';

-- Una sola hoja vigente por diagnóstico; las reemplazadas quedan como historial.
DROP INDEX IF EXISTS public.hojas_costeo_diagnostico_uidx;
CREATE UNIQUE INDEX hojas_costeo_diagnostico_uidx ON public.hojas_costeo (diagnostico_id)
  WHERE diagnostico_id IS NOT NULL AND reemplazada_en IS NULL;

-- 2. Última emisión del diagnóstico ------------------------------------------
CREATE OR REPLACE FUNCTION public.diagnostico_ultima_emision(p_diagnostico_id text)
RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
  SELECT coalesce(
    (SELECT max(h.ocurrido_en) FROM public.diagnostico_tecnico_estado_historial h
      WHERE h.diagnostico_id=p_diagnostico_id AND h.estado_nuevo='emitido'),
    (SELECT d.emitido_en FROM public.diagnosticos_tecnicos d WHERE d.id=p_diagnostico_id));
$fn$;
REVOKE ALL ON FUNCTION public.diagnostico_ultima_emision(text) FROM PUBLIC, anon, authenticated;

-- Hojas existentes: sincronizadas con la última emisión anterior a su creación.
UPDATE public.hojas_costeo h SET diagnostico_sincronizado_en = coalesce(
    (SELECT max(e.ocurrido_en) FROM public.diagnostico_tecnico_estado_historial e
      WHERE e.diagnostico_id=h.diagnostico_id AND e.estado_nuevo='emitido' AND e.ocurrido_en<=h.created_at),
    public.diagnostico_ultima_emision(h.diagnostico_id))
  WHERE h.diagnostico_id IS NOT NULL AND h.diagnostico_sincronizado_en IS NULL
    AND h.estado IS DISTINCT FROM 'aprobada';
-- Las aprobadas no admiten UPDATE por su trigger de bloqueo; se rellenan con el
-- trigger desactivado solo para esta columna nueva.
ALTER TABLE public.hojas_costeo DISABLE TRIGGER trg_bloquear_hoja_costeo_aprobada;
UPDATE public.hojas_costeo h SET diagnostico_sincronizado_en = coalesce(
    (SELECT max(e.ocurrido_en) FROM public.diagnostico_tecnico_estado_historial e
      WHERE e.diagnostico_id=h.diagnostico_id AND e.estado_nuevo='emitido' AND e.ocurrido_en<=h.created_at),
    public.diagnostico_ultima_emision(h.diagnostico_id))
  WHERE h.diagnostico_id IS NOT NULL AND h.diagnostico_sincronizado_en IS NULL;
ALTER TABLE public.hojas_costeo ENABLE TRIGGER trg_bloquear_hoja_costeo_aprobada;

-- 3. La hoja aprobada sigue bloqueada, salvo el vínculo de reemplazo ---------
CREATE OR REPLACE FUNCTION public.bloquear_hoja_costeo_aprobada()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare
  old_sin public.hojas_costeo%rowtype;
  new_sin public.hojas_costeo%rowtype;
begin
  if old.estado = 'aprobada' and new.estado = 'aprobada' then
    old_sin := old;
    new_sin := new;
    old_sin.cotizacion_id := null; new_sin.cotizacion_id := null;
    old_sin.reemplazada_por_id := null; new_sin.reemplazada_por_id := null;
    old_sin.reemplazada_en := null; new_sin.reemplazada_en := null;
    if old_sin is distinct from new_sin then
      raise exception 'No se puede modificar una Hoja de Costeo aprobada.';
    end if;
  end if;
  return new;
end;
$function$;

-- 4. Generar: solo mira la hoja vigente y registra la sincronización --------
DO $patch$
DECLARE
  v_def text;
  v_buscar text := 'FROM public.hojas_costeo h WHERE h.diagnostico_id=v_d.id;';
  v_sync1 text := 'UPDATE public.hojas_costeo SET diagnostico_id=v_d.id,informe_id=v_informe_id,';
BEGIN
  SELECT pg_get_functiondef('public.generar_hoja_costeo_desde_diagnostico(text,uuid)'::regprocedure) INTO v_def;
  ASSERT position(v_buscar IN v_def) > 0, 'PRECONDITION_FAILED: búsqueda de hoja existente';
  v_def := replace(v_def, v_buscar, 'FROM public.hojas_costeo h WHERE h.diagnostico_id=v_d.id AND h.reemplazada_en IS NULL;');
  ASSERT position(v_sync1 IN v_def) > 0, 'PRECONDITION_FAILED: actualización de cabecera';
  v_def := replace(v_def, v_sync1,
    'UPDATE public.hojas_costeo SET diagnostico_id=v_d.id,informe_id=v_informe_id,diagnostico_sincronizado_en=public.diagnostico_ultima_emision(v_d.id),');
  EXECUTE v_def;
END
$patch$;

-- 5. Recalcular totales de cabecera desde las líneas ------------------------
CREATE OR REPLACE FUNCTION public.hc_recalcular_totales_lineas(p_hoja_id text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE v_mo numeric; v_mat numeric; v_act numeric;
BEGIN
  SELECT coalesce(sum(subtotal),0) INTO v_mo FROM public.hoja_costeo_lineas_mano_obra WHERE hoja_costeo_id=p_hoja_id;
  SELECT coalesce(sum(subtotal),0) INTO v_mat FROM public.hoja_costeo_lineas_materiales WHERE hoja_costeo_id=p_hoja_id;
  SELECT coalesce(sum(depreciacion_asignada),0) INTO v_act FROM public.hoja_costeo_lineas_activos WHERE hoja_costeo_id=p_hoja_id;
  UPDATE public.hojas_costeo SET total_mano_obra=v_mo, total_materiales=v_mat, total_activos=v_act,
    costo_total=v_mo+v_mat+v_act+coalesce(total_servicios_terceros,0)+coalesce(total_logistica,0),
    updated_at=now()
  WHERE id=p_hoja_id;
END
$fn$;
REVOKE ALL ON FUNCTION public.hc_recalcular_totales_lineas(text) FROM PUBLIC, anon, authenticated;

-- 6. Estado de sincronización de una hoja ------------------------------------
CREATE OR REPLACE FUNCTION public.obtener_sincronizacion_hoja_costeo(p_hoja_id text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE
  v_h public.hojas_costeo%ROWTYPE; v_d public.diagnosticos_tecnicos%ROWTYPE;
  v_ultima timestamptz; v_informe_version integer; v_recepcion text; v_oportunidad text;
  v_desfasada boolean := false; v_motivo text := NULL; v_bloqueada boolean;
BEGIN
  SELECT * INTO v_h FROM public.hojas_costeo WHERE id=p_hoja_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'La Hoja de Costeo no existe.' USING ERRCODE='P0002'; END IF;
  IF auth.uid() IS NULL OR NOT public.usuario_tiene_empresa(v_h.empresa_id)
     OR NOT public.usuario_puede(v_h.empresa_id,'hoja_costeo','ver') THEN
    RAISE EXCEPTION 'No autorizado para consultar esta Hoja de Costeo.' USING ERRCODE='42501';
  END IF;
  v_bloqueada := v_h.estado='aprobada' OR v_h.cotizacion_id IS NOT NULL;
  IF v_h.diagnostico_id IS NULL THEN
    RETURN jsonb_build_object('tiene_diagnostico',false,
      'hoja_origen',(SELECT jsonb_build_object('id',o.id,'numero',o.numero) FROM public.hojas_costeo o WHERE o.id=v_h.hoja_origen_id),
      'reemplazada_por',(SELECT jsonb_build_object('id',r.id,'numero',r.numero,'estado',r.estado) FROM public.hojas_costeo r WHERE r.id=v_h.reemplazada_por_id));
  END IF;
  SELECT * INTO v_d FROM public.diagnosticos_tecnicos WHERE id=v_h.diagnostico_id;
  v_ultima := public.diagnostico_ultima_emision(v_d.id);
  SELECT i.version INTO v_informe_version FROM public.diagnostico_informes i WHERE i.id=v_h.informe_id;
  SELECT r.numero INTO v_recepcion FROM public.recepciones_activos_cliente r WHERE r.id=v_d.recepcion_id;
  SELECT o.nombre INTO v_oportunidad FROM public.oportunidades o WHERE o.id=v_d.oportunidad_id;
  IF v_h.reemplazada_en IS NULL THEN
    IF v_d.estado IS DISTINCT FROM 'emitido' THEN
      v_desfasada := true; v_motivo := 'reabierto';
    ELSIF v_ultima IS NOT NULL AND (v_h.diagnostico_sincronizado_en IS NULL OR v_ultima > v_h.diagnostico_sincronizado_en) THEN
      v_desfasada := true; v_motivo := 'reemitido';
    END IF;
  END IF;
  RETURN jsonb_build_object(
    'tiene_diagnostico',true,
    'diagnostico_id',v_d.id,'diagnostico_tipo',v_d.tipo,'diagnostico_estado',v_d.estado,
    'recepcion_id',v_d.recepcion_id,'recepcion_numero',v_recepcion,
    'oportunidad_id',v_d.oportunidad_id,'oportunidad_nombre',v_oportunidad,
    'informe_id',v_h.informe_id,'informe_version',v_informe_version,
    'ultima_emision',v_ultima,'sincronizado_en',v_h.diagnostico_sincronizado_en,
    'desfasada',v_desfasada,'motivo',v_motivo,
    'puede_actualizar',v_desfasada AND v_motivo='reemitido' AND NOT v_bloqueada
      AND v_h.estado IN ('borrador','en_revision') AND public.usuario_puede(v_h.empresa_id,'hoja_costeo','editar'),
    'puede_nueva_version',v_desfasada AND v_motivo='reemitido' AND v_bloqueada
      AND public.usuario_puede(v_h.empresa_id,'hoja_costeo','crear'),
    'hoja_origen',(SELECT jsonb_build_object('id',o.id,'numero',o.numero) FROM public.hojas_costeo o WHERE o.id=v_h.hoja_origen_id),
    'reemplazada_por',(SELECT jsonb_build_object('id',r.id,'numero',r.numero,'estado',r.estado) FROM public.hojas_costeo r WHERE r.id=v_h.reemplazada_por_id));
END
$fn$;
REVOKE ALL ON FUNCTION public.obtener_sincronizacion_hoja_costeo(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obtener_sincronizacion_hoja_costeo(text) TO authenticated;

-- 7. Hoja vigente de un diagnóstico (para la pantalla del diagnóstico) -------
CREATE OR REPLACE FUNCTION public.hoja_costeo_de_diagnostico(p_diagnostico_id text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE v_d public.diagnosticos_tecnicos%ROWTYPE; v_h public.hojas_costeo%ROWTYPE; v_ultima timestamptz;
BEGIN
  SELECT * INTO v_d FROM public.diagnosticos_tecnicos WHERE id=p_diagnostico_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF auth.uid() IS NULL OR NOT public.usuario_tiene_empresa(v_d.empresa_id)
     OR NOT (public.usuario_puede(v_d.empresa_id,'diagnostico_tecnico','ver')
             OR public.usuario_puede(v_d.empresa_id,'hoja_costeo','ver')) THEN
    RAISE EXCEPTION 'No autorizado.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_h FROM public.hojas_costeo WHERE diagnostico_id=v_d.id AND reemplazada_en IS NULL;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_ultima := public.diagnostico_ultima_emision(v_d.id);
  RETURN jsonb_build_object('id',v_h.id,'numero',v_h.numero,'estado',v_h.estado,
    'con_cotizacion',v_h.cotizacion_id IS NOT NULL,
    'desfasada',v_d.estado='emitido' AND v_ultima IS NOT NULL
      AND (v_h.diagnostico_sincronizado_en IS NULL OR v_ultima > v_h.diagnostico_sincronizado_en));
END
$fn$;
REVOKE ALL ON FUNCTION public.hoja_costeo_de_diagnostico(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hoja_costeo_de_diagnostico(text) TO authenticated;

-- 8. Actualizar una hoja en borrador desde el diagnóstico reemitido ----------
CREATE OR REPLACE FUNCTION public.actualizar_hoja_costeo_desde_diagnostico(p_hoja_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE
  v_h public.hojas_costeo%ROWTYPE; v_d public.diagnosticos_tecnicos%ROWTYPE;
  v_informe_id uuid; v_n integer;
  v_agregadas integer := 0; v_actualizadas integer := 0; v_eliminadas integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Se requiere una sesión autenticada.' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_h FROM public.hojas_costeo WHERE id=p_hoja_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La Hoja de Costeo no existe.' USING ERRCODE='P0002'; END IF;
  IF NOT public.usuario_tiene_empresa(v_h.empresa_id)
     OR NOT public.usuario_puede(v_h.empresa_id,'hoja_costeo','editar') THEN
    RAISE EXCEPTION 'No autorizado para editar esta Hoja de Costeo.' USING ERRCODE='42501';
  END IF;
  IF v_h.sociedad_id IS NOT NULL AND public.usuario_alcance_sociedades(v_h.empresa_id) IS NOT NULL
     AND NOT v_h.sociedad_id=ANY(public.usuario_alcance_sociedades(v_h.empresa_id)) THEN
    RAISE EXCEPTION 'No tiene acceso a la sociedad de esta hoja.' USING ERRCODE='42501';
  END IF;
  IF v_h.reemplazada_en IS NOT NULL THEN
    RAISE EXCEPTION 'Esta hoja fue reemplazada por una versión nueva.' USING ERRCODE='22023';
  END IF;
  IF v_h.estado NOT IN ('borrador','en_revision') OR v_h.cotizacion_id IS NOT NULL THEN
    RAISE EXCEPTION 'Solo se actualiza una hoja en borrador o en revisión y sin cotización. Crea una nueva versión.' USING ERRCODE='22023';
  END IF;
  IF v_h.diagnostico_id IS NULL THEN
    RAISE EXCEPTION 'La hoja no proviene de un Diagnóstico Técnico.' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('hoja-costeo-diagnostico:'||v_h.diagnostico_id,0));
  SELECT * INTO v_d FROM public.diagnosticos_tecnicos WHERE id=v_h.diagnostico_id FOR SHARE;
  IF v_d.estado IS DISTINCT FROM 'emitido' THEN
    RAISE EXCEPTION 'El diagnóstico está reabierto. Espera a que se vuelva a emitir.' USING ERRCODE='22023';
  END IF;

  -- Materiales del diagnóstico que ya no existen (o cuya línea se quitó).
  DELETE FROM public.hoja_costeo_lineas_materiales m
   WHERE m.hoja_costeo_id=v_h.id AND m.diagnostico_material_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.diagnostico_tecnico_linea_materiales dm
        JOIN public.diagnostico_tecnico_lineas l ON l.id=dm.linea_id
        WHERE dm.id=m.diagnostico_material_id AND l.diagnostico_id=v_d.id);
  GET DIAGNOSTICS v_n=ROW_COUNT; v_eliminadas := v_eliminadas+v_n;
  -- Máquina: la línea ya no existe o el diagnóstico ya no usa equipo.
  DELETE FROM public.hoja_costeo_lineas_activos a
   WHERE a.hoja_costeo_id=v_h.id AND a.diagnostico_linea_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.diagnostico_tecnico_lineas l
        WHERE l.id=a.diagnostico_linea_id AND l.diagnostico_id=v_d.id
          AND l.activo_id IS NOT NULL AND l.horas_maquina>0);
  GET DIAGNOSTICS v_n=ROW_COUNT; v_eliminadas := v_eliminadas+v_n;
  -- Mano de obra de líneas eliminadas en el diagnóstico (y lo que cuelga de ellas).
  DELETE FROM public.hoja_costeo_lineas_materiales m
   WHERE m.hoja_costeo_id=v_h.id AND m.linea_mano_obra_id IN (
     SELECT mo.id FROM public.hoja_costeo_lineas_mano_obra mo
      WHERE mo.hoja_costeo_id=v_h.id AND mo.diagnostico_linea_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.diagnostico_tecnico_lineas l WHERE l.id=mo.diagnostico_linea_id AND l.diagnostico_id=v_d.id));
  DELETE FROM public.hoja_costeo_lineas_activos a
   WHERE a.hoja_costeo_id=v_h.id AND a.linea_mano_obra_id IN (
     SELECT mo.id FROM public.hoja_costeo_lineas_mano_obra mo
      WHERE mo.hoja_costeo_id=v_h.id AND mo.diagnostico_linea_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM public.diagnostico_tecnico_lineas l WHERE l.id=mo.diagnostico_linea_id AND l.diagnostico_id=v_d.id));
  DELETE FROM public.hoja_costeo_lineas_mano_obra mo
   WHERE mo.hoja_costeo_id=v_h.id AND mo.diagnostico_linea_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.diagnostico_tecnico_lineas l WHERE l.id=mo.diagnostico_linea_id AND l.diagnostico_id=v_d.id);
  GET DIAGNOSTICS v_n=ROW_COUNT; v_eliminadas := v_eliminadas+v_n;

  -- Horas y cantidades cambiadas: se actualizan con la tarifa ya valorada.
  UPDATE public.hoja_costeo_lineas_mano_obra mo
     SET horas=l.horas_mano_obra,
         subtotal=CASE WHEN mo.pendiente_valoracion THEN mo.subtotal ELSE round(l.horas_mano_obra*coalesce(mo.costo_hora_snapshot,0),2) END
    FROM public.diagnostico_tecnico_lineas l
   WHERE mo.hoja_costeo_id=v_h.id AND l.id=mo.diagnostico_linea_id
     AND mo.horas IS DISTINCT FROM l.horas_mano_obra;
  GET DIAGNOSTICS v_n=ROW_COUNT; v_actualizadas := v_actualizadas+v_n;
  UPDATE public.hoja_costeo_lineas_activos a
     SET horas_uso_estimadas=l.horas_maquina,
         depreciacion_asignada=CASE WHEN a.pendiente_valoracion OR a.costo_hora_equipo IS NULL THEN a.depreciacion_asignada
                                    ELSE round(l.horas_maquina*a.costo_hora_equipo,2) END
    FROM public.diagnostico_tecnico_lineas l
   WHERE a.hoja_costeo_id=v_h.id AND l.id=a.diagnostico_linea_id
     AND a.horas_uso_estimadas IS DISTINCT FROM l.horas_maquina;
  GET DIAGNOSTICS v_n=ROW_COUNT; v_actualizadas := v_actualizadas+v_n;
  UPDATE public.hoja_costeo_lineas_materiales m
     SET cantidad=dm.cantidad,
         subtotal=CASE WHEN m.pendiente_valoracion THEN m.subtotal ELSE round(dm.cantidad*coalesce(m.costo_unitario_snapshot,0),2) END
    FROM public.diagnostico_tecnico_linea_materiales dm
   WHERE m.hoja_costeo_id=v_h.id AND dm.id=m.diagnostico_material_id
     AND m.cantidad IS DISTINCT FROM dm.cantidad;
  GET DIAGNOSTICS v_n=ROW_COUNT; v_actualizadas := v_actualizadas+v_n;

  -- Líneas nuevas del diagnóstico: entran pendientes de valoración (el wizard las valora).
  INSERT INTO public.hoja_costeo_lineas_mano_obra
    (hoja_costeo_id,familia_trabajo_id,actividad_id,cargo_id,horas,metodo_usado,
     costo_hora_snapshot,subtotal,orden,pendiente_valoracion,tarea_id,diagnostico_linea_id)
  SELECT v_h.id,l.familia_trabajo_id,CASE WHEN l.tarea_id IS NULL THEN l.actividad_id ELSE NULL END,
    l.cargo_id,l.horas_mano_obra,'manual',0,0,l.orden,true,l.tarea_id,l.id
  FROM public.diagnostico_tecnico_lineas l
  WHERE l.diagnostico_id=v_d.id AND l.empresa_id=v_d.empresa_id
    AND NOT EXISTS (SELECT 1 FROM public.hoja_costeo_lineas_mano_obra mo
                    WHERE mo.hoja_costeo_id=v_h.id AND mo.diagnostico_linea_id=l.id)
  ORDER BY l.orden,l.id;
  GET DIAGNOSTICS v_n=ROW_COUNT; v_agregadas := v_agregadas+v_n;
  INSERT INTO public.hoja_costeo_lineas_activos
    (hoja_costeo_id,activo_id,horas_uso_estimadas,depreciacion_asignada,fue_manual,
     orden,pendiente_valoracion,tarea_id,diagnostico_linea_id,costo_hora_equipo)
  SELECT v_h.id,l.activo_id,l.horas_maquina,0,false,l.orden,true,l.tarea_id,l.id,NULL
  FROM public.diagnostico_tecnico_lineas l
  WHERE l.diagnostico_id=v_d.id AND l.empresa_id=v_d.empresa_id
    AND l.activo_id IS NOT NULL AND l.horas_maquina>0
    AND NOT EXISTS (SELECT 1 FROM public.hoja_costeo_lineas_activos a
                    WHERE a.hoja_costeo_id=v_h.id AND a.diagnostico_linea_id=l.id)
  ORDER BY l.orden,l.id;
  GET DIAGNOSTICS v_n=ROW_COUNT; v_agregadas := v_agregadas+v_n;
  INSERT INTO public.hoja_costeo_lineas_materiales
    (hoja_costeo_id,material_id,descripcion,unidad,cantidad,costo_unitario_snapshot,
     subtotal,fue_manual,orden,pendiente_valoracion,tarea_id,diagnostico_linea_id,diagnostico_material_id)
  SELECT v_h.id,m.material_id,
    coalesce(nullif(btrim(m.descripcion),''),nullif(btrim(mat.descripcion),'')),
    m.unidad,m.cantidad,0,0,false,m.orden,true,l.tarea_id,l.id,m.id
  FROM public.diagnostico_tecnico_linea_materiales m
  JOIN public.diagnostico_tecnico_lineas l ON l.id=m.linea_id AND l.empresa_id=m.empresa_id
  LEFT JOIN public.materiales mat ON mat.id=m.material_id AND mat.empresa_id=m.empresa_id
  WHERE l.diagnostico_id=v_d.id AND l.empresa_id=v_d.empresa_id
    AND NOT EXISTS (SELECT 1 FROM public.hoja_costeo_lineas_materiales x
                    WHERE x.hoja_costeo_id=v_h.id AND x.diagnostico_material_id=m.id)
  ORDER BY l.orden,l.id,m.orden,m.id;
  GET DIAGNOSTICS v_n=ROW_COUNT; v_agregadas := v_agregadas+v_n;

  SELECT i.id INTO v_informe_id FROM public.diagnostico_informes i
    WHERE i.empresa_id=v_d.empresa_id AND i.diagnostico_id=v_d.id AND i.estado='emitido'
    ORDER BY i.version DESC,i.emitido_en DESC,i.id DESC LIMIT 1;
  UPDATE public.hojas_costeo SET
      diagnostico_sincronizado_en=public.diagnostico_ultima_emision(v_d.id),
      informe_id=coalesce(v_informe_id,informe_id),
      estado=CASE WHEN estado='en_revision' THEN 'borrador' ELSE estado END
    WHERE id=v_h.id;
  PERFORM public.hc_recalcular_totales_lineas(v_h.id);

  RETURN jsonb_build_object('hoja_costeo_id',v_h.id,'agregadas',v_agregadas,
    'actualizadas',v_actualizadas,'eliminadas',v_eliminadas,
    'volvio_a_borrador',v_h.estado='en_revision');
END
$fn$;
REVOKE ALL ON FUNCTION public.actualizar_hoja_costeo_desde_diagnostico(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.actualizar_hoja_costeo_desde_diagnostico(text) TO authenticated;

-- 9. Nueva versión para una hoja aprobada o cotizada -------------------------
CREATE OR REPLACE FUNCTION public.crear_nueva_version_hoja_costeo(p_hoja_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE
  v_h public.hojas_costeo%ROWTYPE; v_d public.diagnosticos_tecnicos%ROWTYPE;
  v_res jsonb; v_nueva_id text; v_version integer; v_base text; v_numero text; v_ultima timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Se requiere una sesión autenticada.' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_h FROM public.hojas_costeo WHERE id=p_hoja_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La Hoja de Costeo no existe.' USING ERRCODE='P0002'; END IF;
  IF NOT public.usuario_tiene_empresa(v_h.empresa_id)
     OR NOT public.usuario_puede(v_h.empresa_id,'hoja_costeo','crear') THEN
    RAISE EXCEPTION 'No autorizado para crear una Hoja de Costeo en esta empresa.' USING ERRCODE='42501';
  END IF;
  IF v_h.reemplazada_en IS NOT NULL THEN
    RAISE EXCEPTION 'Esta hoja ya fue reemplazada por otra versión.' USING ERRCODE='22023';
  END IF;
  IF NOT (v_h.estado='aprobada' OR v_h.cotizacion_id IS NOT NULL) THEN
    RAISE EXCEPTION 'La hoja aún se puede editar: usa "Actualizar desde el diagnóstico".' USING ERRCODE='22023';
  END IF;
  IF v_h.diagnostico_id IS NULL THEN
    RAISE EXCEPTION 'La hoja no proviene de un Diagnóstico Técnico.' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_d FROM public.diagnosticos_tecnicos WHERE id=v_h.diagnostico_id;
  IF v_d.estado IS DISTINCT FROM 'emitido' THEN
    RAISE EXCEPTION 'El diagnóstico está reabierto. Espera a que se vuelva a emitir.' USING ERRCODE='22023';
  END IF;
  v_ultima := public.diagnostico_ultima_emision(v_d.id);
  IF v_h.diagnostico_sincronizado_en IS NOT NULL AND (v_ultima IS NULL OR v_ultima <= v_h.diagnostico_sincronizado_en) THEN
    RAISE EXCEPTION 'El diagnóstico no cambió desde que se creó esta hoja.' USING ERRCODE='22023';
  END IF;

  -- La hoja actual deja de ser la vigente (el vínculo se completa al final).
  UPDATE public.hojas_costeo SET reemplazada_en=now() WHERE id=v_h.id;
  v_res := public.generar_hoja_costeo_desde_diagnostico(v_d.id, v_h.sociedad_id);
  v_nueva_id := v_res->>'hoja_costeo_id';
  IF v_nueva_id IS NULL OR v_nueva_id=v_h.id THEN
    RAISE EXCEPTION 'No se pudo crear la nueva versión de la hoja.' USING ERRCODE='23505';
  END IF;

  v_version := coalesce(v_h.version,1)+1;
  v_base := regexp_replace(v_h.numero,'-V[0-9]+$','');
  v_numero := v_base||'-V'||v_version;
  IF EXISTS (SELECT 1 FROM public.hojas_costeo WHERE empresa_id=v_h.empresa_id AND numero=v_numero) THEN
    v_numero := v_res->>'numero';
  END IF;
  -- Se conservan los parámetros comerciales y los costos que no vienen del diagnóstico.
  UPDATE public.hojas_costeo n SET
      numero=v_numero, version=v_version, hoja_origen_id=v_h.id,
      margen_objetivo_pct=v_h.margen_objetivo_pct,
      gasto_administrativo_manual_pct=v_h.gasto_administrativo_manual_pct,
      servicios_terceros=coalesce(v_h.servicios_terceros,'[]'::jsonb),
      logistica=coalesce(v_h.logistica,'[]'::jsonb),
      total_servicios_terceros=coalesce(v_h.total_servicios_terceros,0),
      total_logistica=coalesce(v_h.total_logistica,0),
      responsable_costeo=v_h.responsable_costeo,
      moneda=coalesce(v_h.moneda,n.moneda),
      linea_negocio=coalesce(v_h.linea_negocio,n.linea_negocio),
      notas='Nueva versión de '||v_h.numero||' por cambios en el Diagnóstico Técnico.'
    WHERE n.id=v_nueva_id;
  PERFORM public.hc_recalcular_totales_lineas(v_nueva_id);
  UPDATE public.hojas_costeo SET reemplazada_por_id=v_nueva_id WHERE id=v_h.id;

  RETURN jsonb_build_object('hoja_costeo_id',v_nueva_id,'numero',v_numero,
    'version',v_version,'hoja_anterior_id',v_h.id);
END
$fn$;
REVOKE ALL ON FUNCTION public.crear_nueva_version_hoja_costeo(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crear_nueva_version_hoja_costeo(text) TO authenticated;

-- 10. Firma del emisor congelada en el informe ------------------------------
DO $patch$
DECLARE
  v_def text;
  v_firma_old text := 'emitir_informe_diagnostico(p_id uuid, p_emisor_nombre text DEFAULT NULL::text, p_emisor_cargo text DEFAULT NULL::text)';
  v_decl_old text := 'v_nombre text; v_cargo text;';
  v_check text := 'IF v_nombre IS NULL THEN RAISE EXCEPTION ''El nombre del emisor es obligatorio.'' USING ERRCODE=''22023''; END IF;';
  v_emisor_old text := '''emisor'',jsonb_build_object(''nombre'',v_nombre,''cargo'',v_cargo));';
BEGIN
  SELECT pg_get_functiondef('public.emitir_informe_diagnostico(uuid,text,text)'::regprocedure) INTO v_def;
  ASSERT position(v_firma_old IN v_def) > 0, 'PRECONDITION_FAILED: firma de la función';
  ASSERT position(v_decl_old IN v_def) > 0, 'PRECONDITION_FAILED: declaraciones';
  ASSERT position(v_check IN v_def) > 0, 'PRECONDITION_FAILED: validación del emisor';
  ASSERT position(v_emisor_old IN v_def) > 0, 'PRECONDITION_FAILED: emisor del snapshot';
  v_def := replace(v_def, v_firma_old,
    'emitir_informe_diagnostico(p_id uuid, p_emisor_nombre text DEFAULT NULL::text, p_emisor_cargo text DEFAULT NULL::text, p_firma_adjunto_id uuid DEFAULT NULL::uuid)');
  v_def := replace(v_def, v_decl_old, v_decl_old||' v_firma public.adjuntos%ROWTYPE;');
  v_def := replace(v_def, v_check, v_check||E'\n'||
    '  IF p_firma_adjunto_id IS NOT NULL THEN'||E'\n'||
    '    SELECT a.* INTO v_firma FROM public.adjuntos a'||E'\n'||
    '      WHERE a.id=p_firma_adjunto_id AND a.empresa_id=v_i.empresa_id AND a.categoria=''firma_rubrica'''||E'\n'||
    '        AND a.entidad_tipo IN (''personal_administrativo'',''personal_operativo'');'||E'\n'||
    '    IF NOT FOUND THEN RAISE EXCEPTION ''La firma seleccionada no es válida para esta empresa.'' USING ERRCODE=''22023''; END IF;'||E'\n'||
    '  END IF;');
  v_def := replace(v_def, v_emisor_old,
    '''emisor'',jsonb_build_object(''nombre'',v_nombre,''cargo'',v_cargo)'||
    ' || CASE WHEN v_firma.id IS NULL THEN ''{}''::jsonb ELSE jsonb_build_object('||
    '''firma_adjunto_id'',v_firma.id,''firma_bucket'',v_firma.bucket,''firma_storage_path'',v_firma.storage_path,'||
    '''persona_id'',v_firma.entidad_id,''persona_tipo'',v_firma.entidad_tipo) END);');
  EXECUTE v_def;
END
$patch$;
DROP FUNCTION public.emitir_informe_diagnostico(uuid,text,text);
REVOKE ALL ON FUNCTION public.emitir_informe_diagnostico(uuid,text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.emitir_informe_diagnostico(uuid,text,text,uuid) TO authenticated;

-- La firma usada en un informe emitido no se puede borrar ni cambiar de archivo.
CREATE OR REPLACE FUNCTION public.proteger_firma_usada_en_informe()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
BEGIN
  IF OLD.categoria='firma_rubrica'
     AND (TG_OP='DELETE' OR NEW.bucket IS DISTINCT FROM OLD.bucket OR NEW.storage_path IS DISTINCT FROM OLD.storage_path)
     AND EXISTS (SELECT 1 FROM public.diagnostico_informes i
                 WHERE i.estado='emitido' AND i.snapshot->'emisor'->>'firma_adjunto_id'=OLD.id::text) THEN
    RAISE EXCEPTION 'Esta firma está en un informe de diagnóstico emitido y no se puede eliminar. Sube una firma nueva en su lugar.'
      USING ERRCODE='42501';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END
$fn$;
DROP TRIGGER IF EXISTS trg_proteger_firma_usada_en_informe ON public.adjuntos;
CREATE TRIGGER trg_proteger_firma_usada_en_informe
  BEFORE DELETE OR UPDATE OF bucket, storage_path ON public.adjuntos
  FOR EACH ROW EXECUTE FUNCTION public.proteger_firma_usada_en_informe();

-- 11. Verificación -----------------------------------------------------------
DO $verify$
BEGIN
  ASSERT to_regprocedure('public.emitir_informe_diagnostico(uuid,text,text,uuid)') IS NOT NULL, 'VERIFY_FAILED: emitir informe';
  ASSERT to_regprocedure('public.emitir_informe_diagnostico(uuid,text,text)') IS NULL, 'VERIFY_FAILED: firma antigua sigue';
  ASSERT position('reemplazada_en IS NULL' IN pg_get_functiondef('public.generar_hoja_costeo_desde_diagnostico(text,uuid)'::regprocedure)) > 0,
    'VERIFY_FAILED: generar no filtra la hoja vigente';
  ASSERT position('firma_adjunto_id' IN pg_get_functiondef('public.emitir_informe_diagnostico(uuid,text,text,uuid)'::regprocedure)) > 0,
    'VERIFY_FAILED: emisor sin firma congelada';
END
$verify$;

COMMIT;
