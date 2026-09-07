-- 496 · Contacto, validez y hitos de pago para Cotización Especial.

alter table public.cotizaciones_especiales
  add column contacto_id text references public.contactos(id) on delete set null,
  add column validez_tipo text not null default 'dias',
  add column validez_dias integer default 30,
  add column validez_fecha date,
  add column hitos_activos boolean not null default false,
  add column hitos_pago jsonb not null default '[]'::jsonb,
  add constraint cotizaciones_especiales_validez_tipo_check
    check (validez_tipo in ('dias', 'fecha_exacta')),
  -- Cotización Estándar no impone esta coherencia en DB. Se exige aquí para
  -- evitar emitir una oferta sin el dato que el modo de validez declara usar.
  add constraint cotizaciones_especiales_validez_detalle_check
    check (
      (validez_tipo = 'dias' and validez_dias is not null and validez_dias > 0)
      or (validez_tipo = 'fecha_exacta' and validez_fecha is not null)
    );

-- Reemplaza la función efectiva de 495; el trigger existente sigue apuntando a ella.
create or replace function public.derivar_contexto_cotizacion_especial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tipo public.tipos_documento_electronico%rowtype;
  v_cuenta_empresa_id text;
  v_contacto record;
  v_oportunidad_empresa_id text;
  v_hoja record;
  v_plantilla record;
  v_documento record;
  v_vinculacion_inicial boolean;
begin
  select * into v_tipo
  from public.tipos_documento_electronico
  where id = new.tipo_documento_id;

  if not found then
    raise exception 'El tipo de documento % no existe.', new.tipo_documento_id;
  end if;

  if v_tipo.categoria_base <> 'cotizacion' or not v_tipo.activo then
    raise exception 'El tipo de documento debe estar activo y ser de categoría cotizacion.';
  end if;

  new.empresa_id := v_tipo.empresa_id;
  new.sociedad_id := v_tipo.sociedad_id;

  select empresa_id into v_cuenta_empresa_id
  from public.cuentas
  where id = new.cuenta_id;

  if not found or v_cuenta_empresa_id is distinct from new.empresa_id then
    raise exception 'La cuenta debe pertenecer a la misma empresa que el tipo de documento.';
  end if;

  if new.contacto_id is not null then
    select empresa_id, cuenta_id into v_contacto
    from public.contactos
    where id = new.contacto_id;

    if not found
       or v_contacto.empresa_id is distinct from new.empresa_id
       or v_contacto.cuenta_id is distinct from new.cuenta_id then
      raise exception 'El contacto debe pertenecer a la misma empresa y cuenta de la Cotización Especial.';
    end if;
  end if;

  if new.oportunidad_id is not null then
    select empresa_id into v_oportunidad_empresa_id
    from public.oportunidades
    where id = new.oportunidad_id;

    if not found or v_oportunidad_empresa_id is distinct from new.empresa_id then
      raise exception 'La oportunidad debe pertenecer a la misma empresa que el tipo de documento.';
    end if;
  end if;

  if new.origen_items = 'hoja_costeo' then
    select empresa_id, sociedad_id, estado into v_hoja
    from public.hojas_costeo
    where id = new.hoja_costeo_id;

    if not found
       or v_hoja.empresa_id is distinct from new.empresa_id
       or v_hoja.sociedad_id is distinct from new.sociedad_id
       or v_hoja.estado is distinct from 'aprobada' then
      raise exception 'La Hoja de Costeo debe estar aprobada y pertenecer a la misma empresa y sociedad.';
    end if;
  end if;

  select empresa_id, sociedad_id, tipo_documento_id, estado into v_plantilla
  from public.plantillas_documento_bloques
  where id = new.plantilla_documento_id;

  if not found
     or v_plantilla.empresa_id is distinct from new.empresa_id
     or v_plantilla.sociedad_id is distinct from new.sociedad_id
     or v_plantilla.tipo_documento_id is distinct from new.tipo_documento_id
     or v_plantilla.estado is distinct from 'publicada' then
    raise exception 'La plantilla debe estar publicada y pertenecer al mismo tipo, empresa y sociedad.';
  end if;

  v_vinculacion_inicial := new.documento_generado_id is not null
    and (tg_op = 'INSERT' or old.documento_generado_id is null);

  if new.documento_generado_id is not null then
    select empresa_id, sociedad_id, tipo_documento_id, entidad_tipo, entidad_id, estado into v_documento
    from public.documentos_generados
    where id = new.documento_generado_id;

    if not found
       or v_documento.empresa_id is distinct from new.empresa_id
       or v_documento.sociedad_id is distinct from new.sociedad_id
       or v_documento.tipo_documento_id is distinct from new.tipo_documento_id
       or v_documento.entidad_tipo is distinct from 'cotizacion_especial'
       or v_documento.entidad_id is distinct from new.id::text
       or (v_vinculacion_inicial and v_documento.estado is distinct from 'borrador') then
      raise exception 'El documento generado debe pertenecer a esta Cotización Especial, tipo, empresa y sociedad; al vincularlo debe estar en borrador.';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.derivar_contexto_cotizacion_especial()
  from public, anon, authenticated, service_role;

