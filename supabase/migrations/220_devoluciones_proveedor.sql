-- 220: Devoluciones a Proveedor (RMA)
-- Flujo: borrador → enviada (WMS salida) → aceptada → nota_credito_recibida (ajuste CxP)
-- Anulación de devolución enviada revierte movimientos WMS.
-- Correlativo DEV-0001 usa tabla correlativos_documentos (migración 211).

-- ─── Tabla principal ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.devoluciones_proveedor (
  id                  text PRIMARY KEY,
  empresa_id          text NOT NULL REFERENCES public.empresas(id),
  recepcion_id        text NOT NULL REFERENCES public.recepciones(id),
  proveedor_id        text NOT NULL REFERENCES public.proveedores(id),
  oc_id               text REFERENCES public.ordenes_compra(id),
  numero_devolucion   text NOT NULL,
  fecha               date NOT NULL DEFAULT CURRENT_DATE,
  motivo              text NOT NULL CHECK (motivo IN ('defecto_calidad','error_envio','exceso_cantidad','vencido','otro')),
  descripcion_motivo  text,
  estado              text NOT NULL DEFAULT 'borrador'
                        CHECK (estado IN ('borrador','enviada','aceptada','nota_credito_recibida','anulada')),
  cxp_ajuste_id       text REFERENCES public.cxp(id),
  kardex_salida_ids   jsonb DEFAULT '[]',
  motivo_anulacion    text,
  creado_por          text,
  creado_en           timestamptz NOT NULL DEFAULT now(),
  actualizado_en      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, numero_devolucion)
);

-- ─── Líneas de devolución ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.devoluciones_proveedor_lineas (
  id                  text PRIMARY KEY,
  empresa_id          text NOT NULL REFERENCES public.empresas(id),
  devolucion_id       text NOT NULL REFERENCES public.devoluciones_proveedor(id) ON DELETE CASCADE,
  material_id         text REFERENCES public.materiales(id),
  descripcion         text NOT NULL,
  cantidad_devuelta   numeric NOT NULL CHECK (cantidad_devuelta > 0),
  precio_unitario     numeric NOT NULL DEFAULT 0,
  subtotal            numeric GENERATED ALWAYS AS (cantidad_devuelta * precio_unitario) STORED,
  lote                text,
  serie               text,
  motivo_linea        text,
  almacen_id          text REFERENCES public.almacenes(id)
);

-- ─── Índices ────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_dev_prov_empresa     ON public.devoluciones_proveedor(empresa_id);
CREATE INDEX IF NOT EXISTS idx_dev_prov_recepcion   ON public.devoluciones_proveedor(recepcion_id);
CREATE INDEX IF NOT EXISTS idx_dev_prov_estado      ON public.devoluciones_proveedor(estado);
CREATE INDEX IF NOT EXISTS idx_dev_lineas_devolucion ON public.devoluciones_proveedor_lineas(devolucion_id);

-- ─── RLS ────────────────────────────────────────────────────────────────────────
ALTER TABLE public.devoluciones_proveedor        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devoluciones_proveedor_lineas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_devoluciones_proveedor"        ON public.devoluciones_proveedor;
DROP POLICY IF EXISTS "tenant_devoluciones_proveedor_lineas" ON public.devoluciones_proveedor_lineas;

CREATE POLICY "tenant_devoluciones_proveedor"
  ON public.devoluciones_proveedor FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "tenant_devoluciones_proveedor_lineas"
  ON public.devoluciones_proveedor_lineas FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- ─── Notificar PostgREST ────────────────────────────────────────────────────────
SELECT pg_notify('pgrst', 'reload schema');
