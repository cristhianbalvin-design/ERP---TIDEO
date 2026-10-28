-- 653: Diagnóstico de fabricación — etapa 1 (datos).
-- Aprobado por Cristhian el 2026-10-27 (mock docs/diseno/fabricacion/DiagnosticoFabricacion.dc.html):
--   * Un diagnóstico de fabricación nace de una Oportunidad o de una Recepción (exactamente una).
--   * Tiene varias piezas; cada pieza: nombre, cantidad, material del catálogo y su plano
--     (subido: imagen o PDF, o dibujo del catálogo de componentes).
--   * Cada plano lleva pines numerados = características (cota, rosca, acabado, tratamiento,
--     material u otro) con nominal, tolerancia − / +, unidad y marca de crítica.
--   * Cada tarea del diagnóstico puede ligarse a una pieza (pieza_id) o a todas (NULL).
--   * Para emitir: al menos una pieza y todas con material y plano.
--   * Fase 2 (anotado, fuera de esta migración): planos hechos por el área de Ingeniería.
-- No cambia nada de Mantenimiento.

BEGIN;

-- 1) Origen: fabricación desde Oportunidad o Recepción --------------------------------------
ALTER TABLE public.diagnosticos_tecnicos DROP CONSTRAINT diagnosticos_tecnicos_check;
ALTER TABLE public.diagnosticos_tecnicos ADD CONSTRAINT diagnosticos_tecnicos_check CHECK (
  (tipo = 'mantenimiento' AND recepcion_id IS NOT NULL AND oportunidad_id IS NULL)
  OR (tipo = 'fabricacion' AND num_nonnulls(oportunidad_id, recepcion_id) = 1)
);

ALTER TABLE public.diagnosticos_tecnicos ADD COLUMN IF NOT EXISTS referencia_cliente text;
COMMENT ON COLUMN public.diagnosticos_tecnicos.referencia_cliente IS 'Fabricación: referencia del pedido o plano del cliente (texto libre).';

CREATE OR REPLACE FUNCTION public.validar_diagnostico_tecnico_referencias()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare pe text; pa text; ae text;
begin
 if tg_op='UPDATE' and (new.elaborado_por is distinct from old.elaborado_por or new.tipo is distinct from old.tipo or new.recepcion_id is distinct from old.recepcion_id or new.oportunidad_id is distinct from old.oportunidad_id) then
  raise exception 'No se pueden cambiar elaborado_por, tipo, recepcion_id ni oportunidad_id.' using errcode='42501';
 end if;
 -- 653: la fabricación también puede nacer de una recepción (la muestra del cliente).
 if new.recepcion_id is not null then select r.empresa_id,r.activo_id into pe,pa from public.recepciones_activos_cliente r where r.id=new.recepcion_id;
 else select o.empresa_id into pe from public.oportunidades o where o.id=new.oportunidad_id; end if;
 if pe is null or pe is distinct from new.empresa_id then raise exception 'El padre no pertenece al mismo tenant.' using errcode='23514'; end if;
 if new.recepcion_id is not null and new.activo_id is null then new.activo_id:=pa; end if;
 if new.activo_id is not null then select a.empresa_id into ae from public.activos a where a.id=new.activo_id; if ae is distinct from new.empresa_id then raise exception 'El activo debe pertenecer al mismo tenant.' using errcode='23514'; end if; end if;
 if tg_op='INSERT' then new.elaborado_por:=auth.uid();
 elsif old.estado='emitido' then
  if new.estado<>'borrador' or not public.usuario_puede(new.empresa_id,'diagnostico_tecnico','aprobar') then raise exception 'Un diagnostico emitido solo puede reabrirse con aprobar.' using errcode='42501'; end if;
  new.emitido_por:=null; new.emitido_en:=null;
 elsif new.estado='emitido' then new.emitido_por:=auth.uid(); new.emitido_en:=now(); end if;
 new.updated_at:=now(); return new;
end $function$;

