-- Pruebas aisladas de comportamiento 594; las filas propias se revierten al final.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TEMP TABLE _594_ctx (
  empresa_id text, oportunidad_id text, editor_id uuid, aprobador_id uuid,
  ver_id uuid, sin_ver_id uuid, familia_id uuid, tarea_id text,
  id_editor text, id_aprobador text, id_rpc_ok text, id_rpc_no text, id_editar text,
  id_rpc_hijos text, linea_id uuid, material_id uuid
);
CREATE TEMP TABLE _594_results (prueba text PRIMARY KEY, ok boolean NOT NULL, detalle text NOT NULL);
GRANT SELECT ON _594_ctx TO authenticated;
GRANT SELECT, INSERT ON _594_results TO authenticated;

DO $fixtures$
DECLARE c record; v_linea uuid; v_material uuid; v_base text := 't594b_'||replace(gen_random_uuid()::text,'-','');
BEGIN
 WITH miembros AS (
   SELECT ue.empresa_id,ue.user_id,(r.es_admin_empresa OR r.es_superadmin) AS admin,
     coalesce(bool_or(pr.puede_editar),false) AS editar,coalesce(bool_or(pr.puede_aprobar),false) AS aprobar,
     coalesce(bool_or(pr.puede_ver),false) AS ver
   FROM public.usuarios_empresas ue JOIN public.roles r ON r.id=ue.rol_id
   LEFT JOIN public.permisos_roles pr ON pr.rol_id=r.id AND pr.pantalla='diagnostico_tecnico'
   WHERE ue.estado='activo' GROUP BY ue.empresa_id,ue.user_id,r.es_admin_empresa,r.es_superadmin
 ), candidatos AS (
   SELECT e.id empresa_id,o.id oportunidad_id,
     (SELECT m.user_id FROM miembros m WHERE m.empresa_id=e.id AND (m.editar OR m.admin) AND NOT (m.aprobar OR m.admin) ORDER BY m.user_id LIMIT 1) editor_id,
     (SELECT m.user_id FROM miembros m WHERE m.empresa_id=e.id AND (m.aprobar OR m.admin) AND (m.editar OR m.admin) ORDER BY m.user_id LIMIT 1) aprobador_id,
     (SELECT m.user_id FROM miembros m WHERE m.empresa_id=e.id AND (m.ver OR m.admin) ORDER BY m.user_id LIMIT 1) ver_id,
     (SELECT m.user_id FROM miembros m WHERE m.empresa_id=e.id AND NOT (m.ver OR m.admin) ORDER BY m.user_id LIMIT 1) sin_ver_id
   FROM public.empresas e JOIN public.oportunidades o ON o.empresa_id=e.id
 )
  SELECT x.*, (SELECT f.id FROM public.familia_trabajo f WHERE f.empresa_id=x.empresa_id ORDER BY f.id LIMIT 1) familia_id,
    (SELECT t.id FROM public.tipos_servicio_interno t WHERE t.empresa_id=x.empresa_id ORDER BY t.id LIMIT 1) tarea_id
  INTO c FROM candidatos x
   WHERE x.editor_id IS NOT NULL AND x.aprobador_id IS NOT NULL AND x.ver_id IS NOT NULL AND x.sin_ver_id IS NOT NULL
     AND EXISTS(SELECT 1 FROM public.familia_trabajo f WHERE f.empresa_id=x.empresa_id)
     AND EXISTS(SELECT 1 FROM public.tipos_servicio_interno t WHERE t.empresa_id=x.empresa_id)
  ORDER BY x.empresa_id,x.oportunidad_id LIMIT 1;
 IF NOT FOUND THEN
   INSERT INTO _594_results VALUES('fixtures_base',false,'SKIPPED: no hay tenant con oportunidad, editor sin aprobar, aprobador, usuario con ver y sin ver'); RETURN;
 END IF;
 INSERT INTO _594_ctx(empresa_id,oportunidad_id,editor_id,aprobador_id,ver_id,sin_ver_id,familia_id,tarea_id,id_editor,id_aprobador,id_rpc_ok,id_rpc_no,id_editar,id_rpc_hijos)
 VALUES(c.empresa_id,c.oportunidad_id,c.editor_id,c.aprobador_id,c.ver_id,c.sin_ver_id,c.familia_id,c.tarea_id,
   v_base||'_editor',v_base||'_aprobador',v_base||'_rpcok',v_base||'_rpcno',v_base||'_editar',v_base||'_rpchijos');
 PERFORM set_config('request.jwt.claim.sub',c.editor_id::text,true);
 INSERT INTO public.diagnosticos_tecnicos(id,empresa_id,tipo,oportunidad_id,estado,elaborado_por)
 VALUES(v_base||'_editor',c.empresa_id,'fabricacion',c.oportunidad_id,'borrador',c.editor_id),
 (v_base||'_aprobador',c.empresa_id,'fabricacion',c.oportunidad_id,'borrador',c.editor_id),
 (v_base||'_rpcok',c.empresa_id,'fabricacion',c.oportunidad_id,'borrador',c.editor_id),
 (v_base||'_rpcno',c.empresa_id,'fabricacion',c.oportunidad_id,'borrador',c.editor_id),
 (v_base||'_editar',c.empresa_id,'fabricacion',c.oportunidad_id,'borrador',c.editor_id),
 (v_base||'_rpchijos',c.empresa_id,'fabricacion',c.oportunidad_id,'borrador',c.editor_id);
 IF c.familia_id IS NOT NULL AND c.tarea_id IS NOT NULL THEN
   INSERT INTO public.diagnostico_tecnico_lineas(empresa_id,diagnostico_id,familia_trabajo_id,tarea_id,hallazgo)
   VALUES(c.empresa_id,v_base||'_rpchijos',c.familia_id,c.tarea_id,'fixture previo a emisión 594')
   RETURNING id INTO v_linea;
   INSERT INTO public.diagnostico_tecnico_linea_materiales(empresa_id,linea_id,descripcion,cantidad,unidad)
   VALUES(c.empresa_id,v_linea,'material previo a emisión 594',1,'und')
   RETURNING id INTO v_material;
   UPDATE _594_ctx SET linea_id=v_linea,material_id=v_material;
 END IF;
