-- OLA 5B - GAP-15: geolocalizacion, geofencing y SAR.
-- Modelo actual: circulos centro+radio. El campo poligono_geojson queda reservado para una futura extension a poligonos.

alter table public.empresa_config
  add column if not exists asistencia_movil_ubicacion_habilitada boolean default false,
  add column if not exists asistencia_movil_consentimiento_requerido boolean default true,
  add column if not exists asistencia_movil_consentimiento_texto text default 'Autorizo el uso puntual de mi ubicacion exclusivamente al marcar asistencia, para validar presencia en operacion y fines de seguridad SAR. No se realiza rastreo continuo ni en segundo plano.',
  add column if not exists geofencing_modo text default 'flexible' check (geofencing_modo in ('flexible','estricto')),
  add column if not exists geofencing_permitir_sin_gps boolean default true,
  add column if not exists geofencing_precision_baja_m integer default 80,
  add column if not exists sar_habilitado boolean default false,
  add column if not exists sar_hora_limite time default '09:00',
  add column if not exists sar_gracia_minutos integer default 15;

alter table public.personal_operativo
  add column if not exists sede_id text;

alter table public.personal_administrativo
  add column if not exists sede_id text;

create table if not exists public.rrhh_geocercas (
  id text primary key default ('geo_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12)),
  empresa_id text not null,
  nombre text not null,
  sede_id text,
  sede_nombre text,
  latitud double precision not null,
  longitud double precision not null,
  radio_m integer not null default 250 check (radio_m > 0),
  vigencia_desde date,
  vigencia_hasta date,
  estado text not null default 'activo' check (estado in ('activo','inactivo')),
  poligono_geojson jsonb,
  notas text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_rrhh_geocercas_empresa_estado on public.rrhh_geocercas(empresa_id, estado);
alter table public.rrhh_geocercas enable row level security;
drop policy if exists rrhh_geocercas_tenant on public.rrhh_geocercas;
create policy rrhh_geocercas_tenant on public.rrhh_geocercas
for all using (public.usuario_tiene_empresa(empresa_id))
with check (public.usuario_tiene_empresa(empresa_id));

create table if not exists public.rrhh_geocerca_asignaciones (
  id text primary key default ('gea_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12)),
  empresa_id text not null,
  geocerca_id text not null references public.rrhh_geocercas(id) on delete cascade,
  personal_id text,
  personal_tipo text check (personal_tipo in ('operativo','administrativo','admin')),
  sede_id text,
  grupo_tipo text default 'individual' check (grupo_tipo in ('individual','sede','area','centro_costo')),
  grupo_valor text,
  vigencia_desde date,
  vigencia_hasta date,
  estado text not null default 'activo' check (estado in ('activo','inactivo')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_rrhh_geocerca_asig_personal on public.rrhh_geocerca_asignaciones(empresa_id, personal_id, estado);
create index if not exists idx_rrhh_geocerca_asig_sede on public.rrhh_geocerca_asignaciones(empresa_id, sede_id, estado);
alter table public.rrhh_geocerca_asignaciones enable row level security;
drop policy if exists rrhh_geocerca_asig_tenant on public.rrhh_geocerca_asignaciones;
create policy rrhh_geocerca_asig_tenant on public.rrhh_geocerca_asignaciones
for all using (public.usuario_tiene_empresa(empresa_id))
with check (public.usuario_tiene_empresa(empresa_id));

create table if not exists public.rrhh_ubicacion_consentimientos (
  id text primary key default ('gco_' || substr(md5(random()::text || clock_timestamp()::text), 1, 12)),
  empresa_id text not null,
  personal_id text not null,
  personal_tipo text not null,
  auth_user_id uuid,
  texto text not null,
  version text default 'gap15-2026-06-12',
  aceptado_en timestamptz default now(),
  origen text default 'mobile_pwa'
);

create unique index if not exists uq_rrhh_ubicacion_consentimiento_personal
  on public.rrhh_ubicacion_consentimientos(empresa_id, personal_id, version);
alter table public.rrhh_ubicacion_consentimientos enable row level security;
drop policy if exists rrhh_ubicacion_consentimientos_tenant on public.rrhh_ubicacion_consentimientos;
create policy rrhh_ubicacion_consentimientos_tenant on public.rrhh_ubicacion_consentimientos
for all using (public.usuario_tiene_empresa(empresa_id))
with check (public.usuario_tiene_empresa(empresa_id));

alter table public.registros_asistencia
  add column if not exists ubicacion_entrada jsonb,
  add column if not exists ubicacion_salida jsonb,
  add column if not exists geofence_entrada_estado text,
  add column if not exists geofence_salida_estado text,
  add column if not exists geocerca_entrada_id text,
  add column if not exists geocerca_salida_id text,
  add column if not exists distancia_entrada_m numeric,
  add column if not exists distancia_salida_m numeric,
  add column if not exists precision_entrada_m numeric,
  add column if not exists precision_salida_m numeric,
  add column if not exists ubicacion_fix_entrada_at timestamptz,
  add column if not exists ubicacion_fix_salida_at timestamptz,
  add column if not exists ubicacion_enviado_at timestamptz,
  add column if not exists ubicacion_motivo text,
  add column if not exists ubicacion_simulada boolean default false,
  add column if not exists offline_marcacion boolean default false,
  add column if not exists offline_sincronizado_en timestamptz,
  add column if not exists sar_estado text,
  add column if not exists sar_alerta_generada_en timestamptz;

create index if not exists idx_reg_asistencia_geofence
  on public.registros_asistencia(empresa_id, fecha, geofence_entrada_estado, geofence_salida_estado);

create or replace function public.geo_distancia_m(p_lat1 double precision, p_lng1 double precision, p_lat2 double precision, p_lng2 double precision)
returns double precision
language plpgsql
immutable
as $$
declare
  r constant double precision := 6371000;
  dlat double precision;
  dlng double precision;
  a double precision;
begin
  if p_lat1 is null or p_lng1 is null or p_lat2 is null or p_lng2 is null then
    return null;
  end if;
  dlat := radians(p_lat2 - p_lat1);
  dlng := radians(p_lng2 - p_lng1);
  a := sin(dlat/2) * sin(dlat/2)
    + cos(radians(p_lat1)) * cos(radians(p_lat2)) * sin(dlng/2) * sin(dlng/2);
  return 2 * r * atan2(sqrt(a), sqrt(1 - a));
end;
$$;

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
set search_path = public
as $$
declare
  v_cfg record;
  v_geo record;
  v_dist double precision;
  v_best_id text;
  v_best_nombre text;
  v_best_radio integer;
  v_best_dist double precision;
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
    v_dist := public.geo_distancia_m(p_lat, p_lng, v_geo.latitud, v_geo.longitud);
    if v_best_id is null or v_dist < v_best_dist then
      v_best_id := v_geo.id;
      v_best_nombre := v_geo.nombre;
      v_best_radio := v_geo.radio_m;
      v_best_dist := v_dist;
    end if;
  end loop;

  if v_best_id is null then
    return jsonb_build_object('estado','sin_geocerca','motivo','sin_geocerca_asignada');
  end if;

  if v_best_dist <= (v_best_radio + v_precision) then
    return jsonb_build_object('estado','dentro','geocerca_id',v_best_id,'geocerca_nombre',v_best_nombre,'distancia_m',round(v_best_dist::numeric,2),'radio_m',v_best_radio);
  end if;

  if coalesce(v_cfg.geofencing_modo, 'flexible') = 'estricto' then
    raise exception 'Marcacion fuera de perimetro: distancia % m, radio permitido % m.', round(v_best_dist::numeric, 2), v_best_radio;
  end if;

  return jsonb_build_object('estado','fuera','geocerca_id',v_best_id,'geocerca_nombre',v_best_nombre,'distancia_m',round(v_best_dist::numeric,2),'radio_m',v_best_radio);
end;
$$;

create or replace function public.aplicar_geofence_registro()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_personal record;
  v_res jsonb;
  v_lat double precision;
  v_lng double precision;
  v_prec numeric;
begin
  select sede, sede_id
    into v_personal
    from public.personal_operativo
   where empresa_id = new.empresa_id and id = new.trabajador_id;

  if v_personal is null then
    select sede, sede_id
      into v_personal
      from public.personal_administrativo
     where empresa_id = new.empresa_id and id = new.trabajador_id;
  end if;

  if new.origen_registro = 'mobile_pwa' then
    if new.ubicacion_entrada is not null or new.latitud is not null then
      v_lat := coalesce((new.ubicacion_entrada ->> 'lat')::double precision, nullif(new.latitud, '')::double precision);
      v_lng := coalesce((new.ubicacion_entrada ->> 'lng')::double precision, nullif(new.longitud, '')::double precision);
      v_prec := coalesce((new.ubicacion_entrada ->> 'precision_m')::numeric, new.precision_entrada_m, 0);
      v_res := public.validar_geofence_asistencia(new.empresa_id, new.trabajador_id, new.trabajador_tipo, coalesce(v_personal.sede_id, v_personal.sede), v_lat, v_lng, v_prec, new.ubicacion_motivo, new.fecha);
      new.geofence_entrada_estado := v_res ->> 'estado';
      new.geocerca_entrada_id := v_res ->> 'geocerca_id';
      new.distancia_entrada_m := nullif(v_res ->> 'distancia_m', '')::numeric;
      new.precision_entrada_m := v_prec;
      new.ubicacion_fix_entrada_at := coalesce((new.ubicacion_entrada ->> 'fix_at')::timestamptz, new.ubicacion_fix_entrada_at, now());
    end if;

    if new.hora_salida is not null and (new.ubicacion_salida is not null or new.latitud_salida is not null) then
      v_lat := coalesce((new.ubicacion_salida ->> 'lat')::double precision, nullif(new.latitud_salida, '')::double precision);
      v_lng := coalesce((new.ubicacion_salida ->> 'lng')::double precision, nullif(new.longitud_salida, '')::double precision);
      v_prec := coalesce((new.ubicacion_salida ->> 'precision_m')::numeric, new.precision_salida_m, 0);
      v_res := public.validar_geofence_asistencia(new.empresa_id, new.trabajador_id, new.trabajador_tipo, coalesce(v_personal.sede_id, v_personal.sede), v_lat, v_lng, v_prec, new.ubicacion_motivo, new.fecha);
      new.geofence_salida_estado := v_res ->> 'estado';
      new.geocerca_salida_id := v_res ->> 'geocerca_id';
      new.distancia_salida_m := nullif(v_res ->> 'distancia_m', '')::numeric;
      new.precision_salida_m := v_prec;
      new.ubicacion_fix_salida_at := coalesce((new.ubicacion_salida ->> 'fix_at')::timestamptz, new.ubicacion_fix_salida_at, now());
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_aplicar_geofence_registro on public.registros_asistencia;
create trigger trg_aplicar_geofence_registro
before insert or update on public.registros_asistencia
for each row execute function public.aplicar_geofence_registro();

create or replace function public.evaluar_sar_no_llegada(p_empresa_id text, p_fecha date default current_date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  r record;
begin
  for r in
    select distinct a.personal_id, a.personal_tipo, g.id as geocerca_id, g.nombre as geocerca_nombre
      from public.rrhh_geocerca_asignaciones a
      join public.rrhh_geocercas g on g.id = a.geocerca_id
     where a.empresa_id = p_empresa_id and a.estado = 'activo' and g.estado = 'activo'
       and a.personal_id is not null
  loop
    if not exists (
      select 1 from public.registros_asistencia ra
       where ra.empresa_id = p_empresa_id
         and ra.trabajador_id = r.personal_id
         and ra.fecha = p_fecha
         and coalesce(ra.geofence_entrada_estado, '') = 'dentro'
    ) then
      perform public.notificar_rrhh_ola2_once(
        p_empresa_id, null, 'sar_no_llegada', 'SAR: no llegada',
        'Trabajador esperado sin marcacion dentro de perimetro en ' || r.geocerca_nombre,
        'rrhh_geocercas', r.geocerca_id, 'alta'
      );
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

create or replace function public.whatsapp_tipo_alerta_desde_notificacion(p_tipo text, p_payload jsonb)
returns text
language sql
stable
as $$
  select case
    when p_tipo = 'sar_no_llegada' then 'sar_no_llegada'
    when p_tipo in ('contrato_por_vencer','contrato_vencido') then 'contrato_por_vencer'
    when lower(coalesce(p_payload ->> 'tipo_doc_nombre', p_payload ->> 'tipo_documento_id', '')) like '%dni%' then 'doc_dni_por_vencer'
    when lower(coalesce(p_payload ->> 'tipo_doc_nombre', p_payload ->> 'tipo_documento_id', '')) like '%sctr%' then 'doc_sctr_por_vencer'
    when lower(coalesce(p_payload ->> 'tipo_doc_nombre', p_payload ->> 'tipo_documento_id', '')) like '%licencia%' then 'doc_licencia_por_vencer'
    else null
  end;
$$;

do $$
begin
  if to_regclass('public.whatsapp_plantillas') is not null then
    insert into public.whatsapp_plantillas (
      empresa_id, tipo_alerta, proveedor_template, variables, texto_sugerido, estado
    )
    select e.id, 'sar_no_llegada', 'sar_no_llegada',
           array['colaborador','operacion','hora_limite','estado']::text[],
           'SAR: {{colaborador}} no registra llegada dentro de perimetro en {{operacion}} antes de {{hora_limite}}.',
           'activo'
      from public.empresas e
    on conflict (empresa_id, tipo_alerta) do nothing;
  end if;

  if to_regclass('public.whatsapp_matriz_destinatarios') is not null then
    insert into public.whatsapp_matriz_destinatarios (
      empresa_id, tipo_alerta, enviar_colaborador, enviar_jefe_area, enviar_rrhh, enviar_admin,
      requiere_opt_in_colaborador, internos_consentimiento_implicito, estado
    )
    select e.id, 'sar_no_llegada', false, true, true, false, true, true, 'activo'
      from public.empresas e
    on conflict (empresa_id, tipo_alerta) do nothing;
  end if;
end $$;

comment on table public.rrhh_geocercas is 'GAP-15: geocercas circulares por tenant para validacion puntual de asistencia movil y SAR.';
comment on table public.rrhh_geocerca_asignaciones is 'GAP-15: asignacion individual o por grupo/sede de geocercas validas.';
comment on table public.rrhh_ubicacion_consentimientos is 'GAP-15: consentimiento informado para captura puntual de ubicacion; no rastreo continuo.';
