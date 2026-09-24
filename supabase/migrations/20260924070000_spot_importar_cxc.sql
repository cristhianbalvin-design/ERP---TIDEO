-- Paso 8: importacion masiva de CxC con SPOT.
-- Se conserva el contrato existente; los campos nuevos son opcionales:
-- codigo_spot, cuenta_bancaria_id y cuenta_detraccion_id.

alter function public.importar_cxc_masiva_fila_base(jsonb)
  rename to importar_cxc_masiva_fila_base_impl;

revoke all on function public.importar_cxc_masiva_fila_base_impl(jsonb) from public, anon, authenticated, service_role;

create or replace function public.importar_cxc_masiva_fila_base(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id text := nullif(btrim(p_payload ->> 'empresa_id'), '');
  v_os_codigo text := nullif(btrim(p_payload ->> 'os_cliente_codigo'), '');
  v_cebe_codigo text := nullif(btrim(p_payload ->> 'centro_beneficio_codigo'), '');
  v_multisociedad boolean := false;
  v_sociedad_id uuid;
  v_alcance uuid[];
begin
  -- Controles vigentes preservados antes de la nueva validacion societaria.
  if v_empresa_id is null or not public.usuario_tiene_empresa(v_empresa_id) then
    raise exception 'No tienes acceso al tenant indicado.';
  end if;
  if not public.usuario_puede(v_empresa_id, 'facturacion', 'crear') then
    raise exception 'No tienes permiso para crear Facturacion en este tenant.';
  end if;

  select coalesce(e.multisociedad_habilitado, false)
    into v_multisociedad
  from public.empresas e
  where e.id = v_empresa_id;
  if not found then raise exception 'Tenant inexistente.'; end if;

  if v_multisociedad then
    if v_os_codigo is not null then
      select o.sociedad_id into v_sociedad_id
      from public.os_clientes o
      where o.empresa_id = v_empresa_id and o.numero = v_os_codigo
      limit 1;
    else
      select c.sociedad_id into v_sociedad_id
      from public.centros_beneficio c
      where c.empresa_id = v_empresa_id and upper(btrim(c.codigo)) = upper(btrim(v_cebe_codigo))
      limit 1;
    end if;

    v_alcance := public.usuario_alcance_sociedades(v_empresa_id);
    if v_sociedad_id is not null and v_alcance is not null
       and not (v_sociedad_id = any(v_alcance)) then
      raise exception 'La sociedad derivada de la importacion esta fuera del alcance societario del usuario.';
    end if;
  end if;

  return public.importar_cxc_masiva_fila_base_impl(p_payload);
end;
$$;

revoke all on function public.importar_cxc_masiva_fila_base(jsonb) from public, anon;
grant execute on function public.importar_cxc_masiva_fila_base(jsonb) to authenticated, postgres, service_role;

create or replace function public.importar_cxc_masiva_fila(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_monto_pagado numeric(14,2) := coalesce(nullif(p_payload ->> 'monto_pagado', '')::numeric, 0);
  v_monto_detraccion numeric(14,2) := coalesce(nullif(p_payload ->> 'monto_detraccion', '')::numeric, 0);
  v_fecha_emision date := nullif(p_payload ->> 'fecha_emision', '')::date;
  v_fecha_cobro date := nullif(p_payload ->> 'fecha_cobro', '')::date;
  v_moneda text := upper(coalesce(nullif(btrim(p_payload ->> 'moneda'), ''), 'PEN'));
  v_numero_operacion text := nullif(btrim(p_payload ->> 'numero_operacion'), '');
  v_codigo_spot text := nullif(btrim(p_payload ->> 'codigo_spot'), '');
  v_cuenta_neta_id text := nullif(btrim(p_payload ->> 'cuenta_bancaria_id'), '');
  v_cuenta_det_id text := nullif(btrim(p_payload ->> 'cuenta_detraccion_id'), '');
  v_payload_base jsonb;
  v_resultado jsonb;
  v_factura public.facturas%rowtype;
  v_cxc public.cxc%rowtype;
  v_cobro_neto public.cobros_cxc%rowtype;
  v_cobro_detraccion public.cobros_cxc%rowtype;
  v_detraccion public.detracciones%rowtype;
  v_spot public.spot_catalogo%rowtype;
  v_cuenta_neta public.cuentas_bancarias%rowtype;
  v_cuenta_det public.cuentas_bancarias%rowtype;
  v_movimiento_neto public.movimientos_tesoreria%rowtype;
  v_movimiento_det public.movimientos_tesoreria%rowtype;
  v_base_soles numeric(18,2);
  v_monto_soles numeric(18,2);
begin
  if v_monto_detraccion < 0 then
    raise exception 'Monto de detraccion invalido.';
  end if;

  -- Sin SPOT se delega sin cambios al flujo vigente.
  if v_monto_detraccion = 0 then
    return public.importar_cxc_masiva_fila_base(p_payload);
  end if;
  if v_monto_pagado <= 0 then
    raise exception 'Monto pagado debe incluir el deposito neto cuando se informa monto_detraccion.';
  end if;

  if v_codigo_spot is not null then
    select c.* into v_spot
    from public.spot_catalogo c
    where c.codigo = v_codigo_spot
      and c.estado = 'activo'
      and c.vigencia_desde <= v_fecha_emision
      and (c.vigencia_hasta is null or c.vigencia_hasta >= v_fecha_emision)
    order by c.vigencia_desde desc
    limit 1;
    if not found then
      raise exception 'El codigo SPOT % no tiene una version vigente para la fecha de emision.', v_codigo_spot;
    end if;
  end if;

  -- La base conserva monto_pagado + detraccion en CxC para que el saldo
  -- represente ambos cobros; el cobro neto se corrige inmediatamente despues.
  v_payload_base := jsonb_set(
    p_payload,
    '{monto_pagado}',
    to_jsonb(round(v_monto_pagado + v_monto_detraccion, 2))
  );
  v_resultado := public.importar_cxc_masiva_fila_base(v_payload_base);
  v_factura := jsonb_populate_record(null::public.facturas, v_resultado -> 'factura');
  v_cxc := jsonb_populate_record(null::public.cxc, v_resultado -> 'cxc');

  if coalesce(v_factura.aplica_retencion, false) then
    raise exception 'La importacion no puede tener retencion y detraccion al mismo tiempo.';
  end if;

  if v_cuenta_neta_id is null then
    select cb.id into v_cuenta_neta_id
    from public.cuentas_bancarias cb
    where cb.empresa_id = v_factura.empresa_id
      and cb.sociedad_id is not distinct from v_factura.sociedad_id
      and cb.nombre = nullif(btrim(p_payload ->> 'cuenta_bancaria'), '')
    limit 1;
  end if;
  if v_cuenta_neta_id is not null then
    select * into v_cuenta_neta from public.cuentas_bancarias where id=v_cuenta_neta_id;
    if not found or v_cuenta_neta.empresa_id is distinct from v_factura.empresa_id
       or v_cuenta_neta.sociedad_id is distinct from v_factura.sociedad_id
       or coalesce(v_cuenta_neta.es_cuenta_detracciones, false) then
      raise exception 'La cuenta del cobro neto no es una cuenta normal de la misma empresa y sociedad.';
    end if;
  end if;

  if v_cuenta_det_id is not null then
    select * into v_cuenta_det from public.cuentas_bancarias where id=v_cuenta_det_id;
    if not found or v_cuenta_det.empresa_id is distinct from v_factura.empresa_id
       or v_cuenta_det.sociedad_id is distinct from v_factura.sociedad_id
       or coalesce(v_cuenta_det.es_cuenta_detracciones, false) is not true
       or v_cuenta_det.moneda <> 'PEN' or v_cuenta_det.estado <> 'activo' then
      raise exception 'La cuenta de detracciones no es PEN, activa y de la misma empresa y sociedad.';
    end if;
  end if;

  v_cobro_neto := jsonb_populate_record(null::public.cobros_cxc, v_resultado -> 'cobro');
  update public.cobros_cxc
  set monto_capital=v_monto_pagado
  where id=v_cobro_neto.id
  returning * into v_cobro_neto;

  v_base_soles := round(coalesce(v_factura.total, 0), 2);
  v_monto_soles := case when v_moneda='PEN' then v_monto_detraccion else v_monto_detraccion end;
  insert into public.detracciones(
    direccion,factura_id,cxc_id,empresa_id,sociedad_id,spot_catalogo_id,codigo_spot,porcentaje,
    base_soles,monto_detraccion_soles,monto_detraccion_origen,moneda_origen,origen,estado,cuenta_destino_id
  ) values (
    'venta',v_factura.id,v_cxc.id,null,null,
    case when v_spot.id is null then null else v_spot.id end,
    case when v_spot.id is null then null else v_spot.codigo end,
    case when v_spot.id is null then null else v_spot.porcentaje end,
    v_base_soles,v_monto_soles,v_monto_detraccion,v_moneda,'importacion','depositada',v_cuenta_det_id
  ) returning * into v_detraccion;

  insert into public.cobros_cxc(
    id,empresa_id,cxc_id,factura_id,cuenta_id,monto_capital,monto_mora,medio_pago,
    cuenta_bancaria,numero_operacion,fecha_cobro,notas,registrado_por,detraccion_id
  ) values (
    'cob_imp_' || substr(replace(gen_random_uuid()::text,'-',''),1,20),v_factura.empresa_id,v_cxc.id,v_factura.id,
    v_cxc.cuenta_id,v_monto_detraccion,0,'Detraccion',null,v_numero_operacion,v_fecha_cobro,
    'Deposito por detraccion SPOT',auth.uid()::text,v_detraccion.id
  ) returning * into v_cobro_detraccion;

  update public.facturas
  set aplica_detraccion=true,porcentaje_detraccion=v_detraccion.porcentaje,monto_detraccion=v_monto_detraccion
  where id=v_factura.id
  returning * into v_factura;

  -- El movimiento neto se separa del cobro de detraccion y conserva el monto
  -- neto del payload. Sin cuenta normal identificable no se inventa una cuenta.
  if v_cuenta_neta_id is not null then
    insert into public.movimientos_tesoreria(
      id,empresa_id,tipo,descripcion,monto,moneda,fecha,cuenta_bancaria,cuenta_bancaria_id,
      tc_aplicado,monto_en_moneda_cuenta,referencia,vinculo_tipo,vinculo_id,estado,created_at
    ) values (
      'tes_imp_' || substr(replace(gen_random_uuid()::text,'-',''),1,20),v_factura.empresa_id,'ingreso',
      coalesce(nullif(btrim(p_payload ->> 'descripcion'), ''),'Cobro neto importado CxC'),v_monto_pagado,v_moneda,
      coalesce(v_fecha_cobro,v_factura.fecha_emision),nullif(btrim(p_payload ->> 'cuenta_bancaria'),''),v_cuenta_neta_id,
      1,v_monto_pagado,v_numero_operacion,'cxc',v_cxc.id,'registrado',now()
    ) returning * into v_movimiento_neto;
  end if;

  if v_cuenta_det_id is not null then
    insert into public.movimientos_tesoreria(
      id,empresa_id,tipo,descripcion,monto,moneda,fecha,cuenta_bancaria,cuenta_bancaria_id,
      tc_aplicado,monto_en_moneda_cuenta,referencia,vinculo_tipo,vinculo_id,estado,created_at,detraccion_id
    ) values (
      'tes_imp_det_' || substr(replace(gen_random_uuid()::text,'-',''),1,20),v_factura.empresa_id,'ingreso',
      'Deposito detraccion importado',v_monto_soles,'PEN',coalesce(v_fecha_cobro,v_factura.fecha_emision),
      v_cuenta_det.nombre,v_cuenta_det.id,1,v_monto_soles,v_numero_operacion,'cxc',v_cxc.id,'registrado',now(),v_detraccion.id
    ) returning * into v_movimiento_det;
  end if;

  return v_resultado || jsonb_build_object(
    'factura',to_jsonb(v_factura),
    'cobro',to_jsonb(v_cobro_neto),
    'cobros',jsonb_build_array(to_jsonb(v_cobro_neto),to_jsonb(v_cobro_detraccion)),
    'detraccion',to_jsonb(v_detraccion),
    'movimientos',jsonb_build_array(case when v_movimiento_neto.id is null then null else to_jsonb(v_movimiento_neto) end,case when v_movimiento_det.id is null then null else to_jsonb(v_movimiento_det) end)
  );
end;
$$;

revoke all on function public.importar_cxc_masiva_fila(jsonb) from public, anon;
grant execute on function public.importar_cxc_masiva_fila(jsonb) to authenticated, postgres, service_role;
select pg_notify('pgrst','reload schema');
