-- 592 — Diagnóstico Técnico: catálogos, matriz v1 y Hallazgos base.
-- UTF-8 sin BOM. No incluye fotos, informes ni UI.
-- Aplicación protocolaria: BEGIN…COMMIT; el dry-run sustituye mecánicamente
-- solamente el COMMIT final por ROLLBACK.

BEGIN;

CREATE TEMP TABLE _592_attr_before ON COMMIT DROP AS
SELECT p.oid, p.proacl, p.proowner, p.prosecdef, p.proconfig, p.provolatile
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('audit_backend_minimo', 'usuario_puede', 'usuario_puede_ver_diagnostico_padre');

CREATE TEMP TABLE _592_report (
  stage text NOT NULL,
  function_name text,
  proacl text,
  proowner text,
  prosecdef boolean,
  proconfig text,
  provolatile text,
  anon_execute boolean,
  authenticated_execute boolean,
  defaults_count bigint,
  values_count bigint,
  matrix_count bigint,
  tipo_dano_count bigint,
  causa_probable_count bigint,
  unidad_medicion_count bigint,
  mojibake_count bigint
) ON COMMIT DROP;

INSERT INTO _592_report(stage, function_name, proacl, proowner, prosecdef, proconfig, provolatile)
SELECT 'before_existing_function_attrs', oid::regprocedure::text, proacl::text,
       proowner::regrole::text, prosecdef, proconfig::text, provolatile::text
FROM _592_attr_before;

SELECT 'before_existing_function_attrs' AS snapshot,
       oid::regprocedure AS funcion, proacl, proowner::regrole AS proowner,
       prosecdef, proconfig, provolatile
FROM _592_attr_before
ORDER BY oid::regprocedure::text;

DO $$
BEGIN
  ASSERT to_regclass('public.diagnostico_catalogo_defaults') IS NULL,
    'PRECONDITION_FAILED: diagnostico_catalogo_defaults ya existe';
  ASSERT to_regclass('public.diagnostico_catalogo_valores') IS NULL,
    'PRECONDITION_FAILED: diagnostico_catalogo_valores ya existe';
  ASSERT to_regclass('public.diagnostico_matriz_prioridad') IS NULL,
    'PRECONDITION_FAILED: diagnostico_matriz_prioridad ya existe';
  ASSERT to_regclass('public.diagnostico_tecnico_hallazgos') IS NULL,
    'PRECONDITION_FAILED: diagnostico_tecnico_hallazgos ya existe';
  ASSERT to_regclass('public.diagnostico_tecnico_hallazgo_mediciones') IS NULL,
    'PRECONDITION_FAILED: diagnostico_tecnico_hallazgo_mediciones ya existe';
  ASSERT to_regclass('public.diagnostico_tecnico_hallazgo_lineas') IS NULL,
    'PRECONDITION_FAILED: diagnostico_tecnico_hallazgo_lineas ya existe';
  ASSERT (SELECT count(*) FROM _592_attr_before) = 3,
    'PRECONDITION_FAILED: falta una función existente requerida';
  ASSERT to_regprocedure('public.audit_backend_minimo()') IS NOT NULL,
    'PRECONDITION_FAILED: no existe audit_backend_minimo()';
END $$;

CREATE TABLE public.diagnostico_catalogo_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalogo text NOT NULL CHECK (catalogo IN ('tipo_dano','causa_probable','unidad_medicion')),
  codigo text NOT NULL,
  etiqueta text NOT NULL,
  orden smallint NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  UNIQUE (catalogo, codigo)
);

CREATE TABLE public.diagnostico_catalogo_valores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id text NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  catalogo text NOT NULL CHECK (catalogo IN ('tipo_dano','causa_probable','unidad_medicion')),
  codigo text NOT NULL,
  etiqueta text NOT NULL,
  orden smallint NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  default_id uuid REFERENCES public.diagnostico_catalogo_defaults(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, catalogo, codigo),
  UNIQUE (empresa_id, id)
);

CREATE TABLE public.diagnostico_matriz_prioridad (
  version smallint NOT NULL,
  condicion_codigo text NOT NULL,
  riesgo_codigo text NOT NULL,
  prioridad text NOT NULL CHECK (prioridad IN ('P1','P2','P3','P4')),
  PRIMARY KEY (version, condicion_codigo, riesgo_codigo)
);

CREATE OR REPLACE FUNCTION public.inicializar_catalogos_diagnostico(p_empresa_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_insertados integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.empresas WHERE id = p_empresa_id) THEN
    RAISE EXCEPTION 'Empresa inexistente' USING ERRCODE = '22023';
  END IF;
  IF auth.uid() IS NOT NULL
     AND NOT (public.usuario_es_superadmin_plataforma()
              OR public.usuario_puede(p_empresa_id, 'maestros', 'editar')) THEN
    RAISE EXCEPTION 'No autorizado para inicializar catálogos' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.diagnostico_catalogo_valores
    (empresa_id, catalogo, codigo, etiqueta, orden, activo, default_id)
  SELECT p_empresa_id, d.catalogo, d.codigo, d.etiqueta, d.orden, d.activo, d.id
  FROM public.diagnostico_catalogo_defaults d
  ON CONFLICT (empresa_id, catalogo, codigo) DO NOTHING;
  GET DIAGNOSTICS v_insertados = ROW_COUNT;
  RETURN v_insertados;
END
$fn$;

INSERT INTO public.diagnostico_catalogo_defaults (catalogo, codigo, etiqueta, orden)
VALUES
  ('tipo_dano','desgaste','desgaste',10),
  ('tipo_dano','rayado','rayado',20),
  ('tipo_dano','corrosion','corrosión',30),
  ('tipo_dano','fisura_grieta','fisura o grieta',40),
  ('tipo_dano','deformacion','deformación',50),
  ('tipo_dano','fuga','fuga',60),
  ('tipo_dano','picadura','picadura',70),
  ('tipo_dano','golpe_abolladura','golpe o abolladura',80),
  ('tipo_dano','holgura_excesiva','holgura excesiva',90),
  ('tipo_dano','rotura','rotura',100),
  ('tipo_dano','desprendimiento_cromo','desprendimiento de cromo',110),
  ('tipo_dano','sobrecalentamiento','sobrecalentamiento',120),
  ('tipo_dano','contaminacion','contaminación',130),
  ('causa_probable','desgaste_normal','desgaste normal',10),
  ('causa_probable','contaminacion_fluido','contaminación del fluido',20),
  ('causa_probable','sobrecarga_mala_operacion','sobrecarga o mala operación',30),
  ('causa_probable','falta_mantenimiento','falta de mantenimiento',40),
  ('causa_probable','lubricacion_deficiente','lubricación deficiente',50),
  ('causa_probable','instalacion_incorrecta','instalación incorrecta',60),
  ('causa_probable','defecto_fabricacion','defecto de fabricación',70),
  ('causa_probable','impacto','impacto',80),
  ('causa_probable','corrosion_ambiente','corrosión por ambiente',90),
  ('causa_probable','fatiga','fatiga',100),
  ('unidad_medicion','mm','mm',10),
  ('unidad_medicion','um',U&'\00B5m',20),
  ('unidad_medicion','bar','bar',30),
  ('unidad_medicion','psi','psi',40),
  ('unidad_medicion','celsius',U&'\00B0C',50),
  ('unidad_medicion','n_m',U&'N\00B7m',60),
  ('unidad_medicion','kg','kg',70),
  ('unidad_medicion','l_min','L/min',80),
  ('unidad_medicion','h','h',90);

