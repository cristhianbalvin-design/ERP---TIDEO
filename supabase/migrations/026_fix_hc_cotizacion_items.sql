-- TIDEO ERP - Correccion de partidas de Cotizacion generadas desde Hoja de Costeo
-- Ejecutar en proyectos existentes despues de 025_maestro_industrias.sql.
-- Normaliza los items generados por la RPC para que Cotizaciones use precio_unitario,
-- no costo_unitario, y aplique el margen objetivo de la Hoja de Costeo.

create or replace function public.aprobar_hoja_costeo_y_crear_cotizacion(
  p_empresa_id text,
  p_hoja_costeo_id text,
  p_cotizacion_id text,
  p_numero text,
  p_moneda text default 'PEN',
  p_validez text default '30 dias'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hc public.hojas_costeo%rowtype;
  v_cot public.cotizaciones%rowtype;
  v_items jsonb;
  v_divisor numeric;
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tienes acceso al tenant %.', p_empresa_id;
  end if;

  if not (
    public.usuario_puede(p_empresa_id, 'hoja_costeo', 'aprobar')
    or public.usuario_puede(p_empresa_id, 'cotizaciones', 'crear')
  ) then
    raise exception 'No tienes permiso para aprobar hojas de costeo.';
  end if;

  select * into v_hc
  from public.hojas_costeo
  where id = p_hoja_costeo_id
    and empresa_id = p_empresa_id
  for update;

  if not found then
    raise exception 'Hoja de Costeo no encontrada.';
  end if;

  if v_hc.estado = 'aprobada' and v_hc.cotizacion_id is not null then
    select * into v_cot from public.cotizaciones where id = v_hc.cotizacion_id;
    return jsonb_build_object('hoja_costeo', to_jsonb(v_hc), 'cotizacion', to_jsonb(v_cot));
  end if;

  v_divisor := greatest(0.05, 1 - least(greatest(coalesce(v_hc.margen_objetivo_pct, 35), 0), 95) / 100);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', coalesce(item->>'id', origen || '_' || md5(item::text)),
    'descripcion', coalesce(nullif(item->>'descripcion', ''), 'Partida de costeo'),
    'tipo', case when origen = 'materiales' then 'material' else 'servicio' end,
    'cantidad', coalesce(nullif(item->>'cantidad', '')::numeric, 0),
    'unidad', coalesce(nullif(item->>'unidad', ''), 'und'),
    'precio_unitario', round(coalesce(nullif(item->>'costo_unitario', '')::numeric, nullif(item->>'precio_unitario', '')::numeric, 0) / v_divisor),
    'subtotal', coalesce(nullif(item->>'cantidad', '')::numeric, 0)
      * round(coalesce(nullif(item->>'costo_unitario', '')::numeric, nullif(item->>'precio_unitario', '')::numeric, 0) / v_divisor)
  )), '[]'::jsonb)
  into v_items
  from (
    select 'mano_obra' as origen, item from jsonb_array_elements(coalesce(v_hc.mano_obra, '[]'::jsonb)) item
    union all
    select 'materiales' as origen, item from jsonb_array_elements(coalesce(v_hc.materiales, '[]'::jsonb)) item
    union all
    select 'servicios_terceros' as origen, item from jsonb_array_elements(coalesce(v_hc.servicios_terceros, '[]'::jsonb)) item
    union all
    select 'logistica' as origen, item from jsonb_array_elements(coalesce(v_hc.logistica, '[]'::jsonb)) item
  ) src;

  insert into public.cotizaciones (
    id, empresa_id, oportunidad_id, cuenta_id, numero, version, estado, fecha,
    items, subtotal, descuento_global_pct, descuento_global, base_imponible,
    igv_pct, igv, total, moneda, condicion_pago, hoja_costeo_id
  )
  values (
    p_cotizacion_id, p_empresa_id, v_hc.oportunidad_id, v_hc.cuenta_id,
    p_numero, 1, 'borrador', current_date,
    v_items, coalesce(v_hc.precio_sugerido_sin_igv, 0), 0, 0,
    coalesce(v_hc.precio_sugerido_sin_igv, 0), 18,
    round(coalesce(v_hc.precio_sugerido_sin_igv, 0) * 0.18),
    coalesce(v_hc.precio_sugerido_total, 0),
    coalesce(p_moneda, 'PEN'), p_validez, p_hoja_costeo_id
  )
  returning * into v_cot;

  update public.hojas_costeo
  set estado = 'aprobada',
      cotizacion_id = p_cotizacion_id,
      updated_at = now()
  where id = p_hoja_costeo_id
  returning * into v_hc;

  return jsonb_build_object('hoja_costeo', to_jsonb(v_hc), 'cotizacion', to_jsonb(v_cot));
end;
$$;

grant execute on function public.aprobar_hoja_costeo_y_crear_cotizacion(
  text, text, text, text, text, text
) to authenticated;

with normalizados as (
  select
    c.id as cotizacion_id,
    coalesce(jsonb_agg(jsonb_build_object(
      'id', coalesce(src.item->>'id', src.origen || '_' || md5(src.item::text)),
      'descripcion', coalesce(nullif(src.item->>'descripcion', ''), 'Partida de costeo'),
      'tipo', case when src.origen = 'materiales' then 'material' else 'servicio' end,
      'cantidad', coalesce(nullif(src.item->>'cantidad', '')::numeric, 0),
      'unidad', coalesce(nullif(src.item->>'unidad', ''), 'und'),
      'precio_unitario', round(coalesce(nullif(src.item->>'costo_unitario', '')::numeric, nullif(src.item->>'precio_unitario', '')::numeric, 0) / src.divisor),
      'subtotal', coalesce(nullif(src.item->>'cantidad', '')::numeric, 0)
        * round(coalesce(nullif(src.item->>'costo_unitario', '')::numeric, nullif(src.item->>'precio_unitario', '')::numeric, 0) / src.divisor)
    )), '[]'::jsonb) as items
  from public.cotizaciones c
  join public.hojas_costeo h on h.id = c.hoja_costeo_id
  cross join lateral (
    select 'mano_obra' as origen, item, greatest(0.05, 1 - least(greatest(coalesce(h.margen_objetivo_pct, 35), 0), 95) / 100) as divisor
    from jsonb_array_elements(coalesce(h.mano_obra, '[]'::jsonb)) item
    union all
    select 'materiales' as origen, item, greatest(0.05, 1 - least(greatest(coalesce(h.margen_objetivo_pct, 35), 0), 95) / 100) as divisor
    from jsonb_array_elements(coalesce(h.materiales, '[]'::jsonb)) item
    union all
    select 'servicios_terceros' as origen, item, greatest(0.05, 1 - least(greatest(coalesce(h.margen_objetivo_pct, 35), 0), 95) / 100) as divisor
    from jsonb_array_elements(coalesce(h.servicios_terceros, '[]'::jsonb)) item
    union all
    select 'logistica' as origen, item, greatest(0.05, 1 - least(greatest(coalesce(h.margen_objetivo_pct, 35), 0), 95) / 100) as divisor
    from jsonb_array_elements(coalesce(h.logistica, '[]'::jsonb)) item
  ) src
  where c.hoja_costeo_id is not null
  group by c.id
)
update public.cotizaciones c
set items = n.items
from normalizados n
where c.id = n.cotizacion_id;

select pg_notify('pgrst', 'reload schema');
