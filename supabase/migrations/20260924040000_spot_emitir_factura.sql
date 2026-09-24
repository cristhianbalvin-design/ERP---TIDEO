-- Paso 5 SPOT: emision de factura y CxC.
-- La tabla detracciones es la fuente de verdad; las tres columnas de facturas
-- son espejos de compatibilidad escritos en esta misma transaccion.
-- El redondeo del deposito a soles sin decimales sigue la regla operativa
-- publicada por SUNAT para el SPOT: https://cpe.sunat.gob.pe/factura-con-detraccion

create or replace function public.emitir_factura_cxc_atomico(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id text := nullif(btrim(p_payload ->> 'empresa_id'), '');
  v_factura_id text := nullif(btrim(p_payload ->> 'factura_id'), '');
  v_cxc_id text := nullif(btrim(p_payload ->> 'cxc_id'), '');
  v_cuenta_id text := nullif(btrim(p_payload ->> 'cuenta_id'), '');
  v_os_id text := nullif(btrim(p_payload ->> 'os_cliente_id'), '');
  v_valorizacion_id text := nullif(btrim(p_payload ->> 'valorizacion_id'), '');
  v_cebe_id text := nullif(btrim(p_payload ->> 'centro_beneficio_id'), '');
  v_sociedad_id uuid := nullif(btrim(p_payload ->> 'sociedad_id'), '')::uuid;
  v_numero text := nullif(btrim(p_payload ->> 'numero'), '');
  v_tipo_documento text := lower(coalesce(nullif(btrim(p_payload ->> 'tipo_documento'), ''), 'factura'));
  v_fecha_emision date := nullif(p_payload ->> 'fecha_emision', '')::date;
  v_fecha_vencimiento date := nullif(p_payload ->> 'fecha_vencimiento', '')::date;
  v_subtotal numeric(14,2) := coalesce(nullif(p_payload ->> 'subtotal', '')::numeric, 0);
  v_igv numeric(14,2) := coalesce(nullif(p_payload ->> 'igv', '')::numeric, 0);
  v_total numeric(14,2) := coalesce(nullif(p_payload ->> 'total', '')::numeric, 0);
  v_moneda text := upper(coalesce(nullif(btrim(p_payload ->> 'moneda'), ''), 'PEN'));
  v_aplica_retencion boolean := coalesce((p_payload ->> 'aplica_retencion')::boolean, false);
  v_monto_retencion numeric(14,2) := coalesce(nullif(p_payload ->> 'monto_retencion', '')::numeric, 0);
  v_monto_neto numeric(14,2);
  v_saldo numeric(14,2);
  v_multisociedad boolean := false;
  v_factura public.facturas%rowtype;
  v_cxc public.cxc%rowtype;
  v_os public.os_clientes%rowtype;
  v_items jsonb := case when jsonb_typeof(p_payload -> 'items') = 'array' then p_payload -> 'items' else '[]'::jsonb end;
  v_item jsonb;
  v_servicio_id text;
  v_material_id text;
  v_familia_id text;
  v_linea_spot_id uuid;
  v_catalogo_id uuid;
  v_codigo_linea text;
  v_codigos text[] := array[]::text[];
  v_spot public.spot_catalogo%rowtype;
  v_total_soles numeric(18,2);
  v_base_soles numeric(18,2);
  v_monto_detraccion_origen numeric(18,2);
  v_monto_detraccion_soles numeric(18,2);
  v_tipo_cambio_detraccion numeric(18,6) := nullif(p_payload ->> 'tipo_cambio_detraccion', '')::numeric;
  v_tipo_cambio_fuente text := nullif(lower(btrim(p_payload ->> 'tipo_cambio_fuente')), '');
  v_tipo_cambio_historico numeric;
begin
  -- Controles vigentes preservados literalmente: tenant y numero por contraparte.
  if v_empresa_id is null or not public.usuario_tiene_empresa(v_empresa_id) then
    raise exception 'No tienes acceso al tenant indicado.';
  end if;
  if v_factura_id is null or v_cxc_id is null then
    raise exception 'Identificadores de factura y CxC obligatorios.';
  end if;
  if v_cuenta_id is null or not exists (select 1 from public.cuentas where id = v_cuenta_id and empresa_id = v_empresa_id) then
    raise exception 'Cliente invalido para la factura.';
  end if;
  if v_numero is null or v_fecha_emision is null or v_fecha_vencimiento is null then
    raise exception 'Numero y fechas de la factura son obligatorios.';
  end if;
  if v_fecha_vencimiento < v_fecha_emision then
    raise exception 'La fecha de vencimiento no puede ser anterior a la emision.';
  end if;
  if v_moneda not in ('PEN', 'USD') or v_subtotal < 0 or v_igv < 0 or v_total <= 0 then
    raise exception 'Los importes o la moneda de la factura son invalidos.';
  end if;
  if abs(round(v_subtotal + v_igv, 2) - round(v_total, 2)) > 0.01 then
    raise exception 'El total debe coincidir con subtotal mas IGV.';
  end if;

  select coalesce(multisociedad_habilitado, false) into v_multisociedad
  from public.empresas where id = v_empresa_id;
  if v_multisociedad and v_sociedad_id is null then
    raise exception 'Debe seleccionar una sociedad para emitir la factura.';
  end if;
  if v_sociedad_id is not null and not exists (
    select 1 from public.sociedades s
    where s.id = v_sociedad_id and s.empresa_id = v_empresa_id and coalesce(s.activa, true)
  ) then
    raise exception 'La sociedad indicada no es valida para este tenant.';
  end if;
  if v_cebe_id is null or not exists (
    select 1 from public.centros_beneficio c
    where c.id = v_cebe_id and c.empresa_id = v_empresa_id and c.estado = 'activo'
      and (c.fecha_inicio is null or c.fecha_inicio <= v_fecha_emision)
      and (c.fecha_fin is null or c.fecha_fin >= v_fecha_emision)
  ) then
    raise exception 'El CEBE debe existir, estar activo y vigente para la fecha de emision.';
  end if;
  if v_os_id is not null then
    select * into v_os from public.os_clientes
    where id = v_os_id and empresa_id = v_empresa_id
    for update;
    if not found then raise exception 'La OS Cliente indicada no existe.'; end if;
    if v_os.cuenta_id is distinct from v_cuenta_id then raise exception 'La OS no pertenece al cliente seleccionado.'; end if;
    if v_sociedad_id is distinct from v_os.sociedad_id then raise exception 'La sociedad de la factura debe coincidir con la sociedad de la OS.'; end if;
  end if;

  perform public.validar_numero_factura_por_contraparte(
    v_empresa_id, v_sociedad_id, v_cuenta_id, v_numero,
    coalesce((p_payload ->> 'confirmar_numero_duplicado')::boolean, false)
  );

  -- Boletas y comprobantes que no sustentan credito fiscal quedan fuera del SPOT.
  -- Para facturas, cada linea resuelve servicio -> familia -> seleccion explicita.
  if v_tipo_documento = 'factura' then
    for v_item in select value from jsonb_array_elements(v_items) loop
      v_servicio_id := nullif(btrim(v_item ->> 'servicio_id'), '');
      v_material_id := nullif(btrim(v_item ->> 'material_id'), '');
      v_linea_spot_id := nullif(btrim(v_item ->> 'spot_catalogo_id'), '')::uuid;
      v_catalogo_id := null;
      if v_servicio_id is not null then
        select s.spot_catalogo_id, s.familia_id
          into v_catalogo_id, v_familia_id
        from public.servicios s
        where s.id = v_servicio_id;
        if v_catalogo_id is null and v_familia_id is not null then
          select f.spot_catalogo_id into v_catalogo_id
          from public.familia_servicio f where f.id = v_familia_id;
        end if;
      end if;
      -- Materiales no heredan codigo: solo usan la seleccion explicita de la linea.
      if v_catalogo_id is null then
        v_catalogo_id := v_linea_spot_id;
      end if;
      if v_catalogo_id is not null then
        select c.codigo into v_codigo_linea
        from public.spot_catalogo c where c.id = v_catalogo_id;
        if v_codigo_linea is null then
          raise exception 'El codigo SPOT seleccionado en una linea no existe.';
        end if;
        if not (v_codigo_linea = any(v_codigos)) then
          v_codigos := array_append(v_codigos, v_codigo_linea);
        end if;
      end if;
    end loop;
    if coalesce(array_length(v_codigos, 1), 0) > 1 then
      raise exception 'La factura contiene codigos SPOT con tasas distintas. Separa las lineas en comprobantes distintos.';
    end if;
    if coalesce(array_length(v_codigos, 1), 0) = 1 then
      select c.* into v_spot
      from public.spot_catalogo c
      where c.codigo = v_codigos[1]
        and c.estado = 'activo'
        and c.vigencia_desde <= v_fecha_emision
        and (c.vigencia_hasta is null or c.vigencia_hasta >= v_fecha_emision)
      order by c.vigencia_desde desc
      limit 1;
      if not found then
        raise exception 'El codigo SPOT % no tiene una version vigente para la fecha de emision.', v_codigos[1];
      end if;
      if v_moneda = 'USD' then
        if v_tipo_cambio_detraccion is null or v_tipo_cambio_detraccion <= 0 then
          raise exception 'Para una factura USD con detraccion debes informar tipo_cambio_detraccion en soles por dolar.';
        end if;
        if v_tipo_cambio_fuente not in ('manual', 'referencial') then
          raise exception 'Para una factura USD con detraccion debes informar tipo_cambio_fuente como manual o referencial.';
        end if;
        if v_tipo_cambio_fuente = 'referencial' then
          select nullif(usd, 0) into v_tipo_cambio_historico
          from public.tipo_cambio_historico
          where moneda_base = 'PEN' and fecha <= v_fecha_emision
          order by fecha desc limit 1;
          if v_tipo_cambio_historico is null then
            raise exception 'No existe tipo de cambio historico USD/PEN para la fecha de emision.';
          end if;
          if abs(v_tipo_cambio_detraccion - round(1 / v_tipo_cambio_historico, 6)) > 0.000001 then
            raise exception 'El tipo de cambio referencial debe ser la inversion de tipo_cambio_historico.usd (soles por dolar).';
          end if;
        end if;
        v_total_soles := round(v_total * v_tipo_cambio_detraccion, 2);
      else
        v_tipo_cambio_detraccion := null;
        v_tipo_cambio_fuente := null;
        v_total_soles := round(v_total, 2);
      end if;
      v_base_soles := v_total_soles;
      if (v_spot.umbral_operador = '>' and v_base_soles > v_spot.monto_minimo)
         or (v_spot.umbral_operador = '>=' and v_base_soles >= v_spot.monto_minimo) then
        v_aplica_detraccion := true;
        if v_aplica_retencion then
          raise exception 'La factura no puede tener retencion y detraccion al mismo tiempo.';
        end if;
        v_monto_detraccion_origen := round(v_total * v_spot.porcentaje / 100, 2);
        v_monto_detraccion_soles := round(v_base_soles * v_spot.porcentaje / 100, 0);
      end if;
    end if;
  end if;

  v_monto_neto := case when v_aplica_retencion then round(v_total - v_monto_retencion, 2) else v_total end;
  if v_monto_retencion < 0 or v_monto_neto < 0 then raise exception 'La retencion es invalida.'; end if;
  v_saldo := v_monto_neto;

  insert into public.facturas (
    id, empresa_id, cuenta_id, os_cliente_id, valorizacion_id, centro_beneficio_id, sociedad_id,
    numero, tipo_documento, fecha_emision, fecha_vencimiento, subtotal, igv, total, moneda,
    estado, condicion_pago, items, glosa, notas, aplica_retencion, monto_retencion, monto_neto_cobrable, concepto,
    aplica_detraccion, porcentaje_detraccion, monto_detraccion
  ) values (
    v_factura_id, v_empresa_id, v_cuenta_id, v_os_id, v_valorizacion_id, v_cebe_id, v_sociedad_id,
    v_numero, v_tipo_documento, v_fecha_emision, v_fecha_vencimiento, v_subtotal, v_igv, v_total, v_moneda,
    'emitida', nullif(btrim(p_payload ->> 'condicion_pago'), ''), v_items,
    nullif(btrim(p_payload ->> 'glosa'), ''), nullif(btrim(p_payload ->> 'notas'), ''), v_aplica_retencion, v_monto_retencion,
    case when v_aplica_retencion then v_monto_neto else null end, nullif(btrim(p_payload ->> 'glosa'), ''),
    v_aplica_detraccion, case when v_aplica_detraccion then v_spot.porcentaje else null end,
    case when v_aplica_detraccion then v_monto_detraccion_origen else null end
  ) returning * into v_factura;

  insert into public.cxc (
    id, empresa_id, cuenta_id, factura_id, os_cliente_id, sociedad_id, fecha_emision, fecha_vencimiento,
    monto_total, monto_pagado, saldo, moneda, estado, condicion_pago, monto_retencion, glosa, notas, concepto
  ) values (
    v_cxc_id, v_empresa_id, v_cuenta_id, v_factura.id, v_os_id, v_sociedad_id, v_fecha_emision, v_fecha_vencimiento,
    v_total, 0, v_saldo, v_moneda, 'por_cobrar', nullif(btrim(p_payload ->> 'condicion_pago'), ''), v_monto_retencion,
    nullif(btrim(p_payload ->> 'glosa'), ''), nullif(btrim(p_payload ->> 'notas'), ''), nullif(btrim(p_payload ->> 'glosa'), '')
  ) returning * into v_cxc;

  if v_aplica_detraccion then
    insert into public.detracciones (
      direccion, factura_id, cxc_id, empresa_id, sociedad_id, spot_catalogo_id, codigo_spot,
      porcentaje, base_soles, monto_detraccion_soles, monto_detraccion_origen, moneda_origen,
      tipo_cambio, tipo_cambio_fuente, origen, estado
    ) values (
      'venta', v_factura.id, v_cxc.id, null, null, v_spot.id, v_spot.codigo,
      v_spot.porcentaje, v_base_soles, v_monto_detraccion_soles, v_monto_detraccion_origen, v_moneda,
      v_tipo_cambio_detraccion, v_tipo_cambio_fuente, 'emision', 'pendiente'
    );
  end if;

  if v_valorizacion_id is not null then
    update public.valorizaciones set estado = 'facturada' where id = v_valorizacion_id and empresa_id = v_empresa_id;
  end if;
  if v_os_id is not null then
    update public.os_clientes
    set saldo_por_facturar = greatest(0, coalesce(saldo_por_facturar, 0) - v_total),
        monto_facturado = coalesce(monto_facturado, 0) + v_total
    where id = v_os_id and empresa_id = v_empresa_id
    returning * into v_os;
  end if;

  return jsonb_build_object('factura', to_jsonb(v_factura), 'cxc', to_jsonb(v_cxc), 'os', case when v_os_id is null then null else to_jsonb(v_os) end);
end;
$$;

revoke all on function public.emitir_factura_cxc_atomico(jsonb) from public;
grant execute on function public.emitir_factura_cxc_atomico(jsonb) to authenticated;
select pg_notify('pgrst', 'reload schema');