INSERT INTO public.diagnostico_matriz_prioridad (version, condicion_codigo, riesgo_codigo, prioridad)
VALUES
  (1,'conforme','monitorear','P4'),
  (1,'conforme','proximo_mantenimiento','P4'),
  (1,'conforme','antes_de_operar','P3'),
  (1,'conforme','inmediato_por_seguridad','P2'),
  (1,'desgaste_aceptable','monitorear','P4'),
  (1,'desgaste_aceptable','proximo_mantenimiento','P3'),
  (1,'desgaste_aceptable','antes_de_operar','P2'),
  (1,'desgaste_aceptable','inmediato_por_seguridad','P1'),
  (1,'fuera_de_tolerancia','monitorear','P3'),
  (1,'fuera_de_tolerancia','proximo_mantenimiento','P2'),
  (1,'fuera_de_tolerancia','antes_de_operar','P1'),
  (1,'fuera_de_tolerancia','inmediato_por_seguridad','P1'),
  (1,'falla_funcional','monitorear','P2'),
  (1,'falla_funcional','proximo_mantenimiento','P1'),
  (1,'falla_funcional','antes_de_operar','P1'),
  (1,'falla_funcional','inmediato_por_seguridad','P1');

DO $seed$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.empresas LOOP
    PERFORM public.inicializar_catalogos_diagnostico(r.id);
  END LOOP;
END
$seed$;

CREATE OR REPLACE FUNCTION public.calcular_prioridad_diagnostico(
  p_condicion text,
  p_riesgo text,
  p_prioridad_override text DEFAULT NULL,
  p_override_motivo text DEFAULT NULL,
  p_matriz_version smallint DEFAULT 1
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_base text;
  v_base_rango integer;
  v_override_rango integer;
BEGIN
  SELECT m.prioridad INTO v_base
  FROM public.diagnostico_matriz_prioridad m
  WHERE m.version = p_matriz_version
    AND m.condicion_codigo = p_condicion
    AND m.riesgo_codigo = p_riesgo;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING MESSAGE = format(U&'Combinaci\00F3n condici\00F3n/riesgo no existe en la matriz %s', p_matriz_version), ERRCODE = '22023';
  END IF;
  IF p_prioridad_override IS NULL THEN
    RETURN v_base;
  END IF;
  IF p_prioridad_override NOT IN ('P1','P2','P3','P4') THEN
    RAISE EXCEPTION USING MESSAGE = U&'Prioridad override inv\00E1lida', ERRCODE = '22023';
  END IF;
  IF nullif(btrim(p_override_motivo), '') IS NULL THEN
    RAISE EXCEPTION 'El override de prioridad exige motivo' USING ERRCODE = '22023';
  END IF;
  v_base_rango := CASE v_base WHEN 'P1' THEN 4 WHEN 'P2' THEN 3 WHEN 'P3' THEN 2 ELSE 1 END;
  v_override_rango := CASE p_prioridad_override WHEN 'P1' THEN 4 WHEN 'P2' THEN 3 WHEN 'P3' THEN 2 ELSE 1 END;
  IF v_override_rango <= v_base_rango THEN
    RAISE EXCEPTION 'El override solo puede aumentar la prioridad' USING ERRCODE = '22023';
  END IF;
  RETURN p_prioridad_override;
END
$fn$;

CREATE TABLE public.diagnostico_tecnico_hallazgos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id text NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  diagnostico_id text NOT NULL REFERENCES public.diagnosticos_tecnicos(id) ON DELETE CASCADE,
  familia_trabajo_id uuid NOT NULL REFERENCES public.familia_trabajo(id) ON DELETE RESTRICT,
  componente_parte text NOT NULL CHECK (nullif(btrim(componente_parte), '') IS NOT NULL),
  tipo_dano_codigo text NOT NULL,
  causa_probable_codigo text NOT NULL,
  condicion text NOT NULL CHECK (condicion IN ('conforme','desgaste_aceptable','fuera_de_tolerancia','falla_funcional')),
  riesgo text NOT NULL CHECK (riesgo IN ('monitorear','proximo_mantenimiento','antes_de_operar','inmediato_por_seguridad')),
  matriz_version smallint NOT NULL DEFAULT 1,
  prioridad_calculada text NOT NULL,
  prioridad_override text,
  prioridad_override_motivo text,
  prioridad_efectiva text NOT NULL,
  accion_recomendada text NOT NULL CHECK (accion_recomendada IN ('reutilizar','reparar','reemplazar','fabricar_nuevo','monitorear')),
  atribuible_a text NOT NULL CHECK (atribuible_a IN ('desgaste_normal','operacion','defecto_fabrica','instalacion')),
  observacion text,
  incluir_en_informe boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, id)
);

COMMENT ON COLUMN public.diagnostico_tecnico_hallazgos.prioridad_efectiva IS
  'Prioridad que rige el hallazgo: la calculada por la matriz o un override estrictamente superior con motivo.';

CREATE TABLE public.diagnostico_tecnico_hallazgo_mediciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id text NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  hallazgo_id uuid NOT NULL REFERENCES public.diagnostico_tecnico_hallazgos(id) ON DELETE CASCADE,
  parametro text NOT NULL CHECK (nullif(btrim(parametro), '') IS NOT NULL),
  unidad text NOT NULL,
  nominal numeric,
  minimo numeric,
  maximo numeric,
  medido numeric,
  resultado_calculado text,
  condicion_sugerida text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, id)
);

CREATE TABLE public.diagnostico_tecnico_hallazgo_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id text NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  hallazgo_id uuid NOT NULL REFERENCES public.diagnostico_tecnico_hallazgos(id) ON DELETE CASCADE,
  linea_id uuid NOT NULL REFERENCES public.diagnostico_tecnico_lineas(id) ON DELETE CASCADE,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, hallazgo_id, linea_id)
);

