-- 595: Informe al cliente para Diagnóstico Técnico (fase 4a).
-- Propósito: conservar borradores editables y snapshots inmutables/versionados.
-- Decisiones: requiere diagnostico_tecnico + informe_diagnostico en usuario_puede;
-- un borrador por recepción; snapshot server-side por lista blanca; sin Storage;
-- la conclusión IA se confirma por una persona antes de emitir; cuota IA 20/100.
-- NO COMMIT SIN REVISIÓN. Esta propuesta termina intencionalmente en ROLLBACK.
-- Supuestos verificados en repo: diagnosticos_tecnicos.id/diagnostico_id son
-- text; recepciones_activos_cliente usa id, empresa_id, activo_id, numero,
-- numero_caso y fecha_ingreso; activos usa codigo, nombre, placa_serie y
-- cliente_propietario_id; cuentas usa razon_social; maestros citados abajo
-- exponen id/codigo/nombre y catalogo 592 usa catalogo/codigo/etiqueta.
-- No verificados: horometro de recepcion/activo ni tabla ERP que mapee auth.uid()
-- a emisor y cargo; ambas claves quedan null. numero_caso es entero; el
-- generador 572 compone numero como RAC-AAAA-NNNNN y el snapshot lo conserva.

BEGIN;
SET LOCAL lock_timeout = '5s';

DO $pre$
BEGIN
  ASSERT to_regclass('public.diagnosticos_tecnicos') IS NOT NULL,
    'PRECONDITION_FAILED: falta diagnosticos_tecnicos';
  ASSERT to_regclass('public.recepciones_activos_cliente') IS NOT NULL,
    'PRECONDITION_FAILED: falta recepciones_activos_cliente';
  ASSERT to_regclass('public.diagnostico_tecnico_hallazgos') IS NOT NULL,
    'PRECONDITION_FAILED: falta diagnostico_tecnico_hallazgos';
  ASSERT to_regclass('public.diagnostico_tecnico_hallazgo_mediciones') IS NOT NULL,
    'PRECONDITION_FAILED: falta diagnostico_tecnico_hallazgo_mediciones';
  ASSERT to_regclass('public.diagnostico_tecnico_lineas') IS NOT NULL,
    'PRECONDITION_FAILED: falta diagnostico_tecnico_lineas';
  ASSERT to_regclass('public.diagnostico_tecnico_linea_materiales') IS NOT NULL,
    'PRECONDITION_FAILED: falta diagnostico_tecnico_linea_materiales';
  ASSERT to_regclass('public.diagnostico_catalogo_valores') IS NOT NULL,
    'PRECONDITION_FAILED: falta diagnostico_catalogo_valores';
  ASSERT to_regclass('public.diagnostico_matriz_prioridad') IS NOT NULL,
    'PRECONDITION_FAILED: falta diagnostico_matriz_prioridad';
  ASSERT to_regclass('public.familia_trabajo') IS NOT NULL,
    'PRECONDITION_FAILED: falta familia_trabajo';
  ASSERT to_regclass('public.tipos_servicio_interno') IS NOT NULL,
    'PRECONDITION_FAILED: falta tipos_servicio_interno';
  ASSERT to_regclass('public.cargos_empresa') IS NOT NULL,
    'PRECONDITION_FAILED: falta cargos_empresa';
  ASSERT to_regclass('public.activos') IS NOT NULL,
    'PRECONDITION_FAILED: falta activos';
  ASSERT to_regclass('public.cuentas') IS NOT NULL,
    'PRECONDITION_FAILED: falta cuentas';
  ASSERT to_regclass('public.materiales') IS NOT NULL,
    'PRECONDITION_FAILED: falta materiales';
  ASSERT to_regprocedure('public.audit_backend_minimo()') IS NOT NULL,
    'PRECONDITION_FAILED: falta audit_backend_minimo()';
  ASSERT (SELECT count(*) = 31 FROM information_schema.columns
    WHERE table_schema='public' AND (
      (table_name='recepciones_activos_cliente' AND column_name IN ('id','empresa_id','activo_id','numero','numero_caso','fecha_ingreso')) OR
      (table_name='activos' AND column_name IN ('id','empresa_id','codigo','nombre','placa_serie','cliente_propietario_id')) OR
      (table_name='cuentas' AND column_name IN ('id','empresa_id','razon_social')) OR
      (table_name='familia_trabajo' AND column_name IN ('id','nombre')) OR
      (table_name='tipos_servicio_interno' AND column_name IN ('id','codigo','nombre')) OR
      (table_name='cargos_empresa' AND column_name IN ('id','codigo','nombre')) OR
      (table_name='diagnostico_catalogo_valores' AND column_name IN ('empresa_id','catalogo','codigo','etiqueta'))
      OR (table_name='materiales' AND column_name IN ('id','empresa_id','codigo','descripcion'))
    )), 'PRECONDITION_FAILED: faltan columnas usadas por snapshot/cabecera';
  ASSERT to_regprocedure('public.usuario_puede(text,text,text)') IS NOT NULL,
    'PRECONDITION_FAILED: falta usuario_puede(text,text,text)';
  ASSERT to_regprocedure('public.usuario_tiene_empresa(text)') IS NOT NULL,
    'PRECONDITION_FAILED: falta usuario_tiene_empresa(text)';
  ASSERT to_regprocedure('public.usuario_puede_ver_diagnostico_padre(text,text,text,text)') IS NOT NULL,
    'PRECONDITION_FAILED: falta usuario_puede_ver_diagnostico_padre';
  ASSERT to_regclass('public.diagnostico_informes') IS NULL,
    'PRECONDITION_FAILED: ya existe diagnostico_informes';
  ASSERT to_regclass('public.diagnostico_informe_ia_uso') IS NULL,
    'PRECONDITION_FAILED: ya existe diagnostico_informe_ia_uso';
