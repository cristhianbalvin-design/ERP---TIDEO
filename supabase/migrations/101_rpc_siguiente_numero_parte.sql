-- Agrega columna numero a partes_diarios y crea RPC para generar número de serie.

alter table public.partes_diarios
  add column if not exists numero text;

-- RPC para generar el siguiente número de parte diario de forma atómica.
-- Usa series_documentarias con documento = 'Partes Diarios' si existe,
-- y cae al fallback PD-YYYY-NNNN calculado desde la tabla partes_diarios.

create or replace function public.siguiente_numero_parte_diario(p_empresa_id text)
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
  -- Intentar usar serie documentaria activa para Partes Diarios
  select * into v_serie
  from public.series_documentarias
  where empresa_id = p_empresa_id
    and documento  = 'Partes Diarios'
    and estado     = 'activo'
  limit 1;

  if found then
    v_corr := v_serie.siguiente_correlativo;
    update public.series_documentarias
    set siguiente_correlativo = siguiente_correlativo + 1
    where id = v_serie.id;
    return v_serie.serie || '-' || lpad(v_corr::text, 4, '0');
  end if;

  -- Fallback: calcular desde el máximo existente en la tabla
  select coalesce(max(
    case
      when numero like 'PD-' || v_year || '-%'
        then (split_part(numero, '-', 3))::int
      else 0
    end
  ), 0) into v_max
  from public.partes_diarios
  where empresa_id = p_empresa_id;

  return 'PD-' || v_year || '-' || lpad((v_max + 1)::text, 4, '0');
end;
$$;

grant execute on function public.siguiente_numero_parte_diario(text) to authenticated;
