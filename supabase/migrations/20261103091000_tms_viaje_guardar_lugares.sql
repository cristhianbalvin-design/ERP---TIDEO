-- TMS · transporte_viaje_guardar guarda los datos nuevos del asistente (lugar y ventana de cada parada,
-- referencia y contacto del cliente, tipo de carga, bultos y requisitos).
-- Parte de pg_get_functiondef de la versión vigente (20261028110000_tms_viajes_guardar.sql); solo se agregan columnas.
CREATE OR REPLACE FUNCTION public.transporte_viaje_guardar(p_viaje_id text, p_datos jsonb, p_paradas jsonb)
 RETURNS transporte_viajes
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_viaje public.transporte_viajes%rowtype;
  v_empresa_id text;
  v_paradas jsonb := coalesce(p_paradas, '[]'::jsonb);
  v_total integer;
  v_requisitos text[];
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
  v_requisitos := case when jsonb_typeof(p_datos->'requisitos') = 'array'
    then array(select btrim(x) from jsonb_array_elements_text(p_datos->'requisitos') x where btrim(x) <> '')
    else '{}'::text[] end;

  if p_viaje_id is null then
    v_empresa_id := nullif(btrim(p_datos->>'empresa_id'), '');
    if v_empresa_id is null or not public.usuario_tiene_empresa(v_empresa_id) then
      raise exception 'La empresa del viaje no es valida para el usuario.' using errcode='42501';
    end if;
    insert into public.transporte_viajes (
      empresa_id,sociedad_id,cuenta_id,os_cliente_id,cotizacion_id,ruta_id,origen_nombre,destino_nombre,
      distancia_km,duracion_estimada_horas,tipo_unidad,modalidad,carga_descripcion,peso_toneladas,volumen_m3,
      cantidad_facturable,tarifa_id,tarifa_unitaria,moneda,minimo_facturable,ingreso_estimado,fecha_programada,
      transportista_id,vehiculo_id,conductor_id,observaciones,
      referencia_cliente,contacto_id,tipo_carga,carga_bultos,carga_unidad_bultos,requisitos
    ) values (
      v_empresa_id,nullif(p_datos->>'sociedad_id','')::uuid,nullif(btrim(p_datos->>'cuenta_id'),''),nullif(btrim(p_datos->>'os_cliente_id'),''),
      nullif(btrim(p_datos->>'cotizacion_id'),''),nullif(btrim(p_datos->>'ruta_id'),''),coalesce(p_datos->>'origen_nombre',''),coalesce(p_datos->>'destino_nombre',''),
      nullif(p_datos->>'distancia_km','')::numeric,nullif(p_datos->>'duracion_estimada_horas','')::numeric,nullif(p_datos->>'tipo_unidad',''),
      coalesce(nullif(p_datos->>'modalidad',''),'viaje'),nullif(p_datos->>'carga_descripcion',''),nullif(p_datos->>'peso_toneladas','')::numeric,nullif(p_datos->>'volumen_m3','')::numeric,
      nullif(p_datos->>'cantidad_facturable','')::numeric,nullif(btrim(p_datos->>'tarifa_id'),''),nullif(p_datos->>'tarifa_unitaria','')::numeric,
      coalesce(nullif(p_datos->>'moneda',''),'PEN'),nullif(p_datos->>'minimo_facturable','')::numeric,nullif(p_datos->>'ingreso_estimado','')::numeric,
      nullif(p_datos->>'fecha_programada','')::timestamptz,nullif(btrim(p_datos->>'transportista_id'),''),nullif(btrim(p_datos->>'vehiculo_id'),''),
      nullif(btrim(p_datos->>'conductor_id'),''),nullif(p_datos->>'observaciones',''),
      nullif(btrim(p_datos->>'referencia_cliente'),''),nullif(btrim(p_datos->>'contacto_id'),''),nullif(btrim(p_datos->>'tipo_carga'),''),
      nullif(p_datos->>'carga_bultos','')::numeric,nullif(btrim(p_datos->>'carga_unidad_bultos'),''),v_requisitos
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
      conductor_id=nullif(btrim(p_datos->>'conductor_id'),''),observaciones=nullif(p_datos->>'observaciones',''),
      referencia_cliente=nullif(btrim(p_datos->>'referencia_cliente'),''),contacto_id=nullif(btrim(p_datos->>'contacto_id'),''),
      tipo_carga=nullif(btrim(p_datos->>'tipo_carga'),''),carga_bultos=nullif(p_datos->>'carga_bultos','')::numeric,
      carga_unidad_bultos=nullif(btrim(p_datos->>'carga_unidad_bultos'),''),requisitos=v_requisitos
      where id=p_viaje_id returning * into v_viaje;
  end if;

  delete from public.transporte_viaje_paradas where empresa_id=v_viaje.empresa_id and viaje_id=v_viaje.id;
  insert into public.transporte_viaje_paradas(empresa_id,viaje_id,secuencia,tipo,nombre,direccion,latitud,longitud,guia_remision_id,observaciones,
    lugar_id,ventana_inicio,ventana_fin)
  select v_viaje.empresa_id,v_viaje.id,(e.ordinality)::integer,e.value->>'tipo',btrim(e.value->>'nombre'),nullif(e.value->>'direccion',''),
    nullif(e.value->>'latitud','')::numeric,nullif(e.value->>'longitud','')::numeric,nullif(btrim(e.value->>'guia_remision_id'),''),nullif(e.value->>'observaciones',''),
    nullif(btrim(e.value->>'lugar_id'),''),nullif(e.value->>'ventana_inicio','')::time,nullif(e.value->>'ventana_fin','')::time
  from jsonb_array_elements(v_paradas) with ordinality as e(value,ordinality);
  return v_viaje;
end;
$function$;

do $$
begin
  if position('lugar_id' in pg_get_functiondef('public.transporte_viaje_guardar(text,jsonb,jsonb)'::regprocedure)) = 0 then
    raise exception 'transporte_viaje_guardar no quedó actualizada';
  end if;
  if exists (select 1 from pg_proc where oid = 'public.transporte_viaje_guardar(text,jsonb,jsonb)'::regprocedure and prosecdef) then
    raise exception 'transporte_viaje_guardar debe seguir siendo SECURITY INVOKER';
  end if;
end $$;
