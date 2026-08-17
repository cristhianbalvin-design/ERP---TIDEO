-- TIDEO ERP — Tipos de servicio interno ampliados.
-- Migración retroactiva: estos cambios ya fueron aplicados manualmente en producción.

CREATE TABLE IF NOT EXISTS public.clasificacion_servicio_interno (
  id text PRIMARY KEY,
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  es_planificado boolean,
  orden integer DEFAULT 0,
  activo boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.familia_servicio_interno (
  id text PRIMARY KEY,
  codigo text NOT NULL UNIQUE,
  nombre text NOT NULL,
  orden integer DEFAULT 0,
  activo boolean NOT NULL DEFAULT true
);

ALTER TABLE public.clasificacion_servicio_interno ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clasificacion_servicio_interno_read ON public.clasificacion_servicio_interno;
CREATE POLICY clasificacion_servicio_interno_read ON public.clasificacion_servicio_interno
  FOR SELECT TO authenticated USING (true);

ALTER TABLE public.familia_servicio_interno ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS familia_servicio_interno_read ON public.familia_servicio_interno;
CREATE POLICY familia_servicio_interno_read ON public.familia_servicio_interno
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.clasificacion_servicio_interno (id, codigo, nombre, es_planificado, orden)
VALUES
  ('csi_preventivo', 'PREVENTIVO', 'Preventivo', true, 1),
  ('csi_predictivo', 'PREDICTIVO', 'Predictivo', true, 2),
  ('csi_correctivo', 'CORRECTIVO', 'Correctivo', false, 3),
  ('csi_emergencia', 'EMERGENCIA', 'Emergencia', false, 4),
  ('csi_inspeccion', 'INSPECCION', 'Inspección', true, 5),
  ('csi_proyecto', 'PROYECTO', 'Proyecto', true, 6),
  ('csi_garantia', 'GARANTIA', 'Garantía', null, 7),
  ('csi_interno', 'INTERNO', 'Interno', null, 8)
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO public.familia_servicio_interno (id, codigo, nombre, orden)
VALUES
  ('fsi_mecanico', 'MECANICO', 'Mecánico', 1),
  ('fsi_electrico', 'ELECTRICO', 'Eléctrico', 2),
  ('fsi_hidraulico', 'HIDRAULICO', 'Hidráulico', 3),
  ('fsi_neumatico', 'NEUMATICO', 'Neumático', 4),
  ('fsi_soldadura', 'SOLDADURA', 'Soldadura', 5),
  ('fsi_administrativo', 'ADMINISTRATIVO', 'Administrativo', 6)
ON CONFLICT (codigo) DO NOTHING;

ALTER TABLE public.tipos_servicio_interno
  ADD COLUMN IF NOT EXISTS clasificacion_id text REFERENCES public.clasificacion_servicio_interno(id),
  ADD COLUMN IF NOT EXISTS familia_id text REFERENCES public.familia_servicio_interno(id),
  ADD COLUMN IF NOT EXISTS especialidad_id text,
  ADD COLUMN IF NOT EXISTS tiempo_estimado_horas numeric,
  ADD COLUMN IF NOT EXISTS requiere_certificacion boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS nivel_riesgo text,
  ADD COLUMN IF NOT EXISTS requiere_permiso_especial boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS herramientas_requeridas text,
  ADD COLUMN IF NOT EXISTS requiere_repuestos boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS frecuencia_sugerida text,
  ADD COLUMN IF NOT EXISTS unidad_medida text,
  ADD COLUMN IF NOT EXISTS costo_estandar_hora numeric,
  ADD COLUMN IF NOT EXISTS orden_sugerido integer DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.especialidades_tecnicas'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) = 'UNIQUE (empresa_id, id)'
  ) THEN
    ALTER TABLE public.especialidades_tecnicas
      ADD CONSTRAINT especialidades_tecnicas_empresa_id_id_key UNIQUE (empresa_id, id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.tipos_servicio_interno'::regclass
      AND contype = 'f'
      AND pg_get_constraintdef(oid) = 'FOREIGN KEY (empresa_id, especialidad_id) REFERENCES especialidades_tecnicas(empresa_id, id) ON DELETE RESTRICT'
  ) THEN
    ALTER TABLE public.tipos_servicio_interno
      ADD CONSTRAINT fk_tipos_servicio_especialidad
      FOREIGN KEY (empresa_id, especialidad_id)
      REFERENCES public.especialidades_tecnicas (empresa_id, id)
      ON DELETE RESTRICT;
  END IF;
END $$;

UPDATE public.tipos_servicio_interno t
SET clasificacion_id = c.id
FROM public.clasificacion_servicio_interno c
WHERE t.empresa_id = 'emp_20541435833'
  AND upper(trim(t.clasificacion)) = c.codigo;

ALTER TABLE public.ordenes_trabajo
  ADD COLUMN IF NOT EXISTS tipo_servicio_interno_id text REFERENCES public.tipos_servicio_interno(id);