END $fixtures$;

SET LOCAL ROLE authenticated;
DO $behavior$
DECLARE c record; v_state text; v_msg text; v_rows integer; v_count integer; v_id text; v_detail text; v_ok boolean; v_motivo text:='Motivo válido para reabrir';
BEGIN
 SELECT * INTO c FROM _594_ctx LIMIT 1; IF c.empresa_id IS NULL THEN RETURN; END IF;
 PERFORM set_config('request.jwt.claim.sub',c.editor_id::text,true); v_state:=NULL;
 BEGIN UPDATE public.diagnosticos_tecnicos SET estado='emitido' WHERE id=c.id_editor; EXCEPTION WHEN OTHERS THEN v_state:=SQLSTATE; END;
 INSERT INTO _594_results VALUES('update_estado_directo_editor',v_state='42501',coalesce(v_state,'UPDATE permitido; esperado 42501'));
 PERFORM set_config('request.jwt.claim.sub',c.aprobador_id::text,true); v_state:=NULL;
 BEGIN UPDATE public.diagnosticos_tecnicos SET estado='emitido' WHERE id=c.id_aprobador; EXCEPTION WHEN OTHERS THEN v_state:=SQLSTATE; END;
 INSERT INTO _594_results VALUES('update_estado_directo_aprobador',v_state='42501',coalesce(v_state,'UPDATE permitido; esperado 42501'));
 PERFORM set_config('request.jwt.claim.sub',c.editor_id::text,true);
 UPDATE public.diagnosticos_tecnicos SET updated_at=now() WHERE id=c.id_editar; GET DIAGNOSTICS v_rows=ROW_COUNT;
 INSERT INTO _594_results VALUES('policy_update_campo_no_estado_borrador',v_rows=1,format('filas=%s; esperado=1',v_rows));
 PERFORM set_config('request.jwt.claim.sub',c.aprobador_id::text,true);
 BEGIN PERFORM * FROM public.emitir_diagnostico_tecnico(c.id_rpc_ok);
 INSERT INTO _594_results VALUES('rpc_emitir_con_aprobar',true,'RPC completado como aprobador');
 EXCEPTION WHEN OTHERS THEN INSERT INTO _594_results VALUES('rpc_emitir_con_aprobar',false,format('%s: %s',SQLSTATE,SQLERRM)); END;
  IF c.linea_id IS NOT NULL THEN
    PERFORM set_config('request.jwt.claim.sub',c.aprobador_id::text,true);
    v_state:=NULL; v_msg:=NULL;
    BEGIN PERFORM * FROM public.emitir_diagnostico_tecnico(c.id_rpc_hijos); EXCEPTION WHEN OTHERS THEN v_state:=SQLSTATE; v_msg:=SQLERRM; END;
    INSERT INTO _594_results VALUES('rpc_emitir_con_hijos_fixture',v_state IS NULL,format('SQLSTATE=%s; error=%s; esperado RPC emitido con línea/material preexistentes',coalesce(v_state,'ok'),coalesce(v_msg,'ninguno')));
   PERFORM set_config('request.jwt.claim.sub',c.editor_id::text,true);
   -- Inserción de línea probada sobre la línea existente con una fila nueva y los mismos datos válidos.
    v_state:=NULL; v_msg:=NULL; v_rows:=0; BEGIN INSERT INTO public.diagnostico_tecnico_lineas(empresa_id,diagnostico_id,familia_trabajo_id,tarea_id,hallazgo) VALUES(c.empresa_id,c.id_rpc_hijos,c.familia_id,c.tarea_id,'insert emitido'); GET DIAGNOSTICS v_rows=ROW_COUNT; EXCEPTION WHEN OTHERS THEN v_state:=SQLSTATE; v_msg:=SQLERRM; END;
    v_ok:=v_state='42501' AND v_msg LIKE 'No se pueden modificar%emitido.%';
    INSERT INTO _594_results VALUES('emitido_linea_insert',v_ok,format('ruta=authenticated/editor; SQLSTATE=%s; filas=%s; error=%s; esperado bloqueo de línea emitida 42501',coalesce(v_state,'sin error'),v_rows,coalesce(v_msg,'ninguno')));
    v_state:=NULL; v_msg:=NULL; v_rows:=0; BEGIN UPDATE public.diagnostico_tecnico_lineas SET hallazgo='update emitido' WHERE id=c.linea_id; GET DIAGNOSTICS v_rows=ROW_COUNT; EXCEPTION WHEN OTHERS THEN v_state:=SQLSTATE; v_msg:=SQLERRM; END;
    v_ok:=v_state='42501' AND v_msg LIKE 'No se pueden modificar%emitido.%';
    INSERT INTO _594_results VALUES('emitido_linea_update',v_ok,format('ruta=authenticated/editor; SQLSTATE=%s; filas=%s; error=%s; esperado bloqueo de línea emitida 42501',coalesce(v_state,'sin error'),v_rows,coalesce(v_msg,'ninguno')));
    v_state:=NULL; v_msg:=NULL; v_rows:=0; BEGIN DELETE FROM public.diagnostico_tecnico_lineas WHERE id=c.linea_id; GET DIAGNOSTICS v_rows=ROW_COUNT; EXCEPTION WHEN OTHERS THEN v_state:=SQLSTATE; v_msg:=SQLERRM; END;
    v_ok:=v_state='42501' AND v_msg LIKE 'No se pueden modificar%emitido.%';
    INSERT INTO _594_results VALUES('emitido_linea_delete',v_ok,format('ruta=authenticated/editor; SQLSTATE=%s; filas=%s; error=%s; esperado bloqueo de línea emitida 42501',coalesce(v_state,'sin error'),v_rows,coalesce(v_msg,'ninguno')));
    v_state:=NULL; v_msg:=NULL; v_rows:=0; BEGIN INSERT INTO public.diagnostico_tecnico_linea_materiales(empresa_id,linea_id,descripcion,cantidad,unidad) VALUES(c.empresa_id,c.linea_id,'insert emitido',1,'und'); GET DIAGNOSTICS v_rows=ROW_COUNT; EXCEPTION WHEN OTHERS THEN v_state:=SQLSTATE; v_msg:=SQLERRM; END;
    v_ok:=v_state='42501' AND v_msg LIKE 'No se pueden modificar%emitido.%';
    INSERT INTO _594_results VALUES('emitido_material_insert',v_ok,format('ruta=authenticated/editor; SQLSTATE=%s; filas=%s; error=%s; esperado bloqueo de material emitido 42501',coalesce(v_state,'sin error'),v_rows,coalesce(v_msg,'ninguno')));
    v_state:=NULL; v_msg:=NULL; v_rows:=0; BEGIN UPDATE public.diagnostico_tecnico_linea_materiales SET cantidad=cantidad+1 WHERE id=c.material_id; GET DIAGNOSTICS v_rows=ROW_COUNT; EXCEPTION WHEN OTHERS THEN v_state:=SQLSTATE; v_msg:=SQLERRM; END;
    v_ok:=v_state='42501' AND v_msg LIKE 'No se pueden modificar%emitido.%';
    INSERT INTO _594_results VALUES('emitido_material_update',v_ok,format('ruta=authenticated/editor; SQLSTATE=%s; filas=%s; error=%s; esperado bloqueo de material emitido 42501',coalesce(v_state,'sin error'),v_rows,coalesce(v_msg,'ninguno')));
    v_state:=NULL; v_msg:=NULL; v_rows:=0; BEGIN DELETE FROM public.diagnostico_tecnico_linea_materiales WHERE id=c.material_id; GET DIAGNOSTICS v_rows=ROW_COUNT; EXCEPTION WHEN OTHERS THEN v_state:=SQLSTATE; v_msg:=SQLERRM; END;
    v_ok:=v_state='42501' AND v_msg LIKE 'No se pueden modificar%emitido.%';
    INSERT INTO _594_results VALUES('emitido_material_delete',v_ok,format('ruta=authenticated/editor; SQLSTATE=%s; filas=%s; error=%s; esperado bloqueo de material emitido 42501',coalesce(v_state,'sin error'),v_rows,coalesce(v_msg,'ninguno')));
   PERFORM set_config('request.jwt.claim.sub',c.aprobador_id::text,true);
   v_state:=NULL; BEGIN PERFORM * FROM public.emitir_diagnostico_tecnico(c.id_rpc_hijos); EXCEPTION WHEN OTHERS THEN v_state:=SQLSTATE; END;
   INSERT INTO _594_results VALUES('rpc_segunda_emision_22023',v_state='22023',format('SQLSTATE=%s; esperado=22023',coalesce(v_state,'sin error')));
   PERFORM set_config('request.jwt.claim.sub',c.editor_id::text,true);
   v_state:=NULL; BEGIN PERFORM * FROM public.reabrir_diagnostico_tecnico(c.id_rpc_hijos,v_motivo); EXCEPTION WHEN OTHERS THEN v_state:=SQLSTATE; END;
   INSERT INTO _594_results VALUES('reabrir_sin_aprobar_42501',v_state='42501',format('SQLSTATE=%s; esperado=42501',coalesce(v_state,'sin error')));
   PERFORM set_config('request.jwt.claim.sub',c.aprobador_id::text,true);
   FOREACH v_detail IN ARRAY ARRAY[NULL::text,'   ','corto'] LOOP
     v_state:=NULL; BEGIN PERFORM * FROM public.reabrir_diagnostico_tecnico(c.id_rpc_hijos,v_detail); EXCEPTION WHEN OTHERS THEN v_state:=SQLSTATE; END;
     INSERT INTO _594_results VALUES('reabrir_motivo_invalido_'||CASE WHEN v_detail IS NULL THEN 'null' WHEN v_detail='   ' THEN 'blanco' ELSE 'corto' END,v_state='22023',format('motivo=%s; SQLSTATE=%s; esperado=22023',coalesce(quote_nullable(v_detail),'NULL'),coalesce(v_state,'sin error')));
   END LOOP;
    v_state:=NULL; v_msg:=NULL;
    BEGIN PERFORM * FROM public.reabrir_diagnostico_tecnico(c.id_rpc_hijos,v_motivo); EXCEPTION WHEN OTHERS THEN v_state:=SQLSTATE; v_msg:=SQLERRM; END;
   SELECT count(*) INTO v_count FROM public.diagnostico_tecnico_estado_historial WHERE diagnostico_id=c.id_rpc_hijos AND estado_anterior='emitido' AND estado_nuevo='borrador' AND motivo=v_motivo AND usuario_id=c.aprobador_id;
   SELECT estado='borrador' AND emitido_por IS NULL AND emitido_en IS NULL INTO v_ok FROM public.diagnosticos_tecnicos WHERE id=c.id_rpc_hijos;
   SELECT format('estado=%s emitido_por=%s emitido_en=%s',estado,coalesce(emitido_por::text,'NULL'),coalesce(emitido_en::text,'NULL')) INTO v_detail FROM public.diagnosticos_tecnicos WHERE id=c.id_rpc_hijos;
    INSERT INTO _594_results VALUES('reabrir_valido_historial',v_state IS NULL AND v_count=1 AND v_ok,format('SQLSTATE=%s; error=%s; cabecera=%s; historial_filas=%s, motivo=%s, usuario=%s; esperado estado borrador, marcas nulas y fila con motivo/usuario aprobador',coalesce(v_state,'ok'),coalesce(v_msg,'ninguno'),coalesce(v_detail,'NULL'),v_count,v_motivo,c.aprobador_id));
   PERFORM set_config('request.jwt.claim.sub',c.editor_id::text,true); v_state:=NULL;
   BEGIN UPDATE public.diagnosticos_tecnicos SET estado='emitido' WHERE id=c.id_rpc_hijos; EXCEPTION WHEN OTHERS THEN v_state:=SQLSTATE; END;
   INSERT INTO _594_results VALUES('reabierto_update_estado_directo_42501',v_state='42501',format('SQLSTATE=%s; esperado=42501',coalesce(v_state,'sin error')));
   PERFORM set_config('request.jwt.claim.sub',c.aprobador_id::text,true); v_state:=NULL;
   BEGIN UPDATE public.diagnosticos_tecnicos SET elaborado_por=c.aprobador_id WHERE id=c.id_rpc_ok; EXCEPTION WHEN OTHERS THEN v_state:=SQLSTATE; END;
   INSERT INTO _594_results VALUES('emitido_cabecera_campo_aprobador_42501',v_state='42501',format('trg_validar_diagnostico_tecnico_referencias / elaborado_por inmutable; SQLSTATE=%s; esperado=42501',coalesce(v_state,'sin error')));
   PERFORM set_config('request.jwt.claim.sub',c.editor_id::text,true);
    v_rows:=0; v_state:=NULL; v_msg:=NULL;
    BEGIN UPDATE public.diagnostico_tecnico_lineas SET hallazgo='update borrador permitido' WHERE diagnostico_id=c.id_rpc_hijos; GET DIAGNOSTICS v_rows=ROW_COUNT; EXCEPTION WHEN OTHERS THEN v_state:=SQLSTATE; v_msg:=SQLERRM; END;
    INSERT INTO _594_results VALUES('borrador_linea_update_permitido',v_state IS NULL AND v_rows=1,format('filas=%s; error=%s: %s; esperado=1',v_rows,coalesce(v_state,'ninguno'),coalesce(v_msg,'ninguno')));
    v_rows:=0; v_state:=NULL; v_msg:=NULL;
    BEGIN UPDATE public.diagnostico_tecnico_linea_materiales SET cantidad=cantidad+1 WHERE id=c.material_id; GET DIAGNOSTICS v_rows=ROW_COUNT; EXCEPTION WHEN OTHERS THEN v_state:=SQLSTATE; v_msg:=SQLERRM; END;
    INSERT INTO _594_results VALUES('borrador_material_update_permitido',v_state IS NULL AND v_rows=1,format('filas=%s; error=%s: %s; esperado=1',v_rows,coalesce(v_state,'ninguno'),coalesce(v_msg,'ninguno')));
 ELSE
   INSERT INTO _594_results VALUES('fixtures_hijos_594',false,'SKIPPED: no existe familia/tarea para fixture propio de línea y material');
 END IF;
 PERFORM set_config('request.jwt.claim.sub',c.editor_id::text,true); v_state:=NULL;
 BEGIN PERFORM * FROM public.emitir_diagnostico_tecnico(c.id_rpc_no); EXCEPTION WHEN OTHERS THEN v_state:=SQLSTATE; END;
 INSERT INTO _594_results VALUES('rpc_emitir_sin_aprobar',v_state='42501',coalesce(v_state,'RPC permitido; esperado 42501'));
 SELECT id INTO v_id FROM public.diagnostico_tecnico_estado_historial WHERE diagnostico_id=c.id_rpc_ok LIMIT 1;
 IF v_id IS NULL THEN INSERT INTO _594_results VALUES('historial_insert_update_delete_denegados',false,'SKIPPED: no se creo historial para la emision');
 ELSE
   v_count:=0; v_detail:='';
   v_state:=NULL; v_msg:=NULL; v_rows:=0;
   BEGIN INSERT INTO public.diagnostico_tecnico_estado_historial(empresa_id,diagnostico_id,estado_anterior,estado_nuevo,usuario_id) VALUES(c.empresa_id,c.id_rpc_ok,'borrador','emitido',c.aprobador_id); GET DIAGNOSTICS v_rows=ROW_COUNT; EXCEPTION WHEN OTHERS THEN v_state:=SQLSTATE; v_msg:=SQLERRM; END;
   IF v_state='42501' THEN v_count:=v_count+1; END IF;
   v_detail:=v_detail||format('insert[%s filas=%s %s] ',coalesce(v_state,'sin error'),v_rows,coalesce(v_msg,''));
   v_state:=NULL; v_msg:=NULL; v_rows:=0;
   BEGIN UPDATE public.diagnostico_tecnico_estado_historial SET motivo=motivo WHERE id=v_id::uuid; GET DIAGNOSTICS v_rows=ROW_COUNT; EXCEPTION WHEN OTHERS THEN v_state:=SQLSTATE; v_msg:=SQLERRM; END;
   IF v_state='42501' THEN v_count:=v_count+1; END IF;
   v_detail:=v_detail||format('update[%s filas=%s %s] ',coalesce(v_state,'sin error'),v_rows,coalesce(v_msg,''));
   v_state:=NULL; v_msg:=NULL; v_rows:=0;
   BEGIN DELETE FROM public.diagnostico_tecnico_estado_historial WHERE id=v_id::uuid; GET DIAGNOSTICS v_rows=ROW_COUNT; EXCEPTION WHEN OTHERS THEN v_state:=SQLSTATE; v_msg:=SQLERRM; END;
   IF v_state='42501' THEN v_count:=v_count+1; END IF;
   v_detail:=v_detail||format('delete[%s filas=%s %s]',coalesce(v_state,'sin error'),v_rows,coalesce(v_msg,''));
   INSERT INTO _594_results VALUES('historial_insert_update_delete_denegados',v_count=3,format('denegaciones_42501=%s/3; %s',v_count,v_detail));
 END IF;
 v_state:=NULL; BEGIN PERFORM 1 FROM public.diagnostico_tecnico_transicion_rpc LIMIT 1; EXCEPTION WHEN OTHERS THEN v_state:=SQLSTATE; END;
 INSERT INTO _594_results VALUES('transicion_rpc_select_denegado',v_state='42501',coalesce(v_state,'SELECT permitido; esperado 42501'));
 PERFORM set_config('request.jwt.claim.sub',c.ver_id::text,true);
 SELECT count(*) INTO v_count FROM public.diagnostico_tecnico_estado_historial WHERE diagnostico_id=c.id_rpc_ok;
 INSERT INTO _594_results VALUES('historial_visible_con_ver',v_count=1,format('filas=%s; esperado=1',v_count));
 PERFORM set_config('request.jwt.claim.sub',c.sin_ver_id::text,true);
 SELECT count(*) INTO v_count FROM public.diagnostico_tecnico_estado_historial WHERE diagnostico_id=c.id_rpc_ok;
 INSERT INTO _594_results VALUES('historial_vacio_sin_acceso',v_count=0,format('filas=%s; esperado=0',v_count));
