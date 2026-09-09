-- La validación no cambia: solo estructura los datos de un bloqueo estricto
-- para que los clientes puedan mostrar una explicación sin parsear MESSAGE.
create or replace function public.validar_geofence_asistencia(
  p_empresa_id text,
  p_personal_id text,
  p_personal_tipo text,
  p_sede text,
  p_lat double precision,
  p_lng double precision,
  p_precision numeric,
  p_motivo text default null,
  p_fecha date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_cfg record;
  v_geo record;
  v_dist double precision;
  v_best_id text;
  v_best_nombre text;
  v_best_radio integer;
  v_best_dist double precision;
  v_best_tipo text;
  v_dentro boolean;
  v_precision numeric := coalesce(p_precision, 0);
begin
  select * into v_cfg from public.empresa_config where empresa_id = p_empresa_id;

  if p_lat is null or p_lng is null then
    if coalesce(v_cfg.geofencing_permitir_sin_gps, true) then
      return jsonb_build_object('estado','sin_ubicacion','motivo',coalesce(p_motivo,'gps_no_disponible'));
    end if;
    raise exception 'No se puede marcar asistencia sin ubicacion GPS.';
  end if;

  for v_geo in
    select g.*
      from public.rrhh_geocercas g
      left join public.rrhh_geocerca_asignaciones a on a.geocerca_id = g.id
     where g.empresa_id = p_empresa_id
       and g.estado = 'activo'
       and (g.vigencia_desde is null or g.vigencia_desde <= p_fecha)
       and (g.vigencia_hasta is null or g.vigencia_hasta >= p_fecha)
       and (
         (a.estado = 'activo' and a.personal_id = p_personal_id)
         or (a.estado = 'activo' and a.sede_id is not null and a.sede_id = p_sede)
       )
  loop
    if v_geo.tipo = 'poligono' then
      v_dist := ST_Distance(
        ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
        ST_SetSRID(ST_GeomFromGeoJSON(v_geo.poligono_geojson::text), 4326)::geography
      );
    else
      v_dist := public.geo_distancia_m(p_lat, p_lng, v_geo.latitud, v_geo.longitud);
    end if;

    if v_best_id is null or v_dist < v_best_dist then
      v_best_id := v_geo.id;
      v_best_nombre := v_geo.nombre;
      v_best_radio := v_geo.radio_m;
      v_best_dist := v_dist;
      v_best_tipo := v_geo.tipo;
    end if;
  end loop;

  if v_best_id is null then
    return jsonb_build_object('estado','sin_geocerca','motivo','sin_geocerca_asignada');
  end if;

  if v_best_tipo = 'poligono' then
    v_dentro := v_best_dist <= v_precision;
  else
    v_dentro := v_best_dist <= (v_best_radio + v_precision);
  end if;

  if v_dentro then
    return jsonb_build_object('estado','dentro','geocerca_id',v_best_id,'geocerca_nombre',v_best_nombre,'distancia_m',round(v_best_dist::numeric,2),'radio_m',v_best_radio);
  end if;

  if coalesce(v_cfg.geofencing_modo, 'flexible') = 'estricto' then
    if v_best_tipo = 'poligono' then
      raise exception using
        errcode = 'PGE01',
        message = 'Marcacion fuera del perimetro de la geocerca asignada.',
        detail = json_build_object(
          'tipo', 'poligono',
          'geocerca_nombre', v_best_nombre,
          'distancia_m', round(v_best_dist::numeric, 2)
        )::text;
    end if;

    raise exception using
      errcode = 'PGE01',
      message = 'Marcacion fuera del perimetro de la geocerca asignada.',
      detail = json_build_object(
        'tipo', 'circulo',
        'geocerca_nombre', v_best_nombre,
        'distancia_m', round(v_best_dist::numeric, 2),
        'radio_m', v_best_radio
      )::text;
  end if;

  return jsonb_build_object('estado','fuera','geocerca_id',v_best_id,'geocerca_nombre',v_best_nombre,'distancia_m',round(v_best_dist::numeric,2),'radio_m',v_best_radio);
end;
$$;
