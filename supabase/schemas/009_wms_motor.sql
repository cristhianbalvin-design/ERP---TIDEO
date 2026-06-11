-- TIDEO ERP - WMS Motor: ampliar esquema para inventario de clase mundial.
-- Capa 1 (motor) + Capa 2 (amplitud WMS). Capa 3 (valuaciones verticales) fuera de alcance.

-- ─── Ampliar materiales ────────────────────────────────────────────────────────
-- tipo_control: 'sin_control' | 'lote' | 'serie'
ALTER TABLE public.materiales
  ADD COLUMN IF NOT EXISTS tipo_control text DEFAULT 'sin_control',
  ADD COLUMN IF NOT EXISTS stock_maximo numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS punto_reorden numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS costo_promedio_usd numeric(14,2) DEFAULT 0;

-- ─── Ampliar kardex ────────────────────────────────────────────────────────────
-- motivo: subtipo semántico del movimiento (saldo_inicial, compra_directa, ajuste_positivo, etc.)
-- Columnas de trazabilidad de lote/serie/vencimiento en el movimiento
-- Columnas USD paralelas (PEN y USD nunca se mezclan para saldo)
-- Campos de anulación: inmutable = anular con motivo, nunca borrar
ALTER TABLE public.kardex
  ADD COLUMN IF NOT EXISTS motivo text,
  ADD COLUMN IF NOT EXISTS lote text,
  ADD COLUMN IF NOT EXISTS serie text,
  ADD COLUMN IF NOT EXISTS vencimiento date,
  ADD COLUMN IF NOT EXISTS saldo_cantidad numeric(14,2),
  ADD COLUMN IF NOT EXISTS costo_total numeric(14,2),
  ADD COLUMN IF NOT EXISTS costo_unitario_usd numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS costo_total_usd numeric(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS anulado boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS anulado_por uuid,
  ADD COLUMN IF NOT EXISTS anulado_motivo text,
  ADD COLUMN IF NOT EXISTS anulado_at timestamptz,
  ADD COLUMN IF NOT EXISTS proveedor_id text,
  ADD COLUMN IF NOT EXISTS nro_documento text;

-- ─── Ampliar stock ─────────────────────────────────────────────────────────────
-- fisico = disponible + reservado (se mantiene manualmente en la app)
-- disponible = lo que se puede consumir = fisico - reservado
ALTER TABLE public.stock
  ADD COLUMN IF NOT EXISTS fisico numeric(14,2) DEFAULT 0;

-- Inicializar fisico en registros existentes
UPDATE public.stock SET fisico = disponible + reservado WHERE fisico = 0 AND (disponible > 0 OR reservado > 0);

-- ─── Tabla: conteos físicos de inventario ─────────────────────────────────────
-- Soporta conteo total y cíclico (por zona o artículo)
-- Al cerrar, genera movimientos de ajuste automáticos por diferencia
CREATE TABLE IF NOT EXISTS public.inventario_conteos (
  id text PRIMARY KEY,
  empresa_id text NOT NULL REFERENCES public.empresas(id),
  codigo text NOT NULL,
  nombre text NOT NULL,
  tipo text DEFAULT 'total',          -- 'total' | 'ciclico'
  almacen_id text REFERENCES public.almacenes(id),
  zona text,
  estado text DEFAULT 'abierto',      -- 'abierto' | 'en_proceso' | 'cerrado'
  items jsonb DEFAULT '[]'::jsonb,    -- [{ material_id, teorico, fisico, diferencia, lote, serie }]
  ajustes_generados boolean DEFAULT false,
  creado_por uuid,
  cerrado_por uuid,
  cerrado_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (empresa_id, codigo)
);

-- ─── Índices para rendimiento ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_kardex_material ON public.kardex(empresa_id, material_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kardex_almacen ON public.kardex(empresa_id, almacen_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kardex_activo ON public.kardex(empresa_id, anulado) WHERE anulado = false;
CREATE INDEX IF NOT EXISTS idx_kardex_referencia ON public.kardex(empresa_id, referencia_tipo, referencia_id);
CREATE INDEX IF NOT EXISTS idx_conteos_empresa ON public.inventario_conteos(empresa_id, estado);
CREATE INDEX IF NOT EXISTS idx_stock_fisico ON public.stock(empresa_id, almacen_id) WHERE fisico > 0;
CREATE INDEX IF NOT EXISTS idx_materiales_control ON public.materiales(empresa_id, tipo_control);

ALTER TABLE public.inventario_conteos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inv_conteos_select ON public.inventario_conteos;
CREATE POLICY inv_conteos_select ON public.inventario_conteos
FOR SELECT USING (
  public.usuario_tiene_empresa(empresa_id)
  AND public.usuario_puede(empresa_id, 'inventario', 'ver')
);

DROP POLICY IF EXISTS inv_conteos_insert ON public.inventario_conteos;
CREATE POLICY inv_conteos_insert ON public.inventario_conteos
FOR INSERT WITH CHECK (
  public.usuario_tiene_empresa(empresa_id)
  AND (
    public.usuario_puede(empresa_id, 'inventario', 'crear')
    OR public.usuario_puede(empresa_id, 'inventario', 'editar')
  )
);

DROP POLICY IF EXISTS inv_conteos_update ON public.inventario_conteos;
CREATE POLICY inv_conteos_update ON public.inventario_conteos
FOR UPDATE USING (
  public.usuario_tiene_empresa(empresa_id)
  AND public.usuario_puede(empresa_id, 'inventario', 'editar')
) WITH CHECK (
  public.usuario_tiene_empresa(empresa_id)
  AND public.usuario_puede(empresa_id, 'inventario', 'editar')
);

CREATE OR REPLACE FUNCTION public.bloquear_update_conteo_cerrado()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.estado = 'cerrado' THEN
    RAISE EXCEPTION 'Conteo cerrado es inmutable; cree un nuevo conteo para corregir';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bloquear_update_conteo_cerrado ON public.inventario_conteos;
CREATE TRIGGER trg_bloquear_update_conteo_cerrado
BEFORE UPDATE ON public.inventario_conteos
FOR EACH ROW
EXECUTE FUNCTION public.bloquear_update_conteo_cerrado();
