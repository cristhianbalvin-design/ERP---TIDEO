-- Reserva serializada del correlativo de Cotizaciones por empresa.
-- El advisory lock protege tanto la serie documentaria como el fallback MAX+1.
-- Cuando no existe una serie activa, el fallback crea una serie persistente:
-- un MAX+1 sin estado persistido se repetiría después de liberar el lock.

create or replace function public.siguiente_numero_cotizacion(p_empresa_id text)
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
    hashtextextended('siguiente_numero_cotizacion:' || p_empresa_id, 0)
  );

  select * into v_serie
  from public.series_documentarias
  where empresa_id = p_empresa_id
    and documento = 'Cotizaciones'
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

  select coalesce(max(
    case
      when numero like 'COT-' || v_year || '-%'
        then (split_part(numero, '-', 3))::int
      else 0
    end
  ), 0) into v_max
  from public.cotizaciones
  where empresa_id = p_empresa_id;

  v_corr := v_max + 1;
  insert into public.series_documentarias (
    id,
    empresa_id,
    documento,
    serie,
    siguiente_correlativo,
    regla,
    estado
  ) values (
    'ser_cotizaciones_fallback_' || replace(gen_random_uuid()::text, '-', ''),
    p_empresa_id,
    'Cotizaciones',
    'COT-' || v_year,
    v_corr + 1,
    'Anual por empresa',
    'activo'
  );

  return 'COT-' || v_year || '-' || lpad(v_corr::text, 4, '0');
end;
$$;

grant execute on function public.siguiente_numero_cotizacion(text) to authenticated, service_role;