CREATE INDEX diagnostico_catalogo_valores_empresa_catalogo_idx ON public.diagnostico_catalogo_valores (empresa_id, catalogo, activo, orden);
CREATE INDEX diagnostico_hallazgos_empresa_diagnostico_idx ON public.diagnostico_tecnico_hallazgos (empresa_id, diagnostico_id);
CREATE INDEX diagnostico_hallazgos_empresa_prioridad_idx ON public.diagnostico_tecnico_hallazgos (empresa_id, prioridad_efectiva);
CREATE INDEX diagnostico_mediciones_empresa_hallazgo_idx ON public.diagnostico_tecnico_hallazgo_mediciones (empresa_id, hallazgo_id);
CREATE INDEX diagnostico_lineas_empresa_hallazgo_idx ON public.diagnostico_tecnico_hallazgo_lineas (empresa_id, hallazgo_id);
CREATE INDEX diagnostico_lineas_empresa_linea_idx ON public.diagnostico_tecnico_hallazgo_lineas (empresa_id, linea_id);

CREATE OR REPLACE FUNCTION public.bloquear_hallazgo_emitido()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_diagnostico text; v_empresa text; v_estado text;
BEGIN
  IF TG_OP = 'DELETE' THEN v_diagnostico := OLD.diagnostico_id; v_empresa := OLD.empresa_id;
  ELSIF TG_OP IN ('INSERT','UPDATE') THEN v_diagnostico := NEW.diagnostico_id; v_empresa := NEW.empresa_id;
  ELSE RAISE EXCEPTION USING MESSAGE = format(U&'Operaci\00F3n de trigger no soportada: %s', TG_OP), ERRCODE = '0A000'; END IF;
  SELECT d.empresa_id, d.estado INTO v_empresa, v_estado
  FROM public.diagnosticos_tecnicos d WHERE d.id = v_diagnostico FOR SHARE;
  IF NOT FOUND THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RAISE EXCEPTION USING MESSAGE = format(U&'El diagn\00F3stico %s no existe', v_diagnostico), ERRCODE = '23503';
  END IF;
  IF v_empresa IS DISTINCT FROM (CASE WHEN TG_OP = 'DELETE' THEN OLD.empresa_id ELSE NEW.empresa_id END) THEN
    RAISE EXCEPTION USING MESSAGE = U&'El hallazgo y el diagn\00F3stico deben pertenecer a la misma empresa', ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.empresa_id IS DISTINCT FROM OLD.empresa_id OR NEW.diagnostico_id IS DISTINCT FROM OLD.diagnostico_id) THEN
    RAISE EXCEPTION 'empresa_id y diagnostico_id son inmutables' USING ERRCODE = '23514';
  END IF;
  IF v_estado = 'emitido' THEN
    RAISE EXCEPTION USING MESSAGE = U&'No se puede modificar un hallazgo de diagn\00F3stico emitido', ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$fn$;

CREATE OR REPLACE FUNCTION public.validar_hallazgo_referencias()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_empresa text;
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.diagnostico_id IS DISTINCT FROM OLD.diagnostico_id
     OR NEW.familia_trabajo_id IS DISTINCT FROM OLD.familia_trabajo_id
     OR NEW.tipo_dano_codigo IS DISTINCT FROM OLD.tipo_dano_codigo
     OR NEW.causa_probable_codigo IS DISTINCT FROM OLD.causa_probable_codigo THEN
    SELECT d.empresa_id INTO v_empresa FROM public.diagnosticos_tecnicos d WHERE d.id = NEW.diagnostico_id FOR SHARE;
    IF NOT FOUND OR v_empresa IS DISTINCT FROM NEW.empresa_id THEN
      RAISE EXCEPTION 'diagnostico_id no pertenece a empresa_id' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.familia_trabajo f WHERE f.id = NEW.familia_trabajo_id AND f.empresa_id = NEW.empresa_id) THEN
      RAISE EXCEPTION 'familia_trabajo_id no pertenece a empresa_id' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.diagnostico_catalogo_valores c WHERE c.empresa_id = NEW.empresa_id AND c.catalogo = 'tipo_dano' AND c.codigo = NEW.tipo_dano_codigo AND c.activo) THEN
      RAISE EXCEPTION 'tipo_dano_codigo no pertenece a empresa_id' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.diagnostico_catalogo_valores c WHERE c.empresa_id = NEW.empresa_id AND c.catalogo = 'causa_probable' AND c.codigo = NEW.causa_probable_codigo AND c.activo) THEN
      RAISE EXCEPTION 'causa_probable_codigo no pertenece a empresa_id' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END
$fn$;

CREATE OR REPLACE FUNCTION public.bloquear_cambio_codigo_catalogo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.codigo IS DISTINCT FROM OLD.codigo THEN
    RAISE EXCEPTION 'El codigo de catalogo es inmutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$fn$;

CREATE OR REPLACE FUNCTION public.calcular_hallazgo_prioridad()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
BEGIN
  NEW.prioridad_calculada := public.calcular_prioridad_diagnostico(NEW.condicion, NEW.riesgo, NULL, NULL, NEW.matriz_version);
  NEW.prioridad_efectiva := public.calcular_prioridad_diagnostico(NEW.condicion, NEW.riesgo, NEW.prioridad_override, NEW.prioridad_override_motivo, NEW.matriz_version);
  RETURN NEW;
END
$fn$;

CREATE OR REPLACE FUNCTION public.bloquear_medicion_emitida()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_diag text; v_empresa text; v_estado text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT h.diagnostico_id, h.empresa_id INTO v_diag, v_empresa FROM public.diagnostico_tecnico_hallazgos h WHERE h.id = OLD.hallazgo_id FOR SHARE;
  ELSE
    SELECT h.diagnostico_id, h.empresa_id INTO v_diag, v_empresa FROM public.diagnostico_tecnico_hallazgos h WHERE h.id = NEW.hallazgo_id FOR SHARE;
  END IF;
  IF NOT FOUND THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RAISE EXCEPTION USING MESSAGE = U&'El hallazgo no existe', ERRCODE = '23503';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.empresa_id IS DISTINCT FROM OLD.empresa_id OR NEW.hallazgo_id IS DISTINCT FROM OLD.hallazgo_id) THEN
    RAISE EXCEPTION 'empresa_id y hallazgo_id son inmutables' USING ERRCODE = '23514';
  END IF;
  IF v_empresa IS DISTINCT FROM (CASE WHEN TG_OP = 'DELETE' THEN OLD.empresa_id ELSE NEW.empresa_id END) THEN
    RAISE EXCEPTION USING MESSAGE = U&'La medici\00F3n y el hallazgo deben pertenecer a la misma empresa', ERRCODE = '23514';
  END IF;
  SELECT d.estado INTO v_estado FROM public.diagnosticos_tecnicos d WHERE d.id = v_diag FOR SHARE;
  IF v_estado = 'emitido' THEN RAISE EXCEPTION USING MESSAGE = U&'No se puede modificar una medici\00F3n de diagn\00F3stico emitido', ERRCODE = '42501'; END IF;
  IF TG_OP = 'INSERT'
     OR (TG_OP = 'UPDATE' AND NEW.unidad IS DISTINCT FROM OLD.unidad) THEN
    IF NOT EXISTS (SELECT 1 FROM public.diagnostico_catalogo_valores c WHERE c.empresa_id = NEW.empresa_id AND c.catalogo = 'unidad_medicion' AND c.codigo = NEW.unidad AND c.activo) THEN
      RAISE EXCEPTION 'unidad no pertenece a empresa_id' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$fn$;

