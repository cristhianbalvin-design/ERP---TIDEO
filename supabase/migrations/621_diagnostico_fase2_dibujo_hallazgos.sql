-- Fase 2 del catálogo: componentes en activos/hallazgos, zonas y medidas ligadas.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $pre$
BEGIN
  ASSERT to_regclass('public.activos') IS NOT NULL AND to_regclass('public.catalogo_componentes') IS NOT NULL,
    'PRECONDITION_FAILED: faltan activos o catálogo de componentes';
  ASSERT to_regclass('public.diagnostico_tecnico_hallazgos') IS NOT NULL
    AND to_regclass('public.diagnostico_tecnico_hallazgo_mediciones') IS NOT NULL,
    'PRECONDITION_FAILED: faltan tablas de hallazgos o mediciones';
  ASSERT to_regprocedure('public.inicializar_catalogos_diagnostico(text)') IS NOT NULL,
    'PRECONDITION_FAILED: falta inicializar_catalogos_diagnostico(text)';
END $pre$;

ALTER TABLE public.activos ADD COLUMN IF NOT EXISTS componente_catalogo_id text NULL REFERENCES public.catalogo_componentes(id) ON DELETE SET NULL;
ALTER TABLE public.diagnostico_tecnico_hallazgos ADD COLUMN IF NOT EXISTS componente_catalogo_id text NULL REFERENCES public.catalogo_componentes(id) ON DELETE SET NULL;
ALTER TABLE public.diagnostico_tecnico_hallazgo_mediciones ADD COLUMN IF NOT EXISTS zona_id text NULL;
ALTER TABLE public.diagnostico_tecnico_hallazgo_mediciones ADD COLUMN IF NOT EXISTS medida_id text NULL;
ALTER TABLE public.diagnostico_tecnico_hallazgo_mediciones ADD COLUMN IF NOT EXISTS cota text NULL;

CREATE OR REPLACE FUNCTION public.asignar_componente_catalogo_activo(p_empresa_id text, p_activo_id text, p_componente_id text)
RETURNS public.activos LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE v_activo public.activos%ROWTYPE;
BEGIN
  IF NOT public.usuario_tiene_empresa(p_empresa_id) OR NOT public.usuario_puede(p_empresa_id,'recepcion_activos_cliente','editar') THEN
    RAISE EXCEPTION 'No tienes permiso para editar activos de recepción.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_activo FROM public.activos WHERE id=p_activo_id AND empresa_id=p_empresa_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El activo no existe en esta empresa.' USING ERRCODE='P0002'; END IF;
  IF p_componente_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.catalogo_componentes WHERE id=p_componente_id) THEN
    RAISE EXCEPTION 'El componente de catálogo no existe.' USING ERRCODE='23503';
  END IF;
  UPDATE public.activos SET componente_catalogo_id=p_componente_id WHERE id=p_activo_id AND empresa_id=p_empresa_id RETURNING * INTO v_activo;
  RETURN v_activo;
END $fn$;
REVOKE ALL ON FUNCTION public.asignar_componente_catalogo_activo(text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.asignar_componente_catalogo_activo(text,text,text) TO authenticated;

CREATE TABLE IF NOT EXISTS public.diagnostico_tecnico_hallazgo_zonas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id text NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  hallazgo_id uuid NOT NULL REFERENCES public.diagnostico_tecnico_hallazgos(id) ON DELETE CASCADE,
  componente_id text NOT NULL,
  zona_id text NOT NULL,
  orden smallint NOT NULL,
  nota text NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (componente_id,zona_id) REFERENCES public.catalogo_componente_zonas(componente_id,id) ON DELETE RESTRICT,
  UNIQUE (hallazgo_id,zona_id), UNIQUE (empresa_id,id)
);