CREATE OR REPLACE FUNCTION public.usuario_puede_ver_diagnostico_padre(p_tipo text, p_empresa_id text, p_recepcion_id text, p_oportunidad_id text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
select public.usuario_tiene_empresa(p_empresa_id) and case
 -- 653: con recepción (mantenimiento o fabricación) se respeta el alcance de sociedades.
 when p_recepcion_id is not null and p_tipo in ('mantenimiento','fabricacion') then exists(select 1 from public.recepciones_activos_cliente r where r.id=p_recepcion_id and r.empresa_id=p_empresa_id and (public.usuario_alcance_sociedades(p_empresa_id) is null or r.sociedad_id=any(public.usuario_alcance_sociedades(p_empresa_id))))
 when p_tipo='fabricacion' then exists(select 1 from public.oportunidades o where o.id=p_oportunidad_id and o.empresa_id=p_empresa_id)
 else false end
$function$;

-- Crear: fabricación con oportunidad O recepción (misma firma; mantenimiento sin cambios).
CREATE OR REPLACE FUNCTION public.crear_diagnostico_tecnico_inicial(p_empresa_id text, p_tipo text, p_recepcion_id text DEFAULT NULL::text, p_oportunidad_id text DEFAULT NULL::text, p_motivo text DEFAULT NULL::text, p_tecnico_id text DEFAULT NULL::text, p_fecha_inspeccion date DEFAULT NULL::date, p_trabajos_evaluar uuid[] DEFAULT '{}'::uuid[])
 RETURNS diagnosticos_tecnicos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_result public.diagnosticos_tecnicos%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.usuario_tiene_empresa(p_empresa_id)
    OR NOT public.usuario_puede(p_empresa_id,'diagnostico_tecnico','crear') THEN
    RAISE EXCEPTION 'No tienes permiso para crear diagnósticos técnicos.' USING ERRCODE='42501';
  END IF;
  IF p_tipo NOT IN ('mantenimiento','fabricacion') THEN
    RAISE EXCEPTION 'Tipo de diagnóstico no válido.' USING ERRCODE='22023';
  END IF;
  IF p_tipo='mantenimiento' AND (p_recepcion_id IS NULL OR p_oportunidad_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Selecciona una recepción válida.' USING ERRCODE='22023';
  END IF;
  IF p_tipo='fabricacion' AND num_nonnulls(p_oportunidad_id, p_recepcion_id) <> 1 THEN
    RAISE EXCEPTION 'Selecciona una oportunidad o una recepción.' USING ERRCODE='22023';
  END IF;
  IF NOT public.usuario_puede_ver_diagnostico_padre(p_tipo,p_empresa_id,p_recepcion_id,p_oportunidad_id) THEN
    RAISE EXCEPTION 'La referencia no está disponible para esta empresa y alcance.' USING ERRCODE='42501';
  END IF;
  IF p_tipo='mantenimiento' AND (nullif(btrim(coalesce(p_motivo,'')),'') IS NULL
    OR p_tecnico_id IS NULL OR p_fecha_inspeccion IS NULL) THEN
    RAISE EXCEPTION 'Completa motivo, técnico y fecha.' USING ERRCODE='22023';
  END IF;
  IF p_tipo='fabricacion' AND p_tecnico_id IS NULL THEN
    RAISE EXCEPTION 'Elige el técnico responsable.' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.diagnosticos_tecnicos(
    empresa_id,tipo,recepcion_id,oportunidad_id,estado,motivo,tecnico_id,fecha_inspeccion,trabajos_evaluar,elaborado_por
  ) VALUES (
    p_empresa_id,p_tipo,p_recepcion_id,p_oportunidad_id,'borrador',nullif(btrim(p_motivo),''),
    p_tecnico_id,p_fecha_inspeccion,coalesce(p_trabajos_evaluar,'{}'),auth.uid()
  ) RETURNING * INTO v_result;
  RETURN v_result;
END $function$;

-- 2) Piezas ------------------------------------------------------------------------------------
CREATE TABLE public.diagnostico_fabricacion_piezas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id text NOT NULL,
  diagnostico_id text NOT NULL REFERENCES public.diagnosticos_tecnicos(id) ON DELETE CASCADE,
  orden smallint NOT NULL DEFAULT 1,
  nombre text NOT NULL CHECK (length(btrim(nombre)) BETWEEN 1 AND 160),
  cantidad numeric(12,3) NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  material_id text REFERENCES public.materiales(id) ON DELETE RESTRICT,
  observaciones text,
  plano_origen text CHECK (plano_origen IN ('subido','catalogo')),
  plano_ruta text,            -- archivo original en el bucket diagnostico-planos (imagen o PDF)
  plano_imagen_ruta text,     -- imagen sobre la que van los pines (para PDF, la página renderizada)
  plano_nombre_original text,
  plano_mime text,
  plano_pagina smallint CHECK (plano_pagina IS NULL OR plano_pagina >= 1),
  plano_ancho integer CHECK (plano_ancho IS NULL OR plano_ancho > 0),
  plano_alto integer CHECK (plano_alto IS NULL OR plano_alto > 0),
  componente_catalogo_id text REFERENCES public.catalogo_componentes(id) ON DELETE RESTRICT,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT diagnostico_fabricacion_piezas_plano_check CHECK (
    plano_origen IS NULL
    OR (plano_origen = 'subido' AND plano_ruta IS NOT NULL AND plano_imagen_ruta IS NOT NULL AND componente_catalogo_id IS NULL)
    OR (plano_origen = 'catalogo' AND componente_catalogo_id IS NOT NULL AND plano_ruta IS NULL AND plano_imagen_ruta IS NULL)
  )
);
CREATE INDEX diagnostico_fabricacion_piezas_diag_idx ON public.diagnostico_fabricacion_piezas (empresa_id, diagnostico_id, orden);
COMMENT ON TABLE public.diagnostico_fabricacion_piezas IS 'Piezas a fabricar de un diagnóstico de fabricación, cada una con su material y su plano (653).';

