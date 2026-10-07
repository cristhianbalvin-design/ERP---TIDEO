-- 597: Emisión completa del informe de diagnóstico y retención segura de fotos.
-- Propósito: completar la identidad de empresa, relaciones de líneas y fotos en
-- snapshots; permitir actualizar fotos después de reabrir un diagnóstico.
-- Decisiones: conserva las validaciones, locks, versionado, historial y permisos
-- de 595; fotos se congelan por snapshot emitido y se bloquean al borrar en Storage.
-- Supuestos: se usan columnas verificadas en 595, 592, 596 y 081_empresa_config;
-- tipos_servicio_interno se resuelve por id, igual que en la emisión existente.
-- No verificable aquí: la existencia de filas de configuración/activo/cliente
-- para cada empresa; si faltan, la identidad asociada queda NULL.
-- Aplicada en producción por el usuario tras revisión.

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $pre$
BEGIN
  ASSERT to_regprocedure('public.emitir_informe_diagnostico(uuid,text,text)') IS NOT NULL,
    'PRECONDITION_FAILED: falta emitir_informe_diagnostico(uuid,text,text)';
  ASSERT to_regprocedure('public.diagnostico_informe_validar_snapshot(jsonb)') IS NOT NULL,
    'PRECONDITION_FAILED: falta diagnostico_informe_validar_snapshot(jsonb)';
  ASSERT to_regprocedure('public.bloquear_foto_hallazgo_emitido()') IS NOT NULL,
    'PRECONDITION_FAILED: falta bloquear_foto_hallazgo_emitido()';
  ASSERT to_regprocedure('public.foto_diagnostico_bloqueada(text)') IS NOT NULL,
    'PRECONDITION_FAILED: falta foto_diagnostico_bloqueada(text)';
  ASSERT to_regclass('public.diagnostico_informes') IS NOT NULL,
    'PRECONDITION_FAILED: falta diagnostico_informes';
  ASSERT to_regclass('public.diagnosticos_tecnicos') IS NOT NULL,
    'PRECONDITION_FAILED: falta diagnosticos_tecnicos';
  ASSERT to_regclass('public.recepciones_activos_cliente') IS NOT NULL,
    'PRECONDITION_FAILED: falta recepciones_activos_cliente';
  ASSERT to_regclass('public.activos') IS NOT NULL AND to_regclass('public.cuentas') IS NOT NULL,
    'PRECONDITION_FAILED: faltan activos o cuentas';
  ASSERT to_regclass('public.empresa_config') IS NOT NULL,
    'PRECONDITION_FAILED: falta empresa_config';
  ASSERT to_regclass('public.diagnostico_tecnico_hallazgos') IS NOT NULL
    AND to_regclass('public.diagnostico_tecnico_hallazgo_lineas') IS NOT NULL
    AND to_regclass('public.diagnostico_tecnico_lineas') IS NOT NULL
    AND to_regclass('public.tipos_servicio_interno') IS NOT NULL,
    'PRECONDITION_FAILED: faltan tablas de hallazgos o líneas';
  ASSERT to_regclass('public.diagnostico_tecnico_hallazgo_fotos') IS NOT NULL,
    'PRECONDITION_FAILED: falta diagnostico_tecnico_hallazgo_fotos';
  ASSERT (SELECT count(*)=31 FROM information_schema.columns
    WHERE table_schema='public' AND (
      (table_name='activos' AND column_name IN ('id','empresa_id','cliente_propietario_id','codigo','nombre','placa_serie')) OR
      (table_name='cuentas' AND column_name IN ('id','empresa_id','razon_social')) OR
      (table_name='empresa_config' AND column_name IN ('empresa_id','razon_social','ruc','logo_url','logo_path')) OR
      (table_name='diagnostico_tecnico_hallazgo_lineas' AND column_name IN ('empresa_id','hallazgo_id','linea_id')) OR
      (table_name='diagnostico_tecnico_lineas' AND column_name IN ('id','empresa_id','tarea_id')) OR
      (table_name='tipos_servicio_interno' AND column_name IN ('id','nombre')) OR
      (table_name='diagnostico_tecnico_hallazgo_fotos' AND column_name IN ('id','empresa_id','hallazgo_id','ruta_storage','leyenda','orden','ancho','alto','excluir_del_informe'))
    )), 'PRECONDITION_FAILED: faltan columnas verificadas para cabecera, líneas o fotos';
