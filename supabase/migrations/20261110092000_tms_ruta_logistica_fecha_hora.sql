-- TMS · Hoja de Ruta combinada: la fecha programada es fecha y hora (timestamptz, hora de Lima).
-- transporte_ruta_logistica_guardar parte de la versión vigente (20261110090000) y guarda la salida
-- en fecha_programada; las rutas migradas pasan a su fecha a las 08:00 de Lima (o la hora que tenían).
create or replace function public.transporte_ruta_logistica_guardar(
  p_empresa_id text, p_viaje_id text, p_datos jsonb, p_paradas jsonb, p_programar boolean default false)
returns public.transporte_viajes
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v public.transporte_viajes%rowtype;
  v_ped public.transporte_pedidos_ruta%rowtype;
  v_item jsonb;
  v_ids text[] := '{}';
  v_id text;
  v_obs text;
  v_prev text := coalesce(current_setting('tms.rpc_logistica', true), '');
  v_vehiculo text := nullif(p_datos->>'vehiculo_id', '');
  v_conductor text := nullif(p_datos->>'conductor_id', '');
  v_transportista text := nullif(p_datos->>'transportista_id', '');
  v_tipo_unidad text;
  v_origen text := coalesce(nullif(trim(p_datos->>'origen_nombre'), ''), 'Base');
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_salida timestamptz := (coalesce(nullif(p_datos->>'fecha_programada', '')::date, v_hoy)::text || ' '
    || coalesce(nullif(p_datos->>'hora_salida', ''), '08:00'))::timestamp at time zone 'America/Lima';
  r record;
