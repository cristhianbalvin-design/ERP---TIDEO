-- Revisión de errores sobre trg_kardex_reservar_of (20261115100000):
-- 1. Bloquea el pedido y vuelve a comprobar su estado antes de reservar: una OF anulada en paralelo
--    no recibe reservas (antes podía quedar stock reservado para un pedido anulado).
-- 2. Solo actúa sobre pedidos de la misma sociedad que la entrada recibida.
create or replace function public.trg_kardex_reservar_of()
returns trigger
language plpgsql security definer
set search_path to 'public'
as $$
declare d record;
begin
  if new.tipo in ('entrada', 'transferencia_entrada')
     and (new.recepcion_id is not null or new.orden_compra_id is not null or new.referencia_tipo = 'recepcion') then
    for d in select distinct dm.id, dm.fecha_requerida, dm.created_at
               from public.wms_demandas dm
               join public.wms_demanda_lineas l on l.demanda_id = dm.id
              where dm.empresa_id = new.empresa_id and dm.canal = 'produccion' and dm.almacen_id = new.almacen_id
                and dm.sociedad_id is not distinct from new.sociedad_id
                and dm.estado in ('pendiente', 'reservada', 'parcial') and l.material_id = new.material_id
                and l.cantidad - l.cantidad_reservada - l.cantidad_despachada > 0
              order by dm.fecha_requerida nulls last, dm.created_at loop
      begin
        perform 1 from public.wms_demandas
         where id = d.id and estado in ('pendiente', 'reservada', 'parcial')
         for update;
        if found then
          perform public.wms_reservar_demanda(d.id);
        end if;
      exception when others then
        raise warning 'No se pudo reservar el pedido % al recibir %: %', d.id, new.material_id, sqlerrm;
      end;
    end loop;
  end if;
  return null;
end;
$$;

revoke all on function public.trg_kardex_reservar_of() from public, anon, authenticated;

do $$
begin
  if position('for update' in pg_get_functiondef('public.trg_kardex_reservar_of()'::regprocedure)) = 0
     or position('sociedad_id is not distinct from new.sociedad_id' in pg_get_functiondef('public.trg_kardex_reservar_of()'::regprocedure)) = 0 then
    raise exception 'trg_kardex_reservar_of no quedó actualizado';
  end if;
end $$;
