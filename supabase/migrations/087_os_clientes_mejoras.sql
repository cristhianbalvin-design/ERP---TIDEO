-- 087 — OS Clientes: campos extendidos + vinculación múltiple de cotizaciones

alter table public.os_clientes
  add column if not exists nombre               text,
  add column if not exists responsable_comercial text,
  add column if not exists observaciones        text,
  add column if not exists hitos_facturacion    jsonb default '[]'::jsonb,
  add column if not exists contacto_id          text;

-- Vinculación múltiple: una OS puede tener varias cotizaciones aprobadas
alter table public.cotizaciones
  add column if not exists os_cliente_id text references public.os_clientes(id) on delete set null;

-- Backfill: cotizaciones que ya generaron una OS quedan vinculadas
update public.cotizaciones c
  set os_cliente_id = os.id
  from public.os_clientes os
  where os.cotizacion_id = c.id
    and c.os_cliente_id is null;

-- Backfill: OS sin nombre usan su número como nombre temporal
update public.os_clientes
  set nombre = numero
  where nombre is null;

select pg_notify('pgrst', 'reload schema');
