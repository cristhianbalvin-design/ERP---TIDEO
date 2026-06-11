-- TIDEO ERP - Maestro de Activos (horizontal genérico)
-- Un activo se opera, deprecia y asigna a CECO. No tiene stock ni costo promedio.
-- Los repuestos/consumibles de un activo sí son materiales; el equipo en sí es un activo.
--
-- PENDIENTE VERTICAL (CMMS): pasaporte de componentes, horómetro telemétrico, gestión de garantías.
-- Estos se implementarán en la fusión con el ERP especializado.

CREATE TABLE IF NOT EXISTS public.activos (
  id                  text PRIMARY KEY,
  empresa_id          text NOT NULL REFERENCES public.empresas(id),
  codigo              text NOT NULL,
  nombre              text NOT NULL,
  tipo_categoria      text DEFAULT 'equipo',        -- equipo | vehiculo | mueble | inmueble | intangible | otro
  marca               text,
  modelo              text,
  placa_serie         text,                         -- placa (vehículos) o nro de serie (equipos)
  ubicacion           text,
  estado              text DEFAULT 'operativo',     -- operativo | en_mantenimiento | dado_baja
  centro_costo_id     text REFERENCES public.centros_costo(id),
  responsable_id      uuid,                         -- referencia suave a auth.users
  responsable_nombre  text,                         -- nombre libre o del import
  fecha_alta          date,
  valor_adquisicion   numeric(14,2) DEFAULT 0,
  moneda              text DEFAULT 'PEN',
  vida_util_anos      integer DEFAULT 0,
  -- documentos con semáforo de vencimiento: [{tipo, nombre, fecha_vencimiento, archivo_url, dias_alerta}]
  -- tipos habituales: SOAT, poliza_todo_riesgo, revision_tecnica, inspeccion_interna
  documentos          jsonb DEFAULT '[]'::jsonb,
  observacion         text,
  -- baja con trazabilidad (inmutable: baja = desactivar con motivo, nunca borrar)
  baja_motivo         text,
  baja_at             timestamptz,
  baja_por            uuid,
  created_by          uuid,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  UNIQUE (empresa_id, codigo)
);

CREATE INDEX IF NOT EXISTS idx_activos_empresa ON public.activos(empresa_id, estado);
CREATE INDEX IF NOT EXISTS idx_activos_ceco    ON public.activos(empresa_id, centro_costo_id);
CREATE INDEX IF NOT EXISTS idx_activos_tipo    ON public.activos(empresa_id, tipo_categoria);
CREATE INDEX IF NOT EXISTS idx_activos_codigo  ON public.activos(empresa_id, codigo);

-- Aislamiento multitenant: empresa_id en todas las queries (patrón del resto del proyecto).
-- RLS no aplicado aquí — consistente con 009_wms_motor.sql y las demás migraciones.