END
$pre$;

-- No hay catálogo formal de pantallas: informe_diagnostico es el identificador
-- textual usado por usuario_puede. Replica los flags de diagnóstico solo en
-- roles que hoy ya tienen aprobar; no agrega atributos ni altera filas previas.
INSERT INTO public.permisos_roles
  (rol_id, pantalla, puede_ver, puede_crear, puede_editar, puede_anular,
   puede_aprobar, puede_exportar, puede_ver_costos, puede_ver_finanzas)
SELECT base.rol_id, 'informe_diagnostico', base.puede_ver, base.puede_crear,
       base.puede_editar, false, base.puede_aprobar, false, false, false
FROM public.permisos_roles base
WHERE base.pantalla = 'diagnostico_tecnico'
  AND base.puede_aprobar = true
ON CONFLICT (rol_id, pantalla) DO NOTHING;

CREATE TABLE public.diagnostico_informes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id text NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  recepcion_id text NOT NULL REFERENCES public.recepciones_activos_cliente(id) ON DELETE RESTRICT,
  diagnostico_id text NOT NULL REFERENCES public.diagnosticos_tecnicos(id) ON DELETE RESTRICT,
  estado text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','emitido')),
  version integer,
  opciones jsonb NOT NULL DEFAULT '{"conclusion":"","conclusion_origen":"manual","conclusion_confirmada":false,"incluir_mediciones":false,"mostrar_horas":false,"ocultar_conformes":false}'::jsonb,
  snapshot jsonb,
  creado_por uuid NOT NULL DEFAULT auth.uid(),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_por uuid,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  emitido_por uuid,
  emitido_en timestamptz,
  emisor_nombre text,
  emisor_cargo text,
  CONSTRAINT diagnostico_informes_opciones_objeto CHECK (jsonb_typeof(opciones) = 'object'),
  CONSTRAINT diagnostico_informes_opciones_conclusion CHECK (
    coalesce(opciones->>'conclusion_origen','manual') IN ('ia','manual','ia_editada')
    AND jsonb_typeof(coalesce(opciones->'conclusion_confirmada','false'::jsonb)) = 'boolean'
    AND jsonb_typeof(coalesce(opciones->'incluir_mediciones','false'::jsonb)) = 'boolean'
    AND jsonb_typeof(coalesce(opciones->'mostrar_horas','false'::jsonb)) = 'boolean'
    AND jsonb_typeof(coalesce(opciones->'ocultar_conformes','false'::jsonb)) = 'boolean'
  ),
  CONSTRAINT diagnostico_informes_estado_coherente CHECK (
    (estado = 'borrador' AND version IS NULL AND snapshot IS NULL
      AND emitido_por IS NULL AND emitido_en IS NULL)
    OR
    (estado = 'emitido' AND version IS NOT NULL AND version > 0
      AND snapshot IS NOT NULL AND jsonb_typeof(snapshot) = 'object'
      AND emitido_por IS NOT NULL AND emitido_en IS NOT NULL)
  ),
  CONSTRAINT diagnostico_informes_empresa_id_id_key UNIQUE (empresa_id, id)
);

