-- TMS · Composer «Nueva ruta»: guardado atómico de ruta + ruta de regreso + tarifa base (aditivo)
-- - transporte_rutas.numero_peajes
-- - transporte_siguiente_codigo_ruta(empresa): siguiente correlativo R-NNN
-- - transporte_ruta_guardar_compuesta(empresa, ruta, crear_regreso, tarifa): todo en una transacción.
--   SECURITY INVOKER: la RLS de transporte_rutas / transporte_tarifas (permiso crear) sigue mandando.

alter table public.transporte_rutas add column if not exists numero_peajes integer;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'transporte_rutas_numero_peajes_chk') then
    alter table public.transporte_rutas add constraint transporte_rutas_numero_peajes_chk
      check (numero_peajes is null or numero_peajes >= 0);
  end if;
end $$;

create or replace function public.transporte_siguiente_codigo_ruta(p_empresa_id text)
returns text
language sql
stable
set search_path to 'public'
as $$
  select 'R-' || lpad((coalesce(max(substring(codigo from '^R-(\d+)$')::int), 0) + 1)::text, 3, '0')
  from public.transporte_rutas
  where empresa_id = p_empresa_id and codigo ~ '^R-\d+$';
$$;

create or replace function public.transporte_ruta_guardar_compuesta(
  p_empresa_id text, p_ruta jsonb, p_crear_regreso boolean default false, p_tarifa jsonb default null)
returns jsonb
language plpgsql
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
  if p_empresa_id is null or not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'La empresa no es válida para el usuario.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_ruta) is distinct from 'object' then raise exception 'Los datos de la ruta deben ser un objeto.'; end if;

  select * into v_origen from public.transporte_lugares
    where empresa_id = p_empresa_id and id = nullif(btrim(p_ruta->>'origen_lugar_id'), '');
  if not found then raise exception 'Elige el lugar de origen.'; end if;
  select * into v_destino from public.transporte_lugares
    where empresa_id = p_empresa_id and id = nullif(btrim(p_ruta->>'destino_lugar_id'), '');
  if not found then raise exception 'Elige el lugar de destino.'; end if;
  if v_origen.id = v_destino.id then raise exception 'El origen y el destino deben ser lugares distintos.'; end if;

  v_codigo := coalesce(nullif(btrim(p_ruta->>'codigo'), ''), public.transporte_siguiente_codigo_ruta(p_empresa_id));

  insert into public.transporte_rutas (
    empresa_id, codigo, nombre,
    origen_lugar_id, origen_nombre, origen_direccion, origen_ubigeo, origen_latitud, origen_longitud,
    destino_lugar_id, destino_nombre, destino_direccion, destino_ubigeo, destino_latitud, destino_longitud,
    distancia_km, duracion_estimada_horas, tipo_carga_habitual, numero_peajes, peajes_estimados, moneda_peajes, notas, estado
  ) values (
    p_empresa_id, v_codigo,
    coalesce(nullif(btrim(p_ruta->>'nombre'), ''), v_origen.nombre || ' → ' || v_destino.nombre),
    v_origen.id, v_origen.nombre, v_origen.direccion, v_origen.ubigeo, v_origen.latitud, v_origen.longitud,
    v_destino.id, v_destino.nombre, v_destino.direccion, v_destino.ubigeo, v_destino.latitud, v_destino.longitud,
    nullif(p_ruta->>'distancia_km', '')::numeric, nullif(p_ruta->>'duracion_estimada_horas', '')::numeric,
    nullif(btrim(p_ruta->>'tipo_carga_habitual'), ''), nullif(p_ruta->>'numero_peajes', '')::integer,
    nullif(p_ruta->>'peajes_estimados', '')::numeric, coalesce(nullif(p_ruta->>'moneda_peajes', ''), 'PEN'),
    nullif(btrim(p_ruta->>'notas'), ''), 'activa'
  ) returning * into v_ida;

  if coalesce(p_crear_regreso, false) then
    insert into public.transporte_rutas (
      empresa_id, codigo, nombre,
      origen_lugar_id, origen_nombre, origen_direccion, origen_ubigeo, origen_latitud, origen_longitud,
      destino_lugar_id, destino_nombre, destino_direccion, destino_ubigeo, destino_latitud, destino_longitud,
      distancia_km, duracion_estimada_horas, tipo_carga_habitual, numero_peajes, peajes_estimados, moneda_peajes, notas, estado
    ) values (
      p_empresa_id,
      coalesce(nullif(btrim(p_ruta->>'codigo_regreso'), ''), public.transporte_siguiente_codigo_ruta(p_empresa_id)),
      coalesce(nullif(btrim(p_ruta->>'nombre_regreso'), ''), v_destino.nombre || ' → ' || v_origen.nombre),
      v_destino.id, v_destino.nombre, v_destino.direccion, v_destino.ubigeo, v_destino.latitud, v_destino.longitud,
      v_origen.id, v_origen.nombre, v_origen.direccion, v_origen.ubigeo, v_origen.latitud, v_origen.longitud,
      v_ida.distancia_km, v_ida.duracion_estimada_horas, v_ida.tipo_carga_habitual, v_ida.numero_peajes,
      v_ida.peajes_estimados, v_ida.moneda_peajes, v_ida.notas, 'activa'
    ) returning * into v_vuelta;
  end if;

  if p_tarifa is not null and jsonb_typeof(p_tarifa) = 'object' then
    foreach v_ruta_id in array array_remove(array[v_ida.id, v_vuelta.id], null) loop
      insert into public.transporte_tarifas (
        empresa_id, ruta_id, cuenta_id, tipo_unidad, modalidad, tarifa, moneda, minimo_facturable,
        vigente_desde, estado, notas
      ) values (
        p_empresa_id, v_ruta_id, null, btrim(p_tarifa->>'tipo_unidad'), coalesce(nullif(p_tarifa->>'modalidad', ''), 'viaje'),
        (p_tarifa->>'tarifa')::numeric, coalesce(nullif(p_tarifa->>'moneda', ''), 'PEN'),
        nullif(p_tarifa->>'minimo_facturable', '')::numeric,
        coalesce(nullif(p_tarifa->>'vigente_desde', '')::date, current_date), 'activa', nullif(btrim(p_tarifa->>'notas'), '')
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
revoke all on function public.transporte_siguiente_codigo_ruta(text) from public, anon;
grant execute on function public.transporte_siguiente_codigo_ruta(text) to authenticated;

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='transporte_rutas' and column_name='numero_peajes') then
    raise exception 'Falta transporte_rutas.numero_peajes';
  end if;
  if exists (select 1 from pg_proc where oid = 'public.transporte_ruta_guardar_compuesta(text,jsonb,boolean,jsonb)'::regprocedure and prosecdef) then
    raise exception 'transporte_ruta_guardar_compuesta debe ser SECURITY INVOKER';
  end if;
  if public.transporte_siguiente_codigo_ruta('__sin_empresa__') <> 'R-001' then
    raise exception 'transporte_siguiente_codigo_ruta no devuelve R-001 para una empresa vacía';
  end if;
end $$;
