-- Un cobro de CxC afecta cuatro registros financieros. Se realiza como una
-- transacción única para impedir historiales o saldos locales no persistidos.

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
  v_monto numeric(14,2);
  v_mora numeric(14,2);
  v_neto_cobrable numeric(14,2);
  v_nuevo_pagado numeric(14,2);
  v_nuevo_saldo numeric(14,2);
  v_estado text;
  v_cobro_id text;
  v_movimiento_id text;
  v_comision_id text;
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

  v_monto := round(coalesce(nullif(p_cobro ->> 'monto_capital', '')::numeric, 0), 2);
  v_mora := round(coalesce(nullif(p_cobro ->> 'monto_mora', '')::numeric, 0), 2);
  if v_monto <= 0 then
    raise exception 'El monto cobrado debe ser mayor a cero.';
  end if;
  if v_mora < 0 then
    raise exception 'El monto de mora no puede ser negativo.';
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
    medio_pago, cuenta_bancaria, numero_operacion, fecha_cobro, notas, registrado_por, creado_en
  ) values (
    v_cobro_id, v_cxc.empresa_id, v_cxc.id, v_cxc.factura_id, v_cxc.cuenta_id, v_monto, v_mora,
    coalesce(nullif(btrim(p_cobro ->> 'medio_pago'), ''), 'Efectivo'),
    nullif(btrim(p_cobro ->> 'cuenta_bancaria'), ''),
    nullif(btrim(p_cobro ->> 'numero_operacion'), ''),
    coalesce(nullif(p_cobro ->> 'fecha_cobro', '')::date, current_date),
    nullif(btrim(p_cobro ->> 'notas'), ''),
    nullif(btrim(p_cobro ->> 'registrado_por'), ''), now()
  ) returning * into v_cobro;

  v_movimiento_id := coalesce(nullif(btrim(p_movimiento ->> 'id'), ''), 'tes_' || replace(gen_random_uuid()::text, '-', ''));
  insert into public.movimientos_tesoreria (
    id, empresa_id, tipo, descripcion, monto, moneda, fecha, cuenta_bancaria,
    cuenta_bancaria_id, tc_aplicado, monto_en_moneda_cuenta, referencia,
    vinculo_tipo, vinculo_id, estado, created_at
  ) values (
    v_movimiento_id, v_cxc.empresa_id, 'ingreso',
    coalesce(nullif(btrim(p_movimiento ->> 'descripcion'), ''), 'Cobro de factura'),
    v_monto + v_mora,
    coalesce(nullif(btrim(p_movimiento ->> 'moneda'), ''), v_cxc.moneda, 'PEN'),
    coalesce(nullif(p_movimiento ->> 'fecha', '')::date, v_cobro.fecha_cobro),
    nullif(btrim(p_movimiento ->> 'cuenta_bancaria'), ''),
    nullif(btrim(p_movimiento ->> 'cuenta_bancaria_id'), ''),
    nullif(p_movimiento ->> 'tc_aplicado', '')::numeric,
    nullif(p_movimiento ->> 'monto_en_moneda_cuenta', '')::numeric,
    nullif(btrim(p_movimiento ->> 'referencia'), ''),
    'cxc', v_cxc.id, 'registrado', now()
  ) returning * into v_movimiento;

  if p_comision is not null and coalesce(nullif(btrim(p_comision ->> 'id'), ''), '') <> '' then
    v_comision_id := p_comision ->> 'id';
    insert into public.comisiones (
      id, empresa_id, cobro_cxc_id, cxc_id, factura_id, vendedor_id, vendedor_nombre,
      monto_cobrado, porcentaje_comision, monto_comision, bonificacion, monto_total,
      modalidad_pago, periodo, estado, nota_acuerdo, tc_pen_usd, retencion_ir, creado_en
    ) values (
      v_comision_id, v_cxc.empresa_id, v_cobro.id, v_cxc.id, v_cxc.factura_id,
      nullif(btrim(p_comision ->> 'vendedor_id'), ''), nullif(btrim(p_comision ->> 'vendedor_nombre'), ''),
      coalesce(nullif(p_comision ->> 'monto_cobrado', '')::numeric, v_monto),
      nullif(p_comision ->> 'porcentaje_comision', '')::numeric,
      nullif(p_comision ->> 'monto_comision', '')::numeric,
      coalesce(nullif(p_comision ->> 'bonificacion', '')::numeric, 0),
      nullif(p_comision ->> 'monto_total', '')::numeric,
      nullif(btrim(p_comision ->> 'modalidad_pago'), ''),
      nullif(btrim(p_comision ->> 'periodo'), ''),
      coalesce(nullif(btrim(p_comision ->> 'estado'), ''), 'pendiente_aprobacion'),
      nullif(btrim(p_comision ->> 'nota_acuerdo'), ''),
      nullif(p_comision ->> 'tc_pen_usd', '')::numeric,
      coalesce(nullif(p_comision ->> 'retencion_ir', '')::boolean, false),
      now()
    ) returning * into v_comision;
  end if;

  return jsonb_build_object(
    'cxc', to_jsonb(v_cxc),
    'factura', case when v_factura.id is null then null else to_jsonb(v_factura) end,
    'cobro', to_jsonb(v_cobro),
    'movimiento', to_jsonb(v_movimiento),
    'comision', case when v_comision.id is null then null else to_jsonb(v_comision) end
  );
end;
$$;

revoke all on function public.registrar_cobro_cxc_atomico(text, text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.registrar_cobro_cxc_atomico(text, text, jsonb, jsonb, jsonb) to authenticated;

select pg_notify('pgrst', 'reload schema');
