-- Reserva automática de repuestos al programar una OT.
-- Alcance deliberado: idempotencia dentro del flujo de OT. No modifica
-- generar_solpes_reorden() ni serializa contra su cron; esa carrera cruzada
-- permanece como deuda técnica documentada.

begin;

-- Una línea puede quedar parcialmente reservada y con el saldo solicitado a
-- compras. El detalle por almacén vive en la tabla de trazabilidad siguiente.
alter table public.ot_segmento_repuestos
  drop constraint if exists ot_segmento_repuestos_estado_check,
  add constraint ot_segmento_repuestos_estado_check
    check (estado in (
      'estimado',
      'reservado',
      'reservado_parcial_solpe',
      'consumido',
      'anulado'
    ));

create table if not exists public.ot_segmento_repuestos_reservas (
  id text primary key default ('otrsv_' || replace(gen_random_uuid()::text, '-', '')),
  empresa_id text not null references public.empresas(id) on delete cascade,
  sociedad_id uuid references public.sociedades(id) on delete set null,
  ot_id text not null references public.ordenes_trabajo(id) on delete cascade,
  ot_segmento_repuesto_id text not null references public.ot_segmento_repuestos(id) on delete cascade,
  material_id text not null references public.materiales(id),
  stock_id uuid not null references public.stock(id),
  almacen_id text not null references public.almacenes(id),
  cantidad_reservada numeric(14,2) not null check (cantidad_reservada > 0),
  created_at timestamptz not null default now(),
  constraint ot_segmento_repuestos_reservas_unica unique (ot_segmento_repuesto_id, stock_id),
  constraint ot_segmento_repuestos_reservas_empresa_sociedad_fkey
    foreign key (empresa_id, sociedad_id)
    references public.sociedades(empresa_id, id)
);

create index if not exists idx_ot_segmento_repuestos_reservas_ot
  on public.ot_segmento_repuestos_reservas (ot_id, ot_segmento_repuesto_id);

alter table public.ot_segmento_repuestos_reservas enable row level security;

drop policy if exists ops_ot_segmento_repuestos_reservas_select
  on public.ot_segmento_repuestos_reservas;
create policy ops_ot_segmento_repuestos_reservas_select
  on public.ot_segmento_repuestos_reservas
  for select to authenticated
  using (
    public.usuario_tiene_empresa(empresa_id)
    and public.usuario_puede(empresa_id, 'ot', 'ver')
    and (
      public.usuario_alcance_sociedades(empresa_id) is null
      or sociedad_id = any(public.usuario_alcance_sociedades(empresa_id))
    )
  );

