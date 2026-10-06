-- Mutaciones 594 aisladas: cada ruptura debe ser observable; ROLLBACK restaura todo.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TEMP TABLE _594_mut_ctx(
 empresa_id text,oportunidad_id text,editor_id uuid,aprobador_id uuid,familia_id uuid,tarea_id text,
 id_directo text,id_emitir text,id_guardian text,linea_id uuid,material_id uuid,historial_id uuid
);
CREATE TEMP TABLE _594_mut_results(prueba text PRIMARY KEY,ok boolean NOT NULL,detalle text NOT NULL);
COMMENT ON TABLE _594_mut_results IS 'ok=true significa que la ruptura deliberada fue observable.';
GRANT SELECT ON _594_mut_ctx TO authenticated;
GRANT SELECT,INSERT ON _594_mut_results TO authenticated;

DO $fixtures$
DECLARE c record; v_base text:='t594m_'||replace(gen_random_uuid()::text,'-',''); v_line uuid; v_material uuid;
BEGIN
 WITH miembros AS (
  SELECT ue.empresa_id,ue.user_id,(r.es_admin_empresa OR r.es_superadmin) admin,
   coalesce(bool_or(pr.puede_editar),false) editar,coalesce(bool_or(pr.puede_aprobar),false) aprobar
  FROM public.usuarios_empresas ue JOIN public.roles r ON r.id=ue.rol_id
  LEFT JOIN public.permisos_roles pr ON pr.rol_id=r.id AND pr.pantalla='diagnostico_tecnico'
  WHERE ue.estado='activo' GROUP BY ue.empresa_id,ue.user_id,r.es_admin_empresa,r.es_superadmin
 ), candidatos AS (
  SELECT e.id empresa_id,o.id oportunidad_id,
   (SELECT m.user_id FROM miembros m WHERE m.empresa_id=e.id AND (m.editar OR m.admin) AND NOT(m.aprobar OR m.admin) ORDER BY m.user_id LIMIT 1) editor_id,
   (SELECT m.user_id FROM miembros m WHERE m.empresa_id=e.id AND (m.aprobar OR m.admin) ORDER BY m.user_id LIMIT 1) aprobador_id,
   (SELECT f.id FROM public.familia_trabajo f WHERE f.empresa_id=e.id ORDER BY f.id LIMIT 1) familia_id,
   (SELECT t.id FROM public.tipos_servicio_interno t WHERE t.empresa_id=e.id ORDER BY t.id LIMIT 1) tarea_id
  FROM public.empresas e JOIN public.oportunidades o ON o.empresa_id=e.id
 ) SELECT * INTO c FROM candidatos WHERE editor_id IS NOT NULL AND aprobador_id IS NOT NULL ORDER BY empresa_id,oportunidad_id LIMIT 1;
 IF NOT FOUND THEN
  INSERT INTO _594_mut_results VALUES
   ('fixtures_base',false,'SKIPPED: falta tenant con oportunidad, editor sin aprobar y aprobador'); RETURN;
 END IF;
 INSERT INTO _594_mut_ctx(empresa_id,oportunidad_id,editor_id,aprobador_id,familia_id,tarea_id,id_directo,id_emitir,id_guardian)
 VALUES(c.empresa_id,c.oportunidad_id,c.editor_id,c.aprobador_id,c.familia_id,c.tarea_id,v_base||'_directo',v_base||'_emitir',v_base||'_guardian');
 PERFORM set_config('request.jwt.claim.sub',c.editor_id::text,true);
 INSERT INTO public.diagnosticos_tecnicos(id,empresa_id,tipo,oportunidad_id,estado,elaborado_por)
 VALUES(v_base||'_directo',c.empresa_id,'fabricacion',c.oportunidad_id,'borrador',c.editor_id),
       (v_base||'_emitir',c.empresa_id,'fabricacion',c.oportunidad_id,'borrador',c.editor_id),
       (v_base||'_guardian',c.empresa_id,'fabricacion',c.oportunidad_id,'borrador',c.editor_id);
 IF c.familia_id IS NOT NULL AND c.tarea_id IS NOT NULL THEN
  INSERT INTO public.diagnostico_tecnico_lineas(empresa_id,diagnostico_id,familia_trabajo_id,tarea_id,hallazgo)
  VALUES(c.empresa_id,v_base||'_emitir',c.familia_id,c.tarea_id,'fixture 594') RETURNING id INTO v_line;
  INSERT INTO public.diagnostico_tecnico_linea_materiales(empresa_id,linea_id,descripcion,cantidad,unidad)
  VALUES(c.empresa_id,v_line,'fixture material 594',1,'und') RETURNING id INTO v_material;
 END IF;
 PERFORM set_config('request.jwt.claim.sub',c.aprobador_id::text,true);
 PERFORM * FROM public.emitir_diagnostico_tecnico(v_base||'_emitir');
 UPDATE _594_mut_ctx SET linea_id=v_line,material_id=v_material,
   historial_id=(SELECT id FROM public.diagnostico_tecnico_estado_historial WHERE diagnostico_id=v_base||'_emitir' LIMIT 1);