CREATE OR REPLACE FUNCTION public.sugerir_condicion_medicion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
BEGIN
  IF NEW.medido IS NULL OR (NEW.minimo IS NULL AND NEW.maximo IS NULL) THEN
    NEW.resultado_calculado := 'sin_sugerencia'; NEW.condicion_sugerida := NULL;
  ELSIF (NEW.minimo IS NOT NULL AND NEW.medido < NEW.minimo) OR (NEW.maximo IS NOT NULL AND NEW.medido > NEW.maximo) THEN
    NEW.resultado_calculado := 'fuera_de_rango'; NEW.condicion_sugerida := 'fuera_de_tolerancia';
  ELSE
    NEW.resultado_calculado := 'dentro_de_rango'; NEW.condicion_sugerida := 'conforme';
  END IF;
  RETURN NEW;
END
$fn$;

CREATE OR REPLACE FUNCTION public.bloquear_hallazgo_linea_emitido()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_hallazgo uuid; v_diag text; v_empresa text; v_familia uuid; v_estado text; v_linea_empresa text; v_linea_diag text; v_linea_familia uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN v_hallazgo := OLD.hallazgo_id;
  ELSIF TG_OP IN ('INSERT','UPDATE') THEN v_hallazgo := NEW.hallazgo_id;
  ELSE RAISE EXCEPTION USING MESSAGE = format(U&'Operaci\00F3n de trigger no soportada: %s', TG_OP), ERRCODE = '0A000'; END IF;
  IF TG_OP = 'UPDATE' AND (NEW.empresa_id IS DISTINCT FROM OLD.empresa_id OR NEW.hallazgo_id IS DISTINCT FROM OLD.hallazgo_id OR NEW.linea_id IS DISTINCT FROM OLD.linea_id) THEN
    RAISE EXCEPTION 'empresa_id, hallazgo_id y linea_id son inmutables' USING ERRCODE = '23514';
  END IF;
  SELECT h.diagnostico_id, h.empresa_id, h.familia_trabajo_id INTO v_diag, v_empresa, v_familia FROM public.diagnostico_tecnico_hallazgos h WHERE h.id = v_hallazgo FOR SHARE;
  IF NOT FOUND THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RAISE EXCEPTION USING MESSAGE = U&'El hallazgo no existe', ERRCODE = '23503';
  END IF;
  SELECT d.estado INTO v_estado FROM public.diagnosticos_tecnicos d WHERE d.id = v_diag FOR SHARE;
  IF v_estado = 'emitido' THEN RAISE EXCEPTION USING MESSAGE = U&'No se puede modificar un enlace de diagn\00F3stico emitido', ERRCODE = '42501'; END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT l.empresa_id, l.diagnostico_id, l.familia_trabajo_id INTO v_linea_empresa, v_linea_diag, v_linea_familia FROM public.diagnostico_tecnico_lineas l WHERE l.id = NEW.linea_id FOR SHARE;
    IF NOT FOUND OR v_linea_empresa IS DISTINCT FROM v_empresa OR v_linea_diag IS DISTINCT FROM v_diag OR v_linea_familia IS DISTINCT FROM v_familia THEN
      RAISE EXCEPTION USING MESSAGE = U&'La l\00EDnea debe pertenecer al mismo diagn\00F3stico, empresa y Trabajo del hallazgo', ERRCODE = '23514';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$fn$;

CREATE OR REPLACE FUNCTION public.bloquear_cambio_linea_vinculada()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
BEGIN
  IF TG_OP = 'UPDATE'
     AND (NEW.diagnostico_id IS DISTINCT FROM OLD.diagnostico_id
          OR NEW.familia_trabajo_id IS DISTINCT FROM OLD.familia_trabajo_id)
     AND EXISTS (SELECT 1 FROM public.diagnostico_tecnico_hallazgo_lineas l WHERE l.linea_id = OLD.id) THEN
    RAISE EXCEPTION 'No se puede cambiar diagnostico_id o familia_trabajo_id de una linea vinculada' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$fn$;

CREATE TRIGGER a_bloquear_hallazgo_emitido BEFORE INSERT OR UPDATE OR DELETE ON public.diagnostico_tecnico_hallazgos FOR EACH ROW EXECUTE FUNCTION public.bloquear_hallazgo_emitido();
CREATE TRIGGER b_validar_hallazgo_referencias BEFORE INSERT OR UPDATE ON public.diagnostico_tecnico_hallazgos FOR EACH ROW EXECUTE FUNCTION public.validar_hallazgo_referencias();
CREATE TRIGGER c_calcular_hallazgo_prioridad BEFORE INSERT OR UPDATE ON public.diagnostico_tecnico_hallazgos FOR EACH ROW EXECUTE FUNCTION public.calcular_hallazgo_prioridad();
CREATE TRIGGER trg_bloquear_cambio_codigo_catalogo BEFORE UPDATE ON public.diagnostico_catalogo_valores FOR EACH ROW EXECUTE FUNCTION public.bloquear_cambio_codigo_catalogo();
CREATE TRIGGER a_bloquear_medicion_emitida BEFORE INSERT OR UPDATE OR DELETE ON public.diagnostico_tecnico_hallazgo_mediciones FOR EACH ROW EXECUTE FUNCTION public.bloquear_medicion_emitida();
CREATE TRIGGER b_sugerir_condicion_medicion BEFORE INSERT OR UPDATE ON public.diagnostico_tecnico_hallazgo_mediciones FOR EACH ROW EXECUTE FUNCTION public.sugerir_condicion_medicion();
CREATE TRIGGER a_bloquear_hallazgo_linea_emitido BEFORE INSERT OR UPDATE OR DELETE ON public.diagnostico_tecnico_hallazgo_lineas FOR EACH ROW EXECUTE FUNCTION public.bloquear_hallazgo_linea_emitido();
CREATE TRIGGER trg_bloquear_cambio_linea_vinculada BEFORE UPDATE ON public.diagnostico_tecnico_lineas FOR EACH ROW EXECUTE FUNCTION public.bloquear_cambio_linea_vinculada();

