-- F3a · of_buscar_materiales: sin texto devuelve el catálogo activo completo (para el
-- selector con buscador DxReferenceSelector, que filtra en el navegador); con texto, 20.
-- Parte de la definición vigente creada en 20261105100000_of_f3a_ficha_editable.sql;
-- solo cambia el límite.
create or replace function public.of_buscar_materiales(p_of_id uuid, p_texto text)
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v public.ordenes_fabricacion%rowtype;
  v_txt text := lower(btrim(coalesce(p_texto, '')));
  v_q text := '%' || lower(btrim(coalesce(p_texto, ''))) || '%';
begin
  select * into v from public.ordenes_fabricacion where id = p_of_id;
  if not found then raise exception 'La OF no existe.'; end if;
  if not public.usuario_tiene_empresa(v.empresa_id) or not public.usuario_puede(v.empresa_id, 'of', 'ver') then
    raise exception 'No tienes permiso para ver esta OF.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(x order by x->>'descripcion')
      from (
        select jsonb_build_object(
                 'id', m.id, 'codigo', m.codigo, 'descripcion', m.descripcion, 'unidad', m.unidad,
                 'costo_unitario', case when coalesce(m.costo_promedio, 0) > 0
                                        then round(public.of_convertir_moneda(m.costo_promedio, coalesce(m.moneda, 'PEN'), v.moneda), 4) end,
                 'disponible', coalesce((select sum(s.disponible) from public.stock s
                                          where s.material_id = m.id and s.empresa_id = v.empresa_id
                                            and (v.sociedad_id is null or s.sociedad_id is null or s.sociedad_id = v.sociedad_id)), 0)) x
          from public.materiales m
         where m.empresa_id = v.empresa_id and lower(coalesce(m.estado, '')) = 'activo'
           and (v_txt = '' or lower(m.descripcion) like v_q or lower(coalesce(m.codigo, '')) like v_q)
         order by m.descripcion
         limit case when v_txt = '' then null else 20 end) q), '[]'::jsonb);
end;
$$;

do $$
begin
  if position('limit case when v_txt' in pg_get_functiondef('public.of_buscar_materiales(uuid,text)'::regprocedure)) = 0 then
    raise exception 'F3a: of_buscar_materiales no se actualizó';
  end if;
  if has_function_privilege('anon', 'public.of_buscar_materiales(uuid, text)', 'execute') then
    raise exception 'F3a: anon no debe ejecutar of_buscar_materiales';
  end if;
end $$;
