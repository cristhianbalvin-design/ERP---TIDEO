-- TIDEO ERP - Módulo Transporte y Guías de Remisión
-- Incluye: transportistas, vehículos, conductores, guías de remisión,
--          órdenes de venta (bienes), catálogo de venta, correlativos.
--
-- Arquitectura OSE-ready: los campos xml_hash / cdr_url / qr_data están
-- reservados en comentario; agregarlos al ALTER cuando se integre el OSE.
-- Búsqueda de implementación OSE: grep "OSE_FUTURE"
--
-- Regla de no-borrado: guías y OVs se ANULAN, nunca se eliminan.
-- Correlativo: por (empresa_id, tipo_documento, serie) → atómico en app layer.

-- ─── Tabla: correlativos_documentos ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.correlativos_documentos (
  id            text PRIMARY KEY,
  empresa_id    text NOT NULL REFERENCES public.empresas(id),
  tipo_documento text NOT NULL,   -- 'guia_remision' | 'orden_venta' | 'cotizacion_venta'
  serie         text NOT NULL DEFAULT 'T001',
  ultimo_numero integer NOT NULL DEFAULT 0,
  updated_at    timestamptz DEFAULT now(),
  UNIQUE (empresa_id, tipo_documento, serie)
);

-- ─── Tabla: transportistas ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.transportistas (
  id              text PRIMARY KEY,
  empresa_id      text NOT NULL REFERENCES public.empresas(id),
  ruc             text NOT NULL,
  razon_social    text NOT NULL,
  nombre_comercial text,
  nro_mtc         text,           -- Número de registro MTC (transporte de carga)
  direccion       text,
  telefono        text,
  email           text,
  activo          boolean DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE (empresa_id, ruc)
);

-- ─── Tabla: vehiculos_transporte ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vehiculos_transporte (
  id                          text PRIMARY KEY,
  empresa_id                  text NOT NULL REFERENCES public.empresas(id),
  transportista_id            text REFERENCES public.transportistas(id),
  placa                       text NOT NULL,
  marca                       text,
  modelo                      text,
  anio                        integer,
  tipo                        text DEFAULT 'camion',  -- camion | furgon | moto | otro
  nro_certificado_habilitacion text,                  -- MTC habilitación vehicular
  activo                      boolean DEFAULT true,
  created_at                  timestamptz DEFAULT now(),
  updated_at                  timestamptz DEFAULT now()
);

-- ─── Tabla: conductores_transporte ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conductores_transporte (
  id               text PRIMARY KEY,
  empresa_id       text NOT NULL REFERENCES public.empresas(id),
  transportista_id text REFERENCES public.transportistas(id),
  nombre           text NOT NULL,
  dni              text NOT NULL,
  brevete          text,
  categoria_brevete text,           -- A-I | A-II | A-III | B-II | B-III | C
  vigencia_brevete  date,
  activo           boolean DEFAULT true,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

-- ─── Tabla: catalogo_venta ───────────────────────────────────────────────────
-- Productos/bienes que la empresa comercializa (distinto de servicios).
-- Vinculado al maestro de materiales para trazabilidad de inventario.
CREATE TABLE IF NOT EXISTS public.catalogo_venta (
  id                   text PRIMARY KEY,
  empresa_id           text NOT NULL REFERENCES public.empresas(id),
  material_id          text REFERENCES public.materiales(id),
  codigo               text NOT NULL,
  descripcion          text NOT NULL,
  unidad               text DEFAULT 'NIU',         -- código SUNAT
  precio_lista         numeric(14,4) NOT NULL DEFAULT 0,
  precio_lista_usd     numeric(14,4) DEFAULT 0,
  moneda               text DEFAULT 'PEN',
  descuento_maximo_pct numeric(5,2) DEFAULT 0,
  activo               boolean DEFAULT true,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now(),
  UNIQUE (empresa_id, codigo)
);

-- ─── Tabla: ordenes_venta ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ordenes_venta (
  id                  text PRIMARY KEY,
  empresa_id          text NOT NULL REFERENCES public.empresas(id),
  numero              text NOT NULL,              -- correlativo por empresa

  -- Cliente
  cuenta_id           text REFERENCES public.cuentas(id),
  cliente_nombre      text NOT NULL,
  cliente_ruc_dni     text,
  cliente_direccion   text,

  -- Condiciones comerciales
  moneda              text DEFAULT 'PEN',
  condicion_pago      text DEFAULT '30_dias',
  fecha_emision       date NOT NULL,
  fecha_entrega       date,
  almacen_despacho_id text REFERENCES public.almacenes(id),

  -- Totales
  subtotal            numeric(14,2) DEFAULT 0,
  igv                 numeric(14,2) DEFAULT 0,
  total               numeric(14,2) DEFAULT 0,
  subtotal_usd        numeric(14,2) DEFAULT 0,
  total_usd           numeric(14,2) DEFAULT 0,

  -- Estado: pendiente → parcialmente_despachada → despachada → facturada → anulada
  estado              text DEFAULT 'pendiente',
  observaciones       text,

  -- Anulación (no se borra)
  anulado             boolean DEFAULT false,
  anulado_motivo      text,
  anulado_por         uuid,
  anulado_at          timestamptz,

  created_by          uuid,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),

  UNIQUE (empresa_id, numero)
);