ALTER TABLE public.diagnostico_catalogo_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diagnostico_catalogo_valores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diagnostico_matriz_prioridad ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diagnostico_tecnico_hallazgos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diagnostico_tecnico_hallazgo_mediciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diagnostico_tecnico_hallazgo_lineas ENABLE ROW LEVEL SECURITY;

CREATE POLICY diagnostico_catalogo_defaults_select ON public.diagnostico_catalogo_defaults FOR SELECT TO authenticated USING (true);
CREATE POLICY diagnostico_catalogo_valores_select ON public.diagnostico_catalogo_valores FOR SELECT TO authenticated USING (public.usuario_tiene_empresa(public.diagnostico_catalogo_valores.empresa_id));
CREATE POLICY diagnostico_catalogo_valores_insert ON public.diagnostico_catalogo_valores FOR INSERT TO authenticated WITH CHECK (public.usuario_tiene_empresa(public.diagnostico_catalogo_valores.empresa_id) AND public.usuario_puede(public.diagnostico_catalogo_valores.empresa_id,'maestros','editar'));
CREATE POLICY diagnostico_catalogo_valores_update ON public.diagnostico_catalogo_valores FOR UPDATE TO authenticated USING (public.usuario_tiene_empresa(public.diagnostico_catalogo_valores.empresa_id) AND public.usuario_puede(public.diagnostico_catalogo_valores.empresa_id,'maestros','editar')) WITH CHECK (public.usuario_tiene_empresa(public.diagnostico_catalogo_valores.empresa_id) AND public.usuario_puede(public.diagnostico_catalogo_valores.empresa_id,'maestros','editar'));
CREATE POLICY diagnostico_matriz_prioridad_select ON public.diagnostico_matriz_prioridad FOR SELECT TO authenticated USING (true);

CREATE POLICY hallazgos_select ON public.diagnostico_tecnico_hallazgos FOR SELECT TO authenticated USING (public.usuario_tiene_empresa(public.diagnostico_tecnico_hallazgos.empresa_id) AND public.usuario_puede(public.diagnostico_tecnico_hallazgos.empresa_id,'diagnostico_tecnico','ver') AND EXISTS (SELECT 1 FROM public.diagnosticos_tecnicos WHERE public.diagnosticos_tecnicos.id = public.diagnostico_tecnico_hallazgos.diagnostico_id AND public.diagnosticos_tecnicos.empresa_id = public.diagnostico_tecnico_hallazgos.empresa_id AND public.usuario_puede_ver_diagnostico_padre(public.diagnosticos_tecnicos.tipo, public.diagnosticos_tecnicos.empresa_id, public.diagnosticos_tecnicos.recepcion_id, public.diagnosticos_tecnicos.oportunidad_id)));
CREATE POLICY hallazgos_insert ON public.diagnostico_tecnico_hallazgos FOR INSERT TO authenticated WITH CHECK (public.usuario_tiene_empresa(public.diagnostico_tecnico_hallazgos.empresa_id) AND public.usuario_puede(public.diagnostico_tecnico_hallazgos.empresa_id,'diagnostico_tecnico','crear') AND EXISTS (SELECT 1 FROM public.diagnosticos_tecnicos WHERE public.diagnosticos_tecnicos.id = public.diagnostico_tecnico_hallazgos.diagnostico_id AND public.diagnosticos_tecnicos.empresa_id = public.diagnostico_tecnico_hallazgos.empresa_id AND public.diagnosticos_tecnicos.estado = 'borrador'));
CREATE POLICY hallazgos_update ON public.diagnostico_tecnico_hallazgos FOR UPDATE TO authenticated USING (public.usuario_tiene_empresa(public.diagnostico_tecnico_hallazgos.empresa_id) AND public.usuario_puede(public.diagnostico_tecnico_hallazgos.empresa_id,'diagnostico_tecnico','editar') AND EXISTS (SELECT 1 FROM public.diagnosticos_tecnicos WHERE public.diagnosticos_tecnicos.id = public.diagnostico_tecnico_hallazgos.diagnostico_id AND public.diagnosticos_tecnicos.empresa_id = public.diagnostico_tecnico_hallazgos.empresa_id AND public.diagnosticos_tecnicos.estado = 'borrador')) WITH CHECK (public.usuario_tiene_empresa(public.diagnostico_tecnico_hallazgos.empresa_id) AND public.usuario_puede(public.diagnostico_tecnico_hallazgos.empresa_id,'diagnostico_tecnico','editar') AND EXISTS (SELECT 1 FROM public.diagnosticos_tecnicos WHERE public.diagnosticos_tecnicos.id = public.diagnostico_tecnico_hallazgos.diagnostico_id AND public.diagnosticos_tecnicos.empresa_id = public.diagnostico_tecnico_hallazgos.empresa_id AND public.diagnosticos_tecnicos.estado = 'borrador'));
CREATE POLICY hallazgos_delete ON public.diagnostico_tecnico_hallazgos FOR DELETE TO authenticated USING (public.usuario_tiene_empresa(public.diagnostico_tecnico_hallazgos.empresa_id) AND public.usuario_puede(public.diagnostico_tecnico_hallazgos.empresa_id,'diagnostico_tecnico','editar') AND EXISTS (SELECT 1 FROM public.diagnosticos_tecnicos WHERE public.diagnosticos_tecnicos.id = public.diagnostico_tecnico_hallazgos.diagnostico_id AND public.diagnosticos_tecnicos.empresa_id = public.diagnostico_tecnico_hallazgos.empresa_id AND public.diagnosticos_tecnicos.estado = 'borrador'));

CREATE POLICY mediciones_select ON public.diagnostico_tecnico_hallazgo_mediciones FOR SELECT TO authenticated USING (public.usuario_tiene_empresa(public.diagnostico_tecnico_hallazgo_mediciones.empresa_id) AND public.usuario_puede(public.diagnostico_tecnico_hallazgo_mediciones.empresa_id,'diagnostico_tecnico','ver') AND EXISTS (SELECT 1 FROM public.diagnostico_tecnico_hallazgos WHERE public.diagnostico_tecnico_hallazgos.id = public.diagnostico_tecnico_hallazgo_mediciones.hallazgo_id AND public.diagnostico_tecnico_hallazgos.empresa_id = public.diagnostico_tecnico_hallazgo_mediciones.empresa_id));
CREATE POLICY mediciones_insert ON public.diagnostico_tecnico_hallazgo_mediciones FOR INSERT TO authenticated WITH CHECK (public.usuario_tiene_empresa(public.diagnostico_tecnico_hallazgo_mediciones.empresa_id) AND public.usuario_puede(public.diagnostico_tecnico_hallazgo_mediciones.empresa_id,'diagnostico_tecnico','crear') AND EXISTS (SELECT 1 FROM public.diagnostico_tecnico_hallazgos JOIN public.diagnosticos_tecnicos ON public.diagnosticos_tecnicos.id = public.diagnostico_tecnico_hallazgos.diagnostico_id AND public.diagnosticos_tecnicos.empresa_id = public.diagnostico_tecnico_hallazgos.empresa_id WHERE public.diagnostico_tecnico_hallazgos.id = public.diagnostico_tecnico_hallazgo_mediciones.hallazgo_id AND public.diagnostico_tecnico_hallazgos.empresa_id = public.diagnostico_tecnico_hallazgo_mediciones.empresa_id AND public.diagnosticos_tecnicos.estado = 'borrador'));
CREATE POLICY mediciones_update ON public.diagnostico_tecnico_hallazgo_mediciones FOR UPDATE TO authenticated USING (public.usuario_tiene_empresa(public.diagnostico_tecnico_hallazgo_mediciones.empresa_id) AND public.usuario_puede(public.diagnostico_tecnico_hallazgo_mediciones.empresa_id,'diagnostico_tecnico','editar') AND EXISTS (SELECT 1 FROM public.diagnostico_tecnico_hallazgos JOIN public.diagnosticos_tecnicos ON public.diagnosticos_tecnicos.id = public.diagnostico_tecnico_hallazgos.diagnostico_id AND public.diagnosticos_tecnicos.empresa_id = public.diagnostico_tecnico_hallazgos.empresa_id WHERE public.diagnostico_tecnico_hallazgos.id = public.diagnostico_tecnico_hallazgo_mediciones.hallazgo_id AND public.diagnostico_tecnico_hallazgos.empresa_id = public.diagnostico_tecnico_hallazgo_mediciones.empresa_id AND public.diagnosticos_tecnicos.estado = 'borrador')) WITH CHECK (public.usuario_tiene_empresa(public.diagnostico_tecnico_hallazgo_mediciones.empresa_id) AND public.usuario_puede(public.diagnostico_tecnico_hallazgo_mediciones.empresa_id,'diagnostico_tecnico','editar') AND EXISTS (SELECT 1 FROM public.diagnostico_tecnico_hallazgos JOIN public.diagnosticos_tecnicos ON public.diagnosticos_tecnicos.id = public.diagnostico_tecnico_hallazgos.diagnostico_id AND public.diagnosticos_tecnicos.empresa_id = public.diagnostico_tecnico_hallazgos.empresa_id WHERE public.diagnostico_tecnico_hallazgos.id = public.diagnostico_tecnico_hallazgo_mediciones.hallazgo_id AND public.diagnostico_tecnico_hallazgos.empresa_id = public.diagnostico_tecnico_hallazgo_mediciones.empresa_id AND public.diagnosticos_tecnicos.estado = 'borrador'));
CREATE POLICY mediciones_delete ON public.diagnostico_tecnico_hallazgo_mediciones FOR DELETE TO authenticated USING (public.usuario_tiene_empresa(public.diagnostico_tecnico_hallazgo_mediciones.empresa_id) AND public.usuario_puede(public.diagnostico_tecnico_hallazgo_mediciones.empresa_id,'diagnostico_tecnico','editar') AND EXISTS (SELECT 1 FROM public.diagnostico_tecnico_hallazgos JOIN public.diagnosticos_tecnicos ON public.diagnosticos_tecnicos.id = public.diagnostico_tecnico_hallazgos.diagnostico_id AND public.diagnosticos_tecnicos.empresa_id = public.diagnostico_tecnico_hallazgos.empresa_id WHERE public.diagnostico_tecnico_hallazgos.id = public.diagnostico_tecnico_hallazgo_mediciones.hallazgo_id AND public.diagnostico_tecnico_hallazgos.empresa_id = public.diagnostico_tecnico_hallazgo_mediciones.empresa_id AND public.diagnosticos_tecnicos.estado = 'borrador'));

CREATE POLICY hallazgo_lineas_select ON public.diagnostico_tecnico_hallazgo_lineas FOR SELECT TO authenticated USING (public.usuario_tiene_empresa(public.diagnostico_tecnico_hallazgo_lineas.empresa_id) AND public.usuario_puede(public.diagnostico_tecnico_hallazgo_lineas.empresa_id,'diagnostico_tecnico','ver') AND EXISTS (SELECT 1 FROM public.diagnostico_tecnico_hallazgos WHERE public.diagnostico_tecnico_hallazgos.id = public.diagnostico_tecnico_hallazgo_lineas.hallazgo_id AND public.diagnostico_tecnico_hallazgos.empresa_id = public.diagnostico_tecnico_hallazgo_lineas.empresa_id));
CREATE POLICY hallazgo_lineas_insert ON public.diagnostico_tecnico_hallazgo_lineas FOR INSERT TO authenticated WITH CHECK (public.usuario_tiene_empresa(public.diagnostico_tecnico_hallazgo_lineas.empresa_id) AND public.usuario_puede(public.diagnostico_tecnico_hallazgo_lineas.empresa_id,'diagnostico_tecnico','crear') AND EXISTS (SELECT 1 FROM public.diagnostico_tecnico_hallazgos JOIN public.diagnosticos_tecnicos ON public.diagnosticos_tecnicos.id = public.diagnostico_tecnico_hallazgos.diagnostico_id AND public.diagnosticos_tecnicos.empresa_id = public.diagnostico_tecnico_hallazgos.empresa_id WHERE public.diagnostico_tecnico_hallazgos.id = public.diagnostico_tecnico_hallazgo_lineas.hallazgo_id AND public.diagnostico_tecnico_hallazgos.empresa_id = public.diagnostico_tecnico_hallazgo_lineas.empresa_id AND public.diagnosticos_tecnicos.estado = 'borrador'));
CREATE POLICY hallazgo_lineas_update ON public.diagnostico_tecnico_hallazgo_lineas FOR UPDATE TO authenticated USING (public.usuario_tiene_empresa(public.diagnostico_tecnico_hallazgo_lineas.empresa_id) AND public.usuario_puede(public.diagnostico_tecnico_hallazgo_lineas.empresa_id,'diagnostico_tecnico','editar') AND EXISTS (SELECT 1 FROM public.diagnostico_tecnico_hallazgos JOIN public.diagnosticos_tecnicos ON public.diagnosticos_tecnicos.id = public.diagnostico_tecnico_hallazgos.diagnostico_id AND public.diagnosticos_tecnicos.empresa_id = public.diagnostico_tecnico_hallazgos.empresa_id WHERE public.diagnostico_tecnico_hallazgos.id = public.diagnostico_tecnico_hallazgo_lineas.hallazgo_id AND public.diagnostico_tecnico_hallazgos.empresa_id = public.diagnostico_tecnico_hallazgo_lineas.empresa_id AND public.diagnosticos_tecnicos.estado = 'borrador')) WITH CHECK (public.usuario_tiene_empresa(public.diagnostico_tecnico_hallazgo_lineas.empresa_id) AND public.usuario_puede(public.diagnostico_tecnico_hallazgo_lineas.empresa_id,'diagnostico_tecnico','editar') AND EXISTS (SELECT 1 FROM public.diagnostico_tecnico_hallazgos JOIN public.diagnosticos_tecnicos ON public.diagnosticos_tecnicos.id = public.diagnostico_tecnico_hallazgos.diagnostico_id AND public.diagnosticos_tecnicos.empresa_id = public.diagnostico_tecnico_hallazgos.empresa_id WHERE public.diagnostico_tecnico_hallazgos.id = public.diagnostico_tecnico_hallazgo_lineas.hallazgo_id AND public.diagnostico_tecnico_hallazgos.empresa_id = public.diagnostico_tecnico_hallazgo_lineas.empresa_id AND public.diagnosticos_tecnicos.estado = 'borrador'));
CREATE POLICY hallazgo_lineas_delete ON public.diagnostico_tecnico_hallazgo_lineas FOR DELETE TO authenticated USING (public.usuario_tiene_empresa(public.diagnostico_tecnico_hallazgo_lineas.empresa_id) AND public.usuario_puede(public.diagnostico_tecnico_hallazgo_lineas.empresa_id,'diagnostico_tecnico','editar') AND EXISTS (SELECT 1 FROM public.diagnostico_tecnico_hallazgos JOIN public.diagnosticos_tecnicos ON public.diagnosticos_tecnicos.id = public.diagnostico_tecnico_hallazgos.diagnostico_id AND public.diagnosticos_tecnicos.empresa_id = public.diagnostico_tecnico_hallazgos.empresa_id WHERE public.diagnostico_tecnico_hallazgos.id = public.diagnostico_tecnico_hallazgo_lineas.hallazgo_id AND public.diagnostico_tecnico_hallazgos.empresa_id = public.diagnostico_tecnico_hallazgo_lineas.empresa_id AND public.diagnosticos_tecnicos.estado = 'borrador'));

