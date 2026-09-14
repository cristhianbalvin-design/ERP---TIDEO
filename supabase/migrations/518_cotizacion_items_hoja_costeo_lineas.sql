-- 518 · Incluir líneas relacionales del wizard al aprobar una Hoja de Costeo.
--
-- Mantiene JSONB para servicios_terceros y logistica. Para mano_obra y
-- materiales conserva la fuente JSONB de hojas legadas y usa las tablas hijas
-- solo si el JSONB del bloque está vacío, evitando doble conteo en hojas híbridas.

create or replace function public._aprobar_hoja_costeo_y_crear_cotizacion_impl_414(
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
    select 'mano_obra' as origen, item
    from jsonb_array_elements(coalesce(v_hc.mano_obra, '[]'::jsonb)) item
    union all
    select 'materiales', item
    from jsonb_array_elements(coalesce(v_hc.materiales, '[]'::jsonb)) item
    union all
    select 'servicios_terceros', item
    from jsonb_array_elements(coalesce(v_hc.servicios_terceros, '[]'::jsonb)) item
    union all
    select 'logistica', item
    from jsonb_array_elements(coalesce(v_hc.logistica, '[]'::jsonb)) item
    union all
    select 'mano_obra', jsonb_build_object(
      'id', 'mo_' || l.id,
      'descripcion', coalesce(nullif(concat_ws(' · ', ft.nombre, tsi.nombre, ce.nombre), ''), 'Mano de obra'),
      'cantidad', l.horas,
      'unidad', 'hora',
      'costo_unitario', l.costo_hora_snapshot
    )
    from public.hoja_costeo_lineas_mano_obra l
    left join public.familia_trabajo ft on ft.id = l.familia_trabajo_id
    left join public.tipos_servicio_interno tsi on tsi.id = l.actividad_id
    left join public.cargos_empresa ce on ce.id = l.cargo_id
    where l.hoja_costeo_id = v_hc.id
      and jsonb_array_length(coalesce(v_hc.mano_obra, '[]'::jsonb)) = 0
    union all
    select 'materiales', jsonb_build_object(
      'id', 'mat_' || l.id,
      'descripcion', coalesce(nullif(m.descripcion, ''), 'Material de costeo'),
      'cantidad', l.cantidad,
      'unidad', coalesce(nullif(m.unidad, ''), 'und'),
      'costo_unitario', l.costo_unitario_snapshot
    )
    from public.hoja_costeo_lineas_materiales l
    left join public.materiales m on m.id = l.material_id
    where l.hoja_costeo_id = v_hc.id
      and jsonb_array_length(coalesce(v_hc.materiales, '[]'::jsonb)) = 0
    union all
    select 'activos', jsonb_build_object(
      'id', 'act_' || l.id,
      'descripcion', coalesce(nullif(a.nombre, ''), 'Activo de costeo'),
      'cantidad', case when l.horas_uso_estimadas is null then 1 else l.horas_uso_estimadas end,
      'unidad', case when l.horas_uso_estimadas is null then 'servicio' else 'hora' end,
      'costo_unitario', case
        when l.horas_uso_estimadas is null then l.depreciacion_asignada
        else l.depreciacion_asignada / nullif(l.horas_uso_estimadas, 0)
      end
    )
    from public.hoja_costeo_lineas_activos l
    left join public.activos a on a.id = l.activo_id
    where l.hoja_costeo_id = v_hc.id
  ) src;

  insert into public.cotizaciones (
    id, empresa_id, oportunidad_id, cuenta_id, numero, version, estado, fecha,
    items, subtotal, descuento_global_pct, descuento_global, base_imponible,
    igv_pct, igv, total, moneda, condicion_pago, hoja_costeo_id
  ) values (
    p_cotizacion_id, p_empresa_id, v_hc.oportunidad_id, v_hc.cuenta_id,
    p_numero, 1, 'borrador', current_date,
    v_items, coalesce(v_hc.precio_sugerido_sin_igv, 0), 0, 0,
    coalesce(v_hc.precio_sugerido_sin_igv, 0), 18,
    round(coalesce(v_hc.precio_sugerido_sin_igv, 0) * 0.18),
    coalesce(v_hc.precio_sugerido_total, 0),
    coalesce(p_moneda, 'PEN'), p_validez, p_hoja_costeo_id
  ) returning * into v_cot;

  update public.hojas_costeo
  set estado = 'aprobada', cotizacion_id = p_cotizacion_id, updated_at = now()
  where id = p_hoja_costeo_id
  returning * into v_hc;

  return jsonb_build_object('hoja_costeo', to_jsonb(v_hc), 'cotizacion', to_jsonb(v_cot));
end;
$$;