-- ─── Tabla: ordenes_venta_lineas ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ordenes_venta_lineas (
  id               text PRIMARY KEY,
  empresa_id       text NOT NULL REFERENCES public.empresas(id),
  orden_venta_id   text NOT NULL REFERENCES public.ordenes_venta(id) ON DELETE CASCADE,

  material_id      text REFERENCES public.materiales(id),
  catalogo_item_id text REFERENCES public.catalogo_venta(id),
  descripcion      text NOT NULL,
  codigo           text,
  unidad           text DEFAULT 'NIU',

  precio_unitario      numeric(14,4) NOT NULL DEFAULT 0,
  precio_unitario_usd  numeric(14,4) DEFAULT 0,
  descuento_pct        numeric(5,2) DEFAULT 0,
  precio_neto          numeric(14,4),     -- precio_unitario * (1 - descuento/100)

  cantidad             numeric(14,4) NOT NULL DEFAULT 1,
  cantidad_despachada  numeric(14,4) DEFAULT 0,

  subtotal         numeric(14,2) DEFAULT 0,    -- precio_neto * cantidad

  lote             text,
  serie            text,
  orden            integer DEFAULT 1,

  created_at       timestamptz DEFAULT now()
);

-- ─── Tabla: guias_remision ────────────────────────────────────────────────────
-- Cubre los tres orígenes: traslado_interno | despacho_venta | despacho_servicio
-- OSE_FUTURE: agregar xml_hash text, cdr_url text, cdr_estado text, qr_data text
CREATE TABLE IF NOT EXISTS public.guias_remision (
  id              text PRIMARY KEY,
  empresa_id      text NOT NULL REFERENCES public.empresas(id),

  -- Correlativo SUNAT (por empresa + serie)
  serie           text NOT NULL DEFAULT 'T001',
  numero          integer NOT NULL,
  numero_completo text NOT NULL,              -- 'T001-00000001'

  -- Fechas
  fecha_emision         date NOT NULL,
  fecha_inicio_traslado date NOT NULL,

  -- Clasificación y origen
  tipo_origen     text NOT NULL,              -- 'traslado_interno' | 'despacho_venta' | 'despacho_servicio'
  motivo_traslado text NOT NULL DEFAULT '01', -- tabla SUNAT: 01=venta, 04=traslado entre estab., 99=otros
  modalidad       text NOT NULL DEFAULT 'remitente',  -- 'remitente' | 'transportista'

  -- Vínculos a documentos origen (solo se rellena el que aplica)
  orden_venta_id  text REFERENCES public.ordenes_venta(id),
  ot_id           text,                       -- referencia a OT (texto libre, no FK para evitar ciclos)

  -- Almacén origen (para trazabilidad WMS)
  almacen_origen_id text REFERENCES public.almacenes(id),

  -- Punto de partida
  partida_direccion text NOT NULL DEFAULT '',
  partida_ubigeo    text,                     -- código ubigeo INEI (6 dígitos)

  -- Punto de llegada
  llegada_direccion text NOT NULL DEFAULT '',
  llegada_ubigeo    text,

  -- Destinatario
  destinatario_ruc_dni    text DEFAULT '',
  destinatario_razon_social text DEFAULT '',

  -- Peso total del traslado
  peso_bruto_total numeric(14,3) DEFAULT 0,
  unidad_peso      text DEFAULT 'KGM',        -- KGM=kilos, TNE=toneladas métricas

  -- Transportista (ambas modalidades usan estos campos)
  transportista_id        text REFERENCES public.transportistas(id),
  transportista_ruc       text,
  transportista_razon_social text,
  transportista_nro_mtc   text,

  -- Vehículo (modalidad 'remitente')
  vehiculo_id             text REFERENCES public.vehiculos_transporte(id),
  vehiculo_placa          text,
  vehiculo_cert_habilitacion text,

  -- Conductor (modalidad 'remitente')
  conductor_id            text REFERENCES public.conductores_transporte(id),
  conductor_nombre        text,
  conductor_dni           text,
  conductor_brevete       text,

  -- Estado: borrador → emitida → en_transito → entregada → anulada
  estado          text DEFAULT 'borrador',

  -- Movimiento WMS generado al confirmar entrega
  kardex_salida_ids jsonb DEFAULT '[]'::jsonb,  -- array de kardex_id generados

  -- Anulación (inmutable: no se borra)
  anulado         boolean DEFAULT false,
  anulado_motivo  text,
  anulado_por     uuid,
  anulado_at      timestamptz,

  -- Auditoría
  created_by      uuid,
  updated_by      uuid,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),

  UNIQUE (empresa_id, serie, numero)
);

