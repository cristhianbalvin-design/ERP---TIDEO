-- RPC para generar el siguiente número de cotización de forma atómica en el servidor.
-- Evita duplicados cuando el estado local del cliente está desactualizado (ej. permisos RLS recién aplicados).
-- SECURITY DEFINER para poder leer todas las cotizaciones de la empresa sin depender de RLS.

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
  -- Intentar usar series documentaria activa para Cotizaciones
  select * into v_serie
  from public.series_documentarias
  where empresa_id = p_empresa_id
    and documento  = 'Cotizaciones'
    and estado     = 'activo'
  limit 1;

  if found then
    v_corr := v_serie.siguiente_correlativo;
    -- Incrementar atómicamente
    update public.series_documentarias
    set siguiente_correlativo = siguiente_correlativo + 1
    where id = v_serie.id;
    return v_serie.serie || '-' || lpad(v_corr::text, 4, '0');
  end if;

  -- Fallback: calcular desde el máximo existente en la tabla
  select coalesce(max(
    case
      when numero like 'COT-' || v_year || '-%'
        then (split_part(numero, '-', 3))::int
      else 0
    end
  ), 0) into v_max
  from public.cotizaciones
  where empresa_id = p_empresa_id;

  return 'COT-' || v_year || '-' || lpad((v_max + 1)::text, 4, '0');
end;
$$;

grant execute on function public.siguiente_numero_cotizacion(text) to authenticated;
