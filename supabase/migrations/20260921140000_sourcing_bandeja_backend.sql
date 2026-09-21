-- Backend de bandeja de sourcing por línea de SOLPE.
-- No crea UI ni modifica la cadena de creación de OCs.

create or replace function public.obtener_lineas_sourcing(p_empresa_id text)
returns table (
  solpe_id text,
  solpe_codigo text,
  solpe_estado text,
  solpe_descripcion text,
  solpe_item_id text,
  item_index bigint,
  material_id text,
  material_codigo text,
  material_descripcion text,
  familia_id text,
  familia_codigo text,
  familia_nombre text,
  cantidad numeric,
  unidad text,
  precio_unitario numeric,
  proveedores_candidatos jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if nullif(btrim(coalesce(p_empresa_id, '')), '') is null then
    raise exception 'El empresa_id es obligatorio' using errcode = '22023';
  end if;

  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No autorizado para consultar el tenant %', p_empresa_id
      using errcode = '42501';
  end if;

  if not public.usuario_puede(p_empresa_id, 'ordenes_compra', 'ver') then
    raise exception 'No tienes permiso para consultar candidatos de sourcing'
      using errcode = '42501';
  end if;

  return query
  with lineas as (
    select
      s.id as solpe_id,
      s.codigo as solpe_codigo,
      s.estado as solpe_estado,
      s.descripcion as solpe_descripcion,
      item.item ->> 'id' as solpe_item_id,
      item.ordinality as item_index,
      nullif(btrim(item.item ->> 'material_id'), '') as material_id,
      case
        when (item.item ->> 'cantidad') ~ '^-?[0-9]+(\.[0-9]+)?$'
          then (item.item ->> 'cantidad')::numeric
        else null
      end as cantidad,
      nullif(btrim(item.item ->> 'unidad'), '') as unidad,
      case
        when (item.item ->> 'precio_unitario') ~ '^-?[0-9]+(\.[0-9]+)?$'
          then (item.item ->> 'precio_unitario')::numeric
        else null
      end as precio_unitario,
      coalesce(nullif(btrim(item.item ->> 'descripcion'), ''), 'Item de compra') as item_descripcion
    from public.solpe_interna s
    cross join lateral jsonb_array_elements(coalesce(s.items, '[]'::jsonb)) with ordinality as item(item, ordinality)
    where s.empresa_id = p_empresa_id
      and lower(trim(coalesce(s.estado, ''))) in ('aprobada', 'oc_parcial')
      and nullif(btrim(item.item ->> 'oc_id'), '') is null
  ),
  candidatos as (
    select
      l.solpe_id,
      l.solpe_codigo,
      l.solpe_estado,
      l.solpe_descripcion,
      l.solpe_item_id,
      l.item_index,
      l.material_id,
      m.codigo as material_codigo,
      coalesce(m.descripcion, l.item_descripcion) as material_descripcion,
      m.familia_id,
      f.codigo as familia_codigo,
      f.nombre as familia_nombre,
      l.cantidad,
      l.unidad,
      l.precio_unitario,
      p.id as proveedor_id,
      p.codigo as proveedor_codigo,
      p.razon_social as proveedor_razon_social,
      p.nombre_comercial as proveedor_nombre_comercial,
      coalesce(p.total_ocs, 0) as total_ocs,
      p.fecha_ultima_oc,
      row_number() over (
        partition by l.solpe_id, l.item_index
        order by coalesce(p.total_ocs, 0) desc,
                 p.fecha_ultima_oc desc nulls last,
                 p.codigo,
                 p.id
      ) as ranking
    from lineas l
    left join public.materiales m
      on m.id = l.material_id
     and m.empresa_id = p_empresa_id
    left join public.material_familias f
      on f.id = m.familia_id
     and f.empresa_id = p_empresa_id
    left join public.proveedor_familia pf
      on pf.empresa_id = p_empresa_id
     and pf.familia_id = m.familia_id
    left join public.proveedores p
      on p.id = pf.proveedor_id
     and p.empresa_id = p_empresa_id
     and p.estado is distinct from 'bloqueado'
  )
  select
    c.solpe_id,
    c.solpe_codigo,
    c.solpe_estado,
    c.solpe_descripcion,
    c.solpe_item_id,
    c.item_index,
    c.material_id,
    c.material_codigo,
    c.material_descripcion,
    c.familia_id,
    c.familia_codigo,
    c.familia_nombre,
    c.cantidad,
    c.unidad,
    c.precio_unitario,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'proveedor_id', c.proveedor_id,
          'proveedor_codigo', c.proveedor_codigo,
          'razon_social', c.proveedor_razon_social,
          'nombre_comercial', c.proveedor_nombre_comercial,
          'familia_id', c.familia_id,
          'total_ocs', c.total_ocs,
          'fecha_ultima_oc', c.fecha_ultima_oc,
          'ranking', c.ranking
        )
        order by c.ranking
      ) filter (where c.proveedor_id is not null),
      '[]'::jsonb
    ) as proveedores_candidatos
  from candidatos c
  group by
    c.solpe_id,
    c.solpe_codigo,
    c.solpe_estado,
    c.solpe_descripcion,
    c.solpe_item_id,
    c.item_index,
    c.material_id,
    c.material_codigo,
    c.material_descripcion,
    c.familia_id,
    c.familia_codigo,
    c.familia_nombre,
    c.cantidad,
    c.unidad,
    c.precio_unitario
  order by c.solpe_codigo, c.item_index;
end;
$$;

revoke all on function public.obtener_lineas_sourcing(text) from public;
grant execute on function public.obtener_lineas_sourcing(text) to authenticated;

do $$
declare
  v_rol_id text;
begin
  select r.id
    into v_rol_id
    from public.roles r
   where r.empresa_id = 'emp_2000000000'
     and lower(trim(r.nombre)) = 'jefe de operaciones'
     and r.categoria = 'operaciones'
     and r.nivel_jerarquico = 'jefatura'
   limit 1;

  if v_rol_id is null then
    raise exception 'No se encontró el rol Jefe de Operaciones de PRUEBA';
  end if;

  insert into public.permisos_roles (
    rol_id,
    pantalla,
    puede_ver,
    puede_crear,
    puede_editar,
    puede_anular,
    puede_aprobar,
    puede_exportar,
    puede_ver_costos,
    puede_ver_finanzas
  ) values (
    v_rol_id,
    'ordenes_compra',
    true,
    true,
    true,
    false,
    false,
    false,
    false,
    false
  )
  on conflict (rol_id, pantalla) do update set
    puede_ver = excluded.puede_ver,
    puede_crear = excluded.puede_crear,
    puede_editar = excluded.puede_editar,
    puede_anular = excluded.puede_anular,
    puede_aprobar = excluded.puede_aprobar,
    puede_exportar = excluded.puede_exportar,
    puede_ver_costos = excluded.puede_ver_costos,
    puede_ver_finanzas = excluded.puede_ver_finanzas,
    updated_at = now();
end;
$$;

notify pgrst, 'reload schema';