-- El monto nunca viene del cliente: se deriva del total ya calculado por 492.
create or replace function public.normalizar_hitos_cotizacion_especial(
  p_hitos_activos boolean,
  p_hitos_pago jsonb,
  p_total numeric
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_hito jsonb;
  v_hitos jsonb := '[]'::jsonb;
  v_concepto text;
  v_condicion text;
  v_porcentaje numeric;
  v_monto numeric;
  v_suma_porcentajes numeric := 0;
  v_suma_montos numeric := 0;
  v_ajuste numeric;
  v_orden integer := 0;
  v_indice_ajuste integer;
  v_hito_ajuste jsonb;
begin
  if p_hitos_activos is null then
    raise exception 'hitos_activos es obligatorio.' using errcode = '22023';
  end if;

  if not p_hitos_activos then
    return '[]'::jsonb;
  end if;

  if p_hitos_pago is null
     or jsonb_typeof(p_hitos_pago) <> 'array'
     or jsonb_array_length(p_hitos_pago) = 0 then
    raise exception 'Debe proporcionar al menos un hito cuando hitos_activos es true.' using errcode = '22023';
  end if;

  for v_hito in select value from jsonb_array_elements(p_hitos_pago)
  loop
    v_orden := v_orden + 1;
    if jsonb_typeof(v_hito) <> 'object' then
      raise exception 'El hito % debe ser un objeto.', v_orden using errcode = '22023';
    end if;

    v_concepto := nullif(btrim(v_hito ->> 'concepto'), '');
    v_condicion := nullif(btrim(v_hito ->> 'condicion'), '');
    if v_concepto is null or v_condicion is null then
      raise exception 'El hito % requiere concepto y condicion.', v_orden using errcode = '22023';
    end if;

    begin
      v_porcentaje := nullif(btrim(v_hito ->> 'porcentaje'), '')::numeric;
    exception when invalid_text_representation then
      raise exception 'El porcentaje del hito % no es válido.', v_orden using errcode = '22023';
    end;

    if v_porcentaje is null or v_porcentaje <= 0 or v_porcentaje > 100 then
      raise exception 'El porcentaje del hito % debe ser mayor que 0 y menor o igual que 100.', v_orden using errcode = '22023';
    end if;

    v_monto := round(p_total * v_porcentaje / 100);
    v_suma_porcentajes := v_suma_porcentajes + v_porcentaje;
    v_suma_montos := v_suma_montos + v_monto;
    v_hitos := v_hitos || jsonb_build_array(jsonb_build_object(
      'id', v_orden,
      'concepto', v_concepto,
      'porcentaje', v_porcentaje,
      'condicion', v_condicion,
      'monto', v_monto
    ));
  end loop;

  if abs(v_suma_porcentajes - 100) > 0.01 then
    raise exception 'Los porcentajes de hitos suman %; deben sumar exactamente 100%%.', v_suma_porcentajes
      using errcode = '22023';
  end if;

  v_ajuste := round(p_total - v_suma_montos, 2);
  if v_ajuste <> 0 then
    select ordinality - 1, item
      into v_indice_ajuste, v_hito_ajuste
    from jsonb_array_elements(v_hitos) with ordinality as hito(item, ordinality)
    order by (item ->> 'monto')::numeric desc, ordinality desc
    limit 1;

    v_hito_ajuste := jsonb_set(
      v_hito_ajuste,
      '{monto}',
      to_jsonb(round((v_hito_ajuste ->> 'monto')::numeric + v_ajuste, 2)),
      false
    );
    v_hito_ajuste := jsonb_set(
      v_hito_ajuste,
      '{ajuste_redondeo}',
      to_jsonb(v_ajuste),
      true
    );
    v_hitos := jsonb_set(v_hitos, array[v_indice_ajuste::text], v_hito_ajuste, false);
  end if;

  return v_hitos;
end;
$$;

revoke all on function public.normalizar_hitos_cotizacion_especial(boolean, jsonb, numeric)
  from public, anon, authenticated, service_role;

-- PostgreSQL no permite cambiar los argumentos de crear_cotizacion_especial
-- con CREATE OR REPLACE. Se elimina la firma de 492 sin CASCADE y se recrea
-- una única firma ampliada, con defaults para compatibilidad posicional.
drop function public.crear_cotizacion_especial(uuid, uuid, text, text, text, text, text, jsonb);

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
  p_hitos_pago jsonb default '[]'::jsonb
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

    -- calcularHojaCosteo redondea el precio aprobado una sola vez sobre el
    -- costo agregado, mientras el adaptador redondea cada precio unitario.
    -- Concentramos la diferencia residual en una sola línea para que la tabla
    -- visible concilie exactamente con el subtotal aprobado de la HC.
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

  -- Cotización Estándar utiliza una tasa fija de 18 % y redondea el IGV a entero.
  v_igv := round(v_subtotal * 0.18);
  v_total := v_subtotal + v_igv;
  v_hitos := public.normalizar_hitos_cotizacion_especial(p_hitos_activos, p_hitos_pago, v_total);
  v_numero := public.siguiente_numero_cotizacion(v_tipo.empresa_id);

  insert into public.cotizaciones_especiales (
    id, tipo_documento_id, plantilla_documento_id, cuenta_id, oportunidad_id,
    hoja_costeo_id, origen_items, numero, moneda, items, subtotal, igv_pct,
    igv, total, contacto_id, validez_tipo, validez_dias, validez_fecha,
    hitos_activos, hitos_pago, estado, documento_generado_id,
    contexto_emitido_json, created_by
  ) values (
    v_id, p_tipo_documento_id, p_plantilla_documento_id, p_cuenta_id,
    p_oportunidad_id, p_hoja_costeo_id, p_origen_items, v_numero, v_moneda,
    v_items, v_subtotal, 18, v_igv, v_total, p_contacto_id, p_validez_tipo,
    p_validez_dias, p_validez_fecha, p_hitos_activos, v_hitos, 'borrador',
    null, null, auth.uid()
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
  v_hitos jsonb;
begin
  if auth.uid() is null then
    raise exception 'Debe iniciar sesión para editar una Cotización Especial.' using errcode = '42501';
  end if;

  select cotizacion.* into v_cotizacion
  from public.cotizaciones_especiales cotizacion
  where cotizacion.id = p_id
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

  v_hitos := public.normalizar_hitos_cotizacion_especial(
    v_cotizacion.hitos_activos,
    v_cotizacion.hitos_pago,
    v_total
  );

  update public.cotizaciones_especiales cotizacion_especial
  set items = v_items,
      subtotal = v_subtotal,
      igv_pct = 18,
      igv = v_igv,
      total = v_total,
      hitos_pago = v_hitos,
      updated_at = now()
  where cotizacion_especial.id = p_id;

  id := p_id;
  items := v_items;
  subtotal := v_subtotal;
  igv := v_igv;
  total := v_total;
  return next;
end;
$$;

create or replace function public.actualizar_datos_cotizacion_especial(
  p_id uuid,
  p_contacto_id text,
  p_validez_tipo text,
  p_validez_dias integer,
  p_validez_fecha date,
  p_hitos_activos boolean,
  p_hitos_pago jsonb
)
returns table(id uuid, contacto_id text, validez_tipo text, validez_dias integer, validez_fecha date, hitos_activos boolean, hitos_pago jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cotizacion public.cotizaciones_especiales%rowtype;
  v_alcance uuid[];
  v_hitos jsonb;
begin
  if auth.uid() is null then
    raise exception 'Debe iniciar sesión para editar una Cotización Especial.' using errcode = '42501';
  end if;

  select cotizacion.* into v_cotizacion
  from public.cotizaciones_especiales cotizacion
  where cotizacion.id = p_id
  for update;

  if not found then
    raise exception 'La Cotización Especial no existe.' using errcode = 'P0002';
  end if;

  if v_cotizacion.estado <> 'borrador' then
    raise exception 'Sólo se pueden editar los datos de una cotización en borrador.' using errcode = '22023';
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

  v_hitos := public.normalizar_hitos_cotizacion_especial(
    p_hitos_activos,
    p_hitos_pago,
    v_cotizacion.total
  );

  update public.cotizaciones_especiales cotizacion_especial
  set contacto_id = p_contacto_id,
      validez_tipo = p_validez_tipo,
      validez_dias = p_validez_dias,
      validez_fecha = p_validez_fecha,
      hitos_activos = p_hitos_activos,
      hitos_pago = v_hitos,
      updated_at = now()
  where cotizacion_especial.id = p_id
  returning cotizacion_especial.id,
            cotizacion_especial.contacto_id,
            cotizacion_especial.validez_tipo,
            cotizacion_especial.validez_dias,
            cotizacion_especial.validez_fecha,
            cotizacion_especial.hitos_activos,
            cotizacion_especial.hitos_pago
  into id, contacto_id, validez_tipo, validez_dias, validez_fecha, hitos_activos, hitos_pago;

  return next;
end;
$$;

revoke all on function public.crear_cotizacion_especial(
  uuid, uuid, text, text, text, text, text, jsonb, text, text, integer, date, boolean, jsonb
) from public, anon, service_role;
revoke all on function public.actualizar_items_cotizacion_especial(
  uuid, jsonb
) from public, anon, service_role;
revoke all on function public.actualizar_datos_cotizacion_especial(
  uuid, text, text, integer, date, boolean, jsonb
) from public, anon, service_role;

grant execute on function public.crear_cotizacion_especial(
  uuid, uuid, text, text, text, text, text, jsonb, text, text, integer, date, boolean, jsonb
) to authenticated;
grant execute on function public.actualizar_items_cotizacion_especial(
  uuid, jsonb
) to authenticated;
grant execute on function public.actualizar_datos_cotizacion_especial(
  uuid, text, text, integer, date, boolean, jsonb
) to authenticated;

select pg_notify('pgrst', 'reload schema');
