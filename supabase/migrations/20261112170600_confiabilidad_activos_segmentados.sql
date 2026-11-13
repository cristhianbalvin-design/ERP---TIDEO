-- Activos de la empresa con su segmento de confiabilidad en una sola consulta (evita una llamada por activo).
create function public.conf_activos_segmentados(p_empresa_id text)
returns table(id text, codigo text, nombre text, marca text, modelo text, propietario_tipo text, tipo_activo text, horometro_actual numeric, estado text, segmento text)
language sql stable security invoker set search_path = public, pg_temp as $$
  select a.id, a.codigo, a.nombre, a.marca, a.modelo, a.propietario_tipo, a.tipo_activo, a.horometro_actual, a.estado,
    public.conf_segmento_activo(a.id)
  from public.activos a
  where a.empresa_id = p_empresa_id and public.usuario_tiene_empresa(p_empresa_id)
  order by a.codigo;
$$;
revoke all on function public.conf_activos_segmentados(text) from public, anon;
grant execute on function public.conf_activos_segmentados(text) to authenticated;

do $$ begin
  if to_regprocedure('public.conf_activos_segmentados(text)') is null then raise exception 'Falta conf_activos_segmentados'; end if;
  if has_function_privilege('anon','public.conf_activos_segmentados(text)','execute') then raise exception 'Privilegios incorrectos'; end if;
end $$;
