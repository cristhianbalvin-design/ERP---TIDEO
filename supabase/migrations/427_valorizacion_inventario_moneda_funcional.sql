-- Valorización de inventario en moneda funcional (PEN).
-- Para entradas USD, kardex conserva el importe original y la trazabilidad de
-- la tasa; costo_unitario y materiales.costo_promedio permanecen en PEN.

alter table public.kardex
  add column if not exists tipo_cambio_aplicado numeric(18,8),
  add column if not exists fecha_tipo_cambio date,
  add column if not exists fuente_tipo_cambio text;

comment on column public.kardex.tipo_cambio_aplicado is
  'PEN por unidad de moneda original aplicado a la valorización del movimiento.';
comment on column public.kardex.fecha_tipo_cambio is
  'Fecha efectiva de la tasa de cambio aplicada al movimiento.';
comment on column public.kardex.fuente_tipo_cambio is
  'Fuente de la tasa de cambio aplicada al movimiento.';

create or replace function public.registrar_movimiento_atomico(
  p_kardex_id text,
  p_empresa_id text,
  p_material_id text,
  p_almacen_id text,
  p_sociedad_id uuid default null,
  p_tipo text default 'entrada',
  p_motivo text default null,
  p_cantidad numeric default 0,
  p_costo_unitario numeric default 0,
  p_costo_unitario_usd numeric default 0,
  p_moneda text default 'PEN',
  p_lote text default null,
  p_serie text default null,
  p_vencimiento date default null,
  p_referencia_tipo text default null,
  p_referencia_id text default null,
  p_nro_documento text default null,
  p_proveedor_id text default null,
  p_observacion text default null,
  p_usuario_id uuid default null,
  p_valorizacion_estado text default null,
  p_orden_compra_id text default null,
  p_orden_compra_item_idx integer default null,
  p_precio_unitario_provisional numeric default null,
  p_precio_unitario_real numeric default null,
  p_recepcion_id text default null,
  p_skip_costo_promedio boolean default false
)
returns table (
  kardex_id text,
  saldo numeric,
  disponible numeric,
  costo_promedio numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock public.stock%rowtype;
  v_stock_fisico numeric := 0;
  v_stock_disponible numeric := 0;
  v_stock_reservado numeric := 0;
  v_costo_actual numeric := 0;
  v_costo_unitario numeric := coalesce(p_costo_unitario, 0);
  v_costo_unitario_usd numeric := coalesce(p_costo_unitario_usd, 0);
  v_nuevo_costo_promedio numeric := coalesce(p_costo_unitario, 0);
  v_nuevo_fisico numeric := 0;
  v_nuevo_disponible numeric := 0;
  v_moneda text := upper(coalesce(nullif(btrim(p_moneda), ''), 'PEN'));
  v_tc_usd numeric;
  v_tipo_cambio_aplicado numeric;
  v_fecha_tipo_cambio date;
  v_fuente_tipo_cambio text;
  v_es_salida boolean := p_tipo in ('salida', 'transferencia_salida');
  v_es_entrada boolean := p_tipo in ('entrada', 'transferencia_entrada');
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tienes acceso a la empresa indicada.';
  end if;
  if p_kardex_id is null or btrim(p_kardex_id) = ''
     or p_material_id is null or btrim(p_material_id) = ''
     or p_almacen_id is null or btrim(p_almacen_id) = ''
     or p_cantidad is null or p_cantidad <= 0 then
    raise exception 'Faltan datos obligatorios: empresa, material, almacén y cantidad > 0';
  end if;

  -- PEN es la moneda funcional. Para una entrada USD, la tasa se busca por
  -- fecha física del kardex (current_date): primero exacta y, si no existe,
  -- la última anterior. No se usa una tasa futura ni se inventa una tasa.
  if not p_skip_costo_promedio and v_es_entrada and v_moneda <> 'PEN' then
    if v_moneda <> 'USD' then
      raise exception 'Moneda % no soportada para valorización de inventario. Usa PEN o USD.', v_moneda;
    end if;

    select fecha, usd, fuente
      into v_fecha_tipo_cambio, v_tc_usd, v_fuente_tipo_cambio
      from public.tipo_cambio_historico
     where moneda_base = 'PEN'
       and fecha <= current_date
     order by fecha desc
     limit 1;

    if not found or v_tc_usd is null or v_tc_usd <= 0 then
      raise exception 'No existe tipo de cambio PEN/USD para la fecha del movimiento ni una tasa anterior. Registra el tipo de cambio antes de continuar.';
    end if;

    -- tipo_cambio_aplicado queda expresado como PEN por USD, que es el factor
    -- multiplicador usado para llevar el importe original al costo funcional.
    v_tipo_cambio_aplicado := 1 / v_tc_usd;
    v_costo_unitario_usd := coalesce(nullif(p_costo_unitario_usd, 0), p_costo_unitario, 0);
    v_costo_unitario := v_costo_unitario_usd * v_tipo_cambio_aplicado;
  end if;

  -- La primera consulta toma un lock de fila. Si aún no hay stock, se crea
  -- usando la clave única de la combinación y luego se toma el mismo lock.
  select * into v_stock
    from public.stock
   where empresa_id = p_empresa_id
     and material_id = p_material_id
     and almacen_id = p_almacen_id
     and lote is not distinct from p_lote
     and serie is not distinct from p_serie
     and sociedad_id is not distinct from p_sociedad_id
   for update;

  if not found then
    insert into public.stock (
      empresa_id, material_id, almacen_id, sociedad_id,
      fisico, disponible, reservado, lote, serie, vencimiento
    ) values (
      p_empresa_id, p_material_id, p_almacen_id, p_sociedad_id,
      0, 0, 0, p_lote, p_serie, p_vencimiento
    ) on conflict do nothing;

    select * into v_stock
      from public.stock
     where empresa_id = p_empresa_id
       and material_id = p_material_id
       and almacen_id = p_almacen_id
       and lote is not distinct from p_lote
       and serie is not distinct from p_serie
       and sociedad_id is not distinct from p_sociedad_id
     for update;

    if not found then
      raise exception 'No se pudo bloquear el stock del material.';
    end if;
  end if;

  v_stock_fisico := coalesce(v_stock.fisico, v_stock.disponible, 0);
  v_stock_disponible := coalesce(v_stock.disponible, 0);
  v_stock_reservado := coalesce(v_stock.reservado, 0);

  -- La disponibilidad se verifica una vez adquirido el lock de la existencia.
  if v_es_salida and p_cantidad > v_stock_disponible then
    raise exception 'Stock insuficiente. Disponible: %, solicitado: %', v_stock_disponible, p_cantidad;
  end if;

  -- El costo promedio es global al material, por lo que esta fila también se
  -- serializa para entradas concurrentes en distintos almacenes.
  select coalesce(m.costo_promedio, 0) into v_costo_actual
    from public.materiales m
   where m.id = p_material_id
     and m.empresa_id = p_empresa_id
   for update;
  if not found then
    raise exception 'Material inexistente o fuera de la empresa.';
  end if;

  if not p_skip_costo_promedio then
    if v_es_entrada then
      if p_cantidad > 0 then
        v_nuevo_costo_promedio := (
          (v_stock_fisico * v_costo_actual) + (p_cantidad * v_costo_unitario)
        ) / (v_stock_fisico + p_cantidad);
      else
        v_nuevo_costo_promedio := 0;
      end if;
    else
      v_nuevo_costo_promedio := v_costo_actual;
      v_costo_unitario := v_costo_actual;
    end if;
  end if;

  if v_es_entrada then
    v_nuevo_fisico := v_stock_fisico + p_cantidad;
    v_nuevo_disponible := v_stock_disponible + p_cantidad;
  elsif v_es_salida then
    v_nuevo_fisico := greatest(0, v_stock_fisico - p_cantidad);
    v_nuevo_disponible := greatest(0, v_stock_disponible - p_cantidad);
  else
    -- Conserva la semántica histórica de ajustes del motor.
    v_nuevo_fisico := greatest(0, v_stock_fisico + p_cantidad);
    v_nuevo_disponible := greatest(0, v_stock_disponible + p_cantidad);
  end if;

  insert into public.kardex (
    id, empresa_id, material_id, almacen_id, sociedad_id, tipo, motivo,
    cantidad, costo_unitario, costo_total, costo_unitario_usd, costo_total_usd,
    moneda, tipo_cambio_aplicado, fecha_tipo_cambio, fuente_tipo_cambio,
    lote, serie, vencimiento, saldo_cantidad, referencia_tipo,
    referencia_id, nro_documento, proveedor_id, observacion, created_by,
    anulado, valorizacion_estado, orden_compra_id, orden_compra_item_idx,
    precio_unitario_provisional, precio_unitario_real, recepcion_id
  ) values (
    p_kardex_id, p_empresa_id, p_material_id, p_almacen_id, p_sociedad_id,
    p_tipo, coalesce(p_motivo, p_tipo), p_cantidad, v_costo_unitario,
    v_costo_unitario * p_cantidad, v_costo_unitario_usd,
    v_costo_unitario_usd * p_cantidad, v_moneda,
    v_tipo_cambio_aplicado, v_fecha_tipo_cambio, v_fuente_tipo_cambio,
    p_lote, p_serie, p_vencimiento, v_nuevo_fisico, p_referencia_tipo,
    p_referencia_id, p_nro_documento, p_proveedor_id, p_observacion,
    p_usuario_id, false, coalesce(nullif(p_valorizacion_estado, ''), 'definitivo'),
    p_orden_compra_id, p_orden_compra_item_idx, p_precio_unitario_provisional,
    p_precio_unitario_real, p_recepcion_id
  );

  update public.stock
     set fisico = v_nuevo_fisico,
         disponible = v_nuevo_disponible,
         reservado = v_stock_reservado,
         updated_at = now()
   where id = v_stock.id;

  if not p_skip_costo_promedio and v_es_entrada then
    update public.materiales
       set costo_promedio = v_nuevo_costo_promedio,
           updated_at = now()
     where id = p_material_id;
  end if;

  return query
  select p_kardex_id, v_nuevo_fisico, v_nuevo_disponible, v_nuevo_costo_promedio;
end;
$$;

revoke all on function public.registrar_movimiento_atomico(
  text, text, text, text, uuid, text, text, numeric, numeric, numeric, text,
  text, text, date, text, text, text, text, text, uuid, text, text, integer,
  numeric, numeric, text, boolean
) from public, anon;
grant execute on function public.registrar_movimiento_atomico(
  text, text, text, text, uuid, text, text, numeric, numeric, numeric, text,
  text, text, date, text, text, text, text, text, uuid, text, text, integer,
  numeric, numeric, text, boolean
) to authenticated, service_role;

select pg_notify('pgrst', 'reload schema');