create or replace function public.aprobar_hoja_costeo_y_crear_cotizacion_sociedad(
  p_empresa_id text,
  p_sociedad_id uuid,
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
  v_owner_user_id uuid;
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tienes acceso al tenant %.', p_empresa_id;
  end if;

  select * into v_hc
  from public.hojas_costeo
  where id = p_hoja_costeo_id
    and empresa_id = p_empresa_id
    and sociedad_id = p_sociedad_id
  for update;

  if not found then
    raise exception 'Hoja de Costeo no encontrada para la sociedad seleccionada.';
  end if;
  if v_hc.estado = 'aprobada' and v_hc.cotizacion_id is not null then
    select * into v_cot from public.cotizaciones where id = v_hc.cotizacion_id;
    return jsonb_build_object('hoja_costeo', to_jsonb(v_hc), 'cotizacion', to_jsonb(v_cot));
  end if;
  if coalesce(v_hc.estado, 'borrador') <> 'en_revision' then
    raise exception 'Solo se pueden aprobar Hojas de Costeo enviadas a revision.';
  end if;

  select coalesce(
    o.responsable_id,
    (
      select pa.auth_user_id
      from public.personal_administrativo pa
      where pa.empresa_id = o.empresa_id
        and pa.auth_user_id is not null
        and nullif(trim(o.responsable), '') is not null
        and lower(trim(pa.nombre)) = lower(trim(o.responsable))
      limit 1
    )
  ) into v_owner_user_id
  from public.oportunidades o
  where o.id = v_hc.oportunidad_id and o.empresa_id = p_empresa_id;

  if not public.usuario_puede_aprobar_hoja_costeo(p_empresa_id, v_owner_user_id) then
    raise exception 'Solo la jefatura comercial o un nivel superior puede aprobar esta Hoja de Costeo.';
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
  )), '[]'::jsonb) into v_items
  from (
    select 'mano_obra' as origen, item
    from jsonb_array_elements(coalesce(v_hc.mano_obra, '[]'::jsonb)) item
    union all
    select 'materiales', item
    from jsonb_array_elements(coalesce(v_hc.materiales, '[]'::jsonb)) item
    union all
    select 'servicios_terceros', item
    from jsonb_array_elements(coalesce(v_hc.servicios_terceros, '[]'::jsonb)) item
    union all
    select 'logistica', item
    from jsonb_array_elements(coalesce(v_hc.logistica, '[]'::jsonb)) item
    union all
    select 'mano_obra', jsonb_build_object(
      'id', 'mo_' || l.id,
      'descripcion', coalesce(nullif(concat_ws(' · ', ft.nombre, tsi.nombre, ce.nombre), ''), 'Mano de obra'),
      'cantidad', l.horas,
      'unidad', 'hora',
      'costo_unitario', l.costo_hora_snapshot
    )
    from public.hoja_costeo_lineas_mano_obra l
    left join public.familia_trabajo ft on ft.id = l.familia_trabajo_id
    left join public.tipos_servicio_interno tsi on tsi.id = l.actividad_id
    left join public.cargos_empresa ce on ce.id = l.cargo_id
    where l.hoja_costeo_id = v_hc.id
      and jsonb_array_length(coalesce(v_hc.mano_obra, '[]'::jsonb)) = 0
    union all
    select 'materiales', jsonb_build_object(
      'id', 'mat_' || l.id,
      'descripcion', coalesce(nullif(m.descripcion, ''), 'Material de costeo'),
      'cantidad', l.cantidad,
      'unidad', coalesce(nullif(m.unidad, ''), 'und'),
      'costo_unitario', l.costo_unitario_snapshot
    )
    from public.hoja_costeo_lineas_materiales l
    left join public.materiales m on m.id = l.material_id
    where l.hoja_costeo_id = v_hc.id
      and jsonb_array_length(coalesce(v_hc.materiales, '[]'::jsonb)) = 0
    union all
    select 'activos', jsonb_build_object(
      'id', 'act_' || l.id,
      'descripcion', coalesce(nullif(a.nombre, ''), 'Activo de costeo'),
      'cantidad', case when l.horas_uso_estimadas is null then 1 else l.horas_uso_estimadas end,
      'unidad', case when l.horas_uso_estimadas is null then 'servicio' else 'hora' end,
      'costo_unitario', case
        when l.horas_uso_estimadas is null then l.depreciacion_asignada
        else l.depreciacion_asignada / nullif(l.horas_uso_estimadas, 0)
      end
    )
    from public.hoja_costeo_lineas_activos l
    left join public.activos a on a.id = l.activo_id
    where l.hoja_costeo_id = v_hc.id
  ) src;

  insert into public.cotizaciones (
    id, empresa_id, sociedad_id, oportunidad_id, cuenta_id, responsable_id,
    numero, version, estado, fecha, items, subtotal, descuento_global_pct,
    descuento_global, base_imponible, igv_pct, igv, total, moneda,
    condicion_pago, hoja_costeo_id
  ) values (
    p_cotizacion_id, p_empresa_id, p_sociedad_id, v_hc.oportunidad_id,
    v_hc.cuenta_id, v_owner_user_id, p_numero, 1, 'borrador', current_date,
    v_items, coalesce(v_hc.precio_sugerido_sin_igv, 0), 0, 0,
    coalesce(v_hc.precio_sugerido_sin_igv, 0), 18,
    round(coalesce(v_hc.precio_sugerido_sin_igv, 0) * 0.18),
    coalesce(v_hc.precio_sugerido_total, 0), coalesce(p_moneda, 'PEN'),
    p_validez, p_hoja_costeo_id
  ) returning * into v_cot;

  update public.hojas_costeo
  set estado = 'aprobada', cotizacion_id = p_cotizacion_id, updated_at = now()
  where id = p_hoja_costeo_id
  returning * into v_hc;

  return jsonb_build_object('hoja_costeo', to_jsonb(v_hc), 'cotizacion', to_jsonb(v_cot));
end;
$$;

select pg_notify('pgrst', 'reload schema');
