-- Guardado atomico de viajes y reemplazo de paradas.
begin;

do $preflight$
begin
  if to_regclass('public.transporte_viajes') is null or to_regclass('public.transporte_viaje_paradas') is null then
    raise exception 'TMS_VIAJES_GUARDAR_PREFLIGHT: faltan tablas de viajes';
  end if;
  if to_regprocedure('public.usuario_tiene_empresa(text)') is null or to_regprocedure('public.usuario_puede(text,text,text)') is null then
    raise exception 'TMS_VIAJES_GUARDAR_PREFLIGHT: faltan funciones de autorizacion';
  end if;
end
$preflight$;

create or replace function public.transporte_viaje_guardar(p_viaje_id text, p_datos jsonb, p_paradas jsonb)
returns public.transporte_viajes
language plpgsql
security invoker
set search_path to 'public'
as $body$
declare
  v_viaje public.transporte_viajes%rowtype;
  v_empresa_id text;
  v_paradas jsonb := coalesce(p_paradas, '[]'::jsonb);
  v_total integer;
begin
  if jsonb_typeof(p_datos) is distinct from 'object' then raise exception 'Los datos del viaje deben ser un objeto.'; end if;
  if jsonb_typeof(v_paradas) is distinct from 'array' then raise exception 'Las paradas deben enviarse como una lista.'; end if;
  v_total := jsonb_array_length(v_paradas);
  if v_total < 2 then raise exception 'El viaje debe tener al menos una parada de origen y una de destino.'; end if;
  if (select count(*) from jsonb_array_elements(v_paradas) e where e->>'tipo'='origen') <> 1
     or v_paradas->0->>'tipo' <> 'origen'
     or (select count(*) from jsonb_array_elements(v_paradas) e where e->>'tipo'='destino') <> 1
     or v_paradas->(v_total-1)->>'tipo' <> 'destino' then
    raise exception 'La primera parada debe ser el unico origen y la ultima el unico destino.';
  end if;

  if p_viaje_id is null then
    v_empresa_id := nullif(btrim(p_datos->>'empresa_id'), '');
    if v_empresa_id is null or not public.usuario_tiene_empresa(v_empresa_id) then
      raise exception 'La empresa del viaje no es valida para el usuario.' using errcode='42501';
    end if;
    insert into public.transporte_viajes (
      empresa_id,sociedad_id,cuenta_id,os_cliente_id,cotizacion_id,ruta_id,origen_nombre,destino_nombre,
      distancia_km,duracion_estimada_horas,tipo_unidad,modalidad,carga_descripcion,peso_toneladas,volumen_m3,
      cantidad_facturable,tarifa_id,tarifa_unitaria,moneda,minimo_facturable,ingreso_estimado,fecha_programada,
      transportista_id,vehiculo_id,conductor_id,observaciones
    ) values (
      v_empresa_id,nullif(p_datos->>'sociedad_id','')::uuid,nullif(btrim(p_datos->>'cuenta_id'),''),nullif(btrim(p_datos->>'os_cliente_id'),''),
      nullif(btrim(p_datos->>'cotizacion_id'),''),nullif(btrim(p_datos->>'ruta_id'),''),coalesce(p_datos->>'origen_nombre',''),coalesce(p_datos->>'destino_nombre',''),
      nullif(p_datos->>'distancia_km','')::numeric,nullif(p_datos->>'duracion_estimada_horas','')::numeric,nullif(p_datos->>'tipo_unidad',''),
      coalesce(nullif(p_datos->>'modalidad',''),'viaje'),nullif(p_datos->>'carga_descripcion',''),nullif(p_datos->>'peso_toneladas','')::numeric,nullif(p_datos->>'volumen_m3','')::numeric,
      nullif(p_datos->>'cantidad_facturable','')::numeric,nullif(btrim(p_datos->>'tarifa_id'),''),nullif(p_datos->>'tarifa_unitaria','')::numeric,
      coalesce(nullif(p_datos->>'moneda',''),'PEN'),nullif(p_datos->>'minimo_facturable','')::numeric,nullif(p_datos->>'ingreso_estimado','')::numeric,
      nullif(p_datos->>'fecha_programada','')::timestamptz,nullif(btrim(p_datos->>'transportista_id'),''),nullif(btrim(p_datos->>'vehiculo_id'),''),
      nullif(btrim(p_datos->>'conductor_id'),''),nullif(p_datos->>'observaciones','')
    ) returning * into v_viaje;
  else
    select * into v_viaje from public.transporte_viajes where id=p_viaje_id for update;
    if not found then raise exception 'Viaje no encontrado.'; end if;
    if p_datos ? 'empresa_id' and nullif(btrim(p_datos->>'empresa_id'),'') is distinct from v_viaje.empresa_id then
      raise exception 'No se puede cambiar la empresa del viaje.';
    end if;
    if v_viaje.estado not in ('borrador','programado') then raise exception 'Solo se pueden editar viajes en borrador o programados.'; end if;
    if not public.usuario_tiene_empresa(v_viaje.empresa_id) then raise exception 'No tienes permiso para editar el viaje.' using errcode='42501'; end if;
    update public.transporte_viajes set
      sociedad_id=nullif(p_datos->>'sociedad_id','')::uuid,
      cuenta_id=coalesce(nullif(btrim(p_datos->>'cuenta_id'),''),cuenta_id),
      os_cliente_id=nullif(btrim(p_datos->>'os_cliente_id'),''),cotizacion_id=nullif(btrim(p_datos->>'cotizacion_id'),''),ruta_id=nullif(btrim(p_datos->>'ruta_id'),''),
      origen_nombre=coalesce(p_datos->>'origen_nombre',origen_nombre),destino_nombre=coalesce(p_datos->>'destino_nombre',destino_nombre),
      distancia_km=nullif(p_datos->>'distancia_km','')::numeric,duracion_estimada_horas=nullif(p_datos->>'duracion_estimada_horas','')::numeric,
      tipo_unidad=coalesce(nullif(p_datos->>'tipo_unidad',''),tipo_unidad),modalidad=coalesce(nullif(p_datos->>'modalidad',''),modalidad),
      carga_descripcion=nullif(p_datos->>'carga_descripcion',''),peso_toneladas=nullif(p_datos->>'peso_toneladas','')::numeric,
      volumen_m3=nullif(p_datos->>'volumen_m3','')::numeric,cantidad_facturable=nullif(p_datos->>'cantidad_facturable','')::numeric,
      tarifa_id=nullif(btrim(p_datos->>'tarifa_id'),''),tarifa_unitaria=nullif(p_datos->>'tarifa_unitaria','')::numeric,
      moneda=coalesce(nullif(p_datos->>'moneda',''),moneda),minimo_facturable=nullif(p_datos->>'minimo_facturable','')::numeric,
      ingreso_estimado=nullif(p_datos->>'ingreso_estimado','')::numeric,fecha_programada=nullif(p_datos->>'fecha_programada','')::timestamptz,
      transportista_id=nullif(btrim(p_datos->>'transportista_id'),''),vehiculo_id=nullif(btrim(p_datos->>'vehiculo_id'),''),
      conductor_id=nullif(btrim(p_datos->>'conductor_id'),''),observaciones=nullif(p_datos->>'observaciones','')
      where id=p_viaje_id returning * into v_viaje;
  end if;

  delete from public.transporte_viaje_paradas where empresa_id=v_viaje.empresa_id and viaje_id=v_viaje.id;
  insert into public.transporte_viaje_paradas(empresa_id,viaje_id,secuencia,tipo,nombre,direccion,latitud,longitud,guia_remision_id,observaciones)
  select v_viaje.empresa_id,v_viaje.id,(e.ordinality)::integer,e.value->>'tipo',btrim(e.value->>'nombre'),nullif(e.value->>'direccion',''),
    nullif(e.value->>'latitud','')::numeric,nullif(e.value->>'longitud','')::numeric,nullif(btrim(e.value->>'guia_remision_id'),''),nullif(e.value->>'observaciones','')
  from jsonb_array_elements(v_paradas) with ordinality as e(value,ordinality);
  return v_viaje;