-- 3) Características (pines del plano) ----------------------------------------------------------
CREATE TABLE public.diagnostico_fabricacion_caracteristicas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id text NOT NULL,
  pieza_id uuid NOT NULL REFERENCES public.diagnostico_fabricacion_piezas(id) ON DELETE CASCADE,
  numero smallint NOT NULL CHECK (numero BETWEEN 1 AND 999),
  nombre text NOT NULL CHECK (length(btrim(nombre)) BETWEEN 1 AND 160),
  tipo text NOT NULL DEFAULT 'cota' CHECK (tipo IN ('cota','rosca','acabado','tratamiento','material','otro')),
  nominal text,
  tolerancia_menos text,
  tolerancia_mas text,
  unidad text,
  critica boolean NOT NULL DEFAULT false,
  pos_x numeric(5,2) NOT NULL CHECK (pos_x BETWEEN 0 AND 100),
  pos_y numeric(5,2) NOT NULL CHECK (pos_y BETWEEN 0 AND 100),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT diagnostico_fabricacion_caracteristicas_numero_uq UNIQUE (pieza_id, numero)
);
CREATE INDEX diagnostico_fabricacion_caracteristicas_pieza_idx ON public.diagnostico_fabricacion_caracteristicas (empresa_id, pieza_id, numero);
COMMENT ON TABLE public.diagnostico_fabricacion_caracteristicas IS 'Características a fabricar/controlar de una pieza; pos_x/pos_y = posición del pin en % del plano (653).';

-- 4) Tarea ligada a una pieza (NULL = todas las piezas) -----------------------------------------
ALTER TABLE public.diagnostico_tecnico_lineas
  ADD COLUMN IF NOT EXISTS pieza_id uuid REFERENCES public.diagnostico_fabricacion_piezas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS diagnostico_tecnico_lineas_pieza_idx ON public.diagnostico_tecnico_lineas (pieza_id) WHERE pieza_id IS NOT NULL;

