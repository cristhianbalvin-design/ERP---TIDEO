-- 484 · Permisos dinámicos por categoría de documento.
--
-- Mantiene el alcance por tenant/sociedad de la migración 478 y reemplaza
-- únicamente el módulo de permiso fijo. La función devuelve todos los módulos
-- autorizados para una combinación categoría/acción; cada operación conserva
-- una sola política permissive.

alter table public.tipos_documento_electronico
  drop constraint if exists tipos_documento_electronico_categoria_base_check;

alter table public.tipos_documento_electronico
  add constraint tipos_documento_electronico_categoria_base_check
  check (categoria_base in ('cotizacion', 'contrato_laboral'));

create or replace function public.modulo_permiso_por_categoria(
  p_categoria_base text,
  p_accion text
)
returns text[]
language sql
immutable
set search_path = public
as $$
  select case
    when p_categoria_base = 'cotizacion'
      and p_accion in ('ver', 'crear', 'editar')
      then array['parametros']::text[]
    when p_categoria_base = 'contrato_laboral'
      and p_accion = 'ver'
      then array['rrhh_admin', 'rrhh_operativo']::text[]
    when p_categoria_base = 'contrato_laboral'
      and p_accion in ('crear', 'editar')
      then array['rrhh_admin']::text[]
    else array[]::text[]
  end;
$$;

revoke all on function public.modulo_permiso_por_categoria(text, text) from public;
grant execute on function public.modulo_permiso_por_categoria(text, text) to authenticated;