begin
  if not (public.transporte_puede_logistica(p_empresa_id, 'crear') or public.transporte_puede_logistica(p_empresa_id, 'editar')) then
    raise exception 'No tienes permiso para armar rutas.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_paradas) is distinct from 'array' or jsonb_array_length(p_paradas) = 0 then
    raise exception 'Agrega al menos una parada a la ruta.';
  end if;
  v_obs := public.transporte__validar_recursos_logistica(p_empresa_id, v_vehiculo, v_conductor);
  if v_transportista is not null and not exists (select 1 from public.transportistas where id = v_transportista and empresa_id = p_empresa_id) then
    v_transportista := null;
  end if;
  select coalesce(nullif(trim(tipo), ''), 'Unidad propia') into v_tipo_unidad from public.vehiculos_transporte where id = v_vehiculo;
  v_tipo_unidad := coalesce(v_tipo_unidad, 'Unidad propia');

  perform set_config('tms.rpc_logistica', 'si', true);
  if nullif(p_viaje_id, '') is null then
    perform set_config('tms.nota_creacion', 'Ruta de logística creada', true);
    insert into public.transporte_viajes (
      empresa_id, tipo_viaje, estado, origen_nombre, destino_nombre, tipo_unidad, modalidad, moneda,
      fecha_programada, vehiculo_id, conductor_id, transportista_id, observaciones)
    values (
      p_empresa_id, 'logistica', 'borrador', v_origen,
      coalesce(nullif(trim(p_datos->>'destino_nombre'), ''), v_origen), v_tipo_unidad, 'viaje', 'PEN',
      v_salida,
      v_vehiculo, v_conductor, v_transportista, nullif(trim(p_datos->>'observaciones'), ''))
    returning * into v;
    perform set_config('tms.nota_creacion', '', true);
  else
    select * into v from public.transporte_viajes where id = p_viaje_id and empresa_id = p_empresa_id for update;
    if not found then raise exception 'La ruta no existe.'; end if;
    if v.tipo_viaje <> 'logistica' then raise exception 'Aquí solo se editan rutas de logística propia.'; end if;
    if v.estado not in ('borrador','programado') then raise exception 'La ruta ya salió: agrega paradas con «Agregar a la ruta».'; end if;
    update public.transporte_viajes set
      origen_nombre = v_origen,
      destino_nombre = coalesce(nullif(trim(p_datos->>'destino_nombre'), ''), v_origen),
      tipo_unidad = v_tipo_unidad,
      fecha_programada = v_salida,
      vehiculo_id = v_vehiculo, conductor_id = v_conductor, transportista_id = v_transportista,
      observaciones = nullif(trim(p_datos->>'observaciones'), '')
    where id = v.id returning * into v;
  end if;

  for v_item in select value from jsonb_array_elements(p_paradas) loop
    if nullif(v_item->>'parada_id', '') is not null then
      if not exists (select 1 from public.transporte_viaje_paradas where id = v_item->>'parada_id' and viaje_id = v.id) then
        raise exception 'Una de las paradas no pertenece a esta ruta.';
      end if;
      v_ids := v_ids || (v_item->>'parada_id');
    elsif nullif(v_item->>'pedido_id', '') is not null then
      select * into v_ped from public.transporte_pedidos_ruta where id = v_item->>'pedido_id' and empresa_id = p_empresa_id for update;
      if not found then raise exception 'Uno de los pedidos ya no existe.'; end if;
      if v_ped.estado <> 'pendiente' then raise exception 'El pedido «%» ya está en otra ruta.', v_ped.titulo; end if;
      insert into public.transporte_viaje_paradas (
        viaje_id, empresa_id, secuencia, tipo, nombre, direccion, latitud, longitud, guia_remision_id,
        oc_transito_id, compra_gasto_id, documento_tipo, descripcion, pedido_id, ventana_inicio, ventana_fin)
      values (
        v.id, p_empresa_id, 900001 + coalesce(array_length(v_ids, 1), 0),
        case v_ped.accion when 'entregar' then 'entrega' else 'recojo' end,
        v_ped.lugar_nombre, v_ped.direccion, v_ped.latitud, v_ped.longitud, v_ped.guia_remision_id,
        v_ped.oc_transito_id, v_ped.compra_gasto_id, v_ped.documento_tipo,
        coalesce(v_ped.indicaciones, v_ped.titulo), v_ped.id, v_ped.ventana_inicio, v_ped.ventana_fin)
      returning id into v_id;
      update public.transporte_pedidos_ruta set estado = 'asignado', viaje_id = v.id, parada_id = v_id, updated_at = now() where id = v_ped.id;
      v_ids := v_ids || v_id;
    else
      if nullif(trim(v_item->>'nombre'), '') is null then raise exception 'Cada parada libre necesita un nombre.'; end if;
      insert into public.transporte_viaje_paradas (
        viaje_id, empresa_id, secuencia, tipo, nombre, direccion, latitud, longitud, documento_tipo, descripcion)
      values (
        v.id, p_empresa_id, 900001 + coalesce(array_length(v_ids, 1), 0),
        case v_item->>'accion' when 'recoger' then 'recojo' else 'entrega' end,
        trim(v_item->>'nombre'), nullif(trim(v_item->>'direccion'), ''),
        nullif(v_item->>'latitud', '')::numeric, nullif(v_item->>'longitud', '')::numeric,
        'libre', nullif(trim(v_item->>'descripcion'), ''))
      returning id into v_id;
      v_ids := v_ids || v_id;
    end if;
  end loop;

  for r in select * from public.transporte_viaje_paradas where viaje_id = v.id and not (id = any (v_ids)) loop
    if r.estado <> 'pendiente' or r.llegada_at is not null then
      raise exception 'No se puede quitar la parada «%»: ya fue atendida.', r.nombre;
    end if;
    update public.transporte_pedidos_ruta set estado = 'pendiente', viaje_id = null, parada_id = null, updated_at = now() where parada_id = r.id;
    delete from public.transporte_viaje_paradas where id = r.id;
  end loop;
  perform public.transporte__renumerar_paradas(v.id, v_ids);

  if p_programar and v.estado = 'borrador' then
    if v.vehiculo_id is null or v.conductor_id is null then
      raise exception 'Asigna unidad y conductor para programar la ruta.';
    end if;
    v := public.transporte_viaje_cambiar_estado(v.id, 'programado', 'Ruta programada');
  end if;
  if v_obs is not null then perform public.transporte__nota(v, 'Observación: ' || v_obs); end if;
  perform set_config('tms.rpc_logistica', v_prev, true);
  select * into v from public.transporte_viajes where id = v.id;
  return v;
end;
$function$;

-- Rutas migradas: la fecha (date) quedó a medianoche UTC; se pasa a la fecha local con su hora de salida.
do $$
declare n integer;
begin
  perform set_config('tms.rpc_logistica', 'si', true);
  update public.transporte_viajes v
     set fecha_programada = ((r.fecha::text || ' ' || coalesce(to_char(r.hora_salida at time zone 'America/Lima', 'HH24:MI'), '08:00'))::timestamp
                             at time zone 'America/Lima'),
         hora_salida = null
    from public.rutas r
   where r.id = v.legacy_ruta_id and v.legacy_ruta_id is not null;
  get diagnostics n = row_count;
  perform set_config('tms.rpc_logistica', '', true);
  if n <> (select count(*) from public.rutas) then raise exception 'Fechas de rutas migradas: se esperaban %, se actualizaron %.', (select count(*) from public.rutas), n; end if;
  if exists (select 1 from public.transporte_viajes v join public.rutas r on r.id = v.legacy_ruta_id
             where (v.fecha_programada at time zone 'America/Lima')::date <> r.fecha) then
    raise exception 'Una ruta migrada quedó en otra fecha.';
  end if;
end $$;
