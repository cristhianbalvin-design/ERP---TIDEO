-- OF · Anular y reserva al recibir (pendientes de F3c).
-- 1. Anular OF (permiso of:anular, desde Borrador hasta En producción) con motivo obligatorio.
-- 2. Al anular o cerrar una OF se liberan las reservas de su pedido de producción y el pedido sale de la
--    cola de Despachos (estado anulada). Lo ya despachado queda en el kárdex; las SOLPE no se tocan.
-- 3. Al recibir una compra (entrada de kárdex con OC o recepción), los pedidos de producción del mismo
--    almacén con ese material pendiente se reservan solos. Corre al confirmar la transacción (cuando el
--    stock ya está actualizado) y nunca bloquea la recepción.
-- 4. of_catalogo_avance informa puede_anular (parte de la definición vigente).

alter table public.ordenes_fabricacion
  add column if not exists motivo_anulacion text,
  add column if not exists anulada_por uuid,
  add column if not exists anulada_en timestamptz;

create or replace function public.of_anular(p_of_id uuid, p_motivo text)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v public.ordenes_fabricacion%rowtype;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  v := public.of_exigir_edicion(p_of_id, array['borrador', 'en_ingenieria', 'aprobada', 'en_produccion'], 'anular');
  if v_motivo is null or length(v_motivo) < 5 then
    raise exception 'Indica el motivo de la anulación (al menos 5 caracteres).';
  end if;
  update public.ordenes_fabricacion
     set estado = 'anulada', motivo_anulacion = v_motivo, anulada_por = auth.uid(), anulada_en = now()
   where id = v.id;
  return jsonb_build_object('id', v.id, 'estado', 'anulada');
end;
$$;

create or replace function public.trg_of_liberar_reservas()
returns trigger
language plpgsql security definer
set search_path to 'public'
as $$
declare d record;
begin
  if new.estado in ('anulada', 'cerrada') and old.estado is distinct from new.estado then
    for d in select id from public.wms_demandas
              where empresa_id = new.empresa_id and canal = 'produccion' and origen_tipo = 'orden_fabricacion'
                and origen_id = new.id::text and estado not in ('despachada', 'anulada')
              for update loop
      perform public.wms_liberar_demanda_interno(d.id);
      update public.wms_demandas set estado = 'anulada', updated_at = now(),
             observacion = coalesce(observacion || ' · ', '') || case when new.estado = 'anulada' then 'OF anulada' else 'OF cerrada' end
       where id = d.id;
    end loop;
  end if;
  return new;
end;
$$;

create trigger trg_of_liberar_reservas
  after update of estado on public.ordenes_fabricacion
  for each row execute function public.trg_of_liberar_reservas();

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
                and dm.estado in ('pendiente', 'reservada', 'parcial') and l.material_id = new.material_id
                and l.cantidad - l.cantidad_reservada - l.cantidad_despachada > 0
              order by dm.fecha_requerida nulls last, dm.created_at loop
      begin
        perform public.wms_reservar_demanda(d.id);
      exception when others then
        raise warning 'No se pudo reservar el pedido % al recibir %: %', d.id, new.material_id, sqlerrm;
      end;
    end loop;
  end if;
  return null;
end;
$$;

create constraint trigger trg_kardex_reservar_of
  after insert on public.kardex
  deferrable initially deferred
  for each row execute function public.trg_kardex_reservar_of();

-- of_catalogo_avance: agrega puede_anular sobre la definición vigente.
do $mig$
declare d text;
begin
  d := pg_get_functiondef('public.of_catalogo_avance(uuid)'::regprocedure);
  if position($a$'puede_revisar', public.usuario_puede(v.empresa_id, 'of', 'aprobar'),$a$ in d) = 0 then
    raise exception 'of_catalogo_avance no coincide con la versión esperada';
  end if;
  execute replace(d, $a$'puede_revisar', public.usuario_puede(v.empresa_id, 'of', 'aprobar'),$a$,
                     $a$'puede_revisar', public.usuario_puede(v.empresa_id, 'of', 'aprobar'),
    'puede_anular', public.usuario_puede(v.empresa_id, 'of', 'anular'),$a$);
end $mig$;

revoke all on function public.of_anular(uuid, text) from public, anon;
grant execute on function public.of_anular(uuid, text) to authenticated;
revoke all on function public.trg_of_liberar_reservas() from public, anon, authenticated;
revoke all on function public.trg_kardex_reservar_of() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_of_liberar_reservas')
     or not exists (select 1 from pg_trigger where tgname = 'trg_kardex_reservar_of' and tgdeferrable and tginitdeferred) then
    raise exception 'faltan disparadores';
  end if;
  if position('puede_anular' in pg_get_functiondef('public.of_catalogo_avance(uuid)'::regprocedure)) = 0 then
    raise exception 'of_catalogo_avance sin puede_anular';
  end if;
end $$;