END
$pre$;
CREATE OR REPLACE FUNCTION public.emitir_informe_diagnostico(
  p_id uuid, p_emisor_nombre text DEFAULT NULL, p_emisor_cargo text DEFAULT NULL
)
RETURNS public.diagnostico_informes
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE
  v_usuario uuid := auth.uid(); v_i public.diagnostico_informes%ROWTYPE; v_d public.diagnosticos_tecnicos%ROWTYPE;
  v_r public.recepciones_activos_cliente%ROWTYPE; v_op jsonb; v_snapshot jsonb; v_version integer;
  v_nombre text; v_cargo text; v_hallazgos jsonb; v_mediciones jsonb; v_lineas jsonb;
  v_resumen jsonb; v_empresa jsonb; cab_activo public.activos%ROWTYPE; cab_cliente public.cuentas%ROWTYPE;
BEGIN
  IF v_usuario IS NULL THEN RAISE EXCEPTION 'Se requiere una sesión autenticada.' USING ERRCODE='42501'; END IF;
  SELECT i.* INTO v_i FROM public.diagnostico_informes i WHERE i.id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El borrador del informe no existe.' USING ERRCODE='P0002'; END IF;
  IF NOT public.usuario_tiene_empresa(v_i.empresa_id)
     OR NOT public.usuario_puede(v_i.empresa_id,'diagnostico_tecnico','aprobar')
     OR NOT public.usuario_puede(v_i.empresa_id,'informe_diagnostico','aprobar') THEN
    RAISE EXCEPTION 'No autorizado para emitir este informe.' USING ERRCODE='42501';
  END IF;
  IF v_i.estado <> 'borrador' THEN RAISE EXCEPTION 'Solo se puede emitir un borrador.' USING ERRCODE='22023'; END IF;
  SELECT d.* INTO v_d FROM public.diagnosticos_tecnicos d
    WHERE d.id=v_i.diagnostico_id AND d.empresa_id=v_i.empresa_id AND d.recepcion_id=v_i.recepcion_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El diagnóstico no pertenece a la recepción del informe.' USING ERRCODE='23514'; END IF;
  IF v_d.estado IS DISTINCT FROM 'emitido' THEN RAISE EXCEPTION 'El diagnóstico debe estar emitido.' USING ERRCODE='22023'; END IF;
  v_op := v_i.opciones;
  IF nullif(btrim(coalesce(v_op->>'conclusion','')),'') IS NOT NULL
     AND coalesce((v_op->>'conclusion_confirmada')::boolean,false) IS NOT TRUE THEN
    RAISE EXCEPTION 'La conclusión debe confirmarse antes de emitir.' USING ERRCODE='22023';
  END IF;
  SELECT r.* INTO v_r FROM public.recepciones_activos_cliente r
    WHERE r.id=v_i.recepcion_id AND r.empresa_id=v_i.empresa_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'La recepción ya no existe o no corresponde a la empresa.' USING ERRCODE='23514'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('informe:'||v_i.empresa_id||':'||v_i.recepcion_id,0));
  SELECT coalesce(max(i.version),0)+1 INTO v_version FROM public.diagnostico_informes i
    WHERE i.empresa_id=v_i.empresa_id AND i.recepcion_id=v_i.recepcion_id AND i.estado='emitido';

  -- Carga opcional de equipo, cliente e identidad de empresa.
  SELECT a.* INTO cab_activo FROM public.activos a
    WHERE a.id=v_r.activo_id AND a.empresa_id=v_i.empresa_id;
  SELECT c.* INTO cab_cliente FROM public.cuentas c
    WHERE c.id=cab_activo.cliente_propietario_id AND c.empresa_id=v_i.empresa_id;
  SELECT jsonb_build_object('razon_social',ec.razon_social,'ruc',ec.ruc,
      'logo_url',ec.logo_url,'logo_path',ec.logo_path)
    INTO v_empresa FROM public.empresa_config ec WHERE ec.empresa_id=v_i.empresa_id;
  -- Snapshot por lista blanca con identidad, líneas y fotos autorizadas.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'hallazgo_id',h.id,'componente_parte',h.componente_parte,
      'tipo_dano_codigo',h.tipo_dano_codigo,'tipo_dano_etiqueta',td.etiqueta,
      'causa_probable_codigo',h.causa_probable_codigo,'causa_probable_etiqueta',cp.etiqueta,
      'condicion_codigo',h.condicion,'condicion_etiqueta',CASE h.condicion
        WHEN 'conforme' THEN 'Conforme' WHEN 'desgaste_aceptable' THEN 'Desgaste aceptable'
        WHEN 'fuera_de_tolerancia' THEN 'Fuera de tolerancia' WHEN 'falla_funcional' THEN 'Falla funcional' END,
      'riesgo_codigo',h.riesgo,'riesgo_etiqueta',CASE h.riesgo
        WHEN 'monitorear' THEN 'Monitorear' WHEN 'proximo_mantenimiento' THEN 'Próximo mantenimiento'
        WHEN 'antes_de_operar' THEN 'Antes de operar' WHEN 'inmediato_por_seguridad' THEN 'Inmediato por seguridad' END,
      'accion_recomendada_codigo',h.accion_recomendada,'accion_recomendada_etiqueta',CASE h.accion_recomendada
        WHEN 'reutilizar' THEN 'Reutilizar' WHEN 'reparar' THEN 'Reparar' WHEN 'reemplazar' THEN 'Reemplazar'
        WHEN 'fabricar_nuevo' THEN 'Fabricar nuevo' WHEN 'monitorear' THEN 'Monitorear' END,
      'atribuible_a_codigo',h.atribuible_a,'atribuible_a_etiqueta',CASE h.atribuible_a
        WHEN 'desgaste_normal' THEN 'Desgaste normal' WHEN 'operacion' THEN 'Operación'
        WHEN 'defecto_fabrica' THEN 'Defecto de fábrica' WHEN 'instalacion' THEN 'Instalación' END,
      'lineas',coalesce((SELECT jsonb_agg(jsonb_build_object(
        'linea_id',hl.linea_id,'tarea_id',l.tarea_id,'tarea_nombre',t.nombre)
        ORDER BY hl.linea_id)
        FROM public.diagnostico_tecnico_hallazgo_lineas hl
        JOIN public.diagnostico_tecnico_lineas l
          ON l.id=hl.linea_id AND l.empresa_id=hl.empresa_id
        LEFT JOIN public.tipos_servicio_interno t ON t.id=l.tarea_id
        WHERE hl.empresa_id=h.empresa_id AND hl.hallazgo_id=h.id),'[]'::jsonb),
      'fotos',coalesce((SELECT jsonb_agg(foto.objeto ORDER BY foto.orden,foto.id)
        FROM (SELECT f.id,f.orden,jsonb_build_object(
          'ruta_storage',f.ruta_storage,'leyenda',f.leyenda,'orden',f.orden,
          'ancho',f.ancho,'alto',f.alto) AS objeto
          FROM public.diagnostico_tecnico_hallazgo_fotos f
          WHERE f.empresa_id=h.empresa_id AND f.hallazgo_id=h.id
            AND f.excluir_del_informe=false
          ORDER BY f.orden,f.id LIMIT 3) foto),'[]'::jsonb),
      'prioridad',h.prioridad_efectiva,'observacion',h.observacion)
      ORDER BY h.prioridad_efectiva,h.componente_parte,h.id),'[]'::jsonb)
    INTO v_hallazgos
    FROM public.diagnostico_tecnico_hallazgos h
    LEFT JOIN public.diagnostico_catalogo_valores td ON td.empresa_id=h.empresa_id AND td.catalogo='tipo_dano' AND td.codigo=h.tipo_dano_codigo
    LEFT JOIN public.diagnostico_catalogo_valores cp ON cp.empresa_id=h.empresa_id AND cp.catalogo='causa_probable' AND cp.codigo=h.causa_probable_codigo
    WHERE h.empresa_id=v_i.empresa_id AND h.diagnostico_id=v_i.diagnostico_id
      AND h.incluir_en_informe=true
      AND (coalesce((v_op->>'ocultar_conformes')::boolean,false)=false OR h.condicion<>'conforme');

  IF coalesce((v_op->>'incluir_mediciones')::boolean,false) THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
        'hallazgo_id',h.id,'parametro',m.parametro,'unidad',m.unidad,'nominal',m.nominal,
        'minimo',m.minimo,'maximo',m.maximo,'medido',m.medido,
        'resultado',m.resultado_calculado,'condicion_sugerida',m.condicion_sugerida)
        ORDER BY h.id,m.parametro,m.id),'[]'::jsonb)
      INTO v_mediciones
      FROM public.diagnostico_tecnico_hallazgo_mediciones m
      JOIN public.diagnostico_tecnico_hallazgos h ON h.id=m.hallazgo_id AND h.empresa_id=m.empresa_id
      WHERE m.empresa_id=v_i.empresa_id AND h.diagnostico_id=v_i.diagnostico_id
        AND h.incluir_en_informe=true
        AND (coalesce((v_op->>'ocultar_conformes')::boolean,false)=false OR h.condicion<>'conforme');
  ELSE v_mediciones := '[]'::jsonb; END IF;

  IF coalesce((v_op->>'mostrar_horas')::boolean,false) THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
        'linea_id',l.id,'familia_trabajo_id',l.familia_trabajo_id,'familia_trabajo_nombre',f.nombre,
        'actividad_id',l.actividad_id,'actividad_codigo',actividad.codigo,'actividad_nombre',actividad.nombre,
        'tarea_id',l.tarea_id,'tarea_codigo',t.codigo,'tarea_nombre',t.nombre,
        'hallazgo',l.hallazgo,'cargo_id',l.cargo_id,'cargo_codigo',c.codigo,'cargo_nombre',c.nombre,
        'horas_mano_obra',l.horas_mano_obra,'activo_id',l.activo_id,'activo_codigo',ap.codigo,'activo_nombre',ap.nombre,'horas_maquina',l.horas_maquina,
        'materiales',coalesce((SELECT jsonb_agg(jsonb_build_object(
          'material_id',m.material_id,'codigo',mat.codigo,
          'descripcion',coalesce(nullif(btrim(m.descripcion),''),mat.descripcion),
          'cantidad',m.cantidad,'unidad',m.unidad) ORDER BY m.orden,m.id)
          FROM public.diagnostico_tecnico_linea_materiales m
          LEFT JOIN public.materiales mat ON mat.id=m.material_id AND mat.empresa_id=m.empresa_id
          WHERE m.linea_id=l.id AND m.empresa_id=l.empresa_id),'[]'::jsonb))
        ORDER BY l.orden,l.id),'[]'::jsonb)
      INTO v_lineas FROM public.diagnostico_tecnico_lineas l
      LEFT JOIN public.familia_trabajo f ON f.id=l.familia_trabajo_id
      LEFT JOIN public.tipos_servicio_interno actividad ON actividad.id=l.actividad_id
      LEFT JOIN public.tipos_servicio_interno t ON t.id=l.tarea_id
      LEFT JOIN public.cargos_empresa c ON c.id=l.cargo_id
      LEFT JOIN public.activos ap ON ap.id=l.activo_id AND ap.empresa_id=l.empresa_id
      WHERE l.empresa_id=v_i.empresa_id AND l.diagnostico_id=v_i.diagnostico_id;
  ELSE
    SELECT coalesce(jsonb_agg(jsonb_build_object(
        'linea_id',l.id,'familia_trabajo_id',l.familia_trabajo_id,'familia_trabajo_nombre',f.nombre,
        'actividad_id',l.actividad_id,'actividad_codigo',actividad.codigo,'actividad_nombre',actividad.nombre,
        'tarea_id',l.tarea_id,'tarea_codigo',t.codigo,'tarea_nombre',t.nombre,
        'hallazgo',l.hallazgo,'cargo_id',l.cargo_id,'cargo_codigo',c.codigo,'cargo_nombre',c.nombre,
        'activo_id',l.activo_id,'activo_codigo',ap.codigo,'activo_nombre',ap.nombre,
        'materiales',coalesce((SELECT jsonb_agg(jsonb_build_object(
          'material_id',m.material_id,'codigo',mat.codigo,
          'descripcion',coalesce(nullif(btrim(m.descripcion),''),mat.descripcion),
          'cantidad',m.cantidad,'unidad',m.unidad) ORDER BY m.orden,m.id)
          FROM public.diagnostico_tecnico_linea_materiales m
          LEFT JOIN public.materiales mat ON mat.id=m.material_id AND mat.empresa_id=m.empresa_id
          WHERE m.linea_id=l.id AND m.empresa_id=l.empresa_id),'[]'::jsonb))
        ORDER BY l.orden,l.id),'[]'::jsonb)
      INTO v_lineas FROM public.diagnostico_tecnico_lineas l
      LEFT JOIN public.familia_trabajo f ON f.id=l.familia_trabajo_id
      LEFT JOIN public.tipos_servicio_interno actividad ON actividad.id=l.actividad_id
      LEFT JOIN public.tipos_servicio_interno t ON t.id=l.tarea_id
      LEFT JOIN public.cargos_empresa c ON c.id=l.cargo_id
      LEFT JOIN public.activos ap ON ap.id=l.activo_id AND ap.empresa_id=l.empresa_id
      WHERE l.empresa_id=v_i.empresa_id AND l.diagnostico_id=v_i.diagnostico_id;
  END IF;

  SELECT jsonb_build_object(
      'P1',count(*) FILTER (WHERE h.prioridad_efectiva='P1'),
      'P2',count(*) FILTER (WHERE h.prioridad_efectiva='P2'),
      'P3',count(*) FILTER (WHERE h.prioridad_efectiva='P3'),
      'P4',count(*) FILTER (WHERE h.prioridad_efectiva='P4'),
      'conformes',count(*) FILTER (WHERE h.condicion='conforme'))
    INTO v_resumen FROM public.diagnostico_tecnico_hallazgos h
    WHERE h.empresa_id=v_i.empresa_id AND h.diagnostico_id=v_i.diagnostico_id
      AND h.incluir_en_informe=true;

  v_nombre := nullif(btrim(coalesce(p_emisor_nombre,'')),'');
  v_cargo := nullif(btrim(coalesce(p_emisor_cargo,'')),'');
  IF v_nombre IS NULL THEN RAISE EXCEPTION 'El nombre del emisor es obligatorio.' USING ERRCODE='22023'; END IF;
  v_snapshot := jsonb_build_object(
    'empresa',v_empresa,
    'version',v_version,
    'emitido_en',now(),
    'cabecera',jsonb_build_object('recepcion_id',v_r.id,'numero_recepcion',v_r.numero,
      'numero_caso',v_r.numero_caso,'fecha_recepcion',v_r.fecha_ingreso,'activo_id',v_r.activo_id,
      'activo_codigo',cab_activo.codigo,'activo_nombre',cab_activo.nombre,'numero_serie',cab_activo.placa_serie,
      'horometro',NULL,'cliente_id',cab_activo.cliente_propietario_id,'cliente_razon_social',cab_cliente.razon_social,
      'diagnostico_id',v_d.id,'tipo',v_d.tipo,'estado_diagnostico',v_d.estado),
    'hallazgos',v_hallazgos,'mediciones',v_mediciones,'tareas_repuestos',v_lineas,
    'resumen',v_resumen,
    'conclusion',nullif(btrim(coalesce(v_op->>'conclusion','')),''),
    'conclusion_origen',v_op->>'conclusion_origen',
    'emisor',jsonb_build_object('nombre',v_nombre,'cargo',v_cargo));

  PERFORM public.diagnostico_informe_validar_snapshot(v_snapshot);

  INSERT INTO public.diagnostico_informe_transicion_rpc(xid,informe_id,usuario_id)
    VALUES (txid_current(),v_i.id,v_usuario);
  UPDATE public.diagnostico_informes SET estado='emitido',version=v_version,
    snapshot=v_snapshot,emitido_por=v_usuario,emitido_en=now(),
    emisor_nombre=v_nombre,emisor_cargo=v_cargo
    WHERE id=v_i.id RETURNING * INTO v_i;
  DELETE FROM public.diagnostico_informe_transicion_rpc
    WHERE xid=txid_current() AND informe_id=v_i.id AND usuario_id=v_usuario;
  RETURN v_i;