end;
$body$;

drop policy if exists transporte_viaje_paradas_delete on public.transporte_viaje_paradas;
create policy transporte_viaje_paradas_delete on public.transporte_viaje_paradas for delete to authenticated
using (exists(select 1 from public.transporte_viajes v where v.id=transporte_viaje_paradas.viaje_id and v.empresa_id=transporte_viaje_paradas.empresa_id and v.estado in ('borrador','programado')) and public.usuario_tiene_empresa(empresa_id) and public.usuario_puede(empresa_id,'transporte_comercial','editar'));

revoke all on function public.transporte_viaje_guardar(text,jsonb,jsonb) from public,anon;
grant execute on function public.transporte_viaje_guardar(text,jsonb,jsonb) to authenticated;

do $postflight$
begin
  if to_regprocedure('public.transporte_viaje_guardar(text,jsonb,jsonb)') is null then raise exception 'TMS_VIAJES_GUARDAR_POSTFLIGHT: falta la funcion guardar'; end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='transporte_viaje_paradas' and policyname='transporte_viaje_paradas_delete' and cmd='DELETE' and roles @> array['authenticated']::name[]) then
    raise exception 'TMS_VIAJES_GUARDAR_POSTFLIGHT: falta la politica delete de paradas';
  end if;
  if public.transporte_viaje_transicion_permitida('cerrado','programado') then raise exception 'TMS_VIAJES_GUARDAR_POSTFLIGHT: validacion de catalogo invalida'; end if;
end
$postflight$;

commit;