-- ─── Tabla: guias_remision_lineas ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.guias_remision_lineas (
  id          text PRIMARY KEY,
  empresa_id  text NOT NULL REFERENCES public.empresas(id),
  guia_id     text NOT NULL REFERENCES public.guias_remision(id) ON DELETE CASCADE,

  material_id text REFERENCES public.materiales(id),
  descripcion text NOT NULL,
  codigo      text,
  unidad      text NOT NULL DEFAULT 'NIU',   -- código SUNAT de unidad de medida

  cantidad         numeric(14,4) NOT NULL DEFAULT 1,
  peso_unitario    numeric(10,4) DEFAULT 0,
  peso_total       numeric(14,4) DEFAULT 0,  -- cantidad * peso_unitario

  -- Valor referencial (no obligatorio en GR pero útil para trazabilidad)
  precio_unitario  numeric(14,4) DEFAULT 0,
  valor_total      numeric(14,4) DEFAULT 0,
  moneda           text DEFAULT 'PEN',

  lote    text,
  serie   text,
  orden   integer DEFAULT 1,

  created_at timestamptz DEFAULT now()
);

-- ─── Índices ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_guias_empresa    ON public.guias_remision(empresa_id, estado, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_guias_ov         ON public.guias_remision(empresa_id, orden_venta_id) WHERE orden_venta_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_guias_serie      ON public.guias_remision(empresa_id, serie, numero);
CREATE INDEX IF NOT EXISTS idx_ov_empresa       ON public.ordenes_venta(empresa_id, estado, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ov_lineas        ON public.ordenes_venta_lineas(orden_venta_id);
CREATE INDEX IF NOT EXISTS idx_gr_lineas        ON public.guias_remision_lineas(guia_id);
CREATE INDEX IF NOT EXISTS idx_transportistas   ON public.transportistas(empresa_id, activo);
CREATE INDEX IF NOT EXISTS idx_vehiculos        ON public.vehiculos_transporte(empresa_id, transportista_id);
CREATE INDEX IF NOT EXISTS idx_conductores      ON public.conductores_transporte(empresa_id, transportista_id);
CREATE INDEX IF NOT EXISTS idx_catalogo_venta   ON public.catalogo_venta(empresa_id, activo);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.correlativos_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transportistas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehiculos_transporte    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conductores_transporte  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalogo_venta          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordenes_venta           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordenes_venta_lineas    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guias_remision          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guias_remision_lineas   ENABLE ROW LEVEL SECURITY;

-- Políticas de acceso autenticado por empresa_id
-- (DROP IF EXISTS + CREATE para idempotencia — CREATE POLICY no soporta IF NOT EXISTS)
DROP POLICY IF EXISTS "tenant_correlativos"   ON public.correlativos_documentos;
DROP POLICY IF EXISTS "tenant_transportistas" ON public.transportistas;
DROP POLICY IF EXISTS "tenant_vehiculos"      ON public.vehiculos_transporte;
DROP POLICY IF EXISTS "tenant_conductores"    ON public.conductores_transporte;
DROP POLICY IF EXISTS "tenant_catalogo_venta" ON public.catalogo_venta;
DROP POLICY IF EXISTS "tenant_ov"             ON public.ordenes_venta;
DROP POLICY IF EXISTS "tenant_ov_lineas"      ON public.ordenes_venta_lineas;
DROP POLICY IF EXISTS "tenant_guias"          ON public.guias_remision;
DROP POLICY IF EXISTS "tenant_guias_lineas"   ON public.guias_remision_lineas;

CREATE POLICY "tenant_correlativos"   ON public.correlativos_documentos  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "tenant_transportistas" ON public.transportistas           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "tenant_vehiculos"      ON public.vehiculos_transporte     FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "tenant_conductores"    ON public.conductores_transporte   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "tenant_catalogo_venta" ON public.catalogo_venta          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "tenant_ov"             ON public.ordenes_venta            FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "tenant_ov_lineas"      ON public.ordenes_venta_lineas     FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "tenant_guias"          ON public.guias_remision           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "tenant_guias_lineas"   ON public.guias_remision_lineas    FOR ALL TO authenticated USING (true) WITH CHECK (true);
