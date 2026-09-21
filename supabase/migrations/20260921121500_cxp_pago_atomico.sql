-- Pago de CxP atomico: actualiza la CxP, registra el pago y crea el egreso
-- de Tesoreria dentro de la misma transaccion de base de datos.

create or replace function public.registrar_pago_cxp_atomico(
  p_cxp_id text,
  p_monto numeric,
  p_pago jsonb,
  p_movimiento jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cxp public.cxp%rowtype;
  v_cxp_actualizada jsonb;
  v_nuevo_monto numeric;
  v_nuevo_saldo numeric;
  v_nuevo_estado text;
  v_pago jsonb := coalesce(p_pago, '{}'::jsonb);
  v_movimiento jsonb := coalesce(p_movimiento, '{}'::jsonb);
  v_pago_guardado public.cxp_pagos%rowtype;
  v_movimiento_guardado public.movimientos_tesoreria%rowtype;
  v_recibo public.recibos_honorarios%rowtype;
begin
  if nullif(btrim(coalesce(p_cxp_id, '')), '') is null then
    raise exception 'El id de CxP es obligatorio';
  end if;
  if p_monto is null then
    raise exception 'El monto del pago es obligatorio';
  end if;

  select * into v_cxp
  from public.cxp
  where id = p_cxp_id
  for update;

  if not found then
    raise exception 'La CxP % no existe', p_cxp_id;
  end if;

  v_nuevo_monto := coalesce(v_cxp.monto_pagado, 0) + p_monto;
  v_nuevo_saldo := greatest(0, coalesce(v_cxp.monto_total, 0) - v_nuevo_monto);
  v_nuevo_estado := case when v_nuevo_saldo <= 0 then 'pagada' else 'pago_parcial' end;

  -- Delegar en el autorizador ya cerrado garantiza exactamente el mismo
  -- permiso de cxp_pago: cxp:editar OR ver_finanzas.
  v_cxp_actualizada := public.generar_cxp_centralizado(
    jsonb_build_object(
      'id', p_cxp_id,
      'monto_pagado', v_nuevo_monto,
      'saldo', v_nuevo_saldo,
      'estado', v_nuevo_estado
    ),
    'cxp_pago',
    'actualizar'
  );

  insert into public.cxp_pagos (
    id,
    empresa_id,
    cxp_id,
    fecha_pago,
    monto,
    cuenta_bancaria,
    referencia,
    registrado_por,
    creado_en,
    cuenta_bancaria_id,
    metodo_pago
  ) values (
    coalesce(nullif(v_pago->>'id', ''), 'cxpp_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20)),
    v_cxp.empresa_id,
    p_cxp_id,
    coalesce(nullif(v_pago->>'fecha_pago', '')::date, current_date),
    p_monto,
    nullif(v_pago->>'cuenta_bancaria', ''),
    nullif(v_pago->>'referencia', ''),
    nullif(v_pago->>'registrado_por', ''),
    coalesce(nullif(v_pago->>'creado_en', '')::timestamptz, now()),
    nullif(v_pago->>'cuenta_bancaria_id', ''),
    nullif(v_pago->>'metodo_pago', '')
  ) returning * into v_pago_guardado;

  insert into public.movimientos_tesoreria (
    id,
    empresa_id,
    tipo,
    descripcion,
    monto,
    moneda,
    fecha,
    cuenta_bancaria,
    referencia,
    vinculo_tipo,
    vinculo_id,
    estado,
    cuenta_bancaria_id,
    tc_aplicado,
    monto_en_moneda_cuenta
  ) values (
    coalesce(nullif(v_movimiento->>'id', ''), 'tes_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20)),
    v_cxp.empresa_id,
    'egreso',
    coalesce(nullif(v_movimiento->>'descripcion', ''), 'Pago CxP ' || p_cxp_id),
    p_monto,
    coalesce(nullif(v_movimiento->>'moneda', ''), v_cxp.moneda, 'PEN'),
    coalesce(nullif(v_movimiento->>'fecha', '')::date, current_date),
    nullif(v_movimiento->>'cuenta_bancaria', ''),
    nullif(v_movimiento->>'referencia', ''),
    'cxp',
    p_cxp_id,
    coalesce(nullif(v_movimiento->>'estado', ''), 'registrado'),
    nullif(v_movimiento->>'cuenta_bancaria_id', ''),
    nullif(v_movimiento->>'tc_aplicado', '')::numeric,
    nullif(v_movimiento->>'monto_en_moneda_cuenta', '')::numeric
  ) returning * into v_movimiento_guardado;

  -- Sincronizaciones que antes ocurrían después de las tres escrituras
  -- principales. Al quedar aquí también se revierten ante cualquier error.
  if v_nuevo_estado = 'pagada' and v_cxp.gasto_id is not null then
    update public.compras_gastos
    set estado_pago = 'pagado'
    where id = v_cxp.gasto_id
      and empresa_id = v_cxp.empresa_id;
  end if;

  if v_nuevo_estado = 'pagada' and v_cxp.recibo_honorarios_id is not null then
    select * into v_recibo
    from public.recibos_honorarios
    where id = v_cxp.recibo_honorarios_id
      and empresa_id = v_cxp.empresa_id
    for update;

    if found then
      update public.recibos_honorarios
      set estado = 'pagado'
      where id = v_recibo.id
        and empresa_id = v_cxp.empresa_id;

      if v_recibo.comisiones_ids is not null and cardinality(v_recibo.comisiones_ids) > 0 then
        update public.comisiones
        set estado = 'pagada',
            pagado_en = now(),
            recibo_id = v_recibo.id
        where empresa_id = v_cxp.empresa_id
          and id = any(v_recibo.comisiones_ids);
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'cxp', v_cxp_actualizada,
    'pago', to_jsonb(v_pago_guardado),
    'movimiento', to_jsonb(v_movimiento_guardado)
  );
end;
$$;

revoke execute on function public.registrar_pago_cxp_atomico(text, numeric, jsonb, jsonb) from public, anon;
grant execute on function public.registrar_pago_cxp_atomico(text, numeric, jsonb, jsonb) to authenticated;
