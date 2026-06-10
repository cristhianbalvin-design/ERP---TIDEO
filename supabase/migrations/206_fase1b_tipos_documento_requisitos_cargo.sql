-- ============================================================================
-- 206 · Fase 1B — Maestro de tipos de documento + Matriz cargo × documento
-- ============================================================================

-- ── 1. Maestro de tipos de documento (por tenant) ────────────────────────────

CREATE TABLE IF NOT EXISTS public.tipos_documento_empresa (
  id                  text PRIMARY KEY,
  empresa_id          text NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  codigo              text NOT NULL,
  nombre              text NOT NULL,
  ambito              text NOT NULL DEFAULT 'Ambos'
                        CHECK (ambito IN ('Operativo', 'Administrativo', 'Ambos')),
  exige_vencimiento   boolean NOT NULL DEFAULT false,
  dias_alerta         integer NOT NULL DEFAULT 30,
  es_habilitante      boolean NOT NULL DEFAULT false,
  requiere_validacion boolean NOT NULL DEFAULT true,
  estado              text NOT NULL DEFAULT 'activo'
                        CHECK (estado IN ('activo', 'inactivo')),
  orden               integer NOT NULL DEFAULT 0,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  UNIQUE (empresa_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_tdoc_empresa_activo
  ON public.tipos_documento_empresa (empresa_id, estado);

ALTER TABLE public.tipos_documento_empresa ENABLE ROW LEVEL SECURITY;

CREATE POLICY tdoc_select ON public.tipos_documento_empresa
  FOR SELECT USING (public.usuario_tiene_empresa(empresa_id));

CREATE POLICY tdoc_insert ON public.tipos_documento_empresa
  FOR INSERT WITH CHECK (public.usuario_tiene_empresa(empresa_id));

CREATE POLICY tdoc_update ON public.tipos_documento_empresa
  FOR UPDATE
  USING (public.usuario_tiene_empresa(empresa_id))
  WITH CHECK (public.usuario_tiene_empresa(empresa_id));

-- No DELETE policy: usar estado = 'inactivo' para desactivar.

-- ── 2. Matriz cargo × tipo de documento (por tenant) ─────────────────────────

CREATE TABLE IF NOT EXISTS public.cargo_documento_requisito (
  id                 text PRIMARY KEY,
  empresa_id         text NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  cargo_id           text NOT NULL REFERENCES public.cargos_empresa(id) ON DELETE CASCADE,
  tipo_documento_id  text NOT NULL REFERENCES public.tipos_documento_empresa(id) ON DELETE CASCADE,
  obligatorio        boolean NOT NULL DEFAULT true,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now(),
  UNIQUE (empresa_id, cargo_id, tipo_documento_id)
);

CREATE INDEX IF NOT EXISTS idx_cdr_cargo
  ON public.cargo_documento_requisito (empresa_id, cargo_id);

ALTER TABLE public.cargo_documento_requisito ENABLE ROW LEVEL SECURITY;

CREATE POLICY cdr_select ON public.cargo_documento_requisito
  FOR SELECT USING (public.usuario_tiene_empresa(empresa_id));

CREATE POLICY cdr_insert ON public.cargo_documento_requisito
  FOR INSERT WITH CHECK (public.usuario_tiene_empresa(empresa_id));

CREATE POLICY cdr_update ON public.cargo_documento_requisito
  FOR UPDATE
  USING (public.usuario_tiene_empresa(empresa_id))
  WITH CHECK (public.usuario_tiene_empresa(empresa_id));

-- DELETE permitido: es una relación de configuración, no un registro de auditoría.
CREATE POLICY cdr_delete ON public.cargo_documento_requisito
  FOR DELETE USING (public.usuario_tiene_empresa(empresa_id));

-- ── 3. RPC: importar plantilla de tipos comunes del rubro ─────────────────────
-- Inserta tipos predefinidos para el tenant si no existen (ON CONFLICT DO NOTHING).
-- El tenant puede editarlos o eliminarlos (desactivar) libremente después.

CREATE OR REPLACE FUNCTION public.importar_plantilla_tipos_documento(p_empresa_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plantilla jsonb := '[
    {"codigo":"TDOC-001","nombre":"SCTR",                      "ambito":"Operativo",      "exige_vencimiento":true,  "dias_alerta":30, "es_habilitante":true,  "requiere_validacion":true,  "orden":1},
    {"codigo":"TDOC-002","nombre":"Examen Médico Ocupacional", "ambito":"Ambos",          "exige_vencimiento":true,  "dias_alerta":30, "es_habilitante":true,  "requiere_validacion":true,  "orden":2},
    {"codigo":"TDOC-003","nombre":"Entrega de EPP",            "ambito":"Operativo",      "exige_vencimiento":false, "dias_alerta":0,  "es_habilitante":true,  "requiere_validacion":false, "orden":3},
    {"codigo":"TDOC-004","nombre":"Licencia de Conducir",      "ambito":"Operativo",      "exige_vencimiento":true,  "dias_alerta":30, "es_habilitante":false, "requiere_validacion":false, "orden":4},
    {"codigo":"TDOC-005","nombre":"Carnet Minero",             "ambito":"Operativo",      "exige_vencimiento":true,  "dias_alerta":30, "es_habilitante":true,  "requiere_validacion":true,  "orden":5},
    {"codigo":"TDOC-006","nombre":"Cert. Trabajo en Altura",   "ambito":"Operativo",      "exige_vencimiento":true,  "dias_alerta":30, "es_habilitante":true,  "requiere_validacion":true,  "orden":6},
    {"codigo":"TDOC-007","nombre":"DNI",                       "ambito":"Ambos",          "exige_vencimiento":false, "dias_alerta":0,  "es_habilitante":false, "requiere_validacion":false, "orden":7},
    {"codigo":"TDOC-008","nombre":"Contrato",                  "ambito":"Ambos",          "exige_vencimiento":true,  "dias_alerta":60, "es_habilitante":false, "requiere_validacion":true,  "orden":8},
    {"codigo":"TDOC-009","nombre":"Credencial de Acceso",      "ambito":"Ambos",          "exige_vencimiento":true,  "dias_alerta":15, "es_habilitante":true,  "requiere_validacion":true,  "orden":9}
  ]'::jsonb;
  rec jsonb;
BEGIN
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'Sin acceso a la empresa %', p_empresa_id;
  END IF;

  FOR rec IN SELECT jsonb_array_elements(v_plantilla)
  LOOP
    INSERT INTO public.tipos_documento_empresa (
      id, empresa_id, codigo, nombre, ambito,
      exige_vencimiento, dias_alerta, es_habilitante, requiere_validacion,
      estado, orden
    ) VALUES (
      'tdoc_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 18),
      p_empresa_id,
      rec->>'codigo',
      rec->>'nombre',
      rec->>'ambito',
      (rec->>'exige_vencimiento')::boolean,
      (rec->>'dias_alerta')::integer,
      (rec->>'es_habilitante')::boolean,
      (rec->>'requiere_validacion')::boolean,
      'activo',
      (rec->>'orden')::integer
    )
    ON CONFLICT (empresa_id, codigo) DO NOTHING;
  END LOOP;
END;
$$;

-- ── 4. Vista: requisitos_cargo_vista ─────────────────────────────────────────
-- Resuelve el conjunto de documentos requeridos por cargo.
-- Preparada para superponer excepciones por persona en fase futura
-- (join con tabla de excepciones persona × documento, que no existe aún).

CREATE OR REPLACE VIEW public.requisitos_cargo_vista AS
  SELECT
    cdr.id,
    cdr.empresa_id,
    cdr.cargo_id,
    ce.nombre         AS cargo_nombre,
    ce.tipo           AS cargo_tipo,
    cdr.tipo_documento_id,
    tde.nombre        AS tipo_doc_nombre,
    tde.codigo        AS tipo_doc_codigo,
    tde.ambito        AS tipo_doc_ambito,
    tde.exige_vencimiento,
    tde.dias_alerta,
    tde.es_habilitante,
    tde.requiere_validacion,
    cdr.obligatorio
  FROM public.cargo_documento_requisito cdr
  JOIN public.cargos_empresa            ce  ON ce.id  = cdr.cargo_id
  JOIN public.tipos_documento_empresa   tde ON tde.id = cdr.tipo_documento_id
  WHERE tde.estado = 'activo';

SELECT pg_notify('pgrst', 'reload schema');