-- 5) Reglas: misma empresa, diagnóstico de fabricación, bloqueo si está emitido ------------------
CREATE OR REPLACE FUNCTION public.validar_pieza_fabricacion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_d public.diagnosticos_tecnicos%ROWTYPE; v_row public.diagnostico_fabricacion_piezas%ROWTYPE;
BEGIN
  v_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  SELECT d.* INTO v_d FROM public.diagnosticos_tecnicos d WHERE d.id = v_row.diagnostico_id FOR SHARE;
  IF NOT FOUND THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'El diagnóstico no existe.' USING ERRCODE = '23503';
  END IF;
  IF v_d.estado = 'emitido' THEN
    RAISE EXCEPTION 'No se pueden modificar las piezas de un diagnóstico emitido.' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF TG_OP = 'UPDATE' AND (NEW.empresa_id IS DISTINCT FROM OLD.empresa_id OR NEW.diagnostico_id IS DISTINCT FROM OLD.diagnostico_id) THEN
    RAISE EXCEPTION 'empresa_id y diagnostico_id son inmutables.' USING ERRCODE = '23514';
  END IF;
  IF v_d.tipo <> 'fabricacion' THEN
    RAISE EXCEPTION 'Las piezas solo aplican a diagnósticos de fabricación.' USING ERRCODE = '23514';
  END IF;
  IF v_d.empresa_id IS DISTINCT FROM NEW.empresa_id THEN
    RAISE EXCEPTION 'La pieza y su diagnóstico deben pertenecer a la misma empresa.' USING ERRCODE = '23514';
  END IF;
  IF NEW.material_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.materiales m WHERE m.id = NEW.material_id AND m.empresa_id = NEW.empresa_id
  ) THEN
    RAISE EXCEPTION 'El material debe ser del catálogo de la misma empresa.' USING ERRCODE = '23514';
  END IF;
  IF NEW.plano_ruta IS NOT NULL AND split_part(NEW.plano_ruta, '/', 1) <> NEW.empresa_id THEN
    RAISE EXCEPTION 'El plano debe guardarse en la carpeta de la empresa.' USING ERRCODE = '23514';
  END IF;
  IF NEW.plano_imagen_ruta IS NOT NULL AND split_part(NEW.plano_imagen_ruta, '/', 1) <> NEW.empresa_id THEN
    RAISE EXCEPTION 'La imagen del plano debe guardarse en la carpeta de la empresa.' USING ERRCODE = '23514';
  END IF;
  NEW.nombre := btrim(NEW.nombre);
  NEW.updated_at := now();
  RETURN NEW;
END
$function$;

CREATE TRIGGER a_validar_pieza_fabricacion
  BEFORE INSERT OR UPDATE OR DELETE ON public.diagnostico_fabricacion_piezas
  FOR EACH ROW EXECUTE FUNCTION public.validar_pieza_fabricacion();

CREATE OR REPLACE FUNCTION public.validar_caracteristica_fabricacion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_estado text; v_empresa text; v_row public.diagnostico_fabricacion_caracteristicas%ROWTYPE;
BEGIN
  v_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  SELECT d.estado, p.empresa_id INTO v_estado, v_empresa
  FROM public.diagnostico_fabricacion_piezas p
  JOIN public.diagnosticos_tecnicos d ON d.id = p.diagnostico_id
  WHERE p.id = v_row.pieza_id
  FOR SHARE OF p, d;
  IF NOT FOUND THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'La pieza no existe.' USING ERRCODE = '23503';
  END IF;
  IF v_estado = 'emitido' THEN
    RAISE EXCEPTION 'No se pueden modificar las características de un diagnóstico emitido.' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF TG_OP = 'UPDATE' AND (NEW.empresa_id IS DISTINCT FROM OLD.empresa_id OR NEW.pieza_id IS DISTINCT FROM OLD.pieza_id) THEN
    RAISE EXCEPTION 'empresa_id y pieza_id son inmutables.' USING ERRCODE = '23514';
  END IF;
  IF v_empresa IS DISTINCT FROM NEW.empresa_id THEN
    RAISE EXCEPTION 'La característica y su pieza deben pertenecer a la misma empresa.' USING ERRCODE = '23514';
  END IF;
  NEW.nombre := btrim(NEW.nombre);
  NEW.updated_at := now();
  RETURN NEW;
END
$function$;

CREATE TRIGGER a_validar_caracteristica_fabricacion
  BEFORE INSERT OR UPDATE OR DELETE ON public.diagnostico_fabricacion_caracteristicas
  FOR EACH ROW EXECUTE FUNCTION public.validar_caracteristica_fabricacion();

CREATE OR REPLACE FUNCTION public.validar_linea_pieza_fabricacion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.pieza_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.diagnostico_fabricacion_piezas p
    WHERE p.id = NEW.pieza_id AND p.diagnostico_id = NEW.diagnostico_id AND p.empresa_id = NEW.empresa_id
  ) THEN
    RAISE EXCEPTION 'La pieza de la tarea debe ser del mismo diagnóstico.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$function$;

