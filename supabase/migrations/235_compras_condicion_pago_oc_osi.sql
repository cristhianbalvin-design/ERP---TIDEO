-- Condicion comercial en ordenes de compra y servicio.
-- La UI ya envia este dato desde proveedores; formalizamos la columna para evitar
-- rechazos de PostgREST por schema cache / columnas inexistentes.

alter table public.ordenes_compra
  add column if not exists condicion_pago text;

alter table public.ordenes_servicio_interna
  add column if not exists condicion_pago text;

update public.ordenes_compra oc
set condicion_pago = coalesce(nullif(btrim(oc.condicion_pago), ''), nullif(btrim(p.condicion_pago), ''), 'Contado')
from public.proveedores p
where oc.proveedor_id = p.id
  and (oc.condicion_pago is null or btrim(oc.condicion_pago) = '');

update public.ordenes_servicio_interna osi
set condicion_pago = coalesce(nullif(btrim(osi.condicion_pago), ''), nullif(btrim(p.condicion_pago), ''), 'Contado')
from public.proveedores p
where osi.proveedor_id = p.id
  and (osi.condicion_pago is null or btrim(osi.condicion_pago) = '');

notify pgrst, 'reload schema';
