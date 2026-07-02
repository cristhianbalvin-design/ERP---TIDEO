-- TIDEO ERP - RPC transaccional para registrar el pago/abono de un financiamiento.
-- registrarPago en pages_fin_deuda.jsx solo actualizaba el estado local de React:
-- financiamientos, tabla_amortizacion y pagos_financiamiento nunca se persistian en
-- Supabase, y el insert de compras_gastos (gasto de intereses) fallaba en reintentos
-- por usar un id determinista sin manejo de conflicto. Esta RPC hace, en una sola
-- transaccion: actualiza la cabecera del financiamiento, actualiza el bulk de cuotas,
-- inserta el pago y el movimiento de tesoreria, e inserta (de forma idempotente) el
-- gasto de intereses. Sigue el mismo patron de 286_rpc_crear_financiamiento.sql.

create or replace function public.registrar_pago_financiamiento(
  p_empresa_id text,
  p_financiamiento_id text,
  p_saldo_pendiente numeric,
  p_estado text,
  p_cuotas_pagadas integer,
  p_intereses_pagados_total numeric,
  p_cuotas jsonb,
  p_pago jsonb,
  p_movimiento_tesoreria jsonb,
  p_gasto_interes jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_financiamiento public.financiamientos%rowtype;
  v_cuotas jsonb;
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tienes acceso al tenant %.', p_empresa_id;
  end if;

  if not public.usuario_puede(p_empresa_id, 'financiamiento', 'editar') then
    raise exception 'No tienes permiso para registrar pagos de financiamientos en este tenant.';
  end if;

  update public.financiamientos
  set saldo_pendiente = p_saldo_pendiente,
      estado = p_estado,
      cuotas_pagadas = p_cuotas_pagadas,
      intereses_pagados_total = p_intereses_pagados_total,
      updated_at = now()
  where id = p_financiamiento_id and empresa_id = p_empresa_id
  returning * into v_financiamiento;

  if not found then
    raise exception 'Financiamiento % no encontrado en el tenant %.', p_financiamiento_id, p_empresa_id;
  end if;

  update public.tabla_amortizacion t
  set capital = c.capital,
      interes = c.interes,
      total = c.total,
      saldo = c.saldo,
      estado = c.estado,
      fecha_pago_real = c.fecha_pago_real,
      referencia = c.referencia,
      comprobante = c.comprobante,
      updated_at = now()
  from jsonb_to_recordset(coalesce(p_cuotas, '[]'::jsonb)) as c(
    numero integer, capital numeric, interes numeric, total numeric, saldo numeric,
    estado text, fecha_pago_real date, referencia text, comprobante text
  )
  where t.financiamiento_id = p_financiamiento_id and t.numero = c.numero;

  insert into public.pagos_financiamiento (
    id, empresa_id, financiamiento_id, fecha_pago, tipo, cuota_numero,
    capital, interes, total, saldo_despues, moneda, cuenta_bancaria, referencia, comprobante, registrado_por
  )
  values (
    p_pago ->> 'id', p_empresa_id, p_financiamiento_id,
    (p_pago ->> 'fecha_pago')::date, p_pago ->> 'tipo',
    nullif(p_pago ->> 'cuota_numero', '')::integer,
    coalesce((p_pago ->> 'capital')::numeric, 0),
    coalesce((p_pago ->> 'interes')::numeric, 0),
    coalesce((p_pago ->> 'total')::numeric, 0),
    coalesce((p_pago ->> 'saldo_despues')::numeric, 0),
    coalesce(p_pago ->> 'moneda', 'PEN'),
    p_pago ->> 'cuenta_bancaria',
    p_pago ->> 'referencia',
    p_pago ->> 'comprobante',
    auth.uid()
  );

  insert into public.movimientos_tesoreria (
    id, empresa_id, tipo, descripcion, monto, moneda, fecha,
    cuenta_bancaria, referencia, vinculo_tipo, vinculo_id, estado
  )
  values (
    p_movimiento_tesoreria ->> 'id', p_empresa_id,
    coalesce(p_movimiento_tesoreria ->> 'tipo', 'egreso'),
    p_movimiento_tesoreria ->> 'descripcion',
    coalesce((p_movimiento_tesoreria ->> 'monto')::numeric, 0),
    coalesce(p_movimiento_tesoreria ->> 'moneda', 'PEN'),
    (p_movimiento_tesoreria ->> 'fecha')::date,
    p_movimiento_tesoreria ->> 'cuenta_bancaria',
    p_movimiento_tesoreria ->> 'referencia',
    p_movimiento_tesoreria ->> 'vinculo_tipo',
    p_movimiento_tesoreria ->> 'vinculo_id',
    coalesce(p_movimiento_tesoreria ->> 'estado', 'registrado')
  );

  if p_gasto_interes is not null then
    insert into public.compras_gastos (
      id, empresa_id, tipo, descripcion, categoria, subcategoria, monto, moneda, fecha,
      financiamiento_id, cuota_numero, estado
    )
    values (
      p_gasto_interes ->> 'id', p_empresa_id,
      coalesce(p_gasto_interes ->> 'tipo', 'gasto'),
      p_gasto_interes ->> 'descripcion',
      p_gasto_interes ->> 'categoria',
      p_gasto_interes ->> 'subcategoria',
      coalesce((p_gasto_interes ->> 'monto')::numeric, 0),
      coalesce(p_gasto_interes ->> 'moneda', 'PEN'),
      (p_gasto_interes ->> 'fecha')::date,
      p_gasto_interes ->> 'financiamiento_id',
      nullif(p_gasto_interes ->> 'cuota_numero', '')::integer,
      coalesce(p_gasto_interes ->> 'estado', 'registrado')
    )
    on conflict (id) do update set
      monto = excluded.monto,
      descripcion = excluded.descripcion,
      estado = excluded.estado,
      updated_at = now();
  end if;

  select coalesce(jsonb_agg(t order by t.numero), '[]'::jsonb)
  into v_cuotas
  from public.tabla_amortizacion t
  where t.financiamiento_id = p_financiamiento_id;

  return to_jsonb(v_financiamiento) || jsonb_build_object('tabla_amortizacion', v_cuotas);
end;
$$;

grant execute on function public.registrar_pago_financiamiento(
  text, text, numeric, text, integer, numeric, jsonb, jsonb, jsonb, jsonb
) to authenticated;

select pg_notify('pgrst', 'reload schema');