drop policy if exists tipos_documento_electronico_select on public.tipos_documento_electronico;
create policy tipos_documento_electronico_select
on public.tipos_documento_electronico
for select
using (
  public.usuario_tiene_empresa(empresa_id)
  and exists (
    select 1
    from unnest(public.modulo_permiso_por_categoria(categoria_base, 'ver')) as permiso(modulo)
    where public.usuario_puede(empresa_id, permiso.modulo, 'ver')
  )
  and exists (
    select 1
    from (select public.usuario_alcance_sociedades(empresa_id) as alcance) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
);

drop policy if exists tipos_documento_electronico_insert on public.tipos_documento_electronico;
create policy tipos_documento_electronico_insert
on public.tipos_documento_electronico
for insert
with check (
  public.usuario_tiene_empresa(empresa_id)
  and exists (
    select 1
    from unnest(public.modulo_permiso_por_categoria(categoria_base, 'crear')) as permiso(modulo)
    where public.usuario_puede(empresa_id, permiso.modulo, 'crear')
  )
  and exists (
    select 1
    from (select public.usuario_alcance_sociedades(empresa_id) as alcance) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
);

drop policy if exists tipos_documento_electronico_update on public.tipos_documento_electronico;
create policy tipos_documento_electronico_update
on public.tipos_documento_electronico
for update
using (
  public.usuario_tiene_empresa(empresa_id)
  and exists (
    select 1
    from unnest(public.modulo_permiso_por_categoria(categoria_base, 'editar')) as permiso(modulo)
    where public.usuario_puede(empresa_id, permiso.modulo, 'editar')
  )
  and exists (
    select 1
    from (select public.usuario_alcance_sociedades(empresa_id) as alcance) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
)
with check (
  public.usuario_tiene_empresa(empresa_id)
  and exists (
    select 1
    from unnest(public.modulo_permiso_por_categoria(categoria_base, 'editar')) as permiso(modulo)
    where public.usuario_puede(empresa_id, permiso.modulo, 'editar')
  )
  and exists (
    select 1
    from (select public.usuario_alcance_sociedades(empresa_id) as alcance) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
);

drop policy if exists biblioteca_condiciones_generales_select on public.biblioteca_condiciones_generales;
create policy biblioteca_condiciones_generales_select
on public.biblioteca_condiciones_generales
for select
using (
  public.usuario_tiene_empresa(empresa_id)
  and exists (
    select 1
    from public.tipos_documento_electronico tipo
    cross join lateral unnest(public.modulo_permiso_por_categoria(tipo.categoria_base, 'ver')) as permiso(modulo)
    where tipo.id = tipo_documento_id
      and public.usuario_puede(empresa_id, permiso.modulo, 'ver')
  )
  and exists (
    select 1
    from (select public.usuario_alcance_sociedades(empresa_id) as alcance) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
);

drop policy if exists biblioteca_condiciones_generales_insert on public.biblioteca_condiciones_generales;
create policy biblioteca_condiciones_generales_insert
on public.biblioteca_condiciones_generales
for insert
with check (
  public.usuario_tiene_empresa(empresa_id)
  and exists (
    select 1
    from public.tipos_documento_electronico tipo
    cross join lateral unnest(public.modulo_permiso_por_categoria(tipo.categoria_base, 'crear')) as permiso(modulo)
    where tipo.id = tipo_documento_id
      and public.usuario_puede(empresa_id, permiso.modulo, 'crear')
  )
  and exists (
    select 1
    from (select public.usuario_alcance_sociedades(empresa_id) as alcance) alcance_usuario
    where alcance_usuario.alcance is null
       or sociedad_id = any(alcance_usuario.alcance)
  )
);

drop policy if exists biblioteca_condiciones_generales_update on public.biblioteca_condiciones_generales;
create policy biblioteca_condiciones_generales_update
on public.biblioteca_condiciones_generales
for update
using (
  public.usuario_tiene_empresa(empresa_id)
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
)
with check (
  public.usuario_tiene_empresa(empresa_id)
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

drop policy if exists condiciones_generales_segmentos_select on public.condiciones_generales_segmentos;
create policy condiciones_generales_segmentos_select
on public.condiciones_generales_segmentos
for select
using (
  exists (
    select 1
    from public.biblioteca_condiciones_generales biblioteca
    join public.tipos_documento_electronico tipo
      on tipo.id = biblioteca.tipo_documento_id
    cross join lateral unnest(public.modulo_permiso_por_categoria(tipo.categoria_base, 'ver')) as permiso(modulo)
    where biblioteca.id = condiciones_generales_id
      and public.usuario_tiene_empresa(biblioteca.empresa_id)
      and public.usuario_puede(biblioteca.empresa_id, permiso.modulo, 'ver')
      and exists (
        select 1
        from (select public.usuario_alcance_sociedades(biblioteca.empresa_id) as alcance) alcance_usuario
        where alcance_usuario.alcance is null
           or biblioteca.sociedad_id = any(alcance_usuario.alcance)
      )
  )
);

drop policy if exists condiciones_generales_segmentos_insert on public.condiciones_generales_segmentos;
create policy condiciones_generales_segmentos_insert
on public.condiciones_generales_segmentos
for insert
with check (
  exists (
    select 1
    from public.biblioteca_condiciones_generales biblioteca
    join public.tipos_documento_electronico tipo
      on tipo.id = biblioteca.tipo_documento_id
    cross join lateral unnest(public.modulo_permiso_por_categoria(tipo.categoria_base, 'crear')) as permiso(modulo)
    where biblioteca.id = condiciones_generales_id
      and public.usuario_tiene_empresa(biblioteca.empresa_id)
      and public.usuario_puede(biblioteca.empresa_id, permiso.modulo, 'crear')
      and exists (
        select 1
        from (select public.usuario_alcance_sociedades(biblioteca.empresa_id) as alcance) alcance_usuario
        where alcance_usuario.alcance is null
           or biblioteca.sociedad_id = any(alcance_usuario.alcance)
      )
  )
);

drop policy if exists condiciones_generales_segmentos_update on public.condiciones_generales_segmentos;
create policy condiciones_generales_segmentos_update
on public.condiciones_generales_segmentos
for update
using (
  exists (
    select 1
    from public.biblioteca_condiciones_generales biblioteca
    join public.tipos_documento_electronico tipo
      on tipo.id = biblioteca.tipo_documento_id
    cross join lateral unnest(public.modulo_permiso_por_categoria(tipo.categoria_base, 'editar')) as permiso(modulo)
    where biblioteca.id = condiciones_generales_id
      and public.usuario_tiene_empresa(biblioteca.empresa_id)
      and public.usuario_puede(biblioteca.empresa_id, permiso.modulo, 'editar')
      and exists (
        select 1
        from (select public.usuario_alcance_sociedades(biblioteca.empresa_id) as alcance) alcance_usuario
        where alcance_usuario.alcance is null
           or biblioteca.sociedad_id = any(alcance_usuario.alcance)
      )
  )
)
with check (
  exists (
    select 1
    from public.biblioteca_condiciones_generales biblioteca
    join public.tipos_documento_electronico tipo
      on tipo.id = biblioteca.tipo_documento_id
    cross join lateral unnest(public.modulo_permiso_por_categoria(tipo.categoria_base, 'editar')) as permiso(modulo)
    where biblioteca.id = condiciones_generales_id
      and public.usuario_tiene_empresa(biblioteca.empresa_id)
      and public.usuario_puede(biblioteca.empresa_id, permiso.modulo, 'editar')
      and exists (
        select 1
        from (select public.usuario_alcance_sociedades(biblioteca.empresa_id) as alcance) alcance_usuario
        where alcance_usuario.alcance is null
           or biblioteca.sociedad_id = any(alcance_usuario.alcance)
      )
  )
);
