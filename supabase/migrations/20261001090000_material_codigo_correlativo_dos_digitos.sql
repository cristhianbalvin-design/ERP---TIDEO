-- Generación de códigos de material:
-- código de grupo + código de familia + código de subfamilia + correlativo desde 01.
-- Los códigos históricos con correlativo de cuatro dígitos siguen siendo válidos;
-- solo se toma su parte numérica para continuar la secuencia.
create or replace function public.generar_codigo_material(
  p_subfamilia_id text,
  p_empresa_id    text
) returns text
language plpgsql
as $$
declare
  v_cod_grupo     text;
  v_cod_familia   text;
  v_cod_subfam    text;
  v_correlativo   int;
  v_prefix        text;
begin
  select mg.codigo, mf.codigo, ms.codigo
    into v_cod_grupo, v_cod_familia, v_cod_subfam
    from public.material_subfamilias ms
    join public.material_familias mf on mf.id = ms.familia_id
    join public.material_grupos mg on mg.id = mf.grupo_id
   where ms.id = p_subfamilia_id;

  if v_cod_subfam is null then
    return null;
  end if;

  v_prefix := coalesce(v_cod_grupo, '') || coalesce(v_cod_familia, '') || v_cod_subfam;

  select coalesce(max(substring(m.codigo from length(v_prefix) + 1)::integer), 0) + 1
    into v_correlativo
    from public.materiales m
   where m.subfamilia_id = p_subfamilia_id
     and m.empresa_id = p_empresa_id
     and m.codigo like v_prefix || '%'
     and length(m.codigo) > length(v_prefix)
     and substring(m.codigo from length(v_prefix) + 1) ~ '^[0-9]+$';

  return v_prefix || lpad(v_correlativo::text, 2, '0');
end;
$$;

select pg_notify('pgrst', 'reload schema');
