-- Valida pertenencia al tenant antes de ejecutar funciones de numeracion.
-- No agrega permisos de pantalla: solo evita que un usuario autenticado
-- reserve o herede numeros para otra empresa.

create or replace function public.siguiente_codigo_activo(p_empresa_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_serie record;
  v_max   int;
  v_corr  int;
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tiene acceso a esta empresa.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('siguiente_codigo_activo' || p_empresa_id, 0)
  );

  select * into v_serie
  from public.series_documentarias
  where empresa_id = p_empresa_id
    and documento = 'Activo'
    and estado = 'activo'
  limit 1
  for update;

  if found then
    v_corr := v_serie.siguiente_correlativo;
    update public.series_documentarias
    set siguiente_correlativo = siguiente_correlativo + 1
    where id = v_serie.id;
    return 'ACT-' || lpad(v_corr::text, 5, '0');
  end if;

  select coalesce(max((substring(codigo from '([0-9]{5})$'))::int), 0)
    into v_max
  from public.activos
  where empresa_id = p_empresa_id
    and codigo ~ '^ACT-[0-9]{5}$';

  v_corr := v_max + 1;
  insert into public.series_documentarias (
    id, empresa_id, documento, serie, siguiente_correlativo, regla, estado
  ) values (
    'ser_activo_fallback_' || replace(gen_random_uuid()::text, '-', ''),
    p_empresa_id,
    'Activo',
    'ACT',
    v_corr + 1,
    'Permanente por empresa',
    'activo'
  );

  return 'ACT-' || lpad(v_corr::text, 5, '0');
end;
$$;

create or replace function public.siguiente_numero_os_cliente(p_empresa_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year  text := to_char(current_date, 'YYYY');
  v_serie record;
  v_max   int;
  v_corr  int;
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tiene acceso a esta empresa.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('siguiente_numero_os_cliente:' || p_empresa_id, 0)
  );

  select * into v_serie
  from public.series_documentarias
  where empresa_id = p_empresa_id
    and documento = 'OS Cliente'
    and estado = 'activo'
  limit 1
  for update;

  if found then
    v_corr := v_serie.siguiente_correlativo;
    update public.series_documentarias
    set siguiente_correlativo = siguiente_correlativo + 1
    where id = v_serie.id;
    return v_serie.serie || '-' || lpad(v_corr::text, 4, '0');
  end if;

  select coalesce(max((substring(numero from '-([0-9]{4})$'))::int), 0)
    into v_max
  from public.os_clientes
  where empresa_id = p_empresa_id
    and numero ~ ('^OSC-' || v_year || '-[0-9]{4}$');

  v_corr := v_max + 1;
  insert into public.series_documentarias (
    id, empresa_id, documento, serie, siguiente_correlativo, regla, estado
  ) values (
    'ser_os_cliente_fallback_' || replace(gen_random_uuid()::text, '-', ''),
    p_empresa_id,
    'OS Cliente',
    'OSC-' || v_year,
    v_corr + 1,
    'Anual por empresa',
    'activo'
  );

  return 'OSC-' || v_year || '-' || lpad(v_corr::text, 4, '0');
end;
$$;