END
$fn$;

REVOKE ALL ON FUNCTION public.emitir_informe_diagnostico(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.emitir_informe_diagnostico(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.bloquear_foto_hallazgo_emitido()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE
  v_foto public.diagnostico_tecnico_hallazgo_fotos%ROWTYPE;
  v_recepcion text; v_estado text; v_informe_borrador boolean;
BEGIN
  IF TG_OP='DELETE' THEN v_foto := OLD; ELSE v_foto := NEW; END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.empresa_id IS DISTINCT FROM OLD.empresa_id
       OR NEW.hallazgo_id IS DISTINCT FROM OLD.hallazgo_id
       OR NEW.ruta_storage IS DISTINCT FROM OLD.ruta_storage
       OR NEW.nombre_original IS DISTINCT FROM OLD.nombre_original
       OR NEW.mime_type IS DISTINCT FROM OLD.mime_type
       OR NEW.tamano_bytes IS DISTINCT FROM OLD.tamano_bytes
       OR NEW.ancho IS DISTINCT FROM OLD.ancho OR NEW.alto IS DISTINCT FROM OLD.alto
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Solo se pueden modificar la leyenda, el orden y la exclusión del informe.' USING ERRCODE='23514';
    END IF;
    IF NEW.leyenda IS NOT DISTINCT FROM OLD.leyenda
       AND NEW.orden IS NOT DISTINCT FROM OLD.orden
       AND NEW.excluir_del_informe IS NOT DISTINCT FROM OLD.excluir_del_informe THEN
      RAISE EXCEPTION 'El cambio debe modificar leyenda, orden o exclusión del informe.' USING ERRCODE='23514';
    END IF;
    NEW.updated_at := now();
    v_foto := NEW;
  END IF;
  SELECT d.recepcion_id,d.estado INTO v_recepcion,v_estado
  FROM public.diagnostico_tecnico_hallazgos h
  JOIN public.diagnosticos_tecnicos d ON d.id=h.diagnostico_id AND d.empresa_id=h.empresa_id
  WHERE h.id=v_foto.hallazgo_id AND h.empresa_id=v_foto.empresa_id
  FOR SHARE OF h,d;
  IF NOT FOUND THEN
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'El diagnóstico del hallazgo no existe.' USING ERRCODE='23503';
  END IF;
  IF v_estado IS DISTINCT FROM 'borrador' THEN
    SELECT EXISTS (SELECT 1 FROM public.diagnostico_informes i
      WHERE i.empresa_id=v_foto.empresa_id AND i.recepcion_id=v_recepcion
        AND i.estado='borrador') INTO v_informe_borrador;
    IF NOT (TG_OP='UPDATE' AND v_informe_borrador) THEN
      RAISE EXCEPTION 'Solo se pueden modificar fotos de un diagnóstico en borrador.' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END
$fn$;
REVOKE ALL ON FUNCTION public.bloquear_foto_hallazgo_emitido() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.foto_diagnostico_bloqueada(p_ruta text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.diagnostico_tecnico_hallazgo_fotos f
      JOIN public.diagnostico_tecnico_hallazgos h
        ON h.id=f.hallazgo_id AND h.empresa_id=f.empresa_id
      JOIN public.diagnosticos_tecnicos d
        ON d.id=h.diagnostico_id AND d.empresa_id=h.empresa_id
      WHERE f.ruta_storage=p_ruta
        AND d.estado IS DISTINCT FROM 'borrador'
    )
    OR EXISTS (
      SELECT 1 FROM public.diagnostico_informes i
      WHERE i.empresa_id=split_part(p_ruta,'/',1)
        AND i.estado='emitido'
        AND i.snapshot IS NOT NULL
        AND jsonb_path_exists(i.snapshot,
          '$.hallazgos[*].fotos[*] ? (@.ruta_storage == $ruta)'::jsonpath,
          jsonb_build_object('ruta',p_ruta))
    )
$fn$;
REVOKE ALL ON FUNCTION public.foto_diagnostico_bloqueada(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.foto_diagnostico_bloqueada(text) TO authenticated;

DO $verify$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef('public.emitir_informe_diagnostico(uuid,text,text)'::regprocedure) INTO v_def;
  ASSERT position('SELECT a.* INTO cab_activo' IN v_def)>0
    AND position('diagnostico_tecnico_hallazgo_fotos' IN v_def)>0
    AND position('empresa_config' IN v_def)>0,
    'VERIFY_FAILED: la emisión no carga cabecera, empresa y fotos';
  ASSERT position('diagnostico_tecnico_hallazgo_lineas' IN v_def)>0
    AND position('excluir_del_informe=false' IN v_def)>0,
    'VERIFY_FAILED: faltan líneas por hallazgo o filtro de fotos';
  ASSERT has_function_privilege('authenticated','public.emitir_informe_diagnostico(uuid,text,text)','EXECUTE')
    AND NOT has_function_privilege('anon','public.emitir_informe_diagnostico(uuid,text,text)','EXECUTE')
    AND NOT EXISTS (
      SELECT 1 FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      WHERE p.oid='public.emitir_informe_diagnostico(uuid,text,text)'::regprocedure
        AND a.grantee=0 AND a.privilege_type='EXECUTE'),
    'VERIFY_FAILED: permisos EXECUTE de emitir no coinciden con 595';
  SELECT pg_get_functiondef('public.bloquear_foto_hallazgo_emitido()'::regprocedure) INTO v_def;
  ASSERT position('i.estado=''emitido''' IN v_def)=0,
    'VERIFY_FAILED: el bloqueo de fotos conserva la regla de informe emitido';
  SELECT pg_get_functiondef('public.foto_diagnostico_bloqueada(text)'::regprocedure) INTO v_def;
  ASSERT position('diagnostico_informes' IN v_def)>0
    AND position('jsonb_path_exists' IN v_def)>0,
    'VERIFY_FAILED: el bloqueo Storage no consulta snapshots emitidos';
END
$verify$;

COMMIT;