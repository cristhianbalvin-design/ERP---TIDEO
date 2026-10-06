BEGIN;
SET LOCAL ROLE postgres;
-- 592 — Diagnóstico Técnico: catálogos, matriz v1 y Hallazgos base.
-- UTF-8 sin BOM. No incluye fotos, informes ni UI.
-- Aplicación protocolaria: BEGIN…COMMIT; el dry-run sustituye mecánicamente
-- solamente el COMMIT final por ROLLBACK.

CREATE TEMP TABLE _592_attr_before ON COMMIT DROP AS
SELECT p.oid, p.proacl, p.proowner, p.prosecdef, p.proconfig, p.provolatile
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('audit_backend_minimo', 'usuario_puede', 'usuario_puede_ver_diagnostico_padre');

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

CREATE TEMP TABLE _592_behavior_results (
  prueba text PRIMARY KEY,
  ok boolean NOT NULL,
  detalle text
);
GRANT INSERT, UPDATE, SELECT ON _592_behavior_results TO authenticated;

CREATE TEMP TABLE _592_negative_results (
  prueba text PRIMARY KEY,
  esperado text NOT NULL,
  obtenido text NOT NULL,
  ok boolean NOT NULL
);
GRANT INSERT, UPDATE, SELECT ON _592_negative_results TO authenticated;

DO $test$
DECLARE
  v_diag text;
  v_familia uuid;
  v_familia_b uuid;
  v_linea uuid;
  v_linea_otro uuid;
  v_hid uuid;
  v_hid2 uuid;
  v_mid uuid;
  v_tech uuid;
  v_com uuid;
  v_other uuid;
  v_count integer;
  v_rows integer;
  v_ok boolean;
  v_err text;
BEGIN
  SELECT d.id, l.familia_trabajo_id, l.id
  INTO v_diag, v_familia, v_linea
  FROM public.diagnosticos_tecnicos d
  JOIN public.diagnostico_tecnico_lineas l ON l.diagnostico_id = d.id AND l.empresa_id = d.empresa_id
  WHERE d.empresa_id = 'emp_2000000000' AND d.estado = 'borrador'
  ORDER BY d.id, l.id
  LIMIT 1;
  SELECT l.id INTO v_linea_otro
  FROM public.diagnostico_tecnico_lineas l
  WHERE l.empresa_id = 'emp_2000000000' AND l.diagnostico_id <> v_diag
  ORDER BY l.id
  LIMIT 1;
  SELECT ue.user_id INTO v_tech
  FROM public.usuarios_empresas ue
  WHERE ue.empresa_id = 'emp_2000000000' AND ue.rol_id = 'rol_emp_2000000000_ops_tecnico' AND ue.estado = 'activo'
  ORDER BY ue.user_id LIMIT 1;
  SELECT ue.user_id INTO v_com
  FROM public.usuarios_empresas ue
  WHERE ue.empresa_id = 'emp_2000000000' AND ue.rol_id = 'rol_emp_2000000000_comercial_asesor' AND ue.estado = 'activo'
  ORDER BY ue.user_id LIMIT 1;
  SELECT ue.user_id INTO v_other
  FROM public.usuarios_empresas ue
  WHERE ue.empresa_id = 'emp_20513453711' AND ue.estado = 'activo'
  ORDER BY ue.user_id LIMIT 1;
  ASSERT v_diag IS NOT NULL AND v_familia IS NOT NULL AND v_linea IS NOT NULL AND v_linea_otro IS NOT NULL,
    'TEST_FIXTURE_FAILED: faltan diagnóstico/líneas de PRUEBA';
  ASSERT v_tech IS NOT NULL AND v_com IS NOT NULL AND v_other IS NOT NULL,
    'TEST_FIXTURE_FAILED: faltan usuarios técnicos/comerciales/otra empresa';

  INSERT INTO public.diagnostico_tecnico_hallazgos
    (empresa_id, diagnostico_id, familia_trabajo_id, componente_parte, tipo_dano_codigo, causa_probable_codigo,
     condicion, riesgo, accion_recomendada, atribuible_a, observacion)
  VALUES
    ('emp_2000000000', v_diag, v_familia, 'fixture 592', 'desgaste', 'desgaste_normal',
     'conforme', 'inmediato_por_seguridad', 'reparar', 'desgaste_normal', 'fixture')
  RETURNING id INTO v_hid;
  INSERT INTO _592_behavior_results VALUES ('prioridad_efectiva_matriz', (SELECT prioridad_efectiva = 'P2' FROM public.diagnostico_tecnico_hallazgos WHERE id = v_hid), 'P2');

  INSERT INTO _592_behavior_results VALUES ('prioridad_combinacion_inexistente', false, NULL);
  BEGIN
    PERFORM public.calcular_prioridad_diagnostico('no_existe','monitorear');
  EXCEPTION WHEN OTHERS THEN
    UPDATE _592_behavior_results SET ok = SQLSTATE = '22023', detalle = SQLERRM WHERE prueba = 'prioridad_combinacion_inexistente';
  END;

  INSERT INTO _592_behavior_results VALUES ('override_igual_rechazado', false, NULL);
  BEGIN
    PERFORM public.calcular_prioridad_diagnostico('conforme','inmediato_por_seguridad','P2','igual');
  EXCEPTION WHEN OTHERS THEN
    UPDATE _592_behavior_results SET ok = SQLSTATE = '22023', detalle = SQLERRM WHERE prueba = 'override_igual_rechazado';
  END;
  INSERT INTO _592_behavior_results VALUES ('override_menor_rechazado', false, NULL);
  BEGIN
    PERFORM public.calcular_prioridad_diagnostico('conforme','inmediato_por_seguridad','P3','menor');
  EXCEPTION WHEN OTHERS THEN
    UPDATE _592_behavior_results SET ok = SQLSTATE = '22023', detalle = SQLERRM WHERE prueba = 'override_menor_rechazado';
  END;
  INSERT INTO _592_behavior_results VALUES ('override_sin_motivo_rechazado', false, NULL);
  BEGIN
    PERFORM public.calcular_prioridad_diagnostico('conforme','monitorear','P1',NULL);
  EXCEPTION WHEN OTHERS THEN
    UPDATE _592_behavior_results SET ok = SQLSTATE = '22023', detalle = SQLERRM WHERE prueba = 'override_sin_motivo_rechazado';
  END;

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_tech::text, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_count FROM public.diagnostico_tecnico_hallazgos WHERE id = v_hid;
  INSERT INTO _592_behavior_results VALUES ('tecnico_puede_leer', v_count = 1, format('filas=%s', v_count));
  INSERT INTO public.diagnostico_tecnico_hallazgos
    (empresa_id, diagnostico_id, familia_trabajo_id, componente_parte, tipo_dano_codigo, causa_probable_codigo, condicion, riesgo, accion_recomendada, atribuible_a)
  VALUES ('emp_2000000000', v_diag, v_familia, 'tecnico-insert', 'desgaste', 'desgaste_normal', 'conforme', 'monitorear', 'monitorear', 'desgaste_normal')
  RETURNING id INTO v_hid2;
  INSERT INTO _592_behavior_results VALUES ('tecnico_puede_insertar_hallazgo', v_hid2 IS NOT NULL, NULL);
  INSERT INTO public.diagnostico_tecnico_hallazgo_mediciones (empresa_id, hallazgo_id, parametro, unidad, minimo, maximo, medido)
  VALUES ('emp_2000000000', v_hid, 'fixture', 'mm', 1, 4, 5) RETURNING id INTO v_mid;
  INSERT INTO _592_behavior_results VALUES ('medicion_sugiere_fuera_tolerancia', (SELECT condicion_sugerida = 'fuera_de_tolerancia' FROM public.diagnostico_tecnico_hallazgo_mediciones WHERE id = v_mid), NULL);
  INSERT INTO public.diagnostico_tecnico_hallazgo_lineas (empresa_id, hallazgo_id, linea_id)
  VALUES ('emp_2000000000', v_hid, v_linea);
  INSERT INTO _592_behavior_results VALUES ('enlace_mismo_trabajo_permitido', true, NULL);

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_com::text, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_count FROM public.diagnostico_tecnico_hallazgos WHERE id = v_hid;
  INSERT INTO _592_behavior_results VALUES ('comercial_puede_leer', v_count = 1, format('filas=%s', v_count));
  v_ok := true; v_err := NULL;
  BEGIN
    INSERT INTO public.diagnostico_tecnico_hallazgos
      (empresa_id, diagnostico_id, familia_trabajo_id, componente_parte, tipo_dano_codigo, causa_probable_codigo, condicion, riesgo, accion_recomendada, atribuible_a)
    VALUES ('emp_2000000000', v_diag, v_familia, 'comercial', 'desgaste', 'desgaste_normal', 'conforme', 'monitorear', 'monitorear', 'desgaste_normal');
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM; END;
  INSERT INTO _592_behavior_results VALUES ('comercial_no_puede_escribir', NOT v_ok, v_err);

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other::text, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_count FROM public.diagnostico_tecnico_hallazgos WHERE id = v_hid;
  INSERT INTO _592_behavior_results VALUES ('otra_empresa_no_ve', v_count = 0, format('filas=%s', v_count));
  PERFORM set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-000000000000', 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_count FROM public.diagnostico_tecnico_hallazgos WHERE id = v_hid;
  INSERT INTO _592_behavior_results VALUES ('sin_permiso_no_ve', v_count = 0, format('filas=%s', v_count));

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_tech::text, 'role', 'authenticated')::text, true);
  v_ok := true; v_err := NULL;
  BEGIN
    UPDATE public.diagnostico_tecnico_hallazgos SET empresa_id = 'emp_20513453711' WHERE id = v_hid;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_ok := v_rows = 0;
  EXCEPTION WHEN OTHERS THEN v_ok := true; v_err := SQLERRM; END;
  INSERT INTO _592_behavior_results VALUES ('cambio_empresa_rechazado', v_ok, coalesce(v_err, format('filas=%s', v_rows)));
  v_ok := true; v_err := NULL;
  BEGIN
    UPDATE public.diagnostico_tecnico_hallazgos SET diagnostico_id = 'diagnostico_inexistente' WHERE id = v_hid;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_ok := v_rows = 0;
  EXCEPTION WHEN OTHERS THEN v_ok := true; v_err := SQLERRM; END;
  INSERT INTO _592_behavior_results VALUES ('cambio_diagnostico_rechazado', v_ok, coalesce(v_err, format('filas=%s', v_rows)));

  EXECUTE 'SET LOCAL ROLE postgres';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_tech::text, 'role', 'authenticated')::text, true);
  v_ok := true; v_err := NULL;
  BEGIN
    INSERT INTO public.diagnostico_tecnico_hallazgo_lineas (empresa_id, hallazgo_id, linea_id)
    VALUES ('emp_2000000000', v_hid, v_linea_otro);
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM; END;
  INSERT INTO _592_behavior_results VALUES ('enlace_otro_trabajo_rechazado', NOT v_ok, v_err);

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_tech::text, 'role', 'authenticated')::text, true);
  UPDATE public.diagnosticos_tecnicos SET estado = 'emitido' WHERE id = v_diag;
  v_ok := true; v_err := NULL;
  BEGIN
    INSERT INTO public.diagnostico_tecnico_hallazgos
      (empresa_id, diagnostico_id, familia_trabajo_id, componente_parte, tipo_dano_codigo, causa_probable_codigo, condicion, riesgo, accion_recomendada, atribuible_a)
    VALUES ('emp_2000000000', v_diag, v_familia, 'emitido-insert', 'desgaste', 'desgaste_normal', 'conforme', 'monitorear', 'monitorear', 'desgaste_normal');
  EXCEPTION WHEN OTHERS THEN v_ok := false; v_err := SQLERRM; END;
  INSERT INTO _592_behavior_results VALUES ('emitido_hallazgo_insert_rechazado', NOT v_ok, v_err);
  UPDATE public.diagnostico_tecnico_hallazgos SET observacion = 'cambio emitido' WHERE id = v_hid;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  INSERT INTO _592_behavior_results VALUES ('emitido_hallazgo_update_rechazado', v_rows = 0, format('filas=%s', v_rows));
  DELETE FROM public.diagnostico_tecnico_hallazgos WHERE id = v_hid;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  INSERT INTO _592_behavior_results VALUES ('emitido_hallazgo_delete_rechazado', v_rows = 0, format('filas=%s', v_rows));
  UPDATE public.diagnostico_tecnico_hallazgo_mediciones SET medido = 6 WHERE id = v_mid;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  INSERT INTO _592_behavior_results VALUES ('emitido_medicion_update_rechazado', v_rows = 0, format('filas=%s', v_rows));
  DELETE FROM public.diagnostico_tecnico_hallazgo_lineas WHERE hallazgo_id = v_hid;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  INSERT INTO _592_behavior_results VALUES ('emitido_enlace_delete_rechazado', v_rows = 0, format('filas=%s', v_rows));
END
$test$;

SET LOCAL ROLE postgres;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT ue.user_id::text FROM public.usuarios_empresas ue WHERE ue.empresa_id = 'emp_2000000000' AND ue.rol_id = 'rol_emp_2000000000_ops_tecnico' AND ue.estado = 'activo' ORDER BY ue.user_id LIMIT 1), 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

DO $security$
DECLARE
  v_tech uuid;
  v_com uuid;
  v_other uuid;
  v_diag text;
  v_diag_draft text;
  v_diag_repeat text;
  v_diag_b text := 'dt_592_whynco_test';
  v_familia uuid;
  v_familia_b uuid;
  v_familia_draft uuid;
  v_linea uuid;
  v_linea_draft uuid;
  v_line_a uuid;
  v_line_b uuid;
  v_linea_otro uuid;
  v_hid uuid;
  v_hid_priority uuid;
  v_hid_cascade uuid;
  v_hid_b uuid;
  v_mid uuid;
  v_link uuid;
  v_count integer;
  v_rows integer;
  v_ok boolean;
  v_err text;
  v_table text;
  v_function text;
  v_select_denied boolean;
  v_insert_denied boolean;
  v_update_denied boolean;
  v_delete_denied boolean;
BEGIN
  SET LOCAL ROLE postgres;
  SELECT ue.user_id INTO v_tech FROM public.usuarios_empresas ue
  WHERE ue.empresa_id = 'emp_2000000000' AND ue.rol_id = 'rol_emp_2000000000_ops_tecnico' AND ue.estado = 'activo'
  ORDER BY ue.user_id LIMIT 1;
  SELECT ue.user_id INTO v_com FROM public.usuarios_empresas ue
  WHERE ue.empresa_id = 'emp_2000000000' AND ue.rol_id = 'rol_emp_2000000000_comercial_asesor' AND ue.estado = 'activo'
  ORDER BY ue.user_id LIMIT 1;
  SELECT ue.user_id INTO v_other FROM public.usuarios_empresas ue
  WHERE ue.empresa_id = 'emp_20513453711' AND ue.estado = 'activo'
  ORDER BY ue.user_id LIMIT 1;
  SELECT d.id, l.familia_trabajo_id, l.id INTO v_diag, v_familia, v_linea
  FROM public.diagnosticos_tecnicos d
  JOIN public.diagnostico_tecnico_lineas l ON l.diagnostico_id = d.id AND l.empresa_id = d.empresa_id
  WHERE d.empresa_id = 'emp_2000000000' AND d.estado = 'emitido'
  ORDER BY d.id, l.id LIMIT 1;
  SELECT d.id, l.familia_trabajo_id, l.id INTO v_diag_draft, v_familia_draft, v_linea_draft
  FROM public.diagnosticos_tecnicos d
  JOIN public.diagnostico_tecnico_lineas l ON l.diagnostico_id = d.id AND l.empresa_id = d.empresa_id
  WHERE d.empresa_id = 'emp_2000000000' AND d.estado = 'borrador'
  ORDER BY d.id, l.id LIMIT 1;
  SELECT l1.diagnostico_id, l1.familia_trabajo_id, l1.id, l2.id INTO v_diag_repeat, v_familia, v_line_a, v_line_b
  FROM public.diagnostico_tecnico_lineas l1
  JOIN public.diagnostico_tecnico_lineas l2 ON l2.diagnostico_id = l1.diagnostico_id
    AND l2.tarea_id = l1.tarea_id AND l2.id <> l1.id AND l2.empresa_id = l1.empresa_id
  JOIN public.diagnosticos_tecnicos d ON d.id = l1.diagnostico_id AND d.empresa_id = l1.empresa_id
  WHERE l1.empresa_id = 'emp_2000000000' AND d.estado = 'borrador'
  ORDER BY l1.diagnostico_id, l1.id, l2.id LIMIT 1;
  SELECT l.id INTO v_linea_otro FROM public.diagnostico_tecnico_lineas l
  WHERE l.empresa_id = 'emp_2000000000' AND l.diagnostico_id <> v_diag_draft ORDER BY l.id LIMIT 1;
  ASSERT v_tech IS NOT NULL AND v_com IS NOT NULL AND v_other IS NOT NULL AND v_diag_draft IS NOT NULL,
    'TEST_FIXTURE_FAILED: faltan usuarios o diagnóstico en borrador';

  -- Fixtures de otra empresa; no son casos de autorización y se deshacen con ROLLBACK.
  SET LOCAL ROLE postgres;
  INSERT INTO public.diagnosticos_tecnicos(id, empresa_id, tipo, recepcion_id, estado, elaborado_por)
  VALUES (v_diag_b, 'emp_20513453711', 'mantenimiento', (SELECT r.id FROM public.recepciones_activos_cliente r WHERE r.empresa_id='emp_20513453711' ORDER BY r.id LIMIT 1), 'borrador', v_other)
  ON CONFLICT (id) DO NOTHING;
  SELECT f.id INTO v_familia_b FROM public.familia_trabajo f WHERE f.empresa_id = 'emp_20513453711' ORDER BY f.id LIMIT 1;
  INSERT INTO public.diagnostico_tecnico_hallazgos
    (empresa_id, diagnostico_id, familia_trabajo_id, componente_parte, tipo_dano_codigo, causa_probable_codigo,
     condicion, riesgo, accion_recomendada, atribuible_a)
  VALUES ('emp_20513453711', v_diag_b, v_familia_b, 'fixture otra empresa', 'desgaste', 'desgaste_normal',
          'conforme', 'monitorear', 'monitorear', 'desgaste_normal')
  RETURNING id INTO v_hid_b;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_tech::text, 'role', 'authenticated')::text, true);

  -- Repetición autenticada de las comprobaciones de prioridad que el bloque de fixtures ejecutó como postgres.
  INSERT INTO _592_behavior_results VALUES ('prioridad_efectiva_matriz_authenticated', public.calcular_prioridad_diagnostico('conforme','inmediato_por_seguridad') = 'P2', 'SET LOCAL ROLE authenticated');
  v_ok := false; v_err := NULL;
  BEGIN PERFORM public.calcular_prioridad_diagnostico('conforme','inmediato_por_seguridad','P2','igual'); EXCEPTION WHEN OTHERS THEN v_ok := SQLSTATE = '22023'; v_err := SQLERRM; END;
  INSERT INTO _592_behavior_results VALUES ('override_igual_authenticated', v_ok, v_err);
  v_ok := false; v_err := NULL;
  BEGIN PERFORM public.calcular_prioridad_diagnostico('conforme','inmediato_por_seguridad','P3','menor'); EXCEPTION WHEN OTHERS THEN v_ok := SQLSTATE = '22023'; v_err := SQLERRM; END;
  INSERT INTO _592_behavior_results VALUES ('override_menor_authenticated', v_ok, v_err);
  v_ok := false; v_err := NULL;
  BEGIN PERFORM public.calcular_prioridad_diagnostico('conforme','monitorear','P1',NULL); EXCEPTION WHEN OTHERS THEN v_ok := SQLSTATE = '22023'; v_err := SQLERRM; END;
  INSERT INTO _592_behavior_results VALUES ('override_sin_motivo_authenticated', v_ok, v_err);

  -- Caso anon: las cuatro operaciones fallan en cada tabla nueva.
  SET LOCAL ROLE anon;
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  FOR v_table IN SELECT unnest(ARRAY['public.diagnostico_catalogo_defaults','public.diagnostico_catalogo_valores','public.diagnostico_matriz_prioridad','public.diagnostico_tecnico_hallazgos','public.diagnostico_tecnico_hallazgo_mediciones','public.diagnostico_tecnico_hallazgo_lineas']) LOOP
    v_select_denied := false; v_insert_denied := false; v_update_denied := false; v_delete_denied := false;
    BEGIN EXECUTE format('SELECT 1 FROM %s LIMIT 1', v_table); EXCEPTION WHEN OTHERS THEN v_select_denied := true; END;
    BEGIN EXECUTE format('INSERT INTO %s DEFAULT VALUES', v_table); EXCEPTION WHEN OTHERS THEN v_insert_denied := true; END;
    BEGIN EXECUTE format('UPDATE %s SET id = id WHERE false', v_table); EXCEPTION WHEN OTHERS THEN v_update_denied := true; END;
    BEGIN EXECUTE format('DELETE FROM %s WHERE false', v_table); EXCEPTION WHEN OTHERS THEN v_delete_denied := true; END;
    SET LOCAL ROLE authenticated;
    INSERT INTO _592_behavior_results VALUES ('anon_dml_' || replace(v_table, 'public.', ''), v_select_denied AND v_insert_denied AND v_update_denied AND v_delete_denied, format('select=%s insert=%s update=%s delete=%s',v_select_denied,v_insert_denied,v_update_denied,v_delete_denied));
    SET LOCAL ROLE anon;
  END LOOP;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_tech::text, 'role', 'authenticated')::text, true);

  FOR v_table IN SELECT unnest(ARRAY['public.diagnostico_catalogo_defaults','public.diagnostico_catalogo_valores','public.diagnostico_matriz_prioridad','public.diagnostico_tecnico_hallazgos','public.diagnostico_tecnico_hallazgo_mediciones','public.diagnostico_tecnico_hallazgo_lineas']) LOOP
    INSERT INTO _592_behavior_results VALUES ('priv_' || replace(v_table, 'public.', ''),
      NOT has_table_privilege('anon', v_table, 'SELECT') AND NOT has_table_privilege('anon', v_table, 'INSERT') AND NOT has_table_privilege('anon', v_table, 'UPDATE') AND NOT has_table_privilege('anon', v_table, 'DELETE'),
      format('anon_select=%s anon_insert=%s anon_update=%s anon_delete=%s auth_select=%s auth_insert=%s auth_update=%s auth_delete=%s', has_table_privilege('anon',v_table,'SELECT'),has_table_privilege('anon',v_table,'INSERT'),has_table_privilege('anon',v_table,'UPDATE'),has_table_privilege('anon',v_table,'DELETE'),has_table_privilege('authenticated',v_table,'SELECT'),has_table_privilege('authenticated',v_table,'INSERT'),has_table_privilege('authenticated',v_table,'UPDATE'),has_table_privilege('authenticated',v_table,'DELETE')));
  END LOOP;
  FOREACH v_function IN ARRAY ARRAY['public.bloquear_hallazgo_emitido()','public.validar_hallazgo_referencias()','public.calcular_hallazgo_prioridad()','public.bloquear_medicion_emitida()','public.sugerir_condicion_medicion()','public.bloquear_hallazgo_linea_emitido()'] LOOP
    INSERT INTO _592_behavior_results VALUES ('priv_' || replace(v_function, 'public.', ''), NOT has_function_privilege('anon', v_function, 'EXECUTE') AND NOT has_function_privilege('authenticated', v_function, 'EXECUTE'), format('anon_execute=%s auth_execute=%s',has_function_privilege('anon',v_function,'EXECUTE'),has_function_privilege('authenticated',v_function,'EXECUTE')));
  END LOOP;

  -- Inicializador: solo maestros/editar en la empresa propia; idempotente.
  SELECT count(*) INTO v_count FROM public.diagnostico_catalogo_valores WHERE empresa_id = 'emp_2000000000';
  PERFORM public.inicializar_catalogos_diagnostico('emp_2000000000');
  SELECT count(*) INTO v_rows FROM public.diagnostico_catalogo_valores WHERE empresa_id = 'emp_2000000000';
  PERFORM public.inicializar_catalogos_diagnostico('emp_2000000000');
  SELECT count(*) INTO v_count FROM public.diagnostico_catalogo_valores WHERE empresa_id = 'emp_2000000000';
  INSERT INTO _592_behavior_results VALUES ('initializer_idempotente', v_count = v_rows, format('conteo_1=%s conteo_2=%s',v_rows,v_count));
  v_ok := false; v_err := NULL;
  BEGIN PERFORM public.inicializar_catalogos_diagnostico('emp_20513453711'); EXCEPTION WHEN OTHERS THEN v_ok := SQLSTATE = '42501'; v_err := SQLERRM; END;
  INSERT INTO _592_behavior_results VALUES ('initializer_empresa_ajena_rechazado', v_ok, v_err);

  -- Siembra exacta y mojibake en todas las columnas de texto sembradas.
  WITH expected(condicion_codigo,riesgo_codigo,prioridad) AS (VALUES
    ('conforme','monitorear','P4'),('conforme','proximo_mantenimiento','P4'),('conforme','antes_de_operar','P3'),('conforme','inmediato_por_seguridad','P2'),
    ('desgaste_aceptable','monitorear','P4'),('desgaste_aceptable','proximo_mantenimiento','P3'),('desgaste_aceptable','antes_de_operar','P2'),('desgaste_aceptable','inmediato_por_seguridad','P1'),
    ('fuera_de_tolerancia','monitorear','P3'),('fuera_de_tolerancia','proximo_mantenimiento','P2'),('fuera_de_tolerancia','antes_de_operar','P1'),('fuera_de_tolerancia','inmediato_por_seguridad','P1'),
    ('falla_funcional','monitorear','P2'),('falla_funcional','proximo_mantenimiento','P1'),('falla_funcional','antes_de_operar','P1'),('falla_funcional','inmediato_por_seguridad','P1'))
  SELECT count(*) INTO v_count FROM expected e WHERE NOT EXISTS (SELECT 1 FROM public.diagnostico_matriz_prioridad m WHERE m.version=1 AND m.condicion_codigo=e.condicion_codigo AND m.riesgo_codigo=e.riesgo_codigo AND m.prioridad=e.prioridad);
  INSERT INTO _592_behavior_results VALUES ('matriz_exacta_16', v_count = 0 AND (SELECT count(*) FROM public.diagnostico_matriz_prioridad WHERE version=1)=16, format('faltantes=%s filas=%s',v_count,(SELECT count(*) FROM public.diagnostico_matriz_prioridad WHERE version=1)));
  INSERT INTO _592_behavior_results VALUES ('catalogo_tipos_13', (SELECT count(*) FROM public.diagnostico_catalogo_defaults WHERE catalogo='tipo_dano')=13, NULL);
  INSERT INTO _592_behavior_results VALUES ('catalogo_causas_10', (SELECT count(*) FROM public.diagnostico_catalogo_defaults WHERE catalogo='causa_probable')=10, NULL);
  INSERT INTO _592_behavior_results VALUES ('catalogo_unidades_9', (SELECT count(*) FROM public.diagnostico_catalogo_defaults WHERE catalogo='unidad_medicion')=9, NULL);
  SELECT count(*) INTO v_count FROM (SELECT catalogo AS t FROM public.diagnostico_catalogo_defaults UNION ALL SELECT codigo FROM public.diagnostico_catalogo_defaults UNION ALL SELECT etiqueta FROM public.diagnostico_catalogo_defaults UNION ALL SELECT catalogo FROM public.diagnostico_catalogo_valores UNION ALL SELECT codigo FROM public.diagnostico_catalogo_valores UNION ALL SELECT etiqueta FROM public.diagnostico_catalogo_valores UNION ALL SELECT condicion_codigo FROM public.diagnostico_matriz_prioridad UNION ALL SELECT riesgo_codigo FROM public.diagnostico_matriz_prioridad UNION ALL SELECT prioridad FROM public.diagnostico_matriz_prioridad) s WHERE position(chr(194) IN t)>0 OR position(chr(195) IN t)>0 OR position(chr(65533) IN t)>0 OR position(chr(226)||chr(8364) IN t)>0;
  INSERT INTO _592_behavior_results VALUES ('mojibake_texto_sembrado', v_count = 0, format('ocurrencias=%s',v_count));

  -- Catálogos: permiso maestros/editar, no diagnostico_tecnico/editar.
  v_ok := false;
  UPDATE public.diagnostico_catalogo_valores SET etiqueta = etiqueta WHERE empresa_id='emp_2000000000' AND catalogo='tipo_dano' AND codigo='desgaste';
  GET DIAGNOSTICS v_rows = ROW_COUNT; v_ok := v_rows = 1;
  INSERT INTO _592_behavior_results VALUES ('catalogo_editar_tecnico_maestros', v_ok, format('filas=%s permiso=maestros/editar',v_rows));
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_com::text, 'role', 'authenticated')::text, true);
  v_ok := false; v_err := NULL;
  BEGIN UPDATE public.diagnostico_catalogo_valores SET etiqueta = etiqueta WHERE empresa_id='emp_2000000000' AND catalogo='tipo_dano' AND codigo='desgaste'; GET DIAGNOSTICS v_rows = ROW_COUNT; v_ok := v_rows = 0; EXCEPTION WHEN OTHERS THEN v_ok := true; v_err := SQLERRM; END;
  INSERT INTO _592_behavior_results VALUES ('catalogo_editar_comercial_rechazado', v_ok, v_err);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_other::text, 'role', 'authenticated')::text, true);
  SELECT count(*) INTO v_count FROM public.diagnostico_catalogo_valores WHERE empresa_id='emp_2000000000';
  INSERT INTO _592_behavior_results VALUES ('catalogo_otra_empresa_no_ve', v_count=0, format('filas=%s',v_count));
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_tech::text, 'role', 'authenticated')::text, true);

  -- Prioridad enviada por cliente: los campos calculados se recalculan en servidor.
  INSERT INTO public.diagnostico_tecnico_hallazgos
    (empresa_id,diagnostico_id,familia_trabajo_id,componente_parte,tipo_dano_codigo,causa_probable_codigo,condicion,riesgo,matriz_version,prioridad_calculada,prioridad_efectiva,accion_recomendada,atribuible_a)
  VALUES ('emp_2000000000',v_diag_draft,v_familia_draft,'prioridad cliente','desgaste','desgaste_normal','falla_funcional','inmediato_por_seguridad',1,'P4','P4','reparar','operacion')
  RETURNING id INTO v_hid_priority;
  INSERT INTO _592_behavior_results VALUES ('prioridad_cliente_no_forza', (SELECT prioridad_calculada='P1' AND prioridad_efectiva='P1' FROM public.diagnostico_tecnico_hallazgos WHERE id=v_hid_priority), (SELECT prioridad_calculada||'/'||prioridad_efectiva FROM public.diagnostico_tecnico_hallazgos WHERE id=v_hid_priority));

  -- Mediciones: empresa distinta y hallazgo de otra empresa son rechazados.
  v_ok := false; v_err := NULL;
  BEGIN INSERT INTO public.diagnostico_tecnico_hallazgo_mediciones(empresa_id,hallazgo_id,parametro,unidad,minimo,maximo,medido) VALUES ('emp_20513453711',v_hid_priority,'p','mm',1,2,1); EXCEPTION WHEN OTHERS THEN v_ok := true; v_err := SQLERRM; END;
  INSERT INTO _592_behavior_results VALUES ('medicion_empresa_distinta_rechazada', v_ok, v_err);
  v_ok := false; v_err := NULL;
  BEGIN INSERT INTO public.diagnostico_tecnico_hallazgo_mediciones(empresa_id,hallazgo_id,parametro,unidad,minimo,maximo,medido) VALUES ('emp_2000000000',v_hid_b,'p','mm',1,2,1); EXCEPTION WHEN OTHERS THEN v_ok := true; v_err := SQLERRM; END;
  INSERT INTO _592_behavior_results VALUES ('medicion_hallazgo_otra_empresa_rechazada', v_ok, v_err);

  -- Borrador: update/delete del técnico y cascada de mediciones/enlaces.
  INSERT INTO public.diagnostico_tecnico_hallazgos(empresa_id,diagnostico_id,familia_trabajo_id,componente_parte,tipo_dano_codigo,causa_probable_codigo,condicion,riesgo,accion_recomendada,atribuible_a)
  VALUES ('emp_2000000000',v_diag_draft,v_familia_draft,'cascade','desgaste','desgaste_normal','conforme','monitorear','monitorear','desgaste_normal') RETURNING id INTO v_hid_cascade;
  INSERT INTO public.diagnostico_tecnico_hallazgo_mediciones(empresa_id,hallazgo_id,parametro,unidad,medido) VALUES ('emp_2000000000',v_hid_cascade,'p','mm',1) RETURNING id INTO v_mid;
  INSERT INTO public.diagnostico_tecnico_hallazgo_lineas(empresa_id,hallazgo_id,linea_id) VALUES ('emp_2000000000',v_hid_cascade,v_linea_draft) RETURNING id INTO v_link;
  UPDATE public.diagnostico_tecnico_hallazgos SET observacion='actualizado por técnico' WHERE id=v_hid_cascade;
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  INSERT INTO _592_behavior_results VALUES ('borrador_update_tecnico',v_rows=1,format('filas=%s',v_rows));
  DELETE FROM public.diagnostico_tecnico_hallazgos WHERE id=v_hid_cascade;
  SELECT count(*) INTO v_count FROM public.diagnostico_tecnico_hallazgo_mediciones WHERE id=v_mid;
  SELECT v_count + (SELECT count(*) FROM public.diagnostico_tecnico_hallazgo_lineas WHERE id=v_link) INTO v_count;
  INSERT INTO _592_behavior_results VALUES ('borrador_delete_cascada',v_count=0,format('hijos_restantes=%s',v_count));

  -- Emitido: las mismas operaciones quedan rechazadas.
  UPDATE public.diagnostico_tecnico_hallazgos SET observacion='no debe cambiar' WHERE id=(SELECT id FROM public.diagnostico_tecnico_hallazgos WHERE componente_parte='tecnico-insert' LIMIT 1);
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  INSERT INTO _592_behavior_results VALUES ('emitido_update_tecnico_rechazado',v_rows=0,format('filas=%s',v_rows));
  DELETE FROM public.diagnostico_tecnico_hallazgos WHERE id=(SELECT id FROM public.diagnostico_tecnico_hallazgos WHERE componente_parte='tecnico-insert' LIMIT 1);
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  INSERT INTO _592_behavior_results VALUES ('emitido_delete_tecnico_rechazado',v_rows=0,format('filas=%s',v_rows));

  -- Mismo Trabajo y misma tarea repetida: ambos enlaces son válidos; otro diagnóstico no.
  IF v_line_a IS NOT NULL AND v_line_b IS NOT NULL THEN
    INSERT INTO public.diagnostico_tecnico_hallazgos(empresa_id,diagnostico_id,familia_trabajo_id,componente_parte,tipo_dano_codigo,causa_probable_codigo,condicion,riesgo,accion_recomendada,atribuible_a)
    VALUES ('emp_2000000000',v_diag_repeat,v_familia,'tarea repetida','desgaste','desgaste_normal','conforme','monitorear','monitorear','desgaste_normal') RETURNING id INTO v_hid;
    INSERT INTO public.diagnostico_tecnico_hallazgo_lineas(empresa_id,hallazgo_id,linea_id) VALUES ('emp_2000000000',v_hid,v_line_a),('emp_2000000000',v_hid,v_line_b);
    INSERT INTO _592_behavior_results VALUES ('enlace_tarea_repetida_permitido',true,'dos lineas del mismo Trabajo/tarea');
  ELSE
    INSERT INTO _592_behavior_results VALUES ('enlace_tarea_repetida_permitido',false,'SKIPPED');
  END IF;
  v_ok := false; v_err := NULL;
  BEGIN INSERT INTO public.diagnostico_tecnico_hallazgo_lineas(empresa_id,hallazgo_id,linea_id) VALUES ('emp_2000000000',v_hid_priority,v_linea_otro); EXCEPTION WHEN OTHERS THEN v_ok := true; v_err := SQLERRM; END;
  INSERT INTO _592_behavior_results VALUES ('enlace_otro_diagnostico_rechazado',v_ok,v_err);
END
$security$;

DO $round2$
DECLARE
  v_tech uuid;
  v_diag_emit text;
  v_diag_draft text;
  v_diag_p1 text;
  v_diag_p5 text;
  v_hid uuid;
  v_hid_draft uuid;
  v_mid uuid;
  v_mid_c8 uuid;
  v_link uuid;
  v_line uuid;
  v_line_free uuid;
  v_familia uuid;
  v_familia_alt uuid;
  v_tarea text;
  v_count integer;
  v_rows integer;
  v_ok boolean;
  v_sqlstate text;
  v_message text;
  v_obtenido text;
BEGIN
  SET LOCAL ROLE postgres;
  SELECT ue.user_id INTO v_tech FROM public.usuarios_empresas ue
  WHERE ue.empresa_id='emp_2000000000' AND ue.rol_id='rol_emp_2000000000_ops_tecnico' AND ue.estado='activo'
  ORDER BY ue.user_id LIMIT 1;
  SELECT d.id INTO v_diag_emit FROM public.diagnosticos_tecnicos d
  WHERE d.empresa_id='emp_2000000000' AND d.estado='emitido' ORDER BY d.id LIMIT 1;
  SELECT d.id INTO v_diag_draft FROM public.diagnosticos_tecnicos d
  WHERE d.empresa_id='emp_2000000000' AND d.estado='borrador' ORDER BY d.id LIMIT 1;
  SELECT d.id INTO v_diag_p5 FROM public.diagnosticos_tecnicos d
  JOIN public.diagnostico_tecnico_lineas l ON l.diagnostico_id=d.id AND l.empresa_id=d.empresa_id
  WHERE d.empresa_id='emp_2000000000' AND d.estado='borrador' AND d.id<>v_diag_draft ORDER BY d.id LIMIT 1;
  SELECT d.id INTO v_diag_p1 FROM public.diagnosticos_tecnicos d
  JOIN public.diagnostico_tecnico_lineas l ON l.diagnostico_id=d.id AND l.empresa_id=d.empresa_id
  WHERE d.empresa_id='emp_2000000000' AND d.estado='borrador' AND d.id<>v_diag_draft AND d.id<>v_diag_p5 ORDER BY d.id LIMIT 1;
  SELECT l.familia_trabajo_id,l.id INTO v_familia,v_line
  FROM public.diagnostico_tecnico_lineas l WHERE l.diagnostico_id=v_diag_p1 ORDER BY l.id LIMIT 1;
  INSERT INTO public.diagnostico_tecnico_hallazgos(empresa_id,diagnostico_id,familia_trabajo_id,componente_parte,tipo_dano_codigo,causa_probable_codigo,condicion,riesgo,accion_recomendada,atribuible_a)
  VALUES ('emp_2000000000',v_diag_p1,v_familia,'p1 fixture','desgaste','desgaste_normal','conforme','monitorear','monitorear','desgaste_normal') RETURNING id INTO v_hid;
  INSERT INTO public.diagnostico_tecnico_hallazgo_mediciones(empresa_id,hallazgo_id,parametro,unidad,medido) VALUES ('emp_2000000000',v_hid,'p1','mm',1) RETURNING id INTO v_mid;
  INSERT INTO public.diagnostico_tecnico_hallazgo_lineas(empresa_id,hallazgo_id,linea_id) VALUES ('emp_2000000000',v_hid,v_line) RETURNING id INTO v_link;
  UPDATE public.diagnosticos_tecnicos SET estado='emitido' WHERE id=v_diag_p1;
  v_diag_emit := v_diag_p1;
  SELECT l.id INTO v_line_free FROM public.diagnostico_tecnico_lineas l
  WHERE l.empresa_id='emp_2000000000' AND NOT EXISTS (SELECT 1 FROM public.diagnostico_tecnico_hallazgo_lineas x WHERE x.hallazgo_id=v_hid AND x.linea_id=l.id)
  ORDER BY l.id LIMIT 1;
  IF v_tech IS NULL OR v_diag_emit IS NULL OR v_diag_draft IS NULL OR v_diag_p5 IS NULL OR v_hid IS NULL OR v_mid IS NULL OR v_link IS NULL OR v_line_free IS NULL THEN
    RAISE EXCEPTION 'TEST_FIXTURE_FAILED: tech=% diag_emit=% diag_draft=% diag_p5=% hid=% mid=% link=% line_free=%',v_tech,v_diag_emit,v_diag_draft,v_diag_p5,v_hid,v_mid,v_link,v_line_free;
  END IF;

  -- P1: como postgres, sin RLS, cada operación sobre emitido debe producir 42501 y mensaje exacto.
  v_ok := false; BEGIN
    INSERT INTO public.diagnostico_tecnico_hallazgos(empresa_id,diagnostico_id,familia_trabajo_id,componente_parte,tipo_dano_codigo,causa_probable_codigo,condicion,riesgo,accion_recomendada,atribuible_a)
    VALUES ('emp_2000000000',v_diag_emit,v_familia,'p1 hallazgo insert','desgaste','desgaste_normal','conforme','monitorear','monitorear','desgaste_normal');
  EXCEPTION WHEN OTHERS THEN v_sqlstate:=SQLSTATE; v_message:=SQLERRM; v_ok:=SQLSTATE='42501' AND SQLERRM=U&'No se puede modificar un hallazgo de diagn\00F3stico emitido'; END;
  INSERT INTO _592_negative_results VALUES ('p1_postgres_hallazgo_insert','42501 / No se puede modificar un hallazgo de diagnóstico emitido',format('%s / %s',v_sqlstate,v_message),v_ok);
  v_ok := false; BEGIN UPDATE public.diagnostico_tecnico_hallazgos SET observacion='p1' WHERE id=v_hid; EXCEPTION WHEN OTHERS THEN v_sqlstate:=SQLSTATE; v_message:=SQLERRM; v_ok:=SQLSTATE='42501' AND SQLERRM=U&'No se puede modificar un hallazgo de diagn\00F3stico emitido'; END;
  INSERT INTO _592_negative_results VALUES ('p1_postgres_hallazgo_update','42501 / No se puede modificar un hallazgo de diagnóstico emitido',format('%s / %s',v_sqlstate,v_message),v_ok);
  v_ok := false; BEGIN DELETE FROM public.diagnostico_tecnico_hallazgos WHERE id=v_hid; EXCEPTION WHEN OTHERS THEN v_sqlstate:=SQLSTATE; v_message:=SQLERRM; v_ok:=SQLSTATE='42501' AND SQLERRM=U&'No se puede modificar un hallazgo de diagn\00F3stico emitido'; END;
  INSERT INTO _592_negative_results VALUES ('p1_postgres_hallazgo_delete','42501 / No se puede modificar un hallazgo de diagnóstico emitido',format('%s / %s',v_sqlstate,v_message),v_ok);
  v_ok := false; BEGIN INSERT INTO public.diagnostico_tecnico_hallazgo_mediciones(empresa_id,hallazgo_id,parametro,unidad,medido) VALUES ('emp_2000000000',v_hid,'p1','mm',1); EXCEPTION WHEN OTHERS THEN v_sqlstate:=SQLSTATE; v_message:=SQLERRM; v_ok:=SQLSTATE='42501' AND SQLERRM=U&'No se puede modificar una medici\00F3n de diagn\00F3stico emitido'; END;
  INSERT INTO _592_negative_results VALUES ('p1_postgres_medicion_insert','42501 / No se puede modificar una medición de diagnóstico emitido',format('%s / %s',v_sqlstate,v_message),v_ok);
  v_ok := false; BEGIN UPDATE public.diagnostico_tecnico_hallazgo_mediciones SET medido=2 WHERE id=v_mid; EXCEPTION WHEN OTHERS THEN v_sqlstate:=SQLSTATE; v_message:=SQLERRM; v_ok:=SQLSTATE='42501' AND SQLERRM=U&'No se puede modificar una medici\00F3n de diagn\00F3stico emitido'; END;
  INSERT INTO _592_negative_results VALUES ('p1_postgres_medicion_update','42501 / No se puede modificar una medición de diagnóstico emitido',format('%s / %s',v_sqlstate,v_message),v_ok);
  v_ok := false; BEGIN DELETE FROM public.diagnostico_tecnico_hallazgo_mediciones WHERE id=v_mid; EXCEPTION WHEN OTHERS THEN v_sqlstate:=SQLSTATE; v_message:=SQLERRM; v_ok:=SQLSTATE='42501' AND SQLERRM=U&'No se puede modificar una medici\00F3n de diagn\00F3stico emitido'; END;
  INSERT INTO _592_negative_results VALUES ('p1_postgres_medicion_delete','42501 / No se puede modificar una medición de diagnóstico emitido',format('%s / %s',v_sqlstate,v_message),v_ok);
  v_ok := false; BEGIN INSERT INTO public.diagnostico_tecnico_hallazgo_lineas(empresa_id,hallazgo_id,linea_id) VALUES ('emp_2000000000',v_hid,v_line_free); EXCEPTION WHEN OTHERS THEN v_sqlstate:=SQLSTATE; v_message:=SQLERRM; v_ok:=SQLSTATE='42501' AND SQLERRM=U&'No se puede modificar un enlace de diagn\00F3stico emitido'; END;
  INSERT INTO _592_negative_results VALUES ('p1_postgres_enlace_insert','42501 / No se puede modificar un enlace de diagnóstico emitido',format('%s / %s',v_sqlstate,v_message),v_ok);
  v_ok := false; BEGIN DELETE FROM public.diagnostico_tecnico_hallazgo_lineas WHERE id=v_link; EXCEPTION WHEN OTHERS THEN v_sqlstate:=SQLSTATE; v_message:=SQLERRM; v_ok:=SQLSTATE='42501' AND SQLERRM=U&'No se puede modificar un enlace de diagn\00F3stico emitido'; END;
  INSERT INTO _592_negative_results VALUES ('p1_postgres_enlace_delete','42501 / No se puede modificar un enlace de diagnóstico emitido',format('%s / %s',v_sqlstate,v_message),v_ok);

  -- P1 como authenticated: INSERT produce RLS/42501; UPDATE/DELETE producen cero filas.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',v_tech::text,'role','authenticated')::text,true);
  v_sqlstate:=NULL; v_message:=NULL; v_ok:=false; BEGIN
    INSERT INTO public.diagnostico_tecnico_hallazgos(empresa_id,diagnostico_id,familia_trabajo_id,componente_parte,tipo_dano_codigo,causa_probable_codigo,condicion,riesgo,accion_recomendada,atribuible_a)
    VALUES ('emp_2000000000',v_diag_emit,v_familia,'p1 auth insert','desgaste','desgaste_normal','conforme','monitorear','monitorear','desgaste_normal');
  EXCEPTION WHEN OTHERS THEN v_sqlstate:=SQLSTATE; v_message:=SQLERRM; v_ok:=SQLSTATE='42501'; END;
  INSERT INTO _592_negative_results VALUES ('p1_auth_hallazgo_insert','42501 RLS',format('%s / %s',v_sqlstate,v_message),v_ok);
  UPDATE public.diagnostico_tecnico_hallazgos SET observacion='p1' WHERE id=v_hid; GET DIAGNOSTICS v_rows=ROW_COUNT;
  INSERT INTO _592_negative_results VALUES ('p1_auth_hallazgo_update','filas=0',format('filas=%s',v_rows),v_rows=0);
  DELETE FROM public.diagnostico_tecnico_hallazgos WHERE id=v_hid; GET DIAGNOSTICS v_rows=ROW_COUNT;
  INSERT INTO _592_negative_results VALUES ('p1_auth_hallazgo_delete','filas=0',format('filas=%s',v_rows),v_rows=0);
  v_sqlstate:=NULL; v_message:=NULL; v_ok:=false; BEGIN INSERT INTO public.diagnostico_tecnico_hallazgo_mediciones(empresa_id,hallazgo_id,parametro,unidad,medido) VALUES ('emp_2000000000',v_hid,'p1','mm',1); EXCEPTION WHEN OTHERS THEN v_sqlstate:=SQLSTATE; v_message:=SQLERRM; v_ok:=SQLSTATE='42501'; END;
  INSERT INTO _592_negative_results VALUES ('p1_auth_medicion_insert','42501 RLS',format('%s / %s',v_sqlstate,v_message),v_ok);
  UPDATE public.diagnostico_tecnico_hallazgo_mediciones SET medido=2 WHERE id=v_mid; GET DIAGNOSTICS v_rows=ROW_COUNT;
  INSERT INTO _592_negative_results VALUES ('p1_auth_medicion_update','filas=0',format('filas=%s',v_rows),v_rows=0);
  DELETE FROM public.diagnostico_tecnico_hallazgo_mediciones WHERE id=v_mid; GET DIAGNOSTICS v_rows=ROW_COUNT;
  INSERT INTO _592_negative_results VALUES ('p1_auth_medicion_delete','filas=0',format('filas=%s',v_rows),v_rows=0);
  v_sqlstate:=NULL; v_message:=NULL; v_ok:=false; BEGIN INSERT INTO public.diagnostico_tecnico_hallazgo_lineas(empresa_id,hallazgo_id,linea_id) VALUES ('emp_2000000000',v_hid,v_line_free); EXCEPTION WHEN OTHERS THEN v_sqlstate:=SQLSTATE; v_message:=SQLERRM; v_ok:=SQLSTATE='42501'; END;
  INSERT INTO _592_negative_results VALUES ('p1_auth_enlace_insert','42501 RLS',format('%s / %s',v_sqlstate,v_message),v_ok);
  DELETE FROM public.diagnostico_tecnico_hallazgo_lineas WHERE id=v_link; GET DIAGNOSTICS v_rows=ROW_COUNT;
  INSERT INTO _592_negative_results VALUES ('p1_auth_enlace_delete','filas=0',format('filas=%s',v_rows),v_rows=0);

  -- P5: diagnóstico borrador se borra con hallazgos y descendientes; emitido no.
  SET LOCAL ROLE postgres;
  SELECT l.familia_trabajo_id INTO v_familia FROM public.diagnostico_tecnico_lineas l WHERE l.diagnostico_id=v_diag_p5 LIMIT 1;
  INSERT INTO public.diagnostico_tecnico_hallazgos(empresa_id,diagnostico_id,familia_trabajo_id,componente_parte,tipo_dano_codigo,causa_probable_codigo,condicion,riesgo,accion_recomendada,atribuible_a)
  VALUES ('emp_2000000000',v_diag_p5,v_familia,'p5 draft diag','desgaste','desgaste_normal','conforme','monitorear','monitorear','desgaste_normal') RETURNING id INTO v_hid_draft;
  DELETE FROM public.diagnosticos_tecnicos WHERE id=v_diag_p5;
  SELECT count(*) INTO v_count FROM public.diagnostico_tecnico_hallazgos WHERE id=v_hid_draft;
  INSERT INTO _592_negative_results VALUES ('p5_delete_diagnostico_borrador','hallazgo cascada=0',format('hallazgos=%s',v_count),v_count=0);
  v_ok:=false; v_sqlstate:=NULL; v_message:=NULL; BEGIN DELETE FROM public.diagnosticos_tecnicos WHERE id=v_diag_emit; EXCEPTION WHEN OTHERS THEN v_sqlstate:=SQLSTATE; v_message:=SQLERRM; v_ok:=SQLSTATE='42501' AND SQLERRM='No se puede eliminar un Diagnostico Tecnico emitido.'; END;
  INSERT INTO _592_negative_results VALUES ('p5_delete_diagnostico_emitido','42501 / No se puede eliminar un Diagnostico Tecnico emitido.',format('%s / %s',v_sqlstate,v_message),v_ok);

  -- P4/C7: borrar una línea vinculada permite la cascada; cambiar su diagnóstico/Trabajo queda bloqueado.
  SELECT l.familia_trabajo_id,l.tarea_id,l.id INTO v_familia,v_tarea,v_line
  FROM public.diagnostico_tecnico_lineas l
  WHERE l.empresa_id='emp_2000000000' AND l.diagnostico_id=v_diag_draft
  ORDER BY l.id LIMIT 1;
  IF v_line IS NULL THEN
    SELECT d.id INTO v_diag_draft
    FROM public.diagnosticos_tecnicos d
    WHERE d.empresa_id='emp_2000000000' AND d.estado='borrador'
    ORDER BY d.id LIMIT 1;
    SELECT f.id,t.id INTO v_familia,v_tarea
    FROM public.familia_trabajo f
    JOIN public.tipos_servicio_interno t ON t.empresa_id=f.empresa_id
    WHERE f.empresa_id='emp_2000000000'
    ORDER BY f.id,t.id LIMIT 1;
    IF v_diag_draft IS NOT NULL AND v_familia IS NOT NULL AND v_tarea IS NOT NULL THEN
      INSERT INTO public.diagnostico_tecnico_lineas(empresa_id,diagnostico_id,familia_trabajo_id,tarea_id)
      VALUES ('emp_2000000000',v_diag_draft,v_familia,v_tarea)
      RETURNING id INTO v_line;
    ELSE
      INSERT INTO _592_negative_results VALUES ('p4_delete_linea_vinculada','filas=1 y enlace=0','SKIPPED',false);
    END IF;
  END IF;
  IF v_line IS NOT NULL THEN
    INSERT INTO public.diagnostico_tecnico_hallazgos(empresa_id,diagnostico_id,familia_trabajo_id,componente_parte,tipo_dano_codigo,causa_probable_codigo,condicion,riesgo,accion_recomendada,atribuible_a)
    VALUES ('emp_2000000000',v_diag_draft,v_familia,'p4 line','desgaste','desgaste_normal','conforme','monitorear','monitorear','desgaste_normal') RETURNING id INTO v_hid_draft;
    INSERT INTO public.diagnostico_tecnico_hallazgo_lineas(empresa_id,hallazgo_id,linea_id) VALUES ('emp_2000000000',v_hid_draft,v_line) RETURNING id INTO v_link;
    SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',v_tech::text,'role','authenticated')::text,true);
    DELETE FROM public.diagnostico_tecnico_lineas WHERE id=v_line; GET DIAGNOSTICS v_rows=ROW_COUNT;
    SELECT count(*) INTO v_count FROM public.diagnostico_tecnico_hallazgo_lineas WHERE id=v_link;
    INSERT INTO _592_negative_results VALUES ('p4_delete_linea_vinculada','filas=1 y enlace=0',format('filas=%s enlace=%s',v_rows,v_count),v_rows=1 AND v_count=0);
  ELSE
    IF NOT EXISTS (SELECT 1 FROM _592_negative_results WHERE prueba='p4_delete_linea_vinculada') THEN
      INSERT INTO _592_negative_results VALUES ('p4_delete_linea_vinculada','filas=1 y enlace=0','SKIPPED',false);
    END IF;
  END IF;
  SET LOCAL ROLE postgres;
  SELECT f.id INTO v_familia_alt FROM public.familia_trabajo f WHERE f.empresa_id='emp_2000000000' AND f.id IS DISTINCT FROM v_familia ORDER BY f.id LIMIT 1;
  SELECT l.id INTO v_line_free FROM public.diagnostico_tecnico_lineas l WHERE l.diagnostico_id=v_diag_emit LIMIT 1;
  v_ok:=false; v_sqlstate:=NULL; v_message:=NULL; BEGIN UPDATE public.diagnostico_tecnico_lineas SET familia_trabajo_id=v_familia_alt WHERE id=v_line_free; EXCEPTION WHEN OTHERS THEN v_sqlstate:=SQLSTATE; v_message:=SQLERRM; v_ok:=SQLSTATE='23514' AND SQLERRM='No se puede cambiar diagnostico_id o familia_trabajo_id de una linea vinculada'; END;
  INSERT INTO _592_negative_results VALUES ('c7_linea_vinculada_inmutable','23514 / No se puede cambiar diagnostico_id o familia_trabajo_id de una linea vinculada',format('%s / %s',v_sqlstate,v_message),v_ok);

  -- P6: catálogo inactivo no bloquea observación, pero sí cambiar código hacia él; DELETE y código son inmutables.
  SELECT l.familia_trabajo_id,l.id INTO v_familia,v_line FROM public.diagnostico_tecnico_lineas l WHERE l.empresa_id='emp_2000000000' AND l.diagnostico_id=v_diag_emit LIMIT 1;
  v_ok:=false; v_sqlstate:=NULL; v_message:=NULL; BEGIN UPDATE public.diagnostico_catalogo_valores SET activo=false WHERE empresa_id='emp_2000000000' AND catalogo='tipo_dano' AND codigo='rayado'; GET DIAGNOSTICS v_rows=ROW_COUNT; v_ok:=v_rows=1; EXCEPTION WHEN OTHERS THEN v_sqlstate:=SQLSTATE; v_message:=SQLERRM; END;
  INSERT INTO _592_negative_results VALUES ('p6_desactivar_tipo','filas=1',format('%s / %s',v_sqlstate,coalesce(v_message,format('filas=%s',v_rows))),v_ok);
  INSERT INTO public.diagnostico_tecnico_hallazgos(empresa_id,diagnostico_id,familia_trabajo_id,componente_parte,tipo_dano_codigo,causa_probable_codigo,condicion,riesgo,accion_recomendada,atribuible_a)
  VALUES ('emp_2000000000',v_diag_draft,v_familia,'p6 catalogo','desgaste','desgaste_normal','conforme','monitorear','monitorear','desgaste_normal') RETURNING id INTO v_hid_draft;
  UPDATE public.diagnostico_tecnico_hallazgos SET observacion='edición permitida con catálogo desactivado' WHERE id=v_hid_draft;
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  INSERT INTO _592_negative_results VALUES ('p6_observacion_con_tipo_inactivo','filas=1',format('filas=%s',v_rows),v_rows=1);
  SET LOCAL ROLE authenticated; PERFORM set_config('request.jwt.claims',json_build_object('sub',v_tech::text,'role','authenticated')::text,true);
  v_ok:=false; v_sqlstate:=NULL; v_message:=NULL; BEGIN UPDATE public.diagnostico_tecnico_hallazgos SET tipo_dano_codigo='rayado' WHERE id=v_hid_draft; EXCEPTION WHEN OTHERS THEN v_sqlstate:=SQLSTATE; v_message:=SQLERRM; v_ok:=SQLSTATE='23514' AND SQLERRM='tipo_dano_codigo no pertenece a empresa_id'; END;
  INSERT INTO _592_negative_results VALUES ('p6_cambiar_tipo_inactivo','23514 / tipo_dano_codigo no pertenece a empresa_id',format('%s / %s',v_sqlstate,v_message),v_ok);
  v_ok:=false; v_sqlstate:=NULL; v_message:=NULL; BEGIN DELETE FROM public.diagnostico_catalogo_valores WHERE empresa_id='emp_2000000000' AND catalogo='tipo_dano' AND codigo='desgaste'; EXCEPTION WHEN OTHERS THEN v_sqlstate:=SQLSTATE; v_message:=SQLERRM; v_ok:=SQLSTATE='42501'; END;
  INSERT INTO _592_negative_results VALUES ('p6_delete_catalogo_denegado','42501 permission denied',format('%s / %s',v_sqlstate,v_message),v_ok);
  SET LOCAL ROLE postgres;
  v_ok:=false; v_sqlstate:=NULL; v_message:=NULL; BEGIN UPDATE public.diagnostico_catalogo_valores SET codigo='desgaste_mutado' WHERE empresa_id='emp_2000000000' AND catalogo='tipo_dano' AND codigo='desgaste'; EXCEPTION WHEN OTHERS THEN v_sqlstate:=SQLSTATE; v_message:=SQLERRM; v_ok:=SQLSTATE='23514' AND SQLERRM='El codigo de catalogo es inmutable'; END;
  INSERT INTO _592_negative_results VALUES ('p6_codigo_inmutable','23514 / El codigo de catalogo es inmutable',format('%s / %s',v_sqlstate,v_message),v_ok);

  -- C8: una unidad ya usada permite editar la medición; cambiar a una unidad inactiva no.
  SET LOCAL ROLE postgres;
  UPDATE public.diagnostico_catalogo_valores
  SET activo=false
  WHERE empresa_id='emp_2000000000' AND catalogo='unidad_medicion' AND codigo='bar';
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',json_build_object('sub',v_tech::text,'role','authenticated')::text,true);
  INSERT INTO public.diagnostico_tecnico_hallazgo_mediciones(empresa_id,hallazgo_id,parametro,unidad,medido)
  VALUES ('emp_2000000000',v_hid_draft,'c8 unidad','mm',1) RETURNING id INTO v_mid_c8;
  UPDATE public.diagnostico_tecnico_hallazgo_mediciones SET medido=2 WHERE id=v_mid_c8;
  GET DIAGNOSTICS v_rows=ROW_COUNT;
  INSERT INTO _592_negative_results VALUES ('c8_update_medido_unidad_inactiva','filas=1',format('filas=%s',v_rows),v_rows=1);
  v_ok:=false; v_sqlstate:=NULL; v_message:=NULL;
  BEGIN
    UPDATE public.diagnostico_tecnico_hallazgo_mediciones SET unidad='bar' WHERE id=v_mid_c8;
  EXCEPTION WHEN OTHERS THEN
    v_sqlstate:=SQLSTATE; v_message:=SQLERRM;
    v_ok:=SQLSTATE='23514' AND SQLERRM='unidad no pertenece a empresa_id';
  END;
  INSERT INTO _592_negative_results VALUES ('c8_cambiar_unidad_inactiva','23514 / unidad no pertenece a empresa_id',format('%s / %s',v_sqlstate,v_message),v_ok);

  SET LOCAL ROLE postgres;
  SELECT d.id,l.familia_trabajo_id,l.id INTO v_diag_draft,v_familia,v_line
  FROM public.diagnosticos_tecnicos d
  JOIN public.diagnostico_tecnico_lineas l ON l.diagnostico_id=d.id AND l.empresa_id=d.empresa_id
  JOIN public.familia_trabajo f ON f.id=l.familia_trabajo_id AND f.empresa_id=l.empresa_id
  WHERE d.empresa_id='emp_2000000000' AND d.estado='borrador'
  ORDER BY d.id,l.id LIMIT 1;
  SELECT f.id INTO v_familia_alt
  FROM public.familia_trabajo f
  WHERE f.empresa_id='emp_2000000000' AND f.id IS DISTINCT FROM v_familia
  ORDER BY f.id LIMIT 1;
  IF v_line IS NOT NULL AND v_familia_alt IS NOT NULL THEN
    INSERT INTO public.diagnostico_tecnico_hallazgos(empresa_id,diagnostico_id,familia_trabajo_id,componente_parte,tipo_dano_codigo,causa_probable_codigo,condicion,riesgo,accion_recomendada,atribuible_a)
    VALUES ('emp_2000000000',v_diag_draft,v_familia,'p3 line mutation','desgaste','desgaste_normal','conforme','monitorear','monitorear','desgaste_normal') RETURNING id INTO v_hid_draft;
    INSERT INTO public.diagnostico_tecnico_hallazgo_lineas(empresa_id,hallazgo_id,linea_id)
    VALUES ('emp_2000000000',v_hid_draft,v_line) RETURNING id INTO v_link;
    ALTER TABLE public.diagnostico_tecnico_lineas DISABLE TRIGGER trg_bloquear_cambio_linea_vinculada;
    v_ok:=false; v_rows:=0; v_message:=NULL;
    BEGIN
      UPDATE public.diagnostico_tecnico_lineas SET familia_trabajo_id=v_familia_alt WHERE id=v_line;
      GET DIAGNOSTICS v_rows=ROW_COUNT;
      v_ok:=v_rows=1;
    EXCEPTION WHEN OTHERS THEN
      v_message:=SQLERRM;
    END;
    ALTER TABLE public.diagnostico_tecnico_lineas ENABLE TRIGGER trg_bloquear_cambio_linea_vinculada;
    INSERT INTO _592_negative_results VALUES ('p3_disable_bloquear_linea_vinculada','invariante rota',CASE WHEN v_ok THEN 'invariante rota: Trabajo cambiado' ELSE coalesce(v_message,'SKIPPED') END,v_ok);
  ELSE
    INSERT INTO _592_negative_results VALUES ('p3_disable_bloquear_linea_vinculada','invariante rota','SKIPPED',false);
  END IF;

  -- P7: anon no puede ejecutar funciones públicas de aplicación.
  SET LOCAL ROLE anon; PERFORM set_config('request.jwt.claims',json_build_object('role','anon')::text,true);
  SET LOCAL ROLE postgres;
  INSERT INTO _592_negative_results VALUES ('p7_anon_priv_init','has_function_privilege=false',has_function_privilege('anon','public.inicializar_catalogos_diagnostico(text)','EXECUTE')::text,NOT has_function_privilege('anon','public.inicializar_catalogos_diagnostico(text)','EXECUTE'));
  INSERT INTO _592_negative_results VALUES ('p7_anon_priv_calcular','has_function_privilege=false',has_function_privilege('anon','public.calcular_prioridad_diagnostico(text,text,text,text,smallint)','EXECUTE')::text,NOT has_function_privilege('anon','public.calcular_prioridad_diagnostico(text,text,text,text,smallint)','EXECUTE'));
  SET LOCAL ROLE anon;
  v_ok:=false; v_sqlstate:=NULL; v_message:=NULL; BEGIN PERFORM public.inicializar_catalogos_diagnostico('emp_2000000000'); EXCEPTION WHEN OTHERS THEN v_sqlstate:=SQLSTATE; v_message:=SQLERRM; v_ok:=SQLSTATE='42501'; END;
  SET LOCAL ROLE postgres;
  INSERT INTO _592_negative_results VALUES ('p7_anon_call_init','42501 permission denied',format('%s / %s',v_sqlstate,v_message),v_ok);
  SET LOCAL ROLE anon;
  v_ok:=false; v_sqlstate:=NULL; v_message:=NULL; BEGIN PERFORM public.calcular_prioridad_diagnostico('conforme','monitorear'); EXCEPTION WHEN OTHERS THEN v_sqlstate:=SQLSTATE; v_message:=SQLERRM; v_ok:=SQLSTATE='42501'; END;
  SET LOCAL ROLE postgres;
  INSERT INTO _592_negative_results VALUES ('p7_anon_call_calcular','42501 permission denied',format('%s / %s',v_sqlstate,v_message),v_ok);

  -- P3: mutación individual de los seis triggers originales y de la rama de cascada.
  SELECT l.familia_trabajo_id INTO v_familia FROM public.diagnostico_tecnico_lineas l WHERE l.diagnostico_id=v_diag_draft ORDER BY l.id LIMIT 1;
  ALTER TABLE public.diagnostico_tecnico_hallazgos DISABLE TRIGGER a_bloquear_hallazgo_emitido;
  v_ok:=false; BEGIN UPDATE public.diagnostico_tecnico_hallazgos SET observacion='mut a' WHERE id=v_hid; GET DIAGNOSTICS v_rows=ROW_COUNT; v_ok:=v_rows=1; EXCEPTION WHEN OTHERS THEN NULL; END; ALTER TABLE public.diagnostico_tecnico_hallazgos ENABLE TRIGGER a_bloquear_hallazgo_emitido;
  INSERT INTO _592_negative_results VALUES ('p3_disable_bloquear_hallazgo','invariante rota',CASE WHEN v_ok THEN 'invariante rota' ELSE 'blocked' END,v_ok);
  ALTER TABLE public.diagnostico_tecnico_hallazgos DISABLE TRIGGER b_validar_hallazgo_referencias;
  v_ok:=false; BEGIN UPDATE public.diagnostico_tecnico_hallazgos SET tipo_dano_codigo='rayado' WHERE id=v_hid_draft; GET DIAGNOSTICS v_rows=ROW_COUNT; v_ok:=v_rows=1; EXCEPTION WHEN OTHERS THEN NULL; END; ALTER TABLE public.diagnostico_tecnico_hallazgos ENABLE TRIGGER b_validar_hallazgo_referencias;
  INSERT INTO _592_negative_results VALUES ('p3_disable_validar_referencias','invariante rota',CASE WHEN v_ok THEN 'invariante rota' ELSE 'blocked' END,v_ok);
  ALTER TABLE public.diagnostico_tecnico_hallazgos DISABLE TRIGGER c_calcular_hallazgo_prioridad;
  v_ok:=false; v_message:=NULL; BEGIN UPDATE public.diagnostico_tecnico_hallazgos SET condicion='falla_funcional',riesgo='inmediato_por_seguridad' WHERE id=v_hid_draft; SELECT prioridad_calculada INTO v_message FROM public.diagnostico_tecnico_hallazgos WHERE id=v_hid_draft; v_ok:=v_message='P4'; EXCEPTION WHEN OTHERS THEN v_message:=SQLERRM; END; ALTER TABLE public.diagnostico_tecnico_hallazgos ENABLE TRIGGER c_calcular_hallazgo_prioridad;
  INSERT INTO _592_negative_results VALUES ('p3_disable_calcular_prioridad','invariante rota',CASE WHEN v_ok THEN 'invariante rota' ELSE coalesce(v_message,'recalculada') END,v_ok);
  ALTER TABLE public.diagnostico_tecnico_hallazgo_mediciones DISABLE TRIGGER a_bloquear_medicion_emitida;
  v_ok:=false; BEGIN UPDATE public.diagnostico_tecnico_hallazgo_mediciones SET medido=9 WHERE id=v_mid; v_ok:=true; EXCEPTION WHEN OTHERS THEN NULL; END; ALTER TABLE public.diagnostico_tecnico_hallazgo_mediciones ENABLE TRIGGER a_bloquear_medicion_emitida;
  INSERT INTO _592_negative_results VALUES ('p3_disable_bloquear_medicion','invariante rota',CASE WHEN v_ok THEN 'invariante rota' ELSE 'blocked' END,v_ok);
  ALTER TABLE public.diagnostico_tecnico_hallazgo_mediciones DISABLE TRIGGER b_sugerir_condicion_medicion;
  v_ok:=false; BEGIN INSERT INTO public.diagnostico_tecnico_hallazgo_mediciones(empresa_id,hallazgo_id,parametro,unidad,minimo,maximo,medido) VALUES ('emp_2000000000',v_hid_draft,'mut e','mm',1,2,9) RETURNING id INTO v_mid; SELECT condicion_sugerida IS NULL INTO v_ok FROM public.diagnostico_tecnico_hallazgo_mediciones WHERE id=v_mid; EXCEPTION WHEN OTHERS THEN NULL; END; ALTER TABLE public.diagnostico_tecnico_hallazgo_mediciones ENABLE TRIGGER b_sugerir_condicion_medicion;
  INSERT INTO _592_negative_results VALUES ('p3_disable_sugerir_condicion','invariante rota',CASE WHEN v_ok THEN 'invariante rota' ELSE 'calculada' END,v_ok);
  ALTER TABLE public.diagnostico_tecnico_hallazgo_lineas DISABLE TRIGGER a_bloquear_hallazgo_linea_emitido;
  v_ok:=false; BEGIN DELETE FROM public.diagnostico_tecnico_hallazgo_lineas WHERE id=v_link; GET DIAGNOSTICS v_rows=ROW_COUNT; v_ok:=v_rows=1; EXCEPTION WHEN OTHERS THEN NULL; END; ALTER TABLE public.diagnostico_tecnico_hallazgo_lineas ENABLE TRIGGER a_bloquear_hallazgo_linea_emitido;
  INSERT INTO _592_negative_results VALUES ('p3_disable_bloquear_enlace','invariante rota',CASE WHEN v_ok THEN 'invariante rota' ELSE 'blocked' END,v_ok);
  -- Mutación deliberada de la rama DELETE: vuelve a validar la línea ya borrada.
  -- Se crea un fixture nuevo con la familia exacta de la línea elegida para aislar esta mutación.
  SELECT d.id,l.familia_trabajo_id,l.id INTO v_diag_draft,v_familia,v_line
  FROM public.diagnosticos_tecnicos d
  JOIN public.diagnostico_tecnico_lineas l ON l.diagnostico_id=d.id AND l.empresa_id=d.empresa_id
  JOIN public.familia_trabajo f ON f.id=l.familia_trabajo_id AND f.empresa_id=l.empresa_id
  WHERE d.empresa_id='emp_2000000000' AND d.estado='borrador'
  ORDER BY d.id,l.id LIMIT 1;
  INSERT INTO public.diagnostico_tecnico_hallazgos(empresa_id,diagnostico_id,familia_trabajo_id,componente_parte,tipo_dano_codigo,causa_probable_codigo,condicion,riesgo,accion_recomendada,atribuible_a)
  VALUES ('emp_2000000000',v_diag_draft,v_familia,'p3 cascade mutation','desgaste','desgaste_normal','conforme','monitorear','monitorear','desgaste_normal') RETURNING id INTO v_hid_draft;
  INSERT INTO public.diagnostico_tecnico_hallazgo_lineas(empresa_id,hallazgo_id,linea_id) VALUES ('emp_2000000000',v_hid_draft,v_line);
  CREATE OR REPLACE FUNCTION public.bloquear_hallazgo_linea_emitido()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $mut$
  BEGIN
    IF TG_OP = 'DELETE' AND NOT EXISTS (SELECT 1 FROM public.diagnostico_tecnico_lineas l WHERE l.id=OLD.linea_id) THEN
      RAISE EXCEPTION 'MUTATION_FAILED: DELETE volvió a validar la línea ya borrada' USING ERRCODE='23514';
    END IF;
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
  END
  $mut$;
  v_ok:=false; v_sqlstate:=NULL; v_message:=NULL;
  BEGIN DELETE FROM public.diagnostico_tecnico_lineas WHERE id=v_line; EXCEPTION WHEN OTHERS THEN v_sqlstate:=SQLSTATE; v_message:=SQLERRM; v_ok:=SQLSTATE='23514' AND SQLERRM='MUTATION_FAILED: DELETE volvió a validar la línea ya borrada'; END;
  INSERT INTO _592_negative_results VALUES ('p3_mutacion_rama_cascada','debe fallar con MUTATION_FAILED',format('%s / %s',v_sqlstate,v_message),v_ok);

  -- P3 adicional: mutar el trigger de código después de crear todos los fixtures que aún usan ese código.
  SET LOCAL ROLE postgres;
  ALTER TABLE public.diagnostico_catalogo_valores DISABLE TRIGGER trg_bloquear_cambio_codigo_catalogo;
  v_ok:=false; v_rows:=0; v_message:=NULL;
  BEGIN
    UPDATE public.diagnostico_catalogo_valores
    SET codigo='desgaste_mutado'
    WHERE empresa_id='emp_2000000000' AND catalogo='tipo_dano' AND codigo='desgaste';
    GET DIAGNOSTICS v_rows=ROW_COUNT;
    v_ok:=v_rows=1;
  EXCEPTION WHEN OTHERS THEN
    v_message:=SQLERRM;
  END;
  ALTER TABLE public.diagnostico_catalogo_valores ENABLE TRIGGER trg_bloquear_cambio_codigo_catalogo;
  INSERT INTO _592_negative_results VALUES ('p3_disable_bloquear_codigo','invariante rota',CASE WHEN v_ok THEN 'invariante rota: codigo cambiado' ELSE coalesce(v_message,'SKIPPED') END,v_ok);

  -- P8: la policy de SELECT exige una fila visible del hallazgo padre.
  SELECT (qual LIKE '%diagnostico_tecnico_hallazgos%') INTO v_ok FROM pg_policies WHERE schemaname='public' AND tablename='diagnostico_tecnico_hallazgo_lineas' AND policyname='hallazgo_lineas_select';
  INSERT INTO _592_negative_results VALUES ('p8_hallazgo_lineas_select_padre','qual contiene EXISTS al hallazgo',CASE WHEN v_ok THEN 'EXISTS diagnostico_tecnico_hallazgos' ELSE 'NO EXISTS' END,v_ok);
END
$round2$;

SET LOCAL ROLE postgres;
SELECT 'behavior' AS tipo, prueba, ok, detalle AS esperado, NULL::text AS obtenido FROM _592_behavior_results
UNION ALL
SELECT 'negative' AS tipo, prueba, ok, esperado, obtenido FROM _592_negative_results
ORDER BY tipo, prueba;

ROLLBACK;
