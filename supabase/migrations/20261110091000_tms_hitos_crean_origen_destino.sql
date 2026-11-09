-- TMS · Hoja de Ruta combinada: los hitos de carga y destino crean la parada de origen o destino
-- cuando el viaje comercial no la tiene (viajes creados sin paradas). Parte de la versión vigente
-- de transporte_viaje_hito_registrar (20261110090000_tms_hoja_ruta_combinada.sql).
create or replace function public.transporte_viaje_hito_registrar(p_viaje_id text, p_hito text, p_datos jsonb default '{}'::jsonb)
returns public.transporte_viaje_hitos
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v public.transporte_viajes%rowtype;
  v_row public.transporte_viaje_hitos%rowtype;
  v_previo text;
  v_lat numeric := nullif(p_datos->>'latitud', '')::numeric;
  v_lng numeric := nullif(p_datos->>'longitud', '')::numeric;
  v_id text;
  v_seq integer;
begin
  v := public.transporte__viaje_operable(p_viaje_id);
  if v.tipo_viaje <> 'comercial' then raise exception 'Los hitos son del servicio comercial.'; end if;
  if v.estado not in ('en_ruta','con_incidente') then raise exception 'El viaje no está en ruta.'; end if;
  v_previo := case p_hito
    when 'llegada_carga' then 'salida_base' when 'fin_carga' then 'llegada_carga'
    when 'llegada_destino' then 'fin_carga' when 'fin_descarga' then 'llegada_destino' end;
  if v_previo is null then raise exception 'Hito no válido.'; end if;
  if not exists (select 1 from public.transporte_viaje_hitos where viaje_id = v.id and hito = v_previo) then
    raise exception 'Registra antes el hito anterior.';
  end if;
  insert into public.transporte_viaje_hitos (empresa_id, viaje_id, hito, latitud, longitud, km, nota)
  values (v.empresa_id, v.id, p_hito, v_lat, v_lng, nullif(p_datos->>'km', '')::numeric, nullif(trim(p_datos->>'nota'), ''))
  on conflict (viaje_id, hito) do nothing
  returning * into v_row;
  if v_row.id is null then raise exception 'Ese hito ya está registrado.'; end if;
  -- Viajes sin paradas: se crea la de origen al llegar a la carga y la de destino al llegar al destino.
  if p_hito = 'llegada_carga' and not exists (select 1 from public.transporte_viaje_paradas where viaje_id = v.id and tipo = 'origen') then
    insert into public.transporte_viaje_paradas (viaje_id, empresa_id, secuencia, tipo, nombre)
    values (v.id, v.empresa_id, 900000, 'origen', v.origen_nombre) returning id into v_id;
    perform public.transporte__renumerar_paradas(v.id, array[v_id]);
  elsif p_hito = 'llegada_destino' and not exists (select 1 from public.transporte_viaje_paradas where viaje_id = v.id and tipo = 'destino') then
    select coalesce(max(secuencia), 0) + 1 into v_seq from public.transporte_viaje_paradas where viaje_id = v.id;
    insert into public.transporte_viaje_paradas (viaje_id, empresa_id, secuencia, tipo, nombre)
    values (v.id, v.empresa_id, v_seq, 'destino', v.destino_nombre);
  end if;
  -- La carga ocurre en la parada de origen y la descarga en la de destino.
  if p_hito = 'llegada_carga' then
    update public.transporte_viaje_paradas set llegada_at = coalesce(llegada_at, now())
    where viaje_id = v.id and tipo = 'origen' and estado = 'pendiente';
  elsif p_hito = 'fin_carga' then
    update public.transporte_viaje_paradas set estado = 'completada', salida_at = now(), completada_por = auth.uid(),
      latitud_evidencia = v_lat, longitud_evidencia = v_lng
    where viaje_id = v.id and tipo = 'origen' and estado = 'pendiente';
  elsif p_hito = 'llegada_destino' then
    update public.transporte_viaje_paradas set llegada_at = coalesce(llegada_at, now())
    where viaje_id = v.id and tipo = 'destino' and estado = 'pendiente';
  end if;
  return v_row;
end;
$function$;

revoke all on function public.transporte_viaje_hito_registrar(text,text,jsonb) from public, anon;
grant execute on function public.transporte_viaje_hito_registrar(text,text,jsonb) to authenticated, service_role;

do $$ begin
  if position('900000' in pg_get_functiondef('public.transporte_viaje_hito_registrar(text,text,jsonb)'::regprocedure)) = 0 then
    raise exception 'transporte_viaje_hito_registrar no quedó actualizada.';
  end if;
end $$;
