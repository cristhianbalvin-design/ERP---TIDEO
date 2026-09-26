-- 556 · Correlativo atómico para códigos comerciales de proyectos.
-- Usa el catálogo genérico de series documentarias, separado de Cotizaciones.

begin;
create or replace function public.siguiente_codigo_proyecto(p_empresa_id text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_year text := to_char(current_date, 'YYYY');
  v_serie record;
  v_max integer;
  v_corr integer;
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tienes acceso al tenant %.', p_empresa_id;
  end if;

  if not public.usuario_puede(p_empresa_id, 'tarifario_comercial', 'editar') then
    raise exception 'No tienes permiso para generar códigos de proyectos en este tenant.';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('siguiente_codigo_proyecto:' || p_empresa_id, 0)
  );

  select * into v_serie
  from public.series_documentarias
  where empresa_id = p_empresa_id
    and documento = 'Proyectos'
    and estado = 'activo'
  order by created_at, id
  limit 1
  for update;

  if found then
    v_corr := v_serie.siguiente_correlativo;
    update public.series_documentarias
    set siguiente_correlativo = siguiente_correlativo + 1,
        updated_at = now()
    where id = v_serie.id;
    return v_serie.serie || '-' || lpad(v_corr::text, 4, '0');
  end if;

  select coalesce(max(
    substring(codigo from '^PROY-' || v_year || '-([0-9]+)$')::integer
  ), 0)
  into v_max
  from public.proyectos
  where empresa_id = p_empresa_id
    and codigo ~ ('^PROY-' || v_year || '-[0-9]+$');

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
    'ser_proyectos_fallback_' || replace(gen_random_uuid()::text, '-', ''),
    p_empresa_id,
    'Proyectos',
    'PROY-' || v_year,
    v_corr + 1,
    'Anual por empresa',
    'activo'
  );

  return 'PROY-' || v_year || '-' || lpad(v_corr::text, 4, '0');
end;
$$;
revoke all on function public.siguiente_codigo_proyecto(text) from public, anon;
grant execute on function public.siguiente_codigo_proyecto(text) to authenticated, service_role;
select pg_notify('pgrst', 'reload schema');
commit;