CREATE OR REPLACE FUNCTION public.validar_hallazgo_zona_dibujo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE v_componente text; v_estado text; v_empresa text;
BEGIN
  IF TG_OP='DELETE' THEN
    SELECT h.componente_catalogo_id,d.estado,h.empresa_id INTO v_componente,v_estado,v_empresa FROM public.diagnostico_tecnico_hallazgos h JOIN public.diagnosticos_tecnicos d ON d.id=h.diagnostico_id AND d.empresa_id=h.empresa_id WHERE h.id=OLD.hallazgo_id FOR SHARE OF h,d;
  ELSE
    SELECT h.componente_catalogo_id,d.estado,h.empresa_id INTO v_componente,v_estado,v_empresa FROM public.diagnostico_tecnico_hallazgos h JOIN public.diagnosticos_tecnicos d ON d.id=h.diagnostico_id AND d.empresa_id=h.empresa_id WHERE h.id=NEW.hallazgo_id FOR SHARE OF h,d;
    IF NOT FOUND OR v_empresa IS DISTINCT FROM NEW.empresa_id THEN RAISE EXCEPTION 'La zona y el hallazgo deben pertenecer a la misma empresa.' USING ERRCODE='23514'; END IF;
    IF NEW.componente_id IS DISTINCT FROM v_componente THEN RAISE EXCEPTION 'La zona debe pertenecer al componente fijado en el hallazgo.' USING ERRCODE='23514'; END IF;
    IF TG_OP='UPDATE' AND (NEW.empresa_id IS DISTINCT FROM OLD.empresa_id OR NEW.hallazgo_id IS DISTINCT FROM OLD.hallazgo_id) THEN RAISE EXCEPTION 'empresa_id y hallazgo_id son inmutables.' USING ERRCODE='23514'; END IF;
  END IF;
  IF v_estado='emitido' THEN RAISE EXCEPTION 'No se pueden cambiar zonas de un diagnóstico emitido.' USING ERRCODE='42501'; END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $fn$;
DROP TRIGGER IF EXISTS diagnostico_hallazgo_zonas_validar ON public.diagnostico_tecnico_hallazgo_zonas;
CREATE TRIGGER diagnostico_hallazgo_zonas_validar BEFORE INSERT OR UPDATE OR DELETE ON public.diagnostico_tecnico_hallazgo_zonas FOR EACH ROW EXECUTE FUNCTION public.validar_hallazgo_zona_dibujo();
REVOKE ALL ON FUNCTION public.validar_hallazgo_zona_dibujo() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.reemplazar_zonas_hallazgo_diagnostico(p_empresa_id text,p_hallazgo_id uuid,p_componente_id text,p_zonas jsonb)
RETURNS SETOF public.diagnostico_tecnico_hallazgo_zonas LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE v_estado text; v_componente text;
BEGIN
  IF NOT public.usuario_tiene_empresa(p_empresa_id) OR NOT public.usuario_puede(p_empresa_id,'diagnostico_tecnico','editar') THEN RAISE EXCEPTION 'No tienes permiso para editar el diagnóstico.' USING ERRCODE='42501'; END IF;
  SELECT d.estado,h.componente_catalogo_id INTO v_estado,v_componente FROM public.diagnostico_tecnico_hallazgos h JOIN public.diagnosticos_tecnicos d ON d.id=h.diagnostico_id AND d.empresa_id=h.empresa_id WHERE h.id=p_hallazgo_id AND h.empresa_id=p_empresa_id FOR UPDATE OF h,d;
  IF NOT FOUND THEN RAISE EXCEPTION 'El hallazgo no existe en esta empresa.' USING ERRCODE='P0002'; END IF;
  IF v_estado<>'borrador' THEN RAISE EXCEPTION 'No se pueden cambiar zonas de un diagnóstico emitido.' USING ERRCODE='42501'; END IF;
  IF v_componente IS DISTINCT FROM p_componente_id THEN RAISE EXCEPTION 'El componente no coincide con el hallazgo.' USING ERRCODE='23514'; END IF;
  IF jsonb_typeof(coalesce(p_zonas,'[]'::jsonb))<>'array' THEN RAISE EXCEPTION 'Las zonas deben enviarse como una lista.' USING ERRCODE='22023'; END IF;
  DELETE FROM public.diagnostico_tecnico_hallazgo_zonas WHERE empresa_id=p_empresa_id AND hallazgo_id=p_hallazgo_id;
  RETURN QUERY INSERT INTO public.diagnostico_tecnico_hallazgo_zonas(empresa_id,hallazgo_id,componente_id,zona_id,orden,nota)
    SELECT p_empresa_id,p_hallazgo_id,p_componente_id,x.zona_id,x.orden,x.nota FROM jsonb_to_recordset(coalesce(p_zonas,'[]'::jsonb)) AS x(zona_id text,orden smallint,nota text) ORDER BY x.orden RETURNING *;