CREATE UNIQUE INDEX diagnostico_informes_un_borrador_recepcion_uidx
  ON public.diagnostico_informes (empresa_id, recepcion_id)
  WHERE estado = 'borrador';
CREATE UNIQUE INDEX diagnostico_informes_version_emitida_uidx
  ON public.diagnostico_informes (empresa_id, recepcion_id, version)
  WHERE estado = 'emitido';
CREATE INDEX diagnostico_informes_empresa_recepcion_idx
  ON public.diagnostico_informes (empresa_id, recepcion_id, creado_en DESC);

-- La tabla interna de autorización enlaza cambios sensibles al xid, usuario e
-- informe, como en 594. No es accesible para roles de aplicación.
CREATE TABLE public.diagnostico_informe_transicion_rpc (
  xid bigint NOT NULL,
  informe_id uuid NOT NULL,
  usuario_id uuid NOT NULL,
  PRIMARY KEY (xid, informe_id, usuario_id)
);
REVOKE ALL ON public.diagnostico_informe_transicion_rpc FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.proteger_diagnostico_informe()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.estado = 'emitido' THEN
      RAISE EXCEPTION 'Un informe emitido es inmutable.' USING ERRCODE='42501';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.empresa_id IS DISTINCT FROM OLD.empresa_id
     OR NEW.recepcion_id IS DISTINCT FROM OLD.recepcion_id
     OR NEW.diagnostico_id IS DISTINCT FROM OLD.diagnostico_id THEN
    RAISE EXCEPTION 'empresa_id, recepcion_id y diagnostico_id son inmutables.' USING ERRCODE='23514';
  END IF;
  IF OLD.estado = 'emitido' THEN
    RAISE EXCEPTION 'Un informe emitido es inmutable.' USING ERRCODE='42501';
  END IF;
  IF NEW.opciones->>'conclusion' IS DISTINCT FROM OLD.opciones->>'conclusion' THEN
    NEW.opciones := jsonb_set(NEW.opciones, '{conclusion_confirmada}', 'false'::jsonb, true);
  END IF;
  IF (NEW.estado IS DISTINCT FROM OLD.estado OR NEW.version IS DISTINCT FROM OLD.version
      OR NEW.snapshot IS DISTINCT FROM OLD.snapshot
      OR NEW.emitido_por IS DISTINCT FROM OLD.emitido_por OR NEW.emitido_en IS DISTINCT FROM OLD.emitido_en
      OR NEW.emisor_nombre IS DISTINCT FROM OLD.emisor_nombre OR NEW.emisor_cargo IS DISTINCT FROM OLD.emisor_cargo)
     AND NOT EXISTS (
       SELECT 1 FROM public.diagnostico_informe_transicion_rpc a
       WHERE a.xid=txid_current() AND a.informe_id=OLD.id AND a.usuario_id=auth.uid()
     ) THEN
    RAISE EXCEPTION 'Estado y snapshot solo pueden cambiar mediante emitir_informe_diagnostico().' USING ERRCODE='42501';
  END IF;
  NEW.actualizado_por := auth.uid();
  NEW.actualizado_en := now();
  RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION public.proteger_diagnostico_informe() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER diagnostico_informes_inmutabilidad
  BEFORE UPDATE OR DELETE ON public.diagnostico_informes
  FOR EACH ROW EXECUTE FUNCTION public.proteger_diagnostico_informe();
