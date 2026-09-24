-- Paso 6 SPOT: cobro normal compatible y cobro explicito de detraccion.

create or replace function public.validar_cobro_cxc_cuenta_detraccion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cuenta public.cuentas_bancarias%rowtype;
begin
  if new.cuenta_bancaria_id is null then
    return new;
  end if;

  select * into v_cuenta
  from public.cuentas_bancarias
  where id = new.cuenta_bancaria_id;

  if not found then
    return new;
  end if;

  if new.detraccion_id is not null then
    if v_cuenta.empresa_id is distinct from new.empresa_id
       or coalesce(v_cuenta.es_cuenta_detracciones, false) is not true then
      raise exception 'La cuenta bancaria del movimiento no es una cuenta de detracciones de la misma empresa.';
    end if;
  elsif coalesce(v_cuenta.es_cuenta_detracciones, false) is true then
    raise exception 'Un cobro normal no puede registrarse en una cuenta de detracciones.';
  end if;

  return new;
end;
$$;

revoke all on function public.validar_cobro_cxc_cuenta_detraccion() from public;

drop trigger if exists movimientos_cxc_cuenta_detraccion_trg on public.movimientos_tesoreria;
create trigger movimientos_cxc_cuenta_detraccion_trg
before insert or update of cuenta_bancaria_id, detraccion_id, empresa_id
on public.movimientos_tesoreria
for each row execute function public.validar_cobro_cxc_cuenta_detraccion();