END $fn$;
REVOKE ALL ON FUNCTION public.reemplazar_zonas_hallazgo_diagnostico(text,uuid,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reemplazar_zonas_hallazgo_diagnostico(text,uuid,text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.validar_medicion_dibujo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE v_componente text; v_empresa text; v_diagnostico text; v_estado text; v_sociedad uuid; v_nombre text;
BEGIN
  SELECT h.componente_catalogo_id,h.empresa_id,h.diagnostico_id,d.estado,r.sociedad_id INTO v_componente,v_empresa,v_diagnostico,v_estado,v_sociedad
    FROM public.diagnostico_tecnico_hallazgos h JOIN public.diagnosticos_tecnicos d ON d.id=h.diagnostico_id AND d.empresa_id=h.empresa_id
    LEFT JOIN public.recepciones_activos_cliente r ON r.id=d.recepcion_id AND r.empresa_id=d.empresa_id
    WHERE h.id=NEW.hallazgo_id FOR SHARE OF h,d;
  IF NOT FOUND OR v_empresa IS DISTINCT FROM NEW.empresa_id THEN RAISE EXCEPTION 'La medición y el hallazgo deben pertenecer a la misma empresa.' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND (NEW.empresa_id IS DISTINCT FROM OLD.empresa_id OR NEW.hallazgo_id IS DISTINCT FROM OLD.hallazgo_id) THEN RAISE EXCEPTION 'empresa_id y hallazgo_id son inmutables.' USING ERRCODE='23514'; END IF;
  IF v_estado='emitido' THEN RAISE EXCEPTION 'No se puede modificar una medición de diagnóstico emitido.' USING ERRCODE='42501'; END IF;
  IF NEW.medida_id IS NOT NULL THEN
    IF v_componente IS NULL OR NEW.zona_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.diagnostico_tecnico_hallazgo_zonas z WHERE z.hallazgo_id=NEW.hallazgo_id AND z.empresa_id=NEW.empresa_id AND z.componente_id=v_componente AND z.zona_id=NEW.zona_id) THEN
      RAISE EXCEPTION 'La medida debe corresponder a una zona fijada del componente del hallazgo.' USING ERRCODE='23514';
    END IF;
    SELECT coalesce(o.nombre,m.nombre) INTO v_nombre FROM public.catalogo_componente_medidas m LEFT JOIN public.catalogo_componente_medidas_overrides o
      ON o.empresa_id=NEW.empresa_id AND o.sociedad_id IS NOT DISTINCT FROM v_sociedad AND o.componente_id=m.componente_id AND o.zona_id=m.zona_id AND o.medida_id=m.id
      WHERE m.componente_id=v_componente AND m.zona_id=NEW.zona_id AND m.id=NEW.medida_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'La medida no existe para esa zona y componente.' USING ERRCODE='23514'; END IF;
    NEW.parametro:=v_nombre;
    NEW.cota := (SELECT coalesce(o.cota,m.cota) FROM public.catalogo_componente_medidas m LEFT JOIN public.catalogo_componente_medidas_overrides o
      ON o.empresa_id=NEW.empresa_id AND o.sociedad_id IS NOT DISTINCT FROM v_sociedad AND o.componente_id=m.componente_id AND o.zona_id=m.zona_id AND o.medida_id=m.id
      WHERE m.componente_id=v_componente AND m.zona_id=NEW.zona_id AND m.id=NEW.medida_id);
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS diagnostico_medicion_dibujo_validar ON public.diagnostico_tecnico_hallazgo_mediciones;
CREATE TRIGGER diagnostico_medicion_dibujo_validar BEFORE INSERT OR UPDATE ON public.diagnostico_tecnico_hallazgo_mediciones FOR EACH ROW EXECUTE FUNCTION public.validar_medicion_dibujo();
REVOKE ALL ON FUNCTION public.validar_medicion_dibujo() FROM PUBLIC,anon,authenticated;
CREATE UNIQUE INDEX IF NOT EXISTS diagnostico_medicion_dibujo_uq ON public.diagnostico_tecnico_hallazgo_mediciones(hallazgo_id,zona_id,medida_id) WHERE medida_id IS NOT NULL;

ALTER TABLE public.diagnostico_tecnico_hallazgo_zonas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS diagnostico_hallazgo_zonas_select ON public.diagnostico_tecnico_hallazgo_zonas;
DROP POLICY IF EXISTS diagnostico_hallazgo_zonas_insert ON public.diagnostico_tecnico_hallazgo_zonas;
DROP POLICY IF EXISTS diagnostico_hallazgo_zonas_update ON public.diagnostico_tecnico_hallazgo_zonas;
DROP POLICY IF EXISTS diagnostico_hallazgo_zonas_delete ON public.diagnostico_tecnico_hallazgo_zonas;
CREATE POLICY diagnostico_hallazgo_zonas_select ON public.diagnostico_tecnico_hallazgo_zonas FOR SELECT TO authenticated USING (public.usuario_tiene_empresa(empresa_id) AND public.usuario_puede(empresa_id,'diagnostico_tecnico','ver'));
CREATE POLICY diagnostico_hallazgo_zonas_insert ON public.diagnostico_tecnico_hallazgo_zonas FOR INSERT TO authenticated WITH CHECK (public.usuario_tiene_empresa(public.diagnostico_tecnico_hallazgo_zonas.empresa_id) AND public.usuario_puede(public.diagnostico_tecnico_hallazgo_zonas.empresa_id,'diagnostico_tecnico','editar') AND EXISTS (SELECT 1 FROM public.diagnostico_tecnico_hallazgos h JOIN public.diagnosticos_tecnicos d ON d.id=h.diagnostico_id AND d.empresa_id=h.empresa_id WHERE h.id=public.diagnostico_tecnico_hallazgo_zonas.hallazgo_id AND h.empresa_id=public.diagnostico_tecnico_hallazgo_zonas.empresa_id AND d.estado='borrador'));
CREATE POLICY diagnostico_hallazgo_zonas_update ON public.diagnostico_tecnico_hallazgo_zonas FOR UPDATE TO authenticated USING (public.usuario_tiene_empresa(public.diagnostico_tecnico_hallazgo_zonas.empresa_id) AND public.usuario_puede(public.diagnostico_tecnico_hallazgo_zonas.empresa_id,'diagnostico_tecnico','editar') AND EXISTS (SELECT 1 FROM public.diagnostico_tecnico_hallazgos h JOIN public.diagnosticos_tecnicos d ON d.id=h.diagnostico_id AND d.empresa_id=h.empresa_id WHERE h.id=public.diagnostico_tecnico_hallazgo_zonas.hallazgo_id AND h.empresa_id=public.diagnostico_tecnico_hallazgo_zonas.empresa_id AND d.estado='borrador')) WITH CHECK (public.usuario_tiene_empresa(public.diagnostico_tecnico_hallazgo_zonas.empresa_id) AND public.usuario_puede(public.diagnostico_tecnico_hallazgo_zonas.empresa_id,'diagnostico_tecnico','editar') AND EXISTS (SELECT 1 FROM public.diagnostico_tecnico_hallazgos h JOIN public.diagnosticos_tecnicos d ON d.id=h.diagnostico_id AND d.empresa_id=h.empresa_id WHERE h.id=public.diagnostico_tecnico_hallazgo_zonas.hallazgo_id AND h.empresa_id=public.diagnostico_tecnico_hallazgo_zonas.empresa_id AND d.estado='borrador'));
CREATE POLICY diagnostico_hallazgo_zonas_delete ON public.diagnostico_tecnico_hallazgo_zonas FOR DELETE TO authenticated USING (public.usuario_tiene_empresa(public.diagnostico_tecnico_hallazgo_zonas.empresa_id) AND public.usuario_puede(public.diagnostico_tecnico_hallazgo_zonas.empresa_id,'diagnostico_tecnico','editar') AND EXISTS (SELECT 1 FROM public.diagnostico_tecnico_hallazgos h JOIN public.diagnosticos_tecnicos d ON d.id=h.diagnostico_id AND d.empresa_id=h.empresa_id WHERE h.id=public.diagnostico_tecnico_hallazgo_zonas.hallazgo_id AND h.empresa_id=public.diagnostico_tecnico_hallazgo_zonas.empresa_id AND d.estado='borrador'));
REVOKE ALL ON public.diagnostico_tecnico_hallazgo_zonas FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.diagnostico_tecnico_hallazgo_zonas TO authenticated;

CREATE OR REPLACE FUNCTION public.validar_hallazgo_componente_catalogo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
BEGIN
  IF NEW.componente_catalogo_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.catalogo_componentes WHERE id=NEW.componente_catalogo_id) THEN
    RAISE EXCEPTION 'El componente de catálogo no existe.' USING ERRCODE='23503';
  END IF;
  IF NEW.componente_catalogo_id IS NOT NULL THEN SELECT nombre INTO NEW.componente_parte FROM public.catalogo_componentes WHERE id=NEW.componente_catalogo_id; END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS diagnostico_hallazgo_componente_catalogo ON public.diagnostico_tecnico_hallazgos;
