-- Numeración atómica de OS Cliente y Órdenes de Trabajo.
-- Las filas de series_documentarias son el único estado mutable de la secuencia.

alter table public.series_documentarias
  add constraint series_documentarias_empresa_documento_key
  unique (empresa_id, documento);

with semillas(empresa_id, documento, siguiente_correlativo) as (
  values
    ('emp_2000000000', 'OS Cliente', 982),
    ('emp_20541435833', 'OS Cliente', 784),
    ('emp_20600026446', 'OS Cliente', 2310),
    ('emp_20601829101', 'OS Cliente', 970),
    ('emp_20606120487', 'OS Cliente', 991),
    ('emp_20609996464', 'OS Cliente', 259),
    ('emp_2000000000', 'Ordenes de Trabajo', 974),
    ('emp_20541435833', 'Ordenes de Trabajo', 878),
    ('emp_20606120487', 'Ordenes de Trabajo', 800),
    ('emp_20609996464', 'Ordenes de Trabajo', 813)
), tipos(documento, prefijo) as (
  values
    ('OS Cliente', 'OSC'),
    ('Ordenes de Trabajo', 'OT')
)
insert into public.series_documentarias (
  id,
  empresa_id,
  documento,
  serie,
  siguiente_correlativo,
  regla,
  estado
)
select
  'ser_' || lower(replace(t.prefijo, ' ', '_')) || '_' || replace(gen_random_uuid()::text, '-', ''),
  e.id,
  t.documento,
  case
    when t.documento = 'OS Cliente' then 'OSC-' || to_char(current_date, 'YYYY')
    else 'OT-' || right(to_char(current_date, 'YYYY'), 2)
  end,
  coalesce(s.siguiente_correlativo, 1),
  'Anual por empresa',
  'activo'
from public.empresas e
cross join tipos t
left join semillas s
  on s.empresa_id = e.id
 and s.documento = t.documento
on conflict (empresa_id, documento) do update
set serie = excluded.serie,
    siguiente_correlativo = excluded.siguiente_correlativo,
    regla = excluded.regla,
    estado = excluded.estado;

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

revoke all on function public.siguiente_numero_os_cliente(text) from public, anon;
grant execute on function public.siguiente_numero_os_cliente(text) to authenticated, service_role;

revoke all on function public.siguiente_numero_orden_trabajo(text) from public, anon;
grant execute on function public.siguiente_numero_orden_trabajo(text) to authenticated, service_role;
