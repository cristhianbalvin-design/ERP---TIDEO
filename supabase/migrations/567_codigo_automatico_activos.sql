-- Código automático permanente para activos de cliente creados desde Recepción.

alter table public.activos
  add column if not exists codigo_origen text;

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
  'ser_activo_' || replace(gen_random_uuid()::text, '-', ''),
  e.id,
  'Activo',
  'ACT',
  1,
  'Permanente por empresa',
  'activo'
from public.empresas e
on conflict (empresa_id, documento) do nothing;

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

revoke all on function public.siguiente_codigo_activo(text) from public, anon;
grant execute on function public.siguiente_codigo_activo(text) to authenticated, service_role;
