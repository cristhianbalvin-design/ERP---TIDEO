-- 477 · Snapshot inmutable de condiciones comerciales por cotización.
-- Ejecutar con el rol propietario del esquema (SET ROLE postgres).

ALTER TABLE public.cotizaciones
  ADD COLUMN IF NOT EXISTS condiciones_snapshot jsonb;

UPDATE public.cotizaciones AS c
SET condiciones_snapshot = jsonb_build_array(
  jsonb_build_object('clave', 'cond_forma_pago', 'titulo', 'Forma de Pago y Datos Bancarios', 'contenido', COALESCE(NULLIF(c.cond_forma_pago, ''), e.cond_forma_pago, '')),
  jsonb_build_object('clave', 'cond_validez', 'titulo', 'Validez de la Oferta', 'contenido', COALESCE(NULLIF(c.cond_validez, ''), e.cond_validez, '')),
  jsonb_build_object('clave', 'cond_penalidad', 'titulo', 'Penalidad por Mora', 'contenido', COALESCE(NULLIF(c.cond_penalidad, ''), e.cond_penalidad, '')),
  jsonb_build_object('clave', 'cond_inicio_proyecto', 'titulo', 'Inicio del Proyecto', 'contenido', COALESCE(NULLIF(c.cond_inicio_proyecto, ''), e.cond_inicio_proyecto, '')),
  jsonb_build_object('clave', 'cond_alcance', 'titulo', 'Alcance y Exclusiones', 'contenido', COALESCE(NULLIF(c.cond_alcance, ''), e.cond_alcance, '')),
  jsonb_build_object('clave', 'cond_integraciones', 'titulo', 'Integraciones Externas', 'contenido', COALESCE(NULLIF(c.cond_integraciones, ''), e.cond_integraciones, '')),
  jsonb_build_object('clave', 'cond_confidencialidad', 'titulo', 'Confidencialidad', 'contenido', COALESCE(NULLIF(c.cond_confidencialidad, ''), e.cond_confidencialidad, ''))
)
FROM public.empresa_config AS e
WHERE e.empresa_id = c.empresa_id
  AND c.condiciones_snapshot IS NULL;

-- Protege las filas que no tienen una fila correspondiente en empresa_config.
UPDATE public.cotizaciones AS c
SET condiciones_snapshot = jsonb_build_array(
  jsonb_build_object('clave', 'cond_forma_pago', 'titulo', 'Forma de Pago y Datos Bancarios', 'contenido', COALESCE(NULLIF(c.cond_forma_pago, ''), '')),
  jsonb_build_object('clave', 'cond_validez', 'titulo', 'Validez de la Oferta', 'contenido', COALESCE(NULLIF(c.cond_validez, ''), '')),
  jsonb_build_object('clave', 'cond_penalidad', 'titulo', 'Penalidad por Mora', 'contenido', COALESCE(NULLIF(c.cond_penalidad, ''), '')),
  jsonb_build_object('clave', 'cond_inicio_proyecto', 'titulo', 'Inicio del Proyecto', 'contenido', COALESCE(NULLIF(c.cond_inicio_proyecto, ''), '')),
  jsonb_build_object('clave', 'cond_alcance', 'titulo', 'Alcance y Exclusiones', 'contenido', COALESCE(NULLIF(c.cond_alcance, ''), '')),
  jsonb_build_object('clave', 'cond_integraciones', 'titulo', 'Integraciones Externas', 'contenido', COALESCE(NULLIF(c.cond_integraciones, ''), '')),
  jsonb_build_object('clave', 'cond_confidencialidad', 'titulo', 'Confidencialidad', 'contenido', COALESCE(NULLIF(c.cond_confidencialidad, ''), ''))
)
WHERE c.condiciones_snapshot IS NULL;
