-- TIDEO ERP - Descartar borradores documentales desde la UI.
-- Sólo se pueden eliminar versiones en estado borrador. Las RPC son invoker
-- para que las políticas RLS sigan evaluándose con la sesión autenticada.

create policy biblioteca_condiciones_generales_delete_borrador
on public.biblioteca_condiciones_generales
for delete
using (
  estado = 'borrador'
  and public.usuario_tiene_empresa(empresa_id)
  and public.usuario_puede(empresa_id, 'parametros', 'editar')
  and exists (
    select 1
    from (select public.usuario_alcance_sociedades(empresa_id) as alcance) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
);

create policy condiciones_generales_segmentos_delete_borrador
on public.condiciones_generales_segmentos
for delete
using (
  exists (
    select 1
    from public.biblioteca_condiciones_generales biblioteca
    where biblioteca.id = condiciones_generales_id
      and biblioteca.estado = 'borrador'
      and public.usuario_tiene_empresa(biblioteca.empresa_id)
      and public.usuario_puede(biblioteca.empresa_id, 'parametros', 'editar')
      and exists (
        select 1
        from (select public.usuario_alcance_sociedades(biblioteca.empresa_id) as alcance) alcance_usuario
        where alcance_usuario.alcance is null
           or biblioteca.sociedad_id = any(alcance_usuario.alcance)
      )
  )
);

create policy plantillas_documento_bloques_delete_borrador
on public.plantillas_documento_bloques
for delete
using (
  estado = 'borrador'
  and public.usuario_tiene_empresa(empresa_id)
  and exists (
    select 1
    from public.tipos_documento_electronico tipo
    cross join lateral unnest(public.modulo_permiso_por_categoria(tipo.categoria_base, 'editar')) as permiso(modulo)
    where tipo.id = tipo_documento_id
      and public.usuario_puede(empresa_id, permiso.modulo, 'editar')
  )
  and exists (
    select 1
    from (select public.usuario_alcance_sociedades(empresa_id) as alcance) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
);

create policy documento_bloques_delete_borrador
on public.documento_bloques
for delete
using (
  exists (
    select 1
    from public.plantillas_documento_bloques plantilla
    join public.tipos_documento_electronico tipo
      on tipo.id = plantilla.tipo_documento_id
    cross join lateral unnest(public.modulo_permiso_por_categoria(tipo.categoria_base, 'editar')) as permiso(modulo)
    where plantilla.id = plantilla_documento_id
      and plantilla.estado = 'borrador'
      and public.usuario_tiene_empresa(plantilla.empresa_id)
      and public.usuario_puede(plantilla.empresa_id, permiso.modulo, 'editar')
      and exists (
        select 1
        from (select public.usuario_alcance_sociedades(plantilla.empresa_id) as alcance) alcance_usuario
        where alcance_usuario.alcance is null
           or plantilla.sociedad_id = any(alcance_usuario.alcance)
      )
  )
);

grant delete on public.biblioteca_condiciones_generales to authenticated;
grant delete on public.condiciones_generales_segmentos to authenticated;
grant delete on public.plantillas_documento_bloques to authenticated;
grant delete on public.documento_bloques to authenticated;

create or replace function public.descartar_borrador_condiciones_generales(p_biblioteca_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_eliminadas integer;
begin
  delete from public.condiciones_generales_segmentos
  where condiciones_generales_id = p_biblioteca_id;

  delete from public.biblioteca_condiciones_generales
  where id = p_biblioteca_id
    and estado = 'borrador';

  get diagnostics v_eliminadas = row_count;
  if v_eliminadas <> 1 then
    raise exception 'El borrador no existe, no es descartable o no tienes permiso para descartarlo.';
  end if;

  return true;
end;
$$;

create or replace function public.descartar_borrador_plantilla_documento(p_plantilla_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_eliminadas integer;
begin
  delete from public.documento_bloques
  where plantilla_documento_id = p_plantilla_id;

  delete from public.plantillas_documento_bloques
  where id = p_plantilla_id
    and estado = 'borrador';

  get diagnostics v_eliminadas = row_count;
  if v_eliminadas <> 1 then
    raise exception 'El borrador no existe, no es descartable o no tienes permiso para descartarlo.';
  end if;

  return true;
end;
$$;

grant execute on function public.descartar_borrador_condiciones_generales(uuid) to authenticated;
grant execute on function public.descartar_borrador_plantilla_documento(uuid) to authenticated;

select pg_notify('pgrst', 'reload schema');