CREATE TRIGGER b_validar_linea_pieza_fabricacion
  BEFORE INSERT OR UPDATE OF pieza_id ON public.diagnostico_tecnico_lineas
  FOR EACH ROW EXECUTE FUNCTION public.validar_linea_pieza_fabricacion();

CREATE TRIGGER audit_diagnostico_fabricacion_piezas AFTER INSERT OR UPDATE ON public.diagnostico_fabricacion_piezas
  FOR EACH ROW EXECUTE FUNCTION public.audit_backend_minimo();
CREATE TRIGGER audit_diagnostico_fabricacion_caracteristicas AFTER INSERT OR UPDATE ON public.diagnostico_fabricacion_caracteristicas
  FOR EACH ROW EXECUTE FUNCTION public.audit_backend_minimo();

-- 6) RLS (mismo criterio que hallazgos) -------------------------------------------------------
ALTER TABLE public.diagnostico_fabricacion_piezas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diagnostico_fabricacion_caracteristicas ENABLE ROW LEVEL SECURITY;

CREATE POLICY fab_piezas_select ON public.diagnostico_fabricacion_piezas FOR SELECT USING (
  usuario_tiene_empresa(empresa_id) AND usuario_puede(empresa_id, 'diagnostico_tecnico', 'ver')
  AND EXISTS (SELECT 1 FROM public.diagnosticos_tecnicos d WHERE d.id = diagnostico_id AND d.empresa_id = diagnostico_fabricacion_piezas.empresa_id
    AND usuario_puede_ver_diagnostico_padre(d.tipo, d.empresa_id, d.recepcion_id, d.oportunidad_id)));
CREATE POLICY fab_piezas_insert ON public.diagnostico_fabricacion_piezas FOR INSERT WITH CHECK (
  usuario_tiene_empresa(empresa_id) AND usuario_puede(empresa_id, 'diagnostico_tecnico', 'crear')
  AND EXISTS (SELECT 1 FROM public.diagnosticos_tecnicos d WHERE d.id = diagnostico_id AND d.empresa_id = diagnostico_fabricacion_piezas.empresa_id AND d.estado = 'borrador'));
CREATE POLICY fab_piezas_update ON public.diagnostico_fabricacion_piezas FOR UPDATE USING (
  usuario_tiene_empresa(empresa_id) AND usuario_puede(empresa_id, 'diagnostico_tecnico', 'editar')
  AND EXISTS (SELECT 1 FROM public.diagnosticos_tecnicos d WHERE d.id = diagnostico_id AND d.empresa_id = diagnostico_fabricacion_piezas.empresa_id AND d.estado = 'borrador'))
  WITH CHECK (
  usuario_tiene_empresa(empresa_id) AND usuario_puede(empresa_id, 'diagnostico_tecnico', 'editar')
  AND EXISTS (SELECT 1 FROM public.diagnosticos_tecnicos d WHERE d.id = diagnostico_id AND d.empresa_id = diagnostico_fabricacion_piezas.empresa_id AND d.estado = 'borrador'));
CREATE POLICY fab_piezas_delete ON public.diagnostico_fabricacion_piezas FOR DELETE USING (
  usuario_tiene_empresa(empresa_id) AND usuario_puede(empresa_id, 'diagnostico_tecnico', 'editar')
  AND EXISTS (SELECT 1 FROM public.diagnosticos_tecnicos d WHERE d.id = diagnostico_id AND d.empresa_id = diagnostico_fabricacion_piezas.empresa_id AND d.estado = 'borrador'));

CREATE POLICY fab_caracteristicas_select ON public.diagnostico_fabricacion_caracteristicas FOR SELECT USING (
  usuario_tiene_empresa(empresa_id) AND usuario_puede(empresa_id, 'diagnostico_tecnico', 'ver')
  AND EXISTS (SELECT 1 FROM public.diagnostico_fabricacion_piezas p JOIN public.diagnosticos_tecnicos d ON d.id = p.diagnostico_id
    WHERE p.id = pieza_id AND p.empresa_id = diagnostico_fabricacion_caracteristicas.empresa_id
    AND usuario_puede_ver_diagnostico_padre(d.tipo, d.empresa_id, d.recepcion_id, d.oportunidad_id)));