END $behavior$;
SET LOCAL ROLE postgres;
-- Si RLS ocultó la fila o negó INSERT antes de llegar al bloqueo de estado, repetir con postgres+claim.
DO $child_lock_fallback$
DECLARE c record; r record; v_state text; v_rows integer; v_msg text; v_ok boolean;
BEGIN
 SELECT * INTO c FROM _594_ctx LIMIT 1; IF c.empresa_id IS NULL OR c.linea_id IS NULL THEN RETURN; END IF;
 PERFORM set_config('request.jwt.claim.sub',c.editor_id::text,true);
 FOR r IN SELECT prueba FROM _594_results WHERE prueba IN ('emitido_linea_insert','emitido_linea_update','emitido_linea_delete','emitido_material_insert','emitido_material_update','emitido_material_delete') AND NOT ok AND (detalle LIKE '%filas=0%' OR detalle LIKE '%violates row-level security%') LOOP
   v_state:=NULL; v_msg:=NULL; v_rows:=0;
   BEGIN
    IF r.prueba='emitido_linea_insert' THEN
      INSERT INTO public.diagnostico_tecnico_lineas(empresa_id,diagnostico_id,familia_trabajo_id,tarea_id,hallazgo) VALUES(c.empresa_id,c.id_rpc_hijos,c.familia_id,c.tarea_id,'insert emitido fallback'); GET DIAGNOSTICS v_rows=ROW_COUNT;
    ELSIF r.prueba='emitido_linea_update' THEN
      UPDATE public.diagnostico_tecnico_lineas SET hallazgo='update emitido fallback' WHERE id=c.linea_id; GET DIAGNOSTICS v_rows=ROW_COUNT;
    ELSIF r.prueba='emitido_linea_delete' THEN
      DELETE FROM public.diagnostico_tecnico_lineas WHERE id=c.linea_id; GET DIAGNOSTICS v_rows=ROW_COUNT;
    ELSIF r.prueba='emitido_material_insert' THEN
      INSERT INTO public.diagnostico_tecnico_linea_materiales(empresa_id,linea_id,descripcion,cantidad,unidad) VALUES(c.empresa_id,c.linea_id,'insert emitido fallback',1,'und'); GET DIAGNOSTICS v_rows=ROW_COUNT;
    ELSIF r.prueba='emitido_material_update' THEN
      UPDATE public.diagnostico_tecnico_linea_materiales SET cantidad=cantidad+1 WHERE id=c.material_id; GET DIAGNOSTICS v_rows=ROW_COUNT;
    ELSE
      DELETE FROM public.diagnostico_tecnico_linea_materiales WHERE id=c.material_id; GET DIAGNOSTICS v_rows=ROW_COUNT;
    END IF;
   EXCEPTION WHEN OTHERS THEN v_state:=SQLSTATE; v_msg:=SQLERRM;
   END;
   v_ok:=v_state='42501' AND v_msg LIKE 'No se pueden modificar%emitido.%';
   UPDATE _594_results SET ok=v_ok,detalle=format('ruta=postgres+claim editor fallback por RLS; SQLSTATE=%s; filas=%s; error=%s; esperado bloqueo del trigger 42501',coalesce(v_state,'sin error'),v_rows,coalesce(v_msg,'ninguno')) WHERE prueba=r.prueba;
 END LOOP;
