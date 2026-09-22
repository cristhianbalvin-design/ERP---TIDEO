-- Datos técnicos documentales simples del activo.
-- Se usan columnas dedicadas porque forman parte del maestro técnico del activo
-- y deben ser editables/consultables sin interpretar el JSONB de documentos.

alter table public.activos
  add column if not exists año_fabricacion integer,
  add column if not exists año_overhaul integer;

-- La RPC de Cotizaciones Especiales normaliza el snapshot de cada ítem. Estos
-- campos se conservan junto con codigo/marca/modelo para que las variables
-- documentales sigan disponibles después de guardar el borrador.
create or replace function public.normalizar_items_cotizacion_especial(p_items jsonb)
returns table(items jsonb, subtotal numeric)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_item jsonb;
  v_item_normalizado jsonb;
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

    v_item_normalizado := jsonb_build_object(
      'id', v_orden,
      'descripcion', v_descripcion,
      'cantidad', v_cantidad,
      'unidad', v_unidad,
      'precio_unitario', v_precio_unitario,
      'subtotal', round(v_cantidad * v_precio_unitario, 2)
    );

    if v_item ? 'codigo' then
      v_item_normalizado := v_item_normalizado || jsonb_build_object('codigo', v_item -> 'codigo');
    end if;
    if v_item ? 'marca' then
      v_item_normalizado := v_item_normalizado || jsonb_build_object('marca', v_item -> 'marca');
    end if;
    if v_item ? 'modelo' then
      v_item_normalizado := v_item_normalizado || jsonb_build_object('modelo', v_item -> 'modelo');
    end if;
    if v_item ? 'año_fabricacion' then
      v_item_normalizado := v_item_normalizado || jsonb_build_object('año_fabricacion', v_item -> 'año_fabricacion');
    end if;
    if v_item ? 'año_overhaul' then
      v_item_normalizado := v_item_normalizado || jsonb_build_object('año_overhaul', v_item -> 'año_overhaul');
    end if;

    v_items := v_items || jsonb_build_array(v_item_normalizado);
    v_subtotal := v_subtotal + (v_cantidad * v_precio_unitario);
  end loop;

  items := v_items;
  subtotal := round(v_subtotal, 2);
  return next;
end;
$$;

select pg_notify('pgrst', 'reload schema');
