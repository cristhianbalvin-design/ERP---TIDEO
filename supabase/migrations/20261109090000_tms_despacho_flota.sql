-- TMS PR B: capacidad de unidades, asignación y despacho de viajes, notas de bitácora.
-- Aditiva: dos columnas nuevas y dos funciones nuevas. No modifica funciones existentes.

alter table public.vehiculos_transporte
  add column if not exists capacidad_toneladas numeric(10,2),
  add column if not exists capacidad_m3 numeric(10,2);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'vehiculos_transporte_capacidad_chk') then
    alter table public.vehiculos_transporte add constraint vehiculos_transporte_capacidad_chk
      check ((capacidad_toneladas is null or capacidad_toneladas >= 0) and (capacidad_m3 is null or capacidad_m3 >= 0));
  end if;
end $$;

comment on column public.vehiculos_transporte.capacidad_toneladas is 'Carga útil en toneladas; la usa el control de capacidad al despachar.';
comment on column public.vehiculos_transporte.capacidad_m3 is 'Volumen útil en m³; la usa el control de capacidad al despachar.';

-- Asigna transportista, unidad y conductor a un viaje programado y, si se pide, lo despacha.
-- Bloquean: recurso inactivo, de otro transportista, en otro viaje en curso o con documento vencido.
-- Requieren motivo de excepción para despachar: capacidad sin registrar o insuficiente,
-- certificado MTC o brevete sin fecha de vigencia.
create or replace function public.transporte_viaje_asignar(
  p_viaje_id text, p_transportista_id text, p_vehiculo_id text, p_conductor_id text,
  p_despachar boolean default false, p_nota text default null)
returns public.transporte_viajes
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_viaje public.transporte_viajes%rowtype;
  v_tra public.transportistas%rowtype;
  v_veh public.vehiculos_transporte%rowtype;
  v_con public.conductores_transporte%rowtype;
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_obs text[] := '{}';
  v_nota text := nullif(trim(p_nota), '');
  v_resumen text;
begin
  select * into v_viaje from public.transporte_viajes where id = p_viaje_id for update;
  if not found then raise exception 'Viaje no encontrado.'; end if;
  if not public.usuario_tiene_empresa(v_viaje.empresa_id)
     or not public.usuario_puede(v_viaje.empresa_id, 'transporte_comercial', 'editar') then
    raise exception 'No tienes permiso para asignar o despachar viajes.' using errcode = '42501';
  end if;
  if v_viaje.estado <> 'programado' then
    raise exception 'Solo se puede asignar o despachar un viaje programado.';
  end if;

  select * into v_tra from public.transportistas
   where id = p_transportista_id and empresa_id = v_viaje.empresa_id and coalesce(activo, true);
  if not found then raise exception 'El transportista no está activo en esta empresa.'; end if;
  select * into v_veh from public.vehiculos_transporte
   where id = p_vehiculo_id and empresa_id = v_viaje.empresa_id;
  if not found then raise exception 'La unidad no existe en esta empresa.'; end if;
  select * into v_con from public.conductores_transporte
   where id = p_conductor_id and empresa_id = v_viaje.empresa_id;
  if not found then raise exception 'El conductor no existe en esta empresa.'; end if;

  -- Un recurso sin transportista registrado se acepta; uno de otro transportista, no.
  if coalesce(v_veh.transportista_id, v_tra.id) <> v_tra.id or coalesce(v_con.transportista_id, v_tra.id) <> v_tra.id then
    raise exception 'La unidad y el conductor deben pertenecer al transportista elegido.';
  end if;
  if not coalesce(v_veh.activo, true) then raise exception 'La unidad % está inactiva.', v_veh.placa; end if;
  if not coalesce(v_con.activo, true) then raise exception 'El conductor % está inactivo.', v_con.nombre; end if;
  if v_veh.vigencia_certificado_habilitacion < v_hoy then
    raise exception 'El certificado MTC de la unidad % está vencido.', v_veh.placa;
  end if;
  if v_con.vigencia_brevete < v_hoy then
    raise exception 'El brevete de % está vencido.', v_con.nombre;
  end if;
  if exists (select 1 from public.transporte_viajes t where t.empresa_id = v_viaje.empresa_id
      and t.id <> v_viaje.id and t.vehiculo_id = v_veh.id
      and t.estado in ('despachado', 'en_ruta', 'con_incidente')) then
    raise exception 'La unidad % está en otro viaje en curso.', v_veh.placa;
  end if;
  if exists (select 1 from public.transporte_viajes t where t.empresa_id = v_viaje.empresa_id
      and t.id <> v_viaje.id and t.conductor_id = v_con.id
      and t.estado in ('despachado', 'en_ruta', 'con_incidente')) then
    raise exception 'El conductor % está en otro viaje en curso.', v_con.nombre;
  end if;

  if v_veh.capacidad_toneladas is null then v_obs := v_obs || 'capacidad sin registrar'::text;
  elsif v_viaje.peso_toneladas is not null and v_viaje.peso_toneladas > v_veh.capacidad_toneladas then
    v_obs := v_obs || format('carga %s t supera %s t', v_viaje.peso_toneladas, v_veh.capacidad_toneladas);
  end if;
  if v_veh.vigencia_certificado_habilitacion is null then v_obs := v_obs || 'certificado MTC sin vigencia'::text; end if;
  if v_con.vigencia_brevete is null then v_obs := v_obs || 'brevete sin vigencia'::text; end if;

  if p_despachar and array_length(v_obs, 1) > 0 and v_nota is null then
    raise exception 'Se requiere motivo de excepción para despachar: %.', array_to_string(v_obs, ', ');
  end if;

  update public.transporte_viajes
     set transportista_id = v_tra.id, vehiculo_id = v_veh.id, conductor_id = v_con.id
   where id = v_viaje.id
   returning * into v_viaje;

  v_resumen := format('%s · %s', v_veh.placa, v_con.nombre);
  if array_length(v_obs, 1) > 0 and v_nota is not null then
    v_resumen := v_resumen || format(' · Excepción (%s): %s', array_to_string(v_obs, ', '), v_nota);
  elsif v_nota is not null then
    v_resumen := v_resumen || ' · ' || v_nota;
  end if;

  if p_despachar then
    v_viaje := public.transporte_viaje_cambiar_estado(v_viaje.id, 'despachado', v_resumen);
  else
    perform set_config('tms.escribiendo_evento', 'si', true);
    insert into public.transporte_viaje_eventos(viaje_id, empresa_id, estado_anterior, estado_nuevo, nota, created_by)
    values (v_viaje.id, v_viaje.empresa_id, v_viaje.estado, v_viaje.estado, 'Asignación: ' || v_resumen, auth.uid());
    perform set_config('tms.escribiendo_evento', 'no', true);
  end if;
  return v_viaje;
end;
$function$;

-- Agrega una nota libre a la bitácora sin cambiar el estado.
create or replace function public.transporte_viaje_agregar_nota(p_viaje_id text, p_nota text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_viaje public.transporte_viajes%rowtype;
begin
  select * into v_viaje from public.transporte_viajes where id = p_viaje_id;
  if not found then raise exception 'Viaje no encontrado.'; end if;
  if not public.usuario_tiene_empresa(v_viaje.empresa_id)
     or not public.usuario_puede(v_viaje.empresa_id, 'transporte_comercial', 'editar') then
    raise exception 'No tienes permiso para agregar notas al viaje.' using errcode = '42501';
  end if;
  if nullif(trim(p_nota), '') is null then raise exception 'Escribe la nota.'; end if;
  perform set_config('tms.escribiendo_evento', 'si', true);
  insert into public.transporte_viaje_eventos(viaje_id, empresa_id, estado_anterior, estado_nuevo, nota, created_by)
  values (v_viaje.id, v_viaje.empresa_id, v_viaje.estado, v_viaje.estado, trim(p_nota), auth.uid());
  perform set_config('tms.escribiendo_evento', 'no', true);
end;
$function$;

revoke all on function public.transporte_viaje_asignar(text, text, text, text, boolean, text) from public, anon;
revoke all on function public.transporte_viaje_agregar_nota(text, text) from public, anon;
grant execute on function public.transporte_viaje_asignar(text, text, text, text, boolean, text) to authenticated, service_role;
grant execute on function public.transporte_viaje_agregar_nota(text, text) to authenticated, service_role;

-- Comprobación: si algo no quedó como se espera, la migración se revierte.
do $$ begin
  if (select count(*) from information_schema.columns where table_schema = 'public'
      and table_name = 'vehiculos_transporte' and column_name in ('capacidad_toneladas', 'capacidad_m3')) <> 2 then
    raise exception 'Faltan las columnas de capacidad.';
  end if;
  if to_regprocedure('public.transporte_viaje_asignar(text,text,text,text,boolean,text)') is null
     or to_regprocedure('public.transporte_viaje_agregar_nota(text,text)') is null then
    raise exception 'Faltan las funciones de despacho.';
  end if;
  if has_function_privilege('anon', 'public.transporte_viaje_asignar(text,text,text,text,boolean,text)', 'execute') then
    raise exception 'anon no debe ejecutar transporte_viaje_asignar.';
  end if;
end $$;