END $fixtures$;

DO $mutations$
DECLARE c record; v_rows integer; v_ok boolean; v_state text; v_msg text; v_emitido text;
BEGIN
 SELECT * INTO c FROM _594_mut_ctx LIMIT 1;
 IF c.empresa_id IS NULL THEN RETURN; END IF;
 IF c.linea_id IS NULL THEN
  INSERT INTO _594_mut_results VALUES('sin_trigger_lineas',false,'SKIPPED: no existe familia/tarea propia para crear linea de prueba');
  INSERT INTO _594_mut_results VALUES('sin_trigger_materiales',false,'SKIPPED: depende de linea/material de prueba');
 ELSE
  -- Se retiran ambos triggers por objeto: 594 refuerza con FOR SHARE un bloqueo que fase2 ya hacía.
  DROP TRIGGER a_594_bloquear_linea_diagnostico_emitido ON public.diagnostico_tecnico_lineas;
  DROP TRIGGER trg_bloquear_diagnostico_tecnico_linea_emitido ON public.diagnostico_tecnico_lineas;
  v_rows:=0; v_state:=NULL; v_msg:=NULL;
  BEGIN
   UPDATE public.diagnostico_tecnico_lineas SET orden=orden+1 WHERE id=c.linea_id;
   GET DIAGNOSTICS v_rows=ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN v_state:=SQLSTATE; v_msg:=SQLERRM;
  END;
  -- ok=true significa que la ruptura fue observable: la línea emitida cambió.
  INSERT INTO _594_mut_results VALUES('sin_trigger_lineas',v_rows=1,format('ok=true significa ruptura observable; lineas modificadas=%s; error=%s: %s; esperado=1',v_rows,coalesce(v_state,'ninguno'),coalesce(v_msg,'ninguno')));
  -- Se retiran ambos triggers por objeto: 594 refuerza con FOR SHARE un bloqueo que fase2 ya hacía.
  DROP TRIGGER a_594_bloquear_material_diagnostico_emitido ON public.diagnostico_tecnico_linea_materiales;
  DROP TRIGGER trg_bloquear_diagnostico_tecnico_material_emitido ON public.diagnostico_tecnico_linea_materiales;
  v_rows:=0; v_state:=NULL; v_msg:=NULL;
  BEGIN
   UPDATE public.diagnostico_tecnico_linea_materiales SET cantidad=cantidad+1 WHERE id=c.material_id;
   GET DIAGNOSTICS v_rows=ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN v_state:=SQLSTATE; v_msg:=SQLERRM;
  END;
  -- ok=true significa que la ruptura fue observable: el material emitido cambió.
  INSERT INTO _594_mut_results VALUES('sin_trigger_materiales',v_rows=1,format('ok=true significa ruptura observable; materiales modificados=%s; error=%s: %s; esperado=1',v_rows,coalesce(v_state,'ninguno'),coalesce(v_msg,'ninguno')));
 END IF;
 IF c.historial_id IS NULL THEN
  INSERT INTO _594_mut_results VALUES('sin_inmutabilidad_historial',false,'SKIPPED: la emision fixture no produjo historial');
 ELSE
  DROP TRIGGER diagnostico_tecnico_estado_historial_inmutable ON public.diagnostico_tecnico_estado_historial;
  v_rows:=0; v_state:=NULL; v_msg:=NULL;
  BEGIN
   UPDATE public.diagnostico_tecnico_estado_historial SET ocurrido_en=ocurrido_en+interval '1 second' WHERE id=c.historial_id;
   GET DIAGNOSTICS v_rows=ROW_COUNT;
  EXCEPTION WHEN OTHERS THEN v_state:=SQLSTATE; v_msg:=SQLERRM;
  END;
  -- ok=true significa que la ruptura fue observable: la fila histórica cambió.
  INSERT INTO _594_mut_results VALUES('sin_inmutabilidad_historial',v_rows=1,format('ok=true significa ruptura observable; historiales alterados=%s; error=%s: %s; esperado=1',v_rows,coalesce(v_state,'ninguno'),coalesce(v_msg,'ninguno')));
 END IF;
END $mutations$;