create or replace function public.siguiente_numero_orden_trabajo(p_empresa_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year  text := to_char(current_date, 'YYYY');
  v_yy    text := right(v_year, 2);
  v_serie record;
  v_max   int;
  v_corr  int;
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tiene acceso a esta empresa.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('siguiente_numero_orden_trabajo:' || p_empresa_id, 0)
  );

  select * into v_serie
  from public.series_documentarias
  where empresa_id = p_empresa_id
    and documento = 'Ordenes de Trabajo'
    and estado = 'activo'
  limit 1
  for update;

  if found then
    v_corr := v_serie.siguiente_correlativo;
    update public.series_documentarias
    set siguiente_correlativo = siguiente_correlativo + 1
    where id = v_serie.id;
    return v_serie.serie || '-' || lpad(v_corr::text, 4, '0');
  end if;

  select coalesce(max((substring(numero from '-([0-9]{4})$'))::int), 0)
    into v_max
  from public.ordenes_trabajo
  where empresa_id = p_empresa_id
    and numero ~ ('^OT-' || v_yy || '-[0-9]{4}$');

  v_corr := v_max + 1;
  insert into public.series_documentarias (
    id, empresa_id, documento, serie, siguiente_correlativo, regla, estado
  ) values (
    'ser_ordenes_trabajo_fallback_' || replace(gen_random_uuid()::text, '-', ''),
    p_empresa_id,
    'Ordenes de Trabajo',
    'OT-' || v_yy,
    v_corr + 1,
    'Anual por empresa',
    'activo'
  );

  return 'OT-' || v_yy || '-' || lpad(v_corr::text, 4, '0');
end;
$$;

create or replace function public.abrir_o_heredar_numero_caso(
  p_empresa_id text,
  p_padre_id text,
  p_padre_tabla text,
  p_cuenta_id text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_numero_caso integer;
  v_siguiente integer;
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tiene acceso a esta empresa.' using errcode = '42501';
  end if;

  if p_padre_id is not null then
    if p_padre_tabla is null or p_padre_tabla not in (
      'recepciones_activos_cliente',
      'cotizaciones',
      'cotizaciones_especiales',
      'os_clientes',
      'ordenes_trabajo'
    ) then
      raise exception 'Tabla padre no permitida: %', p_padre_tabla
        using errcode = '22023';
    end if;

    execute format(
      'select numero_caso
         from public.%I
        where empresa_id = $1
          and id::text = $2',
      p_padre_tabla
    )
    into strict v_numero_caso
    using p_empresa_id, p_padre_id;

    if v_numero_caso is not null then
      return v_numero_caso;
    end if;
  end if;

  if p_cuenta_id is null then
    return null;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('caso_servicio' || p_empresa_id, 0)
  );

  select siguiente_correlativo
    into v_siguiente
  from public.series_documentarias
  where empresa_id = p_empresa_id
    and documento = 'caso_servicio'
    and estado = 'activo'
  for update;

  if not found then
    raise exception 'No existe una serie activa caso_servicio para la empresa %', p_empresa_id
      using errcode = '22023';
  end if;

  update public.series_documentarias
     set siguiente_correlativo = siguiente_correlativo + 1
   where empresa_id = p_empresa_id
     and documento = 'caso_servicio'
     and estado = 'activo';

  return v_siguiente;
end;
$$;

create or replace function public.secuencia_ot_en_caso(
  p_empresa_id text,
  p_numero_caso integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_siguiente integer;
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tiene acceso a esta empresa.' using errcode = '42501';
  end if;

  if p_numero_caso is null then
    return null;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('caso_servicio' || p_empresa_id, 0)
  );

  select count(*)::integer + 1
    into v_siguiente
  from public.ordenes_trabajo
  where empresa_id = p_empresa_id
    and numero_caso = p_numero_caso;

  return v_siguiente;
end;
$$;

revoke all on function public.siguiente_codigo_activo(text) from public, anon;
grant execute on function public.siguiente_codigo_activo(text) to authenticated, service_role;

revoke all on function public.siguiente_numero_os_cliente(text) from public, anon;
grant execute on function public.siguiente_numero_os_cliente(text) to authenticated, service_role;

revoke all on function public.siguiente_numero_orden_trabajo(text) from public, anon;
grant execute on function public.siguiente_numero_orden_trabajo(text) to authenticated, service_role;

revoke all on function public.abrir_o_heredar_numero_caso(text, text, text, text) from public, anon;
grant execute on function public.abrir_o_heredar_numero_caso(text, text, text, text) to authenticated, service_role;

revoke all on function public.secuencia_ot_en_caso(text, integer) from public, anon;
grant execute on function public.secuencia_ot_en_caso(text, integer) to authenticated, service_role;