create or replace function public.registrar_cobro_cxc_atomico(
  p_empresa_id text,
  p_cxc_id text,
  p_cobro jsonb,
  p_movimiento jsonb,
  p_comision jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cxc public.cxc%rowtype;
  v_factura public.facturas%rowtype;
  v_cobro public.cobros_cxc%rowtype;
  v_movimiento public.movimientos_tesoreria%rowtype;
  v_comision public.comisiones%rowtype;
  v_detraccion public.detracciones%rowtype;
  v_cuenta_bancaria public.cuentas_bancarias%rowtype;
  v_monto numeric(14,2);
  v_monto_payload numeric(14,2);
  v_monto_deposito_soles numeric(14,2);
  v_mora numeric(14,2);
  v_neto_cobrable numeric(14,2);
  v_nuevo_pagado numeric(14,2);
  v_nuevo_saldo numeric(14,2);
  v_saldo_normal_max numeric(14,2);
  v_detraccion_pendiente numeric(14,2);
  v_estado text;
  v_cobro_id text;
  v_movimiento_id text;
  v_comision_id text;
  v_cuenta_bancaria_id text := coalesce(
    nullif(btrim(p_movimiento ->> 'cuenta_bancaria_id'), ''),
    nullif(btrim(p_cobro ->> 'cuenta_bancaria'), '')
  );
  v_tipo_cobro text := lower(coalesce(nullif(btrim(p_cobro ->> 'tipo_cobro'), ''), 'normal'));
  v_es_detraccion boolean := v_tipo_cobro = 'detraccion';
  v_numero_operacion text;
  v_movimiento_monto numeric(14,2);
  v_movimiento_moneda text;
  v_movimiento_tc numeric;
  v_movimiento_monto_cuenta numeric;
  v_comision_payload jsonb;
  v_comision_pct numeric;
  v_comision_bonificacion numeric;
  v_comision_monto numeric;
begin
  select * into v_cxc
  from public.cxc
  where id = p_cxc_id and empresa_id = p_empresa_id
  for update;

  if not found then
    raise exception 'La cuenta por cobrar no existe o no pertenece a la empresa activa.';
  end if;
  if not public.usuario_tiene_empresa(v_cxc.empresa_id) then
    raise exception 'No tiene permisos para registrar cobros en esta empresa.';
  end if;

  if v_es_detraccion then
    if nullif(btrim(p_cobro ->> 'detraccion_id'), '') is not null then
      select * into v_detraccion
      from public.detracciones
      where id = (p_cobro ->> 'detraccion_id')::uuid
        and cxc_id = v_cxc.id
        and direccion = 'venta'
        and estado = 'pendiente'
      for update;
    else
      select * into v_detraccion
      from public.detracciones
      where cxc_id = v_cxc.id
        and direccion = 'venta'
        and estado = 'pendiente'
      order by creado_en
      limit 1
      for update;
    end if;

    if not found then
      raise exception 'No existe una obligacion SPOT pendiente para esta CxC.';
    end if;
    if v_detraccion.empresa_id is distinct from v_cxc.empresa_id
       or v_detraccion.sociedad_id is distinct from v_cxc.sociedad_id then
      raise exception 'La obligacion SPOT no pertenece a la misma empresa y sociedad de la CxC.';
    end if;

    v_monto_payload := nullif(p_cobro ->> 'monto_capital', '')::numeric;
    if v_monto_payload is not null
       and round(v_monto_payload, 2) <> round(v_detraccion.monto_detraccion_origen, 2) then
      raise exception 'El monto del cobro de detraccion debe ser % en la moneda de la CxC.', v_detraccion.monto_detraccion_origen;
    end if;

    v_monto := round(v_detraccion.monto_detraccion_origen, 2);
    v_monto_deposito_soles := round(coalesce(
      nullif(p_movimiento ->> 'monto', '')::numeric,
      nullif(p_cobro ->> 'monto_deposito_soles', '')::numeric
    ), 2);
    if v_monto_deposito_soles is null
       or v_monto_deposito_soles <> round(v_detraccion.monto_detraccion_soles, 2) then
      raise exception 'El deposito de detraccion debe ser exactamente % PEN.', v_detraccion.monto_detraccion_soles;
    end if;
    if upper(coalesce(nullif(btrim(p_movimiento ->> 'moneda'), ''), '')) <> 'PEN' then
      raise exception 'El movimiento de una detraccion debe registrarse en PEN.';
    end if;
    v_mora := round(coalesce(nullif(p_cobro ->> 'monto_mora', '')::numeric, 0), 2);
    if v_mora <> 0 then
      raise exception 'El cobro de detraccion no admite mora.';
    end if;

    if v_cuenta_bancaria_id is null then
      raise exception 'El cobro de detraccion requiere una cuenta bancaria de destino.';
    end if;
    select * into v_cuenta_bancaria
    from public.cuentas_bancarias
    where id = v_cuenta_bancaria_id;

    if not found
       or v_cuenta_bancaria.empresa_id is distinct from v_cxc.empresa_id
       or v_cuenta_bancaria.sociedad_id is distinct from v_cxc.sociedad_id
       or coalesce(v_cuenta_bancaria.es_cuenta_detracciones, false) is not true
       or v_cuenta_bancaria.moneda <> 'PEN'
       or v_cuenta_bancaria.estado <> 'activo' then
      raise exception 'El cobro de detraccion solo puede ir a una cuenta de detracciones PEN activa de la misma empresa y sociedad.';
    end if;

    v_movimiento_monto := v_monto_deposito_soles;
    v_movimiento_moneda := 'PEN';
    v_movimiento_tc := case when v_cxc.moneda = 'USD' then v_detraccion.tipo_cambio else 1 end;
    v_movimiento_monto_cuenta := v_monto_deposito_soles;
    v_numero_operacion := coalesce(
      nullif(btrim(p_cobro ->> 'numero_constancia'), ''),
      nullif(btrim(p_cobro ->> 'numero_operacion'), '')
    );
  else
    v_monto := round(coalesce(nullif(p_cobro ->> 'monto_capital', '')::numeric, 0), 2);
    v_mora := round(coalesce(nullif(p_cobro ->> 'monto_mora', '')::numeric, 0), 2);
    if v_monto <= 0 then
      raise exception 'El monto cobrado debe ser mayor a cero.';
    end if;
    if v_mora < 0 then
      raise exception 'El monto de mora no puede ser negativo.';
    end if;

    if v_cuenta_bancaria_id is not null then
      select * into v_cuenta_bancaria
      from public.cuentas_bancarias
      where id = v_cuenta_bancaria_id;
      if found and coalesce(v_cuenta_bancaria.es_cuenta_detracciones, false) is true then
        raise exception 'Un cobro normal no puede registrarse en una cuenta de detracciones.';
      end if;
    end if;

    v_movimiento_monto := v_monto + v_mora;
    v_movimiento_moneda := coalesce(nullif(btrim(p_movimiento ->> 'moneda'), ''), v_cxc.moneda, 'PEN');
    v_movimiento_tc := nullif(p_movimiento ->> 'tc_aplicado', '')::numeric;
    v_movimiento_monto_cuenta := nullif(p_movimiento ->> 'monto_en_moneda_cuenta', '')::numeric;
    v_numero_operacion := nullif(btrim(p_cobro ->> 'numero_operacion'), '');
  end if;

  select * into v_factura
  from public.facturas
  where id = v_cxc.factura_id and empresa_id = v_cxc.empresa_id
  for update;

  v_neto_cobrable := coalesce(
    nullif(v_factura.monto_neto_cobrable, 0),
    v_cxc.monto_total - coalesce(v_cxc.monto_retencion, 0),
    0
  );

  if not v_es_detraccion then
    select coalesce(sum(d.monto_detraccion_origen), 0)
      into v_detraccion_pendiente
    from public.detracciones d
    where d.cxc_id = v_cxc.id
      and d.direccion = 'venta'
      and d.estado = 'pendiente';
    v_saldo_normal_max := greatest(
      0,
      coalesce(v_cxc.saldo, v_neto_cobrable - coalesce(v_cxc.monto_pagado, 0))
      - v_detraccion_pendiente
    );
    if v_monto > v_saldo_normal_max + 0.005 then
      raise exception 'El cobro normal no puede invadir el tramo pendiente de detraccion; maximo cobrable ahora: %.', v_saldo_normal_max;
    end if;
  end if;

  v_nuevo_pagado := round(coalesce(v_cxc.monto_pagado, 0) + v_monto, 2);
  v_nuevo_saldo := round(v_neto_cobrable - v_nuevo_pagado, 2);

  if v_monto > coalesce(v_cxc.saldo, v_neto_cobrable - coalesce(v_cxc.monto_pagado, 0)) + 0.005 then
    raise exception 'El monto cobrado supera el saldo pendiente de %.', coalesce(v_cxc.saldo, 0);
  end if;
  if v_nuevo_saldo < -0.005 then
    raise exception 'El monto cobrado supera el saldo pendiente.';
  end if;

  v_nuevo_saldo := greatest(0, v_nuevo_saldo);
  v_estado := case when v_nuevo_saldo <= 0 then 'cobrada' else 'cobro_parcial' end;

  update public.cxc
  set monto_pagado = v_nuevo_pagado,
      saldo = v_nuevo_saldo,
      estado = v_estado,
      updated_at = now()
  where id = v_cxc.id
  returning * into v_cxc;

  if v_factura.id is not null then
    update public.facturas
    set estado = v_estado,
        updated_at = now()
    where id = v_factura.id
    returning * into v_factura;
  end if;

  v_cobro_id := coalesce(nullif(btrim(p_cobro ->> 'id'), ''), 'cob_' || replace(gen_random_uuid()::text, '-', ''));
  insert into public.cobros_cxc (
    id, empresa_id, cxc_id, factura_id, cuenta_id, monto_capital, monto_mora,
    medio_pago, cuenta_bancaria, numero_operacion, fecha_cobro, notas, registrado_por, creado_en, detraccion_id
  ) values (
    v_cobro_id, v_cxc.empresa_id, v_cxc.id, v_cxc.factura_id, v_cxc.cuenta_id, v_monto, v_mora,
    coalesce(nullif(btrim(p_cobro ->> 'medio_pago'), ''), 'Efectivo'),
    nullif(btrim(p_cobro ->> 'cuenta_bancaria'), ''),
    v_numero_operacion,
    coalesce(nullif(p_cobro ->> 'fecha_cobro', '')::date, current_date),
    nullif(btrim(p_cobro ->> 'notas'), ''),
    nullif(btrim(p_cobro ->> 'registrado_por'), ''),
    now(),
    case when v_es_detraccion then v_detraccion.id else null end
  ) returning * into v_cobro;

  v_movimiento_id := coalesce(nullif(btrim(p_movimiento ->> 'id'), ''), 'tes_' || replace(gen_random_uuid()::text, '-', ''));
  insert into public.movimientos_tesoreria (
    id, empresa_id, tipo, descripcion, monto, moneda, fecha, cuenta_bancaria,
    cuenta_bancaria_id, tc_aplicado, monto_en_moneda_cuenta, referencia,
    vinculo_tipo, vinculo_id, estado, created_at, detraccion_id
  ) values (
    v_movimiento_id, v_cxc.empresa_id, 'ingreso',
    coalesce(nullif(btrim(p_movimiento ->> 'descripcion'), ''), 'Cobro de factura'),
    v_movimiento_monto,
    v_movimiento_moneda,
    coalesce(nullif(p_movimiento ->> 'fecha', '')::date, v_cobro.fecha_cobro),
    nullif(btrim(p_movimiento ->> 'cuenta_bancaria'), ''),
    nullif(btrim(p_movimiento ->> 'cuenta_bancaria_id'), ''),
    v_movimiento_tc,
    v_movimiento_monto_cuenta,
    nullif(btrim(p_movimiento ->> 'referencia'), ''),
    'cxc', v_cxc.id, 'registrado', now(),
    case when v_es_detraccion then v_detraccion.id else null end
  ) returning * into v_movimiento;

  if v_es_detraccion then
    update public.detracciones
    set estado = 'depositada',
        actualizado_en = now()
    where id = v_detraccion.id;
  end if;

  if p_comision is not null and coalesce(nullif(btrim(p_comision ->> 'id'), ''), '') <> '' then
    v_comision_payload := p_comision;
    if v_es_detraccion then
      v_comision_pct := coalesce(nullif(p_comision ->> 'porcentaje_comision', '')::numeric, 0);
      v_comision_bonificacion := coalesce(nullif(p_comision ->> 'bonificacion', '')::numeric, 0);
      v_comision_monto := round(v_monto * v_comision_pct / 100, 2);
      v_comision_payload := jsonb_set(v_comision_payload, '{monto_cobrado}', to_jsonb(v_monto), true);
      v_comision_payload := jsonb_set(v_comision_payload, '{monto_comision}', to_jsonb(v_comision_monto), true);
      v_comision_payload := jsonb_set(v_comision_payload, '{monto_total}', to_jsonb(round(v_comision_monto + v_comision_bonificacion, 2)), true);
    end if;

    v_comision_id := v_comision_payload ->> 'id';
    insert into public.comisiones (
      id, empresa_id, cobro_cxc_id, cxc_id, factura_id, vendedor_id, vendedor_nombre,
      monto_cobrado, porcentaje_comision, monto_comision, bonificacion, monto_total,
      modalidad_pago, periodo, estado, nota_acuerdo, tc_pen_usd, retencion_ir, creado_en
    ) values (
      v_comision_id, v_cxc.empresa_id, v_cobro.id, v_cxc.id, v_cxc.factura_id,
      nullif(btrim(v_comision_payload ->> 'vendedor_id'), ''), nullif(btrim(v_comision_payload ->> 'vendedor_nombre'), ''),
      coalesce(nullif(v_comision_payload ->> 'monto_cobrado', '')::numeric, v_monto),
      nullif(v_comision_payload ->> 'porcentaje_comision', '')::numeric,
      nullif(v_comision_payload ->> 'monto_comision', '')::numeric,
      coalesce(nullif(v_comision_payload ->> 'bonificacion', '')::numeric, 0),
      nullif(v_comision_payload ->> 'monto_total', '')::numeric,
      nullif(btrim(v_comision_payload ->> 'modalidad_pago'), ''),
      nullif(btrim(v_comision_payload ->> 'periodo'), ''),
      coalesce(nullif(btrim(v_comision_payload ->> 'estado'), ''), 'pendiente_aprobacion'),
      nullif(btrim(v_comision_payload ->> 'nota_acuerdo'), ''),
      nullif(v_comision_payload ->> 'tc_pen_usd', '')::numeric,
      coalesce(nullif(v_comision_payload ->> 'retencion_ir', '')::boolean, false),
      now()
    ) returning * into v_comision;
  end if;

  return jsonb_build_object(
    'cxc', to_jsonb(v_cxc),
    'factura', case when v_factura.id is null then null else to_jsonb(v_factura) end,
    'cobro', to_jsonb(v_cobro),
    'movimiento', to_jsonb(v_movimiento),
    'comision', case when v_comision.id is null then null else to_jsonb(v_comision) end,
    'detraccion', case when v_detraccion.id is null then null else to_jsonb(v_detraccion) end
  );
end;
$$;

revoke all on function public.registrar_cobro_cxc_atomico(text, text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.registrar_cobro_cxc_atomico(text, text, jsonb, jsonb, jsonb) to authenticated;

select pg_notify('pgrst', 'reload schema');