REVOKE ALL ON public.diagnostico_catalogo_defaults, public.diagnostico_catalogo_valores, public.diagnostico_matriz_prioridad, public.diagnostico_tecnico_hallazgos, public.diagnostico_tecnico_hallazgo_mediciones, public.diagnostico_tecnico_hallazgo_lineas FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.diagnostico_catalogo_defaults, public.diagnostico_matriz_prioridad TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.diagnostico_catalogo_valores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.diagnostico_tecnico_hallazgos, public.diagnostico_tecnico_hallazgo_mediciones, public.diagnostico_tecnico_hallazgo_lineas TO authenticated;
REVOKE ALL ON FUNCTION public.inicializar_catalogos_diagnostico(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inicializar_catalogos_diagnostico(text) TO authenticated;
REVOKE ALL ON FUNCTION public.calcular_prioridad_diagnostico(text,text,text,text,smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calcular_prioridad_diagnostico(text,text,text,text,smallint) TO authenticated;
REVOKE ALL ON FUNCTION public.bloquear_hallazgo_emitido(), public.validar_hallazgo_referencias(), public.bloquear_cambio_codigo_catalogo(), public.calcular_hallazgo_prioridad(), public.bloquear_medicion_emitida(), public.sugerir_condicion_medicion(), public.bloquear_hallazgo_linea_emitido(), public.bloquear_cambio_linea_vinculada() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER audit_diagnostico_tecnico_hallazgos AFTER INSERT OR UPDATE ON public.diagnostico_tecnico_hallazgos FOR EACH ROW EXECUTE FUNCTION public.audit_backend_minimo();
CREATE TRIGGER audit_diagnostico_tecnico_hallazgo_mediciones AFTER INSERT OR UPDATE ON public.diagnostico_tecnico_hallazgo_mediciones FOR EACH ROW EXECUTE FUNCTION public.audit_backend_minimo();

SELECT 'after_existing_function_attrs' AS snapshot,
       p.oid::regprocedure AS funcion, p.proacl, p.proowner::regrole AS proowner,
       p.prosecdef, p.proconfig, p.provolatile
FROM pg_proc p
JOIN _592_attr_before b ON b.oid = p.oid
ORDER BY p.oid::regprocedure::text;

INSERT INTO _592_report(stage, function_name, proacl, proowner, prosecdef, proconfig, provolatile)
SELECT 'after_existing_function_attrs', p.oid::regprocedure::text, p.proacl::text,
       p.proowner::regrole::text, p.prosecdef, p.proconfig::text, p.provolatile::text
FROM pg_proc p
JOIN _592_attr_before b ON b.oid = p.oid;

SELECT 'after_trigger_function_attrs' AS snapshot,
       p.oid::regprocedure AS funcion, p.proacl, p.proowner::regrole AS proowner,
       p.prosecdef, p.proconfig, p.provolatile,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('bloquear_hallazgo_emitido','validar_hallazgo_referencias',
                    'bloquear_cambio_codigo_catalogo','calcular_hallazgo_prioridad','bloquear_medicion_emitida',
                    'sugerir_condicion_medicion','bloquear_hallazgo_linea_emitido','bloquear_cambio_linea_vinculada')
ORDER BY p.oid::regprocedure::text;

INSERT INTO _592_report(stage, function_name, proacl, proowner, prosecdef, proconfig, provolatile, anon_execute, authenticated_execute)
SELECT 'after_trigger_function_attrs', p.oid::regprocedure::text, p.proacl::text,
       p.proowner::regrole::text, p.prosecdef, p.proconfig::text, p.provolatile::text,
       has_function_privilege('anon', p.oid, 'EXECUTE'),
       has_function_privilege('authenticated', p.oid, 'EXECUTE')
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('bloquear_hallazgo_emitido','validar_hallazgo_referencias',
                    'bloquear_cambio_codigo_catalogo','calcular_hallazgo_prioridad','bloquear_medicion_emitida',
                    'sugerir_condicion_medicion','bloquear_hallazgo_linea_emitido','bloquear_cambio_linea_vinculada');

SELECT 'seed_counts' AS snapshot,
       (SELECT count(*) FROM public.diagnostico_catalogo_defaults) AS defaults_count,
       (SELECT count(*) FROM public.diagnostico_catalogo_valores) AS values_count,
       (SELECT count(*) FROM public.diagnostico_matriz_prioridad) AS matrix_count,
       (SELECT count(*) FROM public.diagnostico_catalogo_defaults WHERE catalogo = 'tipo_dano') AS tipo_dano_count,
       (SELECT count(*) FROM public.diagnostico_catalogo_defaults WHERE catalogo = 'causa_probable') AS causa_probable_count,
       (SELECT count(*) FROM public.diagnostico_catalogo_defaults WHERE catalogo = 'unidad_medicion') AS unidad_medicion_count;

INSERT INTO _592_report(stage, defaults_count, values_count, matrix_count, tipo_dano_count, causa_probable_count, unidad_medicion_count)
SELECT 'seed_counts',
       (SELECT count(*) FROM public.diagnostico_catalogo_defaults),
       (SELECT count(*) FROM public.diagnostico_catalogo_valores),
       (SELECT count(*) FROM public.diagnostico_matriz_prioridad),
       (SELECT count(*) FROM public.diagnostico_catalogo_defaults WHERE catalogo = 'tipo_dano'),
       (SELECT count(*) FROM public.diagnostico_catalogo_defaults WHERE catalogo = 'causa_probable'),
       (SELECT count(*) FROM public.diagnostico_catalogo_defaults WHERE catalogo = 'unidad_medicion');

SELECT 'seed_mojibake_count' AS snapshot, count(*) AS ocurrencias
FROM (
  SELECT catalogo AS texto FROM public.diagnostico_catalogo_defaults
  UNION ALL SELECT codigo FROM public.diagnostico_catalogo_defaults
  UNION ALL SELECT etiqueta FROM public.diagnostico_catalogo_defaults
  UNION ALL SELECT catalogo FROM public.diagnostico_catalogo_valores
  UNION ALL SELECT codigo FROM public.diagnostico_catalogo_valores
  UNION ALL SELECT etiqueta FROM public.diagnostico_catalogo_valores
  UNION ALL SELECT condicion_codigo FROM public.diagnostico_matriz_prioridad
  UNION ALL SELECT riesgo_codigo FROM public.diagnostico_matriz_prioridad
  UNION ALL SELECT prioridad FROM public.diagnostico_matriz_prioridad
) s
WHERE position(chr(194) IN s.texto) > 0
   OR position(chr(195) IN s.texto) > 0
   OR position(chr(65533) IN s.texto) > 0
   OR position(chr(226) || chr(8364) IN s.texto) > 0;

INSERT INTO _592_report(stage, mojibake_count)
SELECT 'seed_mojibake_count', count(*)
FROM (
  SELECT catalogo AS texto FROM public.diagnostico_catalogo_defaults
  UNION ALL SELECT codigo FROM public.diagnostico_catalogo_defaults
  UNION ALL SELECT etiqueta FROM public.diagnostico_catalogo_defaults
  UNION ALL SELECT catalogo FROM public.diagnostico_catalogo_valores
  UNION ALL SELECT codigo FROM public.diagnostico_catalogo_valores
  UNION ALL SELECT etiqueta FROM public.diagnostico_catalogo_valores
  UNION ALL SELECT condicion_codigo FROM public.diagnostico_matriz_prioridad
  UNION ALL SELECT riesgo_codigo FROM public.diagnostico_matriz_prioridad
  UNION ALL SELECT prioridad FROM public.diagnostico_matriz_prioridad
) s
WHERE position(chr(194) IN s.texto) > 0
   OR position(chr(195) IN s.texto) > 0
   OR position(chr(65533) IN s.texto) > 0
   OR position(chr(226) || chr(8364) IN s.texto) > 0;

DO $$
DECLARE v_bad integer; v_new record;
BEGIN
  ASSERT NOT EXISTS (
    SELECT 1 FROM _592_attr_before b
    JOIN pg_proc p ON p.oid = b.oid
    WHERE b.proacl IS DISTINCT FROM p.proacl
       OR b.proowner IS DISTINCT FROM p.proowner
       OR b.prosecdef IS DISTINCT FROM p.prosecdef
       OR b.proconfig IS DISTINCT FROM p.proconfig
       OR b.provolatile IS DISTINCT FROM p.provolatile
  ), 'POSTCONDITION_FAILED: atributos de funciones existentes cambiaron';
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('bloquear_hallazgo_emitido','validar_hallazgo_referencias','bloquear_cambio_codigo_catalogo','calcular_hallazgo_prioridad','bloquear_medicion_emitida','sugerir_condicion_medicion','bloquear_hallazgo_linea_emitido','bloquear_cambio_linea_vinculada')
      AND (p.proowner IS DISTINCT FROM (SELECT oid FROM pg_roles WHERE rolname = current_user)
           OR NOT p.prosecdef OR p.provolatile <> 'v'
           OR NOT (coalesce(p.proconfig,'{}') @> ARRAY['search_path=public, pg_temp']::text[])
           OR has_function_privilege('anon', p.oid, 'EXECUTE')
           OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  ), 'POSTCONDITION_FAILED: atributos o ACL de trigger incorrectos';
  SELECT count(*) INTO v_bad FROM (
    SELECT catalogo AS t FROM public.diagnostico_catalogo_defaults
    UNION ALL SELECT codigo FROM public.diagnostico_catalogo_defaults
    UNION ALL SELECT etiqueta FROM public.diagnostico_catalogo_defaults
    UNION ALL SELECT catalogo FROM public.diagnostico_catalogo_valores
    UNION ALL SELECT codigo FROM public.diagnostico_catalogo_valores
    UNION ALL SELECT etiqueta FROM public.diagnostico_catalogo_valores
    UNION ALL SELECT condicion_codigo FROM public.diagnostico_matriz_prioridad
    UNION ALL SELECT riesgo_codigo FROM public.diagnostico_matriz_prioridad
    UNION ALL SELECT prioridad FROM public.diagnostico_matriz_prioridad
  ) s WHERE position(chr(194) IN s.t) > 0 OR position(chr(195) IN s.t) > 0 OR position(chr(65533) IN s.t) > 0 OR position(chr(226) || chr(8364) IN s.t) > 0;
  ASSERT v_bad = 0, 'POSTCONDITION_FAILED: mojibake en catálogos o matriz';
  SELECT count(*) INTO v_bad FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('inicializar_catalogos_diagnostico','calcular_prioridad_diagnostico','bloquear_hallazgo_emitido','validar_hallazgo_referencias','bloquear_cambio_codigo_catalogo','calcular_hallazgo_prioridad','bloquear_medicion_emitida','sugerir_condicion_medicion','bloquear_hallazgo_linea_emitido','bloquear_cambio_linea_vinculada')
    AND (position(chr(194) IN pg_get_functiondef(p.oid)) > 0 OR position(chr(195) IN pg_get_functiondef(p.oid)) > 0 OR position(chr(65533) IN pg_get_functiondef(p.oid)) > 0 OR position(chr(226) || chr(8364) IN pg_get_functiondef(p.oid)) > 0);
  ASSERT v_bad = 0, 'POSTCONDITION_FAILED: mojibake en funciones nuevas';
END $$;

SELECT * FROM _592_report
ORDER BY stage, function_name NULLS LAST;

ROLLBACK;