CREATE POLICY fab_caracteristicas_insert ON public.diagnostico_fabricacion_caracteristicas FOR INSERT WITH CHECK (
  usuario_tiene_empresa(empresa_id) AND usuario_puede(empresa_id, 'diagnostico_tecnico', 'crear')
  AND EXISTS (SELECT 1 FROM public.diagnostico_fabricacion_piezas p JOIN public.diagnosticos_tecnicos d ON d.id = p.diagnostico_id
    WHERE p.id = pieza_id AND p.empresa_id = diagnostico_fabricacion_caracteristicas.empresa_id AND d.estado = 'borrador'));
CREATE POLICY fab_caracteristicas_update ON public.diagnostico_fabricacion_caracteristicas FOR UPDATE USING (
  usuario_tiene_empresa(empresa_id) AND usuario_puede(empresa_id, 'diagnostico_tecnico', 'editar')
  AND EXISTS (SELECT 1 FROM public.diagnostico_fabricacion_piezas p JOIN public.diagnosticos_tecnicos d ON d.id = p.diagnostico_id
    WHERE p.id = pieza_id AND p.empresa_id = diagnostico_fabricacion_caracteristicas.empresa_id AND d.estado = 'borrador'))
  WITH CHECK (
  usuario_tiene_empresa(empresa_id) AND usuario_puede(empresa_id, 'diagnostico_tecnico', 'editar')
  AND EXISTS (SELECT 1 FROM public.diagnostico_fabricacion_piezas p JOIN public.diagnosticos_tecnicos d ON d.id = p.diagnostico_id
    WHERE p.id = pieza_id AND p.empresa_id = diagnostico_fabricacion_caracteristicas.empresa_id AND d.estado = 'borrador'));
