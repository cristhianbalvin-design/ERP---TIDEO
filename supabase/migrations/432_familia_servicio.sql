-- TIDEO ERP — Familia de servicio normalizada y precios de referencia opcionales.
-- Migración retroactiva: producción ya contiene estos cambios aplicados manualmente.
-- No ejecutar manualmente en producción; conciliar su historial con la versión 432.

-- Costo y precio pueden quedar sin estimar. DROP DEFAULT es seguro si ya no existe.
ALTER TABLE public.servicios ALTER COLUMN costo DROP DEFAULT;
ALTER TABLE public.servicios ALTER COLUMN precio DROP DEFAULT;

CREATE TABLE IF NOT EXISTS public.familia_servicio (
  id text PRIMARY KEY,
  empresa_id text NOT NULL REFERENCES public.empresas(id),
  codigo text NOT NULL,
  nombre text NOT NULL,
  descripcion text,
  activo boolean NOT NULL DEFAULT true,
  orden integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, codigo)
);

ALTER TABLE public.familia_servicio ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS familia_servicio_iso ON public.familia_servicio;
CREATE POLICY familia_servicio_iso ON public.familia_servicio
  FOR ALL USING (public.usuario_tiene_empresa(empresa_id))
  WITH CHECK (public.usuario_tiene_empresa(empresa_id));

ALTER TABLE public.servicios
  ADD COLUMN IF NOT EXISTS familia_id text REFERENCES public.familia_servicio(id) ON DELETE RESTRICT;

-- Seed para los seis tenants activos. ON CONFLICT conserva las filas ya existentes.
INSERT INTO public.familia_servicio (id, empresa_id, codigo, nombre, orden)
SELECT
  'fam_' || substr(md5(random()::text || empresa_id || codigo), 1, 18),
  empresa_id,
  codigo,
  nombre,
  orden
FROM (
  VALUES
    ('MTTO-PREV', 'Mantenimiento Preventivo', 1),
    ('MTTO-CORR', 'Mantenimiento Correctivo', 2),
    ('MTTO-PRED', 'Mantenimiento Predictivo', 3),
    ('OVERHAUL', 'Reparación de Componentes / Overhaul', 4),
    ('ALQUILER', 'Alquiler de Equipos', 5),
    ('REPUESTOS', 'Suministro de Repuestos', 6),
    ('INSPECCION', 'Inspección Técnica / Certificación', 7),
    ('INSTALACION', 'Instalación y Puesta en Marcha', 8),
    ('SOLDADURA', 'Soldadura y Fabricación', 9),
    ('EMERGENCIA', 'Servicio de Emergencia / Guardia', 10),
    ('TRANSPORTE', 'Transporte y Logística de Equipos', 11),
    ('CAPACITACION', 'Capacitación Operativa', 12),
    ('CONSULTORIA', 'Consultoría Técnica', 13),
    ('HSE', 'Servicios HSE / Seguridad', 14),
    ('SUPERVISION', 'Supervisión de Obra/Proyecto', 15),
    ('GENERAL', 'General', 16)
) AS familias(codigo, nombre, orden)
CROSS JOIN (
  VALUES
    ('emp_20601829101'),
    ('emp_20606120487'),
    ('emp_20600026446'),
    ('emp_20609996464'),
    ('emp_20513453711'),
    ('emp_20541435833')
) AS tenants(empresa_id)
ON CONFLICT (empresa_id, codigo) DO NOTHING;
