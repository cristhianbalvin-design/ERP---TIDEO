-- 492 · Únicas vías de escritura para borradores de Cotización Especial.
-- Las funciones validan explícitamente empresa, permiso y alcance porque
-- cotizaciones_especiales no concede INSERT directo a authenticated.

create or replace function public.normalizar_items_cotizacion_especial(p_items jsonb)
returns table(items jsonb, subtotal numeric)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item jsonb;
  v_items jsonb := '[]'::jsonb;
  v_subtotal numeric := 0;
  v_cantidad numeric;
  v_precio_unitario numeric;
  v_descripcion text;
  v_unidad text;
  v_orden integer := 0;
begin
  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Debe proporcionar al menos un ítem.' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_orden := v_orden + 1;

    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'El ítem % debe ser un objeto.', v_orden using errcode = '22023';
    end if;

    v_descripcion := nullif(btrim(v_item ->> 'descripcion'), '');
    v_unidad := nullif(btrim(v_item ->> 'unidad'), '');

    begin
      v_cantidad := (v_item ->> 'cantidad')::numeric;
      v_precio_unitario := (v_item ->> 'precio_unitario')::numeric;
    exception
      when invalid_text_representation then
        raise exception 'El ítem % debe tener cantidad y precio_unitario numéricos.', v_orden
          using errcode = '22023';
    end;

    if v_descripcion is null or v_unidad is null then
      raise exception 'El ítem % requiere descripción y unidad.', v_orden using errcode = '22023';
    end if;

    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'El ítem % debe tener cantidad mayor que cero.', v_orden using errcode = '22023';
    end if;

    if v_precio_unitario is null or v_precio_unitario < 0 then
      raise exception 'El ítem % debe tener precio_unitario mayor o igual a cero.', v_orden
        using errcode = '22023';
    end if;

    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'id', v_orden,
      'descripcion', v_descripcion,
      'cantidad', v_cantidad,
      'unidad', v_unidad,
      'precio_unitario', v_precio_unitario,
      'subtotal', round(v_cantidad * v_precio_unitario, 2)
    ));
    v_subtotal := v_subtotal + (v_cantidad * v_precio_unitario);
  end loop;

  items := v_items;
  subtotal := round(v_subtotal, 2);
  return next;
end;
$$;

