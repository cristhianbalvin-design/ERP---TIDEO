-- Catálogo estándar por empresa para la unidad de los ítems de cotización.
-- No modifica el valor de unidad de ningún ítem ya persistido.
INSERT INTO public.monedas_impuestos_unidades
  (id, empresa_id, tipo, codigo, nombre, detalle, estado)
SELECT
  'miu_unidad_' || e.id || '_' || v.codigo,
  e.id,
  'unidad',
  v.codigo,
  v.nombre,
  'Unidad de medida para ítems de cotización',
  'activo'
FROM public.empresas e
CROSS JOIN (VALUES
  ('UND', 'Unidad'),
  ('HH', 'Hora-hombre'),
  ('HORA', 'Hora'),
  ('MET', 'Metro'),
  ('GAL', 'Galón'),
  ('CND', 'Ciento'),
  ('PAR', 'Par'),
  ('ROL', 'Rollo'),
  ('DIA', 'Día'),
  ('MES', 'Mes'),
  ('KM', 'Kilómetro'),
  ('KG', 'Kilogramo'),
  ('M', 'Metro'),
  ('M2', 'Metro cuadrado'),
  ('M3', 'Metro cúbico'),
  ('GLB', 'Global'),
  ('L', 'Litro'),
  ('TON', 'Tonelada'),
  ('CAJ', 'Caja'),
  ('PQT', 'Paquete'),
  ('JGO', 'Juego')
) AS v(codigo, nombre)
ON CONFLICT (empresa_id, tipo, codigo) DO NOTHING;
