-- 525 · Permite vincular una OS Cliente a una Cotización Especial emitida.
-- La cotización especial conserva su estado emitido; la conversión se deriva
-- exclusivamente de la existencia de este vínculo.

alter table public.os_clientes
  add column if not exists cotizacion_especial_id uuid
    references public.cotizaciones_especiales(id) on delete restrict;

-- Una Cotización Especial emitida puede originar una única OS Cliente.
-- El índice parcial preserva todas las OS existentes sin cotización especial.
create unique index if not exists ux_os_clientes_cotizacion_especial
  on public.os_clientes(cotizacion_especial_id)
  where cotizacion_especial_id is not null;

select pg_notify('pgrst', 'reload schema');