-- Mutacion deliberada de la funcion: conserva sesion/tenant/estado y el guardian,
-- pero omite solamente la comprobacion de permiso aprobar.
CREATE OR REPLACE FUNCTION public.emitir_diagnostico_tecnico(p_id text)
RETURNS TABLE(id text,estado text,emitido_por uuid,emitido_en timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $mut_fn$
DECLARE v_d public.diagnosticos_tecnicos%ROWTYPE; v_usuario uuid:=auth.uid();
BEGIN
 IF v_usuario IS NULL THEN RAISE EXCEPTION 'Se requiere sesion autenticada.' USING ERRCODE='42501'; END IF;
 SELECT d.* INTO v_d FROM public.diagnosticos_tecnicos d WHERE d.id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'El diagnostico no existe.' USING ERRCODE='P0002'; END IF;
 IF NOT public.usuario_tiene_empresa(v_d.empresa_id) THEN RAISE EXCEPTION 'No autorizado.' USING ERRCODE='42501'; END IF;
 IF v_d.estado IS DISTINCT FROM 'borrador' THEN RAISE EXCEPTION 'Solo borrador.' USING ERRCODE='22023'; END IF;
 INSERT INTO public.diagnostico_tecnico_transicion_rpc VALUES(txid_current(),v_d.id,'emitir',v_usuario);
 UPDATE public.diagnosticos_tecnicos d SET estado='emitido' WHERE d.id=v_d.id RETURNING d.* INTO v_d;
 DELETE FROM public.diagnostico_tecnico_transicion_rpc WHERE xid=txid_current() AND diagnostico_id=v_d.id AND accion='emitir';
 INSERT INTO public.diagnostico_tecnico_estado_historial(empresa_id,diagnostico_id,estado_anterior,estado_nuevo,motivo,usuario_id)
 VALUES(v_d.empresa_id,v_d.id,'borrador','emitido',NULL,v_usuario);
 RETURN QUERY SELECT v_d.id,v_d.estado,v_d.emitido_por,v_d.emitido_en;
END $mut_fn$;
SET LOCAL ROLE authenticated;
DO $rpc_mutation$
DECLARE c record; v_state text; v_emitido text; v_msg text;
BEGIN
 SELECT * INTO c FROM _594_mut_ctx LIMIT 1; IF c.empresa_id IS NULL THEN RETURN; END IF;
 PERFORM set_config('request.jwt.claim.sub',c.editor_id::text,true);
 BEGIN SELECT x.estado INTO v_emitido FROM public.emitir_diagnostico_tecnico(c.id_directo) x; v_state:=NULL;
 EXCEPTION WHEN OTHERS THEN v_state:=SQLSTATE; v_msg:=SQLERRM; END;
 INSERT INTO _594_mut_results VALUES('emitir_sin_verificacion_aprobar',v_state IS NULL AND v_emitido='emitido',
   format('ok=true significa ruptura observable; sqlstate=%s; mensaje=%s; estado=%s; esperado=RPC permitido al mutar la guarda',coalesce(v_state,'ok'),coalesce(v_msg,'ninguno'),coalesce(v_emitido,'NULL')));
END $rpc_mutation$;
SET LOCAL ROLE postgres;

DO $guardian_mutation$
DECLARE c record; v_rows integer; v_state text; v_msg text;
BEGIN
 SELECT * INTO c FROM _594_mut_ctx LIMIT 1; IF c.empresa_id IS NULL THEN RETURN; END IF;
 DROP TRIGGER zzz_594_proteger_diagnostico_tecnico_estado ON public.diagnosticos_tecnicos;
 PERFORM set_config('request.jwt.claim.sub',c.editor_id::text,true);
 v_rows:=0; v_state:=NULL; v_msg:=NULL;
 BEGIN
  UPDATE public.diagnosticos_tecnicos SET estado='emitido' WHERE id=c.id_guardian;
  GET DIAGNOSTICS v_rows=ROW_COUNT;
 EXCEPTION WHEN OTHERS THEN v_state:=SQLSTATE; v_msg:=SQLERRM;
 END;
 INSERT INTO _594_mut_results VALUES('sin_guardian_estado',v_rows=1,format('ok=true significa ruptura observable; UPDATE directo como postgres con claim editor; filas=%s; error=%s: %s; esperado=1',v_rows,coalesce(v_state,'ninguno'),coalesce(v_msg,'ninguno')));
END $guardian_mutation$;

INSERT INTO _594_mut_results
SELECT x.prueba,false,'SKIPPED: fixtures_base no disponible' FROM (VALUES
 ('sin_trigger_lineas'),('sin_trigger_materiales'),('sin_inmutabilidad_historial'),
 ('emitir_sin_verificacion_aprobar'),('sin_guardian_estado')) x(prueba)
WHERE NOT EXISTS(SELECT 1 FROM _594_mut_results r WHERE r.prueba=x.prueba);
SELECT prueba,ok,detalle FROM _594_mut_results ORDER BY prueba;
ROLLBACK;