CREATE TRIGGER diagnostico_hallazgo_componente_catalogo BEFORE INSERT OR UPDATE OF componente_catalogo_id,componente_parte ON public.diagnostico_tecnico_hallazgos FOR EACH ROW EXECUTE FUNCTION public.validar_hallazgo_componente_catalogo();
REVOKE ALL ON FUNCTION public.validar_hallazgo_componente_catalogo() FROM PUBLIC,anon,authenticated;

-- Nuevos 34 tipos por defecto; se conservan intactos los 13 códigos anteriores.
INSERT INTO public.diagnostico_catalogo_defaults(catalogo,codigo,etiqueta,orden) VALUES
('tipo_dano','desgaste_abrasivo','desgaste abrasivo',140),('tipo_dano','desgaste_adhesivo','desgaste adhesivo (agarrotamiento)',150),('tipo_dano','erosion','erosión',160),('tipo_dano','cavitacion','cavitación',170),('tipo_dano','fretting','desgaste por fricción (fretting)',180),('tipo_dano','descascarado','descascarado (spalling)',190),('tipo_dano','estrias','marcas o estrías',200),('tipo_dano','oxidacion','oxidación',210),('tipo_dano','quemado','quemado o decoloración por calor',220),('tipo_dano','ovalizacion','ovalización',230),('tipo_dano','conicidad','conicidad',240),('tipo_dano','excentricidad','excentricidad o descentrado',250),('tipo_dano','curvatura','curvatura o pandeo',260),('tipo_dano','torsion','torsión',270),('tipo_dano','alabeo','alabeo',280),('tipo_dano','fatiga','fatiga del material',290),('tipo_dano','porosidad','porosidad',300),('tipo_dano','soldadura_defectuosa','soldadura defectuosa',310),('tipo_dano','reparacion_previa','reparación previa deficiente',320),('tipo_dano','rosca_danada','rosca dañada',330),('tipo_dano','rosca_barrida','rosca barrida',340),('tipo_dano','chavetero_danado','chavetero deformado o dañado',350),('tipo_dano','pernos_flojos','pernos flojos o faltantes',360),('tipo_dano','sello_danado','sello dañado o extruido',370),('tipo_dano','fuga_interna','fuga interna',380),('tipo_dano','aceite_degradado','aceite degradado',390),('tipo_dano','juego_axial','juego axial excesivo',400),('tipo_dano','rodamiento_danado','rodamiento dañado',410),('tipo_dano','diente_roto','diente roto o astillado',420),('tipo_dano','desalineacion','desalineación',430),('tipo_dano','atascamiento','atascamiento o bloqueo',440),('tipo_dano','falta_lubricacion','falta de lubricación',450),('tipo_dano','ruido_vibracion','ruido o vibración anormal',460),('tipo_dano','pieza_faltante','pieza faltante',470)
ON CONFLICT(catalogo,codigo) DO NOTHING;
INSERT INTO public.diagnostico_catalogo_valores(empresa_id,catalogo,codigo,etiqueta,orden,activo,default_id)
SELECT e.id,d.catalogo,d.codigo,d.etiqueta,d.orden,d.activo,d.id FROM public.empresas e CROSS JOIN public.diagnostico_catalogo_defaults d WHERE d.catalogo='tipo_dano' AND d.orden>=140
ON CONFLICT(empresa_id,catalogo,codigo) DO NOTHING;