CREATE TRIGGER audit_diagnostico_informes
  AFTER INSERT OR UPDATE ON public.diagnostico_informes
  FOR EACH ROW EXECUTE FUNCTION public.audit_backend_minimo();

ALTER TABLE public.diagnostico_informes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.diagnostico_informes FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.diagnostico_informes FROM authenticated;
GRANT SELECT ON public.diagnostico_informes TO authenticated;
GRANT UPDATE (opciones) ON public.diagnostico_informes TO authenticated;
CREATE POLICY diagnostico_informes_select ON public.diagnostico_informes
  FOR SELECT TO authenticated
  USING (public.usuario_tiene_empresa(empresa_id)
    AND public.usuario_puede(empresa_id,'diagnostico_tecnico','ver')
    AND public.usuario_puede(empresa_id,'informe_diagnostico','ver')
    AND EXISTS (SELECT 1 FROM public.diagnosticos_tecnicos d
      WHERE d.id=diagnostico_informes.diagnostico_id AND d.empresa_id=diagnostico_informes.empresa_id
        AND d.recepcion_id=diagnostico_informes.recepcion_id
        AND public.usuario_puede_ver_diagnostico_padre(d.tipo,d.empresa_id,d.recepcion_id,d.oportunidad_id)));
CREATE POLICY diagnostico_informes_update ON public.diagnostico_informes
  FOR UPDATE TO authenticated
  USING (estado='borrador' AND public.usuario_tiene_empresa(empresa_id)
    AND public.usuario_puede(empresa_id,'diagnostico_tecnico','editar')
    AND public.usuario_puede(empresa_id,'informe_diagnostico','editar'))
  WITH CHECK (estado='borrador' AND public.usuario_tiene_empresa(empresa_id)
    AND public.usuario_puede(empresa_id,'diagnostico_tecnico','editar')
    AND public.usuario_puede(empresa_id,'informe_diagnostico','editar')
    AND EXISTS (SELECT 1 FROM public.diagnosticos_tecnicos d
      WHERE d.id=diagnostico_informes.diagnostico_id AND d.empresa_id=diagnostico_informes.empresa_id
        AND d.recepcion_id=diagnostico_informes.recepcion_id
        AND public.usuario_puede_ver_diagnostico_padre(d.tipo,d.empresa_id,d.recepcion_id,d.oportunidad_id)));

CREATE FUNCTION public.obtener_o_crear_borrador_informe(p_recepcion_id text)
RETURNS public.diagnostico_informes
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE v_usuario uuid := auth.uid(); v_empresa text; v_diagnostico text; v_result public.diagnostico_informes%ROWTYPE;
BEGIN
  IF v_usuario IS NULL THEN RAISE EXCEPTION 'Se requiere una sesión autenticada.' USING ERRCODE='42501'; END IF;
  SELECT r.empresa_id INTO v_empresa FROM public.recepciones_activos_cliente r WHERE r.id=p_recepcion_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'La recepción no existe.' USING ERRCODE='P0002'; END IF;
  IF NOT public.usuario_tiene_empresa(v_empresa) THEN RAISE EXCEPTION 'La recepción no pertenece a una empresa accesible.' USING ERRCODE='42501'; END IF;
  IF NOT public.usuario_puede(v_empresa,'diagnostico_tecnico','editar')
     OR NOT public.usuario_puede(v_empresa,'informe_diagnostico','editar') THEN
    RAISE EXCEPTION 'No autorizado para crear o editar el informe.' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('informe:'||v_empresa||':'||p_recepcion_id,0));
  SELECT i.* INTO v_result FROM public.diagnostico_informes i
    WHERE i.empresa_id=v_empresa AND i.recepcion_id=p_recepcion_id AND i.estado='borrador';
  IF FOUND THEN RETURN v_result; END IF;
  SELECT d.id INTO v_diagnostico FROM public.diagnosticos_tecnicos d
    WHERE d.empresa_id=v_empresa AND d.recepcion_id=p_recepcion_id AND d.tipo='mantenimiento'
      AND public.usuario_puede_ver_diagnostico_padre(d.tipo,d.empresa_id,d.recepcion_id,d.oportunidad_id)
    ORDER BY d.created_at DESC, d.id LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'No existe un diagnóstico de mantenimiento para esta recepción.' USING ERRCODE='P0002'; END IF;
  INSERT INTO public.diagnostico_informes(empresa_id,recepcion_id,diagnostico_id,creado_por)
    VALUES (v_empresa,p_recepcion_id,v_diagnostico,v_usuario)
    RETURNING * INTO v_result;
  RETURN v_result;