create or replace function public.procesar_reserva_repuestos_ot(p_ot_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ot public.ordenes_trabajo%rowtype;
  v_repuesto public.ot_segmento_repuestos%rowtype;
  v_stock record;
  v_pendiente numeric(14,2);
  v_reservado numeric(14,2);
  v_a_reservar numeric(14,2);
  v_faltante numeric(14,2);
  v_almacen_principal text;
  v_solpe_id text;
  v_solpe_codigo text;
begin
  -- El lock de la OT serializa invocaciones concurrentes de esta función para
  -- la misma OT. Las filas no estimadas quedan fuera, haciendo el reintento
  -- idempotente sin volver a reservar ni generar SOLPE.
  select *
    into v_ot
    from public.ordenes_trabajo
   where id = p_ot_id
   for update;

  if not found then
    raise exception 'La OT % no existe.', p_ot_id;
  end if;

  if v_ot.estado is distinct from 'programada' then
    return;
  end if;

  if auth.uid() is not null
     and (
       not public.usuario_tiene_empresa(v_ot.empresa_id)
       or not public.usuario_puede(v_ot.empresa_id, 'ot', 'editar')
     ) then
    raise exception 'No tienes permiso para procesar la reserva de repuestos de esta OT.';
  end if;

  for v_repuesto in
    select *
      from public.ot_segmento_repuestos
     where ot_id = p_ot_id
       and estado = 'estimado'
     order by material_id, id
     for update
  loop
    v_pendiente := v_repuesto.cantidad_estimada;
    v_reservado := 0;
    v_almacen_principal := null;

    -- La disponibilidad visible en el buscador de OT es la suma por material.
    -- Para conservar ese criterio, se reserva de tantas existencias genéricas
    -- como sean necesarias, priorizando mayor disponible. Cada fuente queda
    -- trazada; almacen_id de la línea conserva el almacén principal.
    for v_stock in
      select s.id, s.almacen_id, coalesce(s.disponible, 0) as disponible
        from public.stock s
       where s.empresa_id = v_repuesto.empresa_id
         and s.material_id = v_repuesto.material_id
         and s.sociedad_id is not distinct from v_repuesto.sociedad_id
         and s.lote is null
         and s.serie is null
         and coalesce(s.disponible, 0) > 0
       order by coalesce(s.disponible, 0) desc, s.id
       for update
    loop
      exit when v_pendiente <= 0;

      v_a_reservar := least(v_pendiente, v_stock.disponible);
      if v_a_reservar <= 0 then
        continue;
      end if;

      update public.stock
         set disponible = coalesce(disponible, 0) - v_a_reservar,
             reservado = coalesce(reservado, 0) + v_a_reservar,
             updated_at = now()
       where id = v_stock.id;

      insert into public.ot_segmento_repuestos_reservas (
        empresa_id, sociedad_id, ot_id, ot_segmento_repuesto_id,
        material_id, stock_id, almacen_id, cantidad_reservada
      ) values (
        v_repuesto.empresa_id, v_repuesto.sociedad_id, p_ot_id, v_repuesto.id,
        v_repuesto.material_id, v_stock.id, v_stock.almacen_id, v_a_reservar
      );

      if v_almacen_principal is null then
        v_almacen_principal := v_stock.almacen_id;
      end if;

      v_reservado := v_reservado + v_a_reservar;
      v_pendiente := v_pendiente - v_a_reservar;
    end loop;

    v_faltante := greatest(v_repuesto.cantidad_estimada - v_reservado, 0);
    v_solpe_id := null;

    if v_faltante > 0 then
      v_solpe_codigo := 'SLP-OT-' || to_char(now(), 'YYYYMMDD') || '-'
        || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

      -- La comprobación e inserción ocurren en una única sentencia. El lock de
      -- la OT hace que dos reintentos de este flujo no puedan duplicar SOLPEs.
      -- Se considera oc_generada como solicitud activa para esta OT/material.
      with existente as (
        select si.id
          from public.solpe_interna si
         where si.empresa_id = v_repuesto.empresa_id
           and si.ot_id = p_ot_id
           and si.material_id = v_repuesto.material_id
           and si.estado in ('borrador', 'solicitada', 'aprobada', 'oc_generada')
         order by si.created_at, si.id
         limit 1
         for update
      ), insertada as (
        insert into public.solpe_interna (
          id, empresa_id, codigo, descripcion, tipo, prioridad, urgencia,
          estado, origen, origen_tipo, origen_id, material_id,
          cantidad_solicitada, disponible_actual, fecha, items, ot_id
        )
        select
          'slp_ot_' || replace(gen_random_uuid()::text, '-', ''),
          v_repuesto.empresa_id,
          v_solpe_codigo,
          'Faltante de repuesto para OT ' || coalesce(v_ot.numero, p_ot_id),
          'bien',
          'alta',
          'alta',
          'solicitada',
          'ot',
          'ot',
          v_repuesto.id,
          v_repuesto.material_id,
          v_faltante,
          v_reservado,
          current_date,
          jsonb_build_array(jsonb_build_object(
            'material_id', v_repuesto.material_id,
            'cantidad', v_faltante,
            'ot_segmento_repuesto_id', v_repuesto.id,
            'cantidad_estimada', v_repuesto.cantidad_estimada,
            'cantidad_reservada', v_reservado
          )),
          p_ot_id
        where not exists (select 1 from existente)
        returning id
      )
      select coalesce(
        (select id from insertada),
        (select id from existente)
      ) into v_solpe_id;

      if v_solpe_id is null then
        raise exception 'No se pudo obtener ni crear la SOLPE para OT %, material %.',
          p_ot_id, v_repuesto.material_id;
      end if;
    end if;

    update public.ot_segmento_repuestos
       set almacen_id = v_almacen_principal,
           solpe_id = v_solpe_id,
           estado = case
             when v_faltante > 0 then 'reservado_parcial_solpe'
             else 'reservado'
           end,
           updated_at = now()
     where id = v_repuesto.id;
  end loop;
end;
$$;

comment on function public.procesar_reserva_repuestos_ot(text) is
'Reserva existencias genéricas de repuestos estimados de una OT programada y crea SOLPE por faltante. Es idempotente dentro de la OT; no serializa contra generar_solpes_reorden().';

revoke all on function public.procesar_reserva_repuestos_ot(text) from public;
grant execute on function public.procesar_reserva_repuestos_ot(text) to authenticated;
grant execute on function public.procesar_reserva_repuestos_ot(text) to service_role;

create or replace function public.trg_procesar_reserva_repuestos_ot_programada()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado = 'programada'
     and (tg_op = 'INSERT' or old.estado is distinct from 'programada') then
    perform public.procesar_reserva_repuestos_ot(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ordenes_trabajo_reserva_repuestos_programada
  on public.ordenes_trabajo;
create trigger trg_ordenes_trabajo_reserva_repuestos_programada
  after insert or update of estado on public.ordenes_trabajo
  for each row
  execute function public.trg_procesar_reserva_repuestos_ot_programada();

-- La creación Operaciones inserta primero la OT programada y después sus
-- repuestos. Este trigger por sentencia cubre ese orden sin requerir cambios
-- de aplicación y procesa todas las líneas del insert en la misma transacción.
create or replace function public.trg_procesar_reserva_repuestos_insertados()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ot_id text;
begin
  for v_ot_id in
    select distinct nr.ot_id
      from new_repuestos nr
      join public.ordenes_trabajo ot on ot.id = nr.ot_id
     where ot.estado = 'programada'
     order by nr.ot_id
  loop
    perform public.procesar_reserva_repuestos_ot(v_ot_id);
  end loop;
  return null;
end;
$$;

drop trigger if exists trg_ot_segmento_repuestos_reserva_insert
  on public.ot_segmento_repuestos;
create trigger trg_ot_segmento_repuestos_reserva_insert
  after insert on public.ot_segmento_repuestos
  referencing new table as new_repuestos
  for each statement
  execute function public.trg_procesar_reserva_repuestos_insertados();

select pg_notify('pgrst', 'reload schema');

commit;