CREATE OR REPLACE FUNCTION public.inicializar_catalogos_diagnostico(p_empresa_id text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE v_insertados integer;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.empresas WHERE id=p_empresa_id) THEN RAISE EXCEPTION 'Empresa inexistente' USING ERRCODE='22023'; END IF;
  IF auth.uid() IS NOT NULL AND NOT(public.usuario_es_superadmin_plataforma() OR public.usuario_puede(p_empresa_id,'maestros','editar')) THEN RAISE EXCEPTION 'No autorizado para inicializar catálogos' USING ERRCODE='42501'; END IF;
  INSERT INTO public.diagnostico_catalogo_valores(empresa_id,catalogo,codigo,etiqueta,orden,activo,default_id) SELECT p_empresa_id,d.catalogo,d.codigo,d.etiqueta,d.orden,d.activo,d.id FROM public.diagnostico_catalogo_defaults d ON CONFLICT(empresa_id,catalogo,codigo) DO NOTHING;
  GET DIAGNOSTICS v_insertados=ROW_COUNT; RETURN v_insertados;
END $fn$;
REVOKE ALL ON FUNCTION public.inicializar_catalogos_diagnostico(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.inicializar_catalogos_diagnostico(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.crear_tipo_dano_diagnostico(p_empresa_id text,p_etiqueta text)
RETURNS public.diagnostico_catalogo_valores LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE v_etiqueta text; v_norm text; v_codigo text; v_row public.diagnostico_catalogo_valores%ROWTYPE; v_base text;
BEGIN
  IF NOT public.usuario_tiene_empresa(p_empresa_id) OR NOT public.usuario_puede(p_empresa_id,'maestros','editar') THEN RAISE EXCEPTION 'Se requiere permiso de edición de Maestros.' USING ERRCODE='42501'; END IF;
  v_etiqueta:=lower(left(regexp_replace(btrim(coalesce(p_etiqueta,'')),'\s+',' ','g'),1))||substr(regexp_replace(btrim(coalesce(p_etiqueta,'')),'\s+',' ','g'),2);
  IF v_etiqueta='' OR char_length(v_etiqueta)>60 THEN RAISE EXCEPTION 'El tipo de daño debe tener entre 1 y 60 caracteres.' USING ERRCODE='22023'; END IF;
  v_norm:=lower(translate(v_etiqueta,'áéíóúüñ','aeiouun'));
  SELECT * INTO v_row FROM public.diagnostico_catalogo_valores WHERE empresa_id=p_empresa_id AND catalogo='tipo_dano' AND lower(translate(etiqueta,'áéíóúüñ','aeiouun'))=v_norm LIMIT 1;
  IF FOUND THEN RETURN v_row; END IF;
  v_base:=trim(both '_' from regexp_replace(v_norm,'[^a-z0-9]+','_','g')); IF v_base='' THEN v_base:='tipo'; END IF;
  v_codigo:='x_'||left(v_base,48); WHILE EXISTS(SELECT 1 FROM public.diagnostico_catalogo_valores WHERE empresa_id=p_empresa_id AND catalogo='tipo_dano' AND codigo=v_codigo) LOOP v_codigo:='x_'||left(v_base,40)||'_'||substr(replace(gen_random_uuid()::text,'-',''),1,7); END LOOP;
  INSERT INTO public.diagnostico_catalogo_valores(empresa_id,catalogo,codigo,etiqueta,orden,activo) SELECT p_empresa_id,'tipo_dano',v_codigo,v_etiqueta,coalesce(max(orden),0)+10,true FROM public.diagnostico_catalogo_valores WHERE empresa_id=p_empresa_id AND catalogo='tipo_dano' RETURNING * INTO v_row;
  RETURN v_row;
END $fn$;
REVOKE ALL ON FUNCTION public.crear_tipo_dano_diagnostico(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.crear_tipo_dano_diagnostico(text,text) TO authenticated;

-- Se inserta el bloque del dibujo en el snapshot creado por 597 antes de congelarlo.
CREATE OR REPLACE FUNCTION public.diagnostico_informe_agregar_dibujos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE v_sociedad uuid; v_h jsonb; v_item jsonb; v_new jsonb:='[]'::jsonb; v_med_new jsonb:='[]'::jsonb; v_dibujo jsonb; v_id uuid;
BEGIN
  IF OLD.estado='borrador' AND NEW.estado='emitido' AND NEW.snapshot IS NOT NULL THEN
    SELECT sociedad_id INTO v_sociedad FROM public.recepciones_activos_cliente WHERE id=NEW.recepcion_id AND empresa_id=NEW.empresa_id;
    FOR v_h IN SELECT value FROM jsonb_array_elements(NEW.snapshot->'hallazgos') LOOP
      v_id:=(v_h->>'hallazgo_id')::uuid;
      SELECT CASE WHEN h.componente_catalogo_id IS NULL THEN NULL ELSE jsonb_build_object(
        'componente_id',c.id,'componente_nombre',c.nombre,'svg',regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(c.svg,'<script[^>]*>.*?</script[[:space:]]*>','','gi'),'<foreignObject[^>]*>.*?</foreignObject[[:space:]]*>','','gi'),'[[:space:]]+on[a-zA-Z]+[[:space:]]*=[[:space:]]*("[^"]*"|''[^'']*''|[^[:space:]>]+)','','gi'),'[[:space:]]+(xlink:)?href[[:space:]]*=[[:space:]]*("([a-zA-Z][a-zA-Z0-9.+-]*:|//)[^"]*"|''([a-zA-Z][a-zA-Z0-9.+-]*:|//)[^'']*''|([a-zA-Z][a-zA-Z0-9.+-]*:|//)[^[:space:]>]+)','','gi'),'[[:space:]]+style[[:space:]]*=[[:space:]]*("[^"]*url[^"]*"|''[^'']*url[^'']*''|[^[:space:]>]*url[^[:space:]>]*)','','gi'),
        'zonas',coalesce((SELECT jsonb_agg(jsonb_build_object('zona_id',hz.zona_id,'nombre',z.nombre,'orden',hz.orden,'nota',hz.nota) ORDER BY hz.orden) FROM public.diagnostico_tecnico_hallazgo_zonas hz JOIN public.catalogo_componente_zonas z ON z.componente_id=hz.componente_id AND z.id=hz.zona_id WHERE hz.hallazgo_id=h.id),'[]'::jsonb),
        'medidas',coalesce((SELECT jsonb_agg(jsonb_build_object('zona_id',m.zona_id,'medida_id',m.medida_id,'cota',coalesce(ov.cota,cm.cota,m.cota),'nombre',coalesce(ov.nombre,cm.nombre,m.parametro),'unidad','mm','nominal',m.nominal,'minimo',m.minimo,'maximo',m.maximo,'medido',m.medido,'resultado',m.resultado_calculado) ORDER BY m.zona_id,m.parametro) FROM public.diagnostico_tecnico_hallazgo_mediciones m LEFT JOIN public.catalogo_componente_medidas cm ON cm.componente_id=h.componente_catalogo_id AND cm.zona_id=m.zona_id AND cm.id=m.medida_id LEFT JOIN public.catalogo_componente_medidas_overrides ov ON ov.empresa_id=m.empresa_id AND ov.sociedad_id IS NOT DISTINCT FROM v_sociedad AND ov.componente_id=cm.componente_id AND ov.zona_id=cm.zona_id AND ov.medida_id=cm.id WHERE m.hallazgo_id=h.id AND m.medida_id IS NOT NULL),'[]'::jsonb)) END INTO v_dibujo
        FROM public.diagnostico_tecnico_hallazgos h LEFT JOIN public.catalogo_componentes c ON c.id=h.componente_catalogo_id WHERE h.id=v_id;
      IF v_dibujo IS NOT NULL THEN v_h:=jsonb_set(v_h,'{componente_parte}',v_dibujo->'componente_nombre',true)||jsonb_build_object('dibujo',v_dibujo); END IF;
      v_new:=v_new||jsonb_build_array(v_h);
    END LOOP;
    NEW.snapshot:=jsonb_set(NEW.snapshot,'{hallazgos}',v_new,true);
    FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(NEW.snapshot->'mediciones','[]'::jsonb)) LOOP
      IF NOT EXISTS (SELECT 1 FROM public.diagnostico_tecnico_hallazgo_mediciones m WHERE m.empresa_id=NEW.empresa_id AND m.hallazgo_id=(v_item->>'hallazgo_id')::uuid AND m.medida_id IS NOT NULL AND m.parametro IS NOT DISTINCT FROM v_item->>'parametro' AND m.nominal IS NOT DISTINCT FROM nullif(v_item->>'nominal','')::numeric AND m.minimo IS NOT DISTINCT FROM nullif(v_item->>'minimo','')::numeric AND m.maximo IS NOT DISTINCT FROM nullif(v_item->>'maximo','')::numeric AND m.medido IS NOT DISTINCT FROM nullif(v_item->>'medido','')::numeric) THEN
        v_med_new:=v_med_new||jsonb_build_array(v_item);
      END IF;
    END LOOP;
    NEW.snapshot:=jsonb_set(NEW.snapshot,'{mediciones}',v_med_new,true);
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS diagnostico_informe_agregar_dibujos ON public.diagnostico_informes;
CREATE TRIGGER diagnostico_informe_agregar_dibujos BEFORE UPDATE OF estado,snapshot ON public.diagnostico_informes FOR EACH ROW EXECUTE FUNCTION public.diagnostico_informe_agregar_dibujos();
REVOKE ALL ON FUNCTION public.diagnostico_informe_agregar_dibujos() FROM PUBLIC,anon,authenticated;