END
$fn$;
REVOKE ALL ON FUNCTION public.obtener_o_crear_borrador_informe(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obtener_o_crear_borrador_informe(text) TO authenticated;

CREATE FUNCTION public.diagnostico_informe_validar_snapshot(p_snapshot jsonb)
RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $fn$
BEGIN
  IF EXISTS (
    WITH RECURSIVE nodos(valor) AS (
      SELECT p_snapshot
      UNION ALL
      SELECT hijos.valor
      FROM nodos n
      CROSS JOIN LATERAL (
        SELECT e.value AS valor FROM jsonb_each(
          CASE WHEN jsonb_typeof(n.valor)='object' THEN n.valor ELSE '{}'::jsonb END) e
        UNION ALL
        SELECT a.value AS valor FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(n.valor)='array' THEN n.valor ELSE '[]'::jsonb END) a
      ) hijos
    )
    SELECT 1 FROM nodos n
    CROSS JOIN LATERAL jsonb_object_keys(
      CASE WHEN jsonb_typeof(n.valor)='object' THEN n.valor ELSE '{}'::jsonb END) k(clave)
    WHERE k.clave ~* '(costo|precio|tarifa|margen|salario|sueldo)'
  ) THEN
    RAISE EXCEPTION 'El snapshot contiene una clave comercial o salarial.' USING ERRCODE='23514';
  END IF;
END
$fn$;
REVOKE ALL ON FUNCTION public.diagnostico_informe_validar_snapshot(jsonb) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.emitir_informe_diagnostico(
  p_id uuid, p_emisor_nombre text DEFAULT NULL, p_emisor_cargo text DEFAULT NULL
)
RETURNS public.diagnostico_informes
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE
  v_usuario uuid := auth.uid(); v_i public.diagnostico_informes%ROWTYPE; v_d public.diagnosticos_tecnicos%ROWTYPE;
  v_r public.recepciones_activos_cliente%ROWTYPE; v_op jsonb; v_snapshot jsonb; v_version integer;
  v_nombre text; v_cargo text; v_hallazgos jsonb; v_mediciones jsonb; v_lineas jsonb;
  v_resumen jsonb; cab_activo public.activos%ROWTYPE; cab_cliente public.cuentas%ROWTYPE;
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

  -- Snapshot explícito por lista blanca. No copiar filas completas ni campos
  -- comerciales. Referencias de cliente no están verificadas en el esquema.
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

