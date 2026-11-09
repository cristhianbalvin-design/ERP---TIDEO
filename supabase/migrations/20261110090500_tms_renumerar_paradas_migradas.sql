-- TMS · Hoja de Ruta combinada: las paradas copiadas desde ruta_paradas conservaban la secuencia
-- de la tabla antigua (no correlativa por ruta). Se renumeran 1..n por viaje, en el mismo orden.
do $$
declare r record;
begin
  perform set_config('tms.rpc_logistica', 'si', true);
  for r in select id from public.transporte_viajes where legacy_ruta_id is not null loop
    perform public.transporte__renumerar_paradas(r.id,
      array(select id from public.transporte_viaje_paradas where viaje_id = r.id order by secuencia));
  end loop;
  perform set_config('tms.rpc_logistica', '', true);
  if exists (select 1 from public.transporte_viajes v where v.legacy_ruta_id is not null and exists (
      select 1 from public.transporte_viaje_paradas p where p.viaje_id = v.id
        and p.secuencia > (select count(*) from public.transporte_viaje_paradas q where q.viaje_id = v.id))) then
    raise exception 'Renumeración de paradas incompleta.';
  end if;
end $$;