DO $verify$
BEGIN
  ASSERT (SELECT count(*)=47 FROM public.diagnostico_catalogo_defaults WHERE catalogo='tipo_dano' AND activo),'VERIFY_FAILED: no hay 47 tipos de daño por defecto activos';
  ASSERT (SELECT count(*)=34 FROM public.diagnostico_catalogo_defaults WHERE catalogo='tipo_dano' AND orden>=140 AND etiqueta !~ 'Ã|Â|�'),'VERIFY_FAILED: etiquetas nuevas faltantes o con mojibake';
  ASSERT to_regclass('public.diagnostico_tecnico_hallazgo_zonas') IS NOT NULL,'VERIFY_FAILED: falta tabla de zonas de hallazgo';
  ASSERT (SELECT count(*)=3 FROM information_schema.columns WHERE table_schema='public' AND table_name='diagnostico_tecnico_hallazgo_mediciones' AND column_name IN ('zona_id','medida_id','cota')),'VERIFY_FAILED: faltan columnas de mediciones ligadas';
  ASSERT (SELECT count(*)=2 FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('activos','diagnostico_tecnico_hallazgos') AND column_name='componente_catalogo_id'),'VERIFY_FAILED: faltan columnas de componente en activos o hallazgos';
  ASSERT (SELECT count(*)=4 FROM pg_trigger WHERE tgname IN ('diagnostico_hallazgo_zonas_validar','diagnostico_medicion_dibujo_validar','diagnostico_hallazgo_componente_catalogo','diagnostico_informe_agregar_dibujos') AND NOT tgisinternal),'VERIFY_FAILED: faltan triggers de validación o snapshot';
  ASSERT (SELECT count(*)=1 FROM pg_trigger WHERE tgname='diagnostico_informe_agregar_dibujos' AND NOT tgisinternal),'VERIFY_FAILED: falta trigger para congelar dibujos al emitir';
END $verify$;
COMMIT;