CREATE TABLE public.diagnostico_informe_ia_uso (
  empresa_id text NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  usuario_id uuid NOT NULL,
  dia date NOT NULL,
  conteo integer NOT NULL DEFAULT 0 CHECK (conteo >= 0),
  modelo text,
  tokens_in bigint NOT NULL DEFAULT 0 CHECK (tokens_in >= 0),
  tokens_out bigint NOT NULL DEFAULT 0 CHECK (tokens_out >= 0),
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id,usuario_id,dia)
);
ALTER TABLE public.diagnostico_informe_ia_uso ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.diagnostico_informe_ia_uso FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.consumir_cuota_ia_informe(
  p_empresa_id text, p_limite_usuario integer DEFAULT 20, p_limite_empresa integer DEFAULT 100,
  p_modelo text DEFAULT NULL, p_tokens_in bigint DEFAULT 0, p_tokens_out bigint DEFAULT 0
)
RETURNS TABLE(ok boolean,motivo text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE v_usuario uuid := auth.uid(); v_dia date := (now() AT TIME ZONE 'UTC')::date;
  v_usuario_count integer; v_empresa_count bigint;
BEGIN
  IF v_usuario IS NULL THEN RAISE EXCEPTION 'Se requiere una sesión autenticada.' USING ERRCODE='42501'; END IF;
  IF p_limite_usuario < 1 OR p_limite_empresa < 1 OR p_tokens_in < 0 OR p_tokens_out < 0 THEN
    RAISE EXCEPTION 'Límites o tokens inválidos.' USING ERRCODE='22023';
  END IF;
  -- Los parámetros permiten reducir límites en entornos de prueba, nunca elevar
  -- los máximos productivos decididos para esta fase.
  p_limite_usuario := least(p_limite_usuario,20);
  p_limite_empresa := least(p_limite_empresa,100);
  IF NOT public.usuario_tiene_empresa(p_empresa_id)
     OR NOT public.usuario_puede(p_empresa_id,'diagnostico_tecnico','editar')
     OR NOT public.usuario_puede(p_empresa_id,'informe_diagnostico','editar') THEN
    RAISE EXCEPTION 'No autorizado para consumir cuota de informe.' USING ERRCODE='42501';
  END IF;
  -- Serializa por empresa/día para que los límites de usuario y empresa sean atómicos.
  PERFORM pg_advisory_xact_lock(hashtextextended('informe-ia:'||p_empresa_id||':'||v_dia::text,0));
  SELECT coalesce(u.conteo,0) INTO v_usuario_count FROM public.diagnostico_informe_ia_uso u
    WHERE u.empresa_id=p_empresa_id AND u.usuario_id=v_usuario AND u.dia=v_dia;
  v_usuario_count := coalesce(v_usuario_count,0);
  SELECT coalesce(sum(u.conteo),0) INTO v_empresa_count FROM public.diagnostico_informe_ia_uso u
    WHERE u.empresa_id=p_empresa_id AND u.dia=v_dia;
  IF v_usuario_count >= p_limite_usuario THEN RETURN QUERY SELECT false,'limite_usuario'; RETURN; END IF;
  IF v_empresa_count >= p_limite_empresa THEN RETURN QUERY SELECT false,'limite_empresa'; RETURN; END IF;
  INSERT INTO public.diagnostico_informe_ia_uso
    (empresa_id,usuario_id,dia,conteo,modelo,tokens_in,tokens_out,actualizado_en)
  VALUES (p_empresa_id,v_usuario,v_dia,1,p_modelo,coalesce(p_tokens_in,0),coalesce(p_tokens_out,0),now())
  ON CONFLICT (empresa_id,usuario_id,dia) DO UPDATE SET
    conteo=public.diagnostico_informe_ia_uso.conteo+1,
    modelo=coalesce(EXCLUDED.modelo,public.diagnostico_informe_ia_uso.modelo),
    tokens_in=public.diagnostico_informe_ia_uso.tokens_in+EXCLUDED.tokens_in,
    tokens_out=public.diagnostico_informe_ia_uso.tokens_out+EXCLUDED.tokens_out,
    actualizado_en=now();
  RETURN QUERY SELECT true,'ok';
END
$fn$;
REVOKE ALL ON FUNCTION public.consumir_cuota_ia_informe(text,integer,integer,text,bigint,bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consumir_cuota_ia_informe(text,integer,integer,text,bigint,bigint) TO authenticated;

-- Pruebas reales sin fixtures; las integraciones con filas siguen en VERIFICAR MANUAL.
DO $tests$
DECLARE v_def text; v_rechazado boolean := false;
BEGIN
  ASSERT (SELECT count(*)=1 FROM pg_indexes WHERE schemaname='public'
    AND indexname='diagnostico_informes_un_borrador_recepcion_uidx'),
    'TEST_FAILED: falta índice único parcial de borrador';
  ASSERT (SELECT count(*)=1 FROM pg_indexes WHERE schemaname='public'
    AND indexname='diagnostico_informes_version_emitida_uidx'),
    'TEST_FAILED: falta índice único de versiones emitidas';
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid='public.diagnostico_informes'::regclass),
    'TEST_FAILED: RLS no está habilitado';
  ASSERT NOT has_table_privilege('authenticated','public.diagnostico_informes','DELETE'),
    'TEST_FAILED: authenticated conserva DELETE directo';
  ASSERT NOT has_table_privilege('authenticated','public.diagnostico_informes','UPDATE'),
    'TEST_FAILED: authenticated conserva UPDATE de tabla completo';
  ASSERT NOT has_table_privilege('authenticated','public.diagnostico_informes','INSERT'),
    'TEST_FAILED: authenticated conserva INSERT directo';
  SELECT pg_get_functiondef('public.emitir_informe_diagnostico(uuid,text,text)'::regprocedure) INTO v_def;
  ASSERT position('diagnostico_tecnico' IN v_def)>0 AND position('informe_diagnostico' IN v_def)>0,
    'TEST_FAILED: el RPC no comprueba ambos permisos';
  ASSERT position('conclusion_confirmada' IN v_def)>0 AND position('diagnosticos_tecnicos' IN v_def)>0,
    'TEST_FAILED: faltan validaciones de conclusión/diagnóstico emitido';
  ASSERT position('jsonb_build_object' IN v_def)>0 AND position('snapshot' IN v_def)>0,
    'TEST_FAILED: no se construye snapshot en servidor';
  BEGIN
    PERFORM public.diagnostico_informe_validar_snapshot('{"cabecera":{"lineas":[{"costo_estimado":12}]}}'::jsonb);
  EXCEPTION WHEN check_violation THEN
    v_rechazado := true;
  END;
  ASSERT v_rechazado, 'TEST_FAILED: la guardia no rechazó una clave costo anidada';
  PERFORM public.diagnostico_informe_validar_snapshot('{"cabecera":{"activo_nombre":"Bomba"},"hallazgos":[]}'::jsonb);
  ASSERT position('limite_usuario' IN pg_get_functiondef(
    'public.consumir_cuota_ia_informe(text,integer,integer,text,bigint,bigint)'::regprocedure))>0
    AND position('limite_empresa' IN pg_get_functiondef(
    'public.consumir_cuota_ia_informe(text,integer,integer,text,bigint,bigint)'::regprocedure))>0,
    'TEST_FAILED: RPC de cuota no rechaza límites';
END
$tests$;

-- VERIFICAR MANUAL en base efímera con fixtures y roles del despliegue:
-- 1) RPC SECURITY DEFINER crear borrador con RLS activo, repetir devuelve el mismo id;
-- 2) usuario sin aprobar en cualquier pantalla no puede emitir;
-- 3) editar conclusion pone conclusion_confirmada=false; confirmarla requiere UPDATE posterior;
-- 4) cambiar conclusión IA exige conclusion_origen='ia_editada'; CHECK permite ia/manual/ia_editada;
-- 5) PDF/snapshot refleja etiquetas congeladas de familia, tarea, actividad, cargo, activo, material y catálogos;
-- 6) cabecera muestra numero RAC, equipo, cliente, serie y fecha_ingreso; horometro queda null;
-- 7) emisor vacío falla; UPDATE/DELETE de emitido fallan; una nueva emisión genera version=max+1;
-- 8) cuota rechaza llamada 21 del usuario y 101 de empresa sin guardar texto diagnóstico/conclusión.

ROLLBACK;
