-- Estado de seguimiento de taller/producción independiente del estado comercial.
ALTER TABLE public.os_clientes
  ADD COLUMN estado_produccion text;

ALTER TABLE public.os_clientes
  ADD CONSTRAINT os_clientes_estado_produccion_chk
  CHECK (
    estado_produccion IS NULL
    OR estado_produccion IN (
      'Evaluación',
      'Cotización',
      'Stand By',
      'Proceso',
      'Terminado',
      'No Procede',
      'Devolución',
      'Entregado',
      'Negociación'
    )
  );
