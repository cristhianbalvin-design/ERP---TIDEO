-- Fecha efectiva de cierre, separada de fecha_fin (cierre estimado).
ALTER TABLE public.os_clientes
  ADD COLUMN fecha_cierre_real date;