END $child_lock_fallback$;
INSERT INTO _594_results
SELECT x.prueba,false,'SKIPPED: prerequisite fixture/test path unavailable' FROM (VALUES
 ('update_estado_directo_editor'),('update_estado_directo_aprobador'),('policy_update_campo_no_estado_borrador'),
 ('rpc_emitir_con_aprobar'),('rpc_emitir_sin_aprobar'),('historial_insert_update_delete_denegados'),
 ('transicion_rpc_select_denegado'),('historial_visible_con_ver'),('historial_vacio_sin_acceso'),
 ('rpc_emitir_con_hijos_fixture'),
 ('emitido_linea_insert'),('emitido_linea_update'),('emitido_linea_delete'),('emitido_material_insert'),('emitido_material_update'),('emitido_material_delete'),
 ('rpc_segunda_emision_22023'),('reabrir_sin_aprobar_42501'),('reabrir_motivo_invalido_null'),('reabrir_motivo_invalido_blanco'),('reabrir_motivo_invalido_corto'),
 ('reabrir_valido_historial'),('reabierto_update_estado_directo_42501'),('emitido_cabecera_campo_aprobador_42501'),
 ('borrador_linea_update_permitido'),('borrador_material_update_permitido')) x(prueba)
WHERE NOT EXISTS(SELECT 1 FROM _594_results r WHERE r.prueba=x.prueba);
SELECT prueba,ok,detalle FROM _594_results ORDER BY prueba;
ROLLBACK;
