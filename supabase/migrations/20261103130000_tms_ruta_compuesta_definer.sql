-- TMS · «Nueva ruta»: transporte_ruta_guardar_compuesta pasa a SECURITY DEFINER (decisión del usuario 2026-11-03).
-- Parte de la versión vigente (20261103120000_tms_ruta_compuesta.sql). Cambios:
--   + security definer, con validación explícita de sesión, empresa (usuario_tiene_empresa) y permiso
--     usuario_puede(empresa, 'transporte_comercial', 'crear'), porque la RLS no aplica dentro de la función.
--   + solo lugares activos de la misma empresa; created_by = auth.uid() en rutas y tarifas.
create or replace function public.transporte_ruta_guardar_compuesta(
  p_empresa_id text, p_ruta jsonb, p_crear_regreso boolean default false, p_tarifa jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_origen public.transporte_lugares%rowtype;
  v_destino public.transporte_lugares%rowtype;
  v_ida public.transporte_rutas%rowtype;
  v_vuelta public.transporte_rutas%rowtype;
  v_codigo text;
  v_tarifas text[] := '{}';
  v_tid text;
  v_ruta_id text;
begin
  if auth.uid() is null or p_empresa_id is null or not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'La empresa no es válida para el usuario.' using errcode = '42501';
  end if;
  if not public.usuario_puede(p_empresa_id, 'transporte_comercial', 'crear') then
    raise exception 'No tienes permiso para crear rutas en Transporte Comercial.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_ruta) is distinct from 'object' then raise exception 'Los datos de la ruta deben ser un objeto.'; end if;

  select * into v_origen from public.transporte_lugares
    where empresa_id = p_empresa_id and estado = 'activo' and id = nullif(btrim(p_ruta->>'origen_lugar_id'), '');
  if not found then raise exception 'Elige el lugar de origen.'; end if;
  select * into v_destino from public.transporte_lugares
    where empresa_id = p_empresa_id and estado = 'activo' and id = nullif(btrim(p_ruta->>'destino_lugar_id'), '');
  if not found then raise exception 'Elige el lugar de destino.'; end if;
  if v_origen.id = v_destino.id then raise exception 'El origen y el destino deben ser lugares distintos.'; end if;

  v_codigo := coalesce(nullif(btrim(p_ruta->>'codigo'), ''), public.transporte_siguiente_codigo_ruta(p_empresa_id));

  insert into public.transporte_rutas (
    empresa_id, codigo, nombre,
    origen_lugar_id, origen_nombre, origen_direccion, origen_ubigeo, origen_latitud, origen_longitud,
    destino_lugar_id, destino_nombre, destino_direccion, destino_ubigeo, destino_latitud, destino_longitud,
    distancia_km, duracion_estimada_horas, tipo_carga_habitual, numero_peajes, peajes_estimados, moneda_peajes, notas, estado, created_by
  ) values (
    p_empresa_id, v_codigo,
    coalesce(nullif(btrim(p_ruta->>'nombre'), ''), v_origen.nombre || ' → ' || v_destino.nombre),
    v_origen.id, v_origen.nombre, v_origen.direccion, v_origen.ubigeo, v_origen.latitud, v_origen.longitud,
    v_destino.id, v_destino.nombre, v_destino.direccion, v_destino.ubigeo, v_destino.latitud, v_destino.longitud,
    nullif(p_ruta->>'distancia_km', '')::numeric, nullif(p_ruta->>'duracion_estimada_horas', '')::numeric,
    nullif(btrim(p_ruta->>'tipo_carga_habitual'), ''), nullif(p_ruta->>'numero_peajes', '')::integer,
    nullif(p_ruta->>'peajes_estimados', '')::numeric, coalesce(nullif(p_ruta->>'moneda_peajes', ''), 'PEN'),
    nullif(btrim(p_ruta->>'notas'), ''), 'activa', auth.uid()
  ) returning * into v_ida;

  if coalesce(p_crear_regreso, false) then
    insert into public.transporte_rutas (
      empresa_id, codigo, nombre,
      origen_lugar_id, origen_nombre, origen_direccion, origen_ubigeo, origen_latitud, origen_longitud,
      destino_lugar_id, destino_nombre, destino_direccion, destino_ubigeo, destino_latitud, destino_longitud,
      distancia_km, duracion_estimada_horas, tipo_carga_habitual, numero_peajes, peajes_estimados, moneda_peajes, notas, estado, created_by
    ) values (
      p_empresa_id,
      coalesce(nullif(btrim(p_ruta->>'codigo_regreso'), ''), public.transporte_siguiente_codigo_ruta(p_empresa_id)),
      coalesce(nullif(btrim(p_ruta->>'nombre_regreso'), ''), v_destino.nombre || ' → ' || v_origen.nombre),
      v_destino.id, v_destino.nombre, v_destino.direccion, v_destino.ubigeo, v_destino.latitud, v_destino.longitud,
      v_origen.id, v_origen.nombre, v_origen.direccion, v_origen.ubigeo, v_origen.latitud, v_origen.longitud,
      v_ida.distancia_km, v_ida.duracion_estimada_horas, v_ida.tipo_carga_habitual, v_ida.numero_peajes,
      v_ida.peajes_estimados, v_ida.moneda_peajes, v_ida.notas, 'activa', auth.uid()
    ) returning * into v_vuelta;
  end if;

  if p_tarifa is not null and jsonb_typeof(p_tarifa) = 'object' then
    foreach v_ruta_id in array array_remove(array[v_ida.id, v_vuelta.id], null) loop
      insert into public.transporte_tarifas (
        empresa_id, ruta_id, cuenta_id, tipo_unidad, modalidad, tarifa, moneda, minimo_facturable,
        vigente_desde, estado, notas, created_by
      ) values (
        p_empresa_id, v_ruta_id, null, btrim(p_tarifa->>'tipo_unidad'), coalesce(nullif(p_tarifa->>'modalidad', ''), 'viaje'),
        (p_tarifa->>'tarifa')::numeric, coalesce(nullif(p_tarifa->>'moneda', ''), 'PEN'),
        nullif(p_tarifa->>'minimo_facturable', '')::numeric,
        coalesce(nullif(p_tarifa->>'vigente_desde', '')::date, current_date), 'activa', nullif(btrim(p_tarifa->>'notas'), ''), auth.uid()
      ) returning id into v_tid;
      v_tarifas := v_tarifas || v_tid;
    end loop;
  end if;

  return jsonb_build_object('ruta_id', v_ida.id, 'codigo', v_ida.codigo, 'regreso_id', v_vuelta.id,
    'codigo_regreso', v_vuelta.codigo, 'tarifa_ids', to_jsonb(v_tarifas));
end;
$$;

revoke all on function public.transporte_ruta_guardar_compuesta(text, jsonb, boolean, jsonb) from public, anon;
grant execute on function public.transporte_ruta_guardar_compuesta(text, jsonb, boolean, jsonb) to authenticated;

do $$
declare v_def text := pg_get_functiondef('public.transporte_ruta_guardar_compuesta(text,jsonb,boolean,jsonb)'::regprocedure);
begin
  if not (select prosecdef from pg_proc where oid = 'public.transporte_ruta_guardar_compuesta(text,jsonb,boolean,jsonb)'::regprocedure) then
    raise exception 'transporte_ruta_guardar_compuesta debe ser SECURITY DEFINER';
  end if;
  if position('usuario_puede(p_empresa_id, ''transporte_comercial'', ''crear'')' in v_def) = 0 then
    raise exception 'Falta la validación de permiso crear dentro de la función';
  end if;
  if position('search_path' in v_def) = 0 then raise exception 'Falta search_path fijo'; end if;
  if has_function_privilege('anon', 'public.transporte_ruta_guardar_compuesta(text,jsonb,boolean,jsonb)', 'execute') then
    raise exception 'anon no debe poder ejecutar la función';
  end if;
end $$;