-- Es un helper interno. Sólo las RPC SECURITY DEFINER siguientes pueden invocarlo.
revoke all on function public.normalizar_items_cotizacion_especial(jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.crear_cotizacion_especial(
  p_tipo_documento_id uuid,
  p_plantilla_documento_id uuid,
  p_cuenta_id text,
  p_oportunidad_id text,
  p_origen_items text,
  p_hoja_costeo_id text,
  p_moneda text,
  p_items jsonb
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
  v_alcance uuid[];
  v_moneda text;
begin
  if auth.uid() is null then
    raise exception 'Debe iniciar sesión para crear una Cotización Especial.' using errcode = '42501';
  end if;

  select * into v_tipo
  from public.tipos_documento_electronico
  where id = p_tipo_documento_id;

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

    select * into v_hoja
    from public.hojas_costeo
    where id = p_hoja_costeo_id;

    if not found
       or v_hoja.estado <> 'aprobada'
       or v_hoja.empresa_id is distinct from v_tipo.empresa_id
       or v_hoja.sociedad_id is distinct from v_tipo.sociedad_id then
      raise exception 'La Hoja de Costeo debe estar aprobada y pertenecer a la misma empresa y sociedad.'
        using errcode = '22023';
    end if;

    -- Equivalente SQL de construirItemsCotizacionDesdeHC (src/context.jsx).
    -- El margen 0 conserva el fallback histórico a 35 por el uso de || en JS.
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

    -- La HC es la fuente comercial aprobada de la base imponible.
    v_subtotal := coalesce(v_hoja.precio_sugerido_sin_igv, 0);
  end if;

  -- Cotización Estándar utiliza una tasa fija de 18 % y redondea el IGV a entero.
  v_igv := round(v_subtotal * 0.18);
  v_total := v_subtotal + v_igv;
  v_numero := public.siguiente_numero_cotizacion(v_tipo.empresa_id);

  insert into public.cotizaciones_especiales (
    id,
    tipo_documento_id,
    plantilla_documento_id,
    cuenta_id,
    oportunidad_id,
    hoja_costeo_id,
    origen_items,
    numero,
    moneda,
    items,
    subtotal,
    igv_pct,
    igv,
    total,
    estado,
    documento_generado_id,
    contexto_emitido_json,
    created_by
  ) values (
    v_id,
    p_tipo_documento_id,
    p_plantilla_documento_id,
    p_cuenta_id,
    p_oportunidad_id,
    p_hoja_costeo_id,
    p_origen_items,
    v_numero,
    v_moneda,
    v_items,
    v_subtotal,
    18,
    v_igv,
    v_total,
    'borrador',
    null,
    null,
    auth.uid()
  );

  id := v_id;
  numero := v_numero;
  return next;
end;
$$;

create or replace function public.actualizar_items_cotizacion_especial(
  p_id uuid,
  p_items jsonb
)
returns table(id uuid, items jsonb, subtotal numeric, igv numeric, total numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cotizacion public.cotizaciones_especiales%rowtype;
  v_items jsonb;
  v_subtotal numeric;
  v_igv numeric;
  v_total numeric;
  v_alcance uuid[];
begin
  if auth.uid() is null then
    raise exception 'Debe iniciar sesión para editar una Cotización Especial.' using errcode = '42501';
  end if;

  select * into v_cotizacion
  from public.cotizaciones_especiales
  where id = p_id
  for update;

  if not found then
    raise exception 'La Cotización Especial no existe.' using errcode = 'P0002';
  end if;

  if v_cotizacion.estado <> 'borrador' then
    raise exception 'Sólo se pueden editar los ítems de una cotización en borrador.' using errcode = '22023';
  end if;

  if v_cotizacion.origen_items <> 'manual' then
    raise exception 'Los ítems provenientes de Hoja de Costeo no se editan manualmente; cree una cotización manual para modificar partidas.'
      using errcode = '22023';
  end if;

  if not public.usuario_tiene_empresa(v_cotizacion.empresa_id)
     or not public.usuario_puede(v_cotizacion.empresa_id, 'cotizaciones', 'editar') then
    raise exception 'No tiene permiso para editar cotizaciones en esta empresa.' using errcode = '42501';
  end if;

  v_alcance := public.usuario_alcance_sociedades(v_cotizacion.empresa_id);
  if v_alcance is not null
     and not coalesce(v_cotizacion.sociedad_id = any(v_alcance), false) then
    raise exception 'No tiene alcance sobre la sociedad de esta cotización.' using errcode = '42501';
  end if;

  select n.items, n.subtotal into v_items, v_subtotal
  from public.normalizar_items_cotizacion_especial(p_items) n;

  v_igv := round(v_subtotal * 0.18);
  v_total := v_subtotal + v_igv;

  update public.cotizaciones_especiales
  set items = v_items,
      subtotal = v_subtotal,
      igv_pct = 18,
      igv = v_igv,
      total = v_total,
      updated_at = now()
  where id = p_id;

  id := p_id;
  items := v_items;
  subtotal := v_subtotal;
  igv := v_igv;
  total := v_total;
  return next;
end;
$$;

revoke all on function public.crear_cotizacion_especial(uuid, uuid, text, text, text, text, text, jsonb)
  from public, anon, service_role;
revoke all on function public.actualizar_items_cotizacion_especial(uuid, jsonb)
  from public, anon, service_role;
grant execute on function public.crear_cotizacion_especial(uuid, uuid, text, text, text, text, text, jsonb)
  to authenticated;
grant execute on function public.actualizar_items_cotizacion_especial(uuid, jsonb)
  to authenticated;

select pg_notify('pgrst', 'reload schema');