CREATE POLICY fab_caracteristicas_delete ON public.diagnostico_fabricacion_caracteristicas FOR DELETE USING (
  usuario_tiene_empresa(empresa_id) AND usuario_puede(empresa_id, 'diagnostico_tecnico', 'editar')
  AND EXISTS (SELECT 1 FROM public.diagnostico_fabricacion_piezas p JOIN public.diagnosticos_tecnicos d ON d.id = p.diagnostico_id
    WHERE p.id = pieza_id AND p.empresa_id = diagnostico_fabricacion_caracteristicas.empresa_id AND d.estado = 'borrador'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.diagnostico_fabricacion_piezas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.diagnostico_fabricacion_caracteristicas TO authenticated;

-- 7) Bucket privado de planos: {empresa}/{diagnostico}/{pieza}/{archivo} ------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('diagnostico-planos', 'diagnostico-planos', false, 10485760,
        ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.plano_diagnostico_bloqueado(p_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1 from public.diagnosticos_tecnicos d
    where d.empresa_id = split_part(p_name, '/', 1)
      and d.id = split_part(p_name, '/', 2)
      and d.estado = 'emitido'
  )
$function$;

CREATE POLICY storage_diag_planos_select ON storage.objects FOR SELECT USING (
  bucket_id = 'diagnostico-planos'
  AND usuario_tiene_empresa(split_part(name, '/', 1))
  AND usuario_puede(split_part(name, '/', 1), 'diagnostico_tecnico', 'ver'));
CREATE POLICY storage_diag_planos_insert ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'diagnostico-planos'
  AND usuario_tiene_empresa(split_part(name, '/', 1))
  AND usuario_puede(split_part(name, '/', 1), 'diagnostico_tecnico', 'crear')
  AND NOT plano_diagnostico_bloqueado(name));
CREATE POLICY storage_diag_planos_delete ON storage.objects FOR DELETE USING (
  bucket_id = 'diagnostico-planos'
  AND usuario_tiene_empresa(split_part(name, '/', 1))
  AND usuario_puede(split_part(name, '/', 1), 'diagnostico_tecnico', 'editar')
  AND NOT plano_diagnostico_bloqueado(name));

-- 8) Emitir: la fabricación exige piezas con material y plano -----------------------------------
CREATE OR REPLACE FUNCTION public.emitir_diagnostico_tecnico(p_id text)
 RETURNS TABLE(id text, estado text, emitido_por uuid, emitido_en timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_d public.diagnosticos_tecnicos%ROWTYPE; v_usuario uuid := auth.uid(); v_falta text;
BEGIN
  IF v_usuario IS NULL THEN RAISE EXCEPTION 'Se requiere una sesión autenticada.' USING ERRCODE='42501'; END IF;
  SELECT d.* INTO v_d FROM public.diagnosticos_tecnicos d WHERE d.id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El diagnóstico no existe.' USING ERRCODE='P0002'; END IF;
  IF NOT public.usuario_tiene_empresa(v_d.empresa_id)
     OR NOT public.usuario_puede(v_d.empresa_id,'diagnostico_tecnico','aprobar') THEN
    RAISE EXCEPTION 'No autorizado para emitir este diagnóstico.' USING ERRCODE='42501';
  END IF;
  IF v_d.estado IS DISTINCT FROM 'borrador' THEN
    RAISE EXCEPTION 'Solo se puede emitir un diagnóstico en borrador.' USING ERRCODE='22023';
  END IF;
  -- 653: fabricación — al menos una pieza y todas con material y plano.
  IF v_d.tipo = 'fabricacion' THEN
    IF NOT EXISTS (SELECT 1 FROM public.diagnostico_fabricacion_piezas p WHERE p.diagnostico_id = v_d.id) THEN
      RAISE EXCEPTION 'Agrega al menos una pieza antes de emitir.' USING ERRCODE='22023';
    END IF;
    SELECT string_agg(p.nombre, ', ' ORDER BY p.orden) INTO v_falta
    FROM public.diagnostico_fabricacion_piezas p
    WHERE p.diagnostico_id = v_d.id AND (p.material_id IS NULL OR p.plano_origen IS NULL);
    IF v_falta IS NOT NULL THEN
      RAISE EXCEPTION 'Falta material o plano en: %', v_falta USING ERRCODE='22023';
    END IF;
  END IF;
  INSERT INTO public.diagnostico_tecnico_transicion_rpc VALUES (txid_current(),v_d.id,'emitir',v_usuario);
  UPDATE public.diagnosticos_tecnicos d SET estado='emitido' WHERE d.id=v_d.id
    RETURNING d.* INTO v_d;
  DELETE FROM public.diagnostico_tecnico_transicion_rpc WHERE xid=txid_current() AND diagnostico_id=v_d.id AND accion='emitir';
  INSERT INTO public.diagnostico_tecnico_estado_historial
    (empresa_id,diagnostico_id,estado_anterior,estado_nuevo,motivo,usuario_id)
  VALUES (v_d.empresa_id,v_d.id,'borrador','emitido',NULL,v_usuario);
  RETURN QUERY SELECT v_d.id,v_d.estado,v_d.emitido_por,v_d.emitido_en;
END
$function$;

-- 9) Comprobación ------------------------------------------------------------------------------
DO $verify$
BEGIN
  IF to_regclass('public.diagnostico_fabricacion_piezas') IS NULL OR to_regclass('public.diagnostico_fabricacion_caracteristicas') IS NULL THEN
    RAISE EXCEPTION 'VERIFY_FAILED: faltan tablas de fabricación';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='diagnostico_tecnico_lineas' AND column_name='pieza_id') THEN
    RAISE EXCEPTION 'VERIFY_FAILED: falta diagnostico_tecnico_lineas.pieza_id';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='diagnostico-planos' AND NOT public) THEN
    RAISE EXCEPTION 'VERIFY_FAILED: falta el bucket privado diagnostico-planos';
  END IF;
  IF (SELECT count(*) FROM pg_policy WHERE polrelid IN ('public.diagnostico_fabricacion_piezas'::regclass,'public.diagnostico_fabricacion_caracteristicas'::regclass)) <> 8 THEN
    RAISE EXCEPTION 'VERIFY_FAILED: políticas RLS incompletas';
  END IF;
  -- Mantenimiento sigue exigiendo recepción y sin oportunidad.
  IF EXISTS (SELECT 1 FROM public.diagnosticos_tecnicos WHERE tipo='mantenimiento' AND (recepcion_id IS NULL OR oportunidad_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'VERIFY_FAILED: mantenimiento con origen inválido';
  END IF;
END
$verify$;

COMMIT;
