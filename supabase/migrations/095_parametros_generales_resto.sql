-- Migración 095: Parametros Generales Resto
-- Añade configuración global faltante, series documentarias y plantillas SLA.

-- 1. Actualizar empresa_config
ALTER TABLE public.empresa_config
  ADD COLUMN IF NOT EXISTS moneda_base text DEFAULT 'PEN',
  ADD COLUMN IF NOT EXISTS igv_defecto numeric DEFAULT 18,
  ADD COLUMN IF NOT EXISTS zona_horaria text DEFAULT 'America/Lima',
  ADD COLUMN IF NOT EXISTS plantilla_cotizacion text DEFAULT 'TIDEO propuesta tecnica v3',
  ADD COLUMN IF NOT EXISTS plantilla_factura text DEFAULT 'Exportacion fiscal externa',
  ADD COLUMN IF NOT EXISTS requiere_2fa_financiero boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS config_flujos_alertas jsonb DEFAULT '[]'::jsonb;

-- 2. Crear tabla series_documentarias
CREATE TABLE IF NOT EXISTS public.series_documentarias (
  id text primary key,
  empresa_id text not null references public.empresas(id) on delete cascade,
  documento text not null,
  serie text not null,
  siguiente_correlativo numeric not null default 1,
  regla text,
  estado text default 'activo',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

CREATE INDEX IF NOT EXISTS idx_series_documentarias_empresa ON public.series_documentarias(empresa_id, estado);

ALTER TABLE public.series_documentarias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_series_doc_select ON public.series_documentarias;
CREATE POLICY tenant_series_doc_select ON public.series_documentarias
  FOR SELECT USING (public.usuario_tiene_empresa(empresa_id));

DROP POLICY IF EXISTS tenant_series_doc_insert ON public.series_documentarias;
CREATE POLICY tenant_series_doc_insert ON public.series_documentarias
  FOR INSERT WITH CHECK (public.usuario_tiene_empresa(empresa_id) AND public.usuario_puede(empresa_id, 'parametros', 'crear'));

DROP POLICY IF EXISTS tenant_series_doc_update ON public.series_documentarias;
CREATE POLICY tenant_series_doc_update ON public.series_documentarias
  FOR UPDATE USING (public.usuario_tiene_empresa(empresa_id) AND public.usuario_puede(empresa_id, 'parametros', 'editar'))
  WITH CHECK (public.usuario_tiene_empresa(empresa_id) AND public.usuario_puede(empresa_id, 'parametros', 'editar'));

DROP POLICY IF EXISTS tenant_series_doc_delete ON public.series_documentarias;
CREATE POLICY tenant_series_doc_delete ON public.series_documentarias
  FOR DELETE USING (public.usuario_tiene_empresa(empresa_id) AND public.usuario_puede(empresa_id, 'parametros', 'editar'));


-- 3. Crear tabla sla_plantillas
CREATE TABLE IF NOT EXISTS public.sla_plantillas (
  id text primary key,
  empresa_id text not null references public.empresas(id) on delete cascade,
  nombre text not null,
  tiempo_respuesta_horas numeric default 4,
  tiempo_resolucion_horas numeric default 24,
  semaforo_regla text,
  estado text default 'activo',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

CREATE INDEX IF NOT EXISTS idx_sla_plantillas_empresa ON public.sla_plantillas(empresa_id, estado);

ALTER TABLE public.sla_plantillas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_sla_plantillas_select ON public.sla_plantillas;
CREATE POLICY tenant_sla_plantillas_select ON public.sla_plantillas
  FOR SELECT USING (public.usuario_tiene_empresa(empresa_id));

DROP POLICY IF EXISTS tenant_sla_plantillas_insert ON public.sla_plantillas;
CREATE POLICY tenant_sla_plantillas_insert ON public.sla_plantillas
  FOR INSERT WITH CHECK (public.usuario_tiene_empresa(empresa_id) AND public.usuario_puede(empresa_id, 'parametros', 'crear'));

DROP POLICY IF EXISTS tenant_sla_plantillas_update ON public.sla_plantillas;
CREATE POLICY tenant_sla_plantillas_update ON public.sla_plantillas
  FOR UPDATE USING (public.usuario_tiene_empresa(empresa_id) AND public.usuario_puede(empresa_id, 'parametros', 'editar'))
  WITH CHECK (public.usuario_tiene_empresa(empresa_id) AND public.usuario_puede(empresa_id, 'parametros', 'editar'));

DROP POLICY IF EXISTS tenant_sla_plantillas_delete ON public.sla_plantillas;
CREATE POLICY tenant_sla_plantillas_delete ON public.sla_plantillas
  FOR DELETE USING (public.usuario_tiene_empresa(empresa_id) AND public.usuario_puede(empresa_id, 'parametros', 'editar'));

-- 4. Maestro tenant: monedas, impuestos y unidades
CREATE TABLE IF NOT EXISTS public.monedas_impuestos_unidades (
  id text primary key,
  empresa_id text not null references public.empresas(id) on delete cascade,
  tipo text not null default 'moneda' check (tipo in ('moneda', 'impuesto', 'unidad')),
  codigo text not null,
  nombre text not null,
  detalle text,
  estado text default 'activo',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (empresa_id, tipo, codigo)
);

CREATE INDEX IF NOT EXISTS idx_monedas_impuestos_unidades_empresa
  ON public.monedas_impuestos_unidades(empresa_id, tipo, estado);

ALTER TABLE public.monedas_impuestos_unidades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_miu_select ON public.monedas_impuestos_unidades;
CREATE POLICY tenant_miu_select ON public.monedas_impuestos_unidades
  FOR SELECT USING (public.usuario_tiene_empresa(empresa_id) AND public.usuario_puede(empresa_id, 'maestros', 'ver'));

DROP POLICY IF EXISTS tenant_miu_insert ON public.monedas_impuestos_unidades;
CREATE POLICY tenant_miu_insert ON public.monedas_impuestos_unidades
  FOR INSERT WITH CHECK (public.usuario_tiene_empresa(empresa_id) AND public.usuario_puede(empresa_id, 'maestros', 'crear'));

DROP POLICY IF EXISTS tenant_miu_update ON public.monedas_impuestos_unidades;
CREATE POLICY tenant_miu_update ON public.monedas_impuestos_unidades
  FOR UPDATE USING (public.usuario_tiene_empresa(empresa_id) AND public.usuario_puede(empresa_id, 'maestros', 'editar'))
  WITH CHECK (public.usuario_tiene_empresa(empresa_id) AND public.usuario_puede(empresa_id, 'maestros', 'editar'));

DROP POLICY IF EXISTS tenant_miu_delete ON public.monedas_impuestos_unidades;
CREATE POLICY tenant_miu_delete ON public.monedas_impuestos_unidades
  FOR DELETE USING (public.usuario_tiene_empresa(empresa_id) AND public.usuario_puede(empresa_id, 'maestros', 'editar'));

-- Notify postgrest
SELECT pg_notify('pgrst', 'reload schema');
