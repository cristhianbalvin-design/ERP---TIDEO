-- 521 · Las Cotizaciones Especiales originadas en Hoja de Costeo se crean
-- como borradores editables. La Hoja queda vinculada como referencia, pero
-- sus partidas se copian al snapshot de items de la cotización.
--
-- Mantiene JSONB para servicios_terceros y logistica. Para mano_obra y
-- materiales conserva el JSONB histórico y usa tablas hijas sólo cuando el
-- bloque JSONB correspondiente está vacío, evitando doble conteo en hojas
-- híbridas. Activos siempre proviene de su tabla relacional.

-- La Hoja queda como referencia aun cuando sus partidas ya fueron copiadas a
-- un borrador manual editable. Se preserva la regla original para el origen
-- `hoja_costeo` histórico y se habilita el nuevo caso `manual` + referencia.
alter table public.cotizaciones_especiales
  drop constraint if exists cotizaciones_especiales_origen_hoja_check;

alter table public.cotizaciones_especiales
  add constraint cotizaciones_especiales_origen_hoja_check
  check (
    origen_items = 'manual'
    or (origen_items = 'hoja_costeo' and hoja_costeo_id is not null)
  );

create or replace function public.crear_cotizacion_especial(
  p_tipo_documento_id uuid,
  p_plantilla_documento_id uuid,
  p_cuenta_id text,
  p_oportunidad_id text,
  p_origen_items text,
  p_hoja_costeo_id text,
  p_moneda text,
  p_items jsonb,
  p_contacto_id text default null,
  p_validez_tipo text default 'dias',
  p_validez_dias integer default 30,
  p_validez_fecha date default null,
  p_hitos_activos boolean default false,
  p_hitos_pago jsonb default '[]'::jsonb,
  p_activo_id text default null,
  p_recepcion_id text default null
)
returns table(id uuid, numero text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo public.tipos_documento_electronico%rowtype;
  v_hoja public.hojas_costeo%rowtype;
  v_items jsonb;
  v_subtotal numeric;
  v_igv numeric;
  v_total numeric;
  v_numero text;
  v_id uuid := gen_random_uuid();
  v_margen numeric;
  v_divisor numeric;
  v_linea record;
  v_cantidad numeric;
  v_costo_unitario numeric;
  v_precio_unitario numeric;
  v_orden integer := 0;
  v_suma_subtotales_items numeric;
  v_ajuste_redondeo numeric;
  v_indice_ajuste integer;
  v_item_ajuste jsonb;
  v_cantidad_ajuste numeric;
  v_precio_ajuste numeric;
  v_alcance uuid[];
  v_moneda text;
  v_hitos jsonb;
begin
  if auth.uid() is null then
    raise exception 'Debe iniciar sesión para crear una Cotización Especial.' using errcode = '42501';
  end if;

  select tipo.* into v_tipo
  from public.tipos_documento_electronico tipo
  where tipo.id = p_tipo_documento_id;

  if not found or not v_tipo.activo or v_tipo.categoria_base <> 'cotizacion' then
    raise exception 'El tipo de documento debe existir, estar activo y ser de categoría cotizacion.'
      using errcode = '22023';
  end if;

  if not public.usuario_tiene_empresa(v_tipo.empresa_id)
     or not public.usuario_puede(v_tipo.empresa_id, 'cotizaciones', 'crear') then
    raise exception 'No tiene permiso para crear cotizaciones en esta empresa.' using errcode = '42501';
  end if;

  v_alcance := public.usuario_alcance_sociedades(v_tipo.empresa_id);
  if v_alcance is not null
     and not coalesce(v_tipo.sociedad_id = any(v_alcance), false) then
    raise exception 'No tiene alcance sobre la sociedad del tipo de documento.' using errcode = '42501';
  end if;

  if p_origen_items not in ('manual', 'hoja_costeo') then
    raise exception 'origen_items debe ser manual u hoja_costeo.' using errcode = '22023';
  end if;

  v_moneda := upper(coalesce(nullif(btrim(p_moneda), ''), 'PEN'));

  if p_origen_items = 'manual' then
    if p_hoja_costeo_id is not null then
      raise exception 'Una cotización manual no puede recibir hoja_costeo_id.' using errcode = '22023';
    end if;

    select n.items, n.subtotal into v_items, v_subtotal
    from public.normalizar_items_cotizacion_especial(p_items) n;
  else
    if p_hoja_costeo_id is null then
      raise exception 'hoja_costeo_id es obligatorio cuando el origen es hoja_costeo.'
        using errcode = '22023';
    end if;

    if p_items is not null then
      raise exception 'No envíe ítems manuales cuando el origen es hoja_costeo.' using errcode = '22023';
    end if;

    select hoja.* into v_hoja
    from public.hojas_costeo hoja
    where hoja.id = p_hoja_costeo_id;

    if not found
       or v_hoja.estado <> 'aprobada'
       or v_hoja.empresa_id is distinct from v_tipo.empresa_id
       or v_hoja.sociedad_id is distinct from v_tipo.sociedad_id then
      raise exception 'La Hoja de Costeo debe estar aprobada y pertenecer a la misma empresa y sociedad.'
        using errcode = '22023';
    end if;

    v_margen := least(greatest(
      case when coalesce(v_hoja.margen_objetivo_pct, 0) = 0 then 35 else v_hoja.margen_objetivo_pct end,
      0
    ), 95) / 100;
    v_divisor := 1 - v_margen;
    v_items := '[]'::jsonb;

    for v_linea in
      with secciones as (
        select 1 as seccion_orden, ordinality, 'servicio'::text as tipo, value as item
        from jsonb_array_elements(coalesce(v_hoja.mano_obra, '[]'::jsonb)) with ordinality
        union all
        select 2, ordinality, 'material'::text, value
        from jsonb_array_elements(coalesce(v_hoja.materiales, '[]'::jsonb)) with ordinality
        union all
        select 3, ordinality, 'servicio'::text, value
        from jsonb_array_elements(coalesce(v_hoja.servicios_terceros, '[]'::jsonb)) with ordinality
        union all
        select 4, ordinality, 'servicio'::text, value
        from jsonb_array_elements(coalesce(v_hoja.logistica, '[]'::jsonb)) with ordinality
        union all
        select 1, row_number() over (order by l.id), 'servicio'::text,
          jsonb_build_object(
            'id', 'mo_' || l.id,
            'descripcion', coalesce(nullif(concat_ws(' - ', ft.nombre, tsi.nombre, ce.nombre), ''), 'Mano de obra'),
            'cantidad', l.horas,
            'unidad', 'hora',
            'costo_unitario', l.costo_hora_snapshot
          )
        from public.hoja_costeo_lineas_mano_obra l
        left join public.familia_trabajo ft on ft.id = l.familia_trabajo_id
        left join public.tipos_servicio_interno tsi on tsi.id = l.actividad_id
        left join public.cargos_empresa ce on ce.id = l.cargo_id
        where l.hoja_costeo_id = v_hoja.id
          and jsonb_array_length(coalesce(v_hoja.mano_obra, '[]'::jsonb)) = 0
        union all
        select 2, row_number() over (order by l.id), 'material'::text,
          jsonb_build_object(
            'id', 'mat_' || l.id,
            'descripcion', coalesce(nullif(m.descripcion, ''), 'Material de costeo'),
            'cantidad', l.cantidad,
            'unidad', coalesce(nullif(m.unidad, ''), 'und'),
            'costo_unitario', l.costo_unitario_snapshot
          )
        from public.hoja_costeo_lineas_materiales l
        left join public.materiales m on m.id = l.material_id
        where l.hoja_costeo_id = v_hoja.id
          and jsonb_array_length(coalesce(v_hoja.materiales, '[]'::jsonb)) = 0
        union all
        select 5, row_number() over (order by l.id), 'servicio'::text,
          jsonb_build_object(
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
        where l.hoja_costeo_id = v_hoja.id
      )
      select * from secciones order by seccion_orden, ordinality
    loop
      v_orden := v_orden + 1;
      v_cantidad := coalesce(nullif(v_linea.item ->> 'cantidad', '')::numeric, 0);
      v_costo_unitario := coalesce(
        nullif(v_linea.item ->> 'costo_unitario', '')::numeric,
        nullif(v_linea.item ->> 'precio_unitario', '')::numeric,
        0
      );
      v_precio_unitario := case
        when v_divisor > 0 then round(v_costo_unitario / v_divisor)
        else v_costo_unitario
      end;

      v_items := v_items || jsonb_build_array(jsonb_build_object(
        'id', coalesce(v_linea.item -> 'id', to_jsonb(v_orden)),
        'descripcion', coalesce(nullif(v_linea.item ->> 'descripcion', ''), 'Partida de costeo'),
        'tipo', v_linea.tipo,
        'cantidad', v_cantidad,
        'unidad', coalesce(nullif(v_linea.item ->> 'unidad', ''), 'und'),
        'precio_unitario', v_precio_unitario,
        'subtotal', round(v_cantidad * v_precio_unitario, 2)
      ));
    end loop;

    v_subtotal := coalesce(v_hoja.precio_sugerido_sin_igv, 0);

    select coalesce(sum((item ->> 'subtotal')::numeric), 0)
    into v_suma_subtotales_items
    from jsonb_array_elements(v_items) item;
    v_ajuste_redondeo := round(v_subtotal - v_suma_subtotales_items, 2);

    if v_ajuste_redondeo <> 0 then
      if jsonb_array_length(v_items) = 0 then
        raise exception 'La Hoja de Costeo no tiene ítems para conciliar su subtotal aprobado.'
          using errcode = '22023';
      end if;

      select ordinality - 1, item
      into v_indice_ajuste, v_item_ajuste
      from jsonb_array_elements(v_items) with ordinality as item(item, ordinality)
      order by case when (item ->> 'cantidad')::numeric = 1 then 0 else 1 end,
               (item ->> 'subtotal')::numeric desc,
               ordinality desc
      limit 1;

      v_cantidad_ajuste := (v_item_ajuste ->> 'cantidad')::numeric;
      v_precio_ajuste := (v_item_ajuste ->> 'precio_unitario')::numeric
        + (v_ajuste_redondeo / v_cantidad_ajuste);
      v_item_ajuste := jsonb_set(
        v_item_ajuste,
        '{precio_unitario}',
        to_jsonb(v_precio_ajuste),
        false
      );
      v_item_ajuste := jsonb_set(
        v_item_ajuste,
        '{subtotal}',
        to_jsonb(round(v_cantidad_ajuste * v_precio_ajuste, 2)),
        false
      );
      v_item_ajuste := jsonb_set(
        v_item_ajuste,
        '{ajuste_redondeo}',
        to_jsonb(v_ajuste_redondeo),
        true
      );
      v_items := jsonb_set(v_items, array[v_indice_ajuste::text], v_item_ajuste, false);
    end if;
  end if;

  v_igv := round(v_subtotal * 0.18);
  v_total := v_subtotal + v_igv;
  v_hitos := public.normalizar_hitos_cotizacion_especial(p_hitos_activos, p_hitos_pago, v_total);
  v_numero := public.siguiente_numero_cotizacion(v_tipo.empresa_id);

  insert into public.cotizaciones_especiales (
    id, tipo_documento_id, plantilla_documento_id, cuenta_id, oportunidad_id,
    hoja_costeo_id, activo_id, recepcion_id, origen_items, numero, moneda, items, subtotal, igv_pct,
    igv, total, contacto_id, validez_tipo, validez_dias, validez_fecha,
    hitos_activos, hitos_pago, estado, documento_generado_id,
    contexto_emitido_json, created_by
  ) values (
    v_id, p_tipo_documento_id, p_plantilla_documento_id, p_cuenta_id,
    p_oportunidad_id, p_hoja_costeo_id, p_activo_id, p_recepcion_id,
    case when p_origen_items = 'hoja_costeo' then 'manual' else p_origen_items end,
    v_numero, v_moneda, v_items, v_subtotal, 18, v_igv, v_total,
    p_contacto_id, p_validez_tipo, p_validez_dias, p_validez_fecha,
    p_hitos_activos, v_hitos, 'borrador', null, null, auth.uid()
  );

  id := v_id;
  numero := v_numero;
  return next;
end;
$$;

revoke all on function public.crear_cotizacion_especial(
  uuid, uuid, text, text, text, text, text, jsonb, text, text, integer, date, boolean, jsonb, text, text
) from public, anon, service_role;

grant execute on function public.crear_cotizacion_especial(
  uuid, uuid, text, text, text, text, text, jsonb, text, text, integer, date, boolean, jsonb, text, text
) to authenticated;

select pg_notify('pgrst', 'reload schema');
