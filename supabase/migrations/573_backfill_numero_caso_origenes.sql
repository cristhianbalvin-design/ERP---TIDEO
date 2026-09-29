-- Copia numero_caso desde documentos padre ya numerados.
-- No genera casos nuevos y solo completa filas cuyo numero_caso es NULL.

update public.cotizaciones c
set numero_caso = r.numero_caso
from public.recepciones_activos_cliente r
where c.numero_caso is null
  and c.recepcion_id = r.id
  and c.empresa_id = r.empresa_id
  and r.numero_caso is not null;

update public.os_clientes o
set numero_caso = c.numero_caso
from public.cotizaciones c
where o.numero_caso is null
  and o.cotizacion_id = c.id
  and o.empresa_id = c.empresa_id
  and c.numero_caso is not null;

update public.os_clientes o
set numero_caso = c.numero_caso
from public.cotizaciones_especiales c
where o.numero_caso is null
  and o.cotizacion_especial_id = c.id
  and o.empresa_id = c.empresa_id
  and c.numero_caso is not null;

update public.ordenes_trabajo ot
set numero_caso = o.numero_caso
from public.os_clientes o
where ot.numero_caso is null
  and ot.os_cliente_id = o.id
  and ot.empresa_id = o.empresa_id
  and o.numero_caso is not null;
