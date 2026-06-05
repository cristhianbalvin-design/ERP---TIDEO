-- Backfill puntual: gasto Anthropic pagado sin CxP/tesoreria.
-- Usa movimientos_tesoreria como tabla equivalente a flujo_caja.

do $$
declare
  v_empresa_id text;
  v_g public.compras_gastos%rowtype;
  v_cuenta record;
  v_ceco_id text;
  v_cxp_id text;
  v_pago_id text;
  v_mov_id text;
begin
  select id into v_empresa_id
  from public.empresas
  where nombre_comercial ilike '%TIDEO TECH%STRATEGY%'
     or razon_social ilike '%TIDEO TECH%STRATEGY%'
  order by id
  limit 1;

  if v_empresa_id is null then
    return;
  end if;

  select *
  into v_g
  from public.compras_gastos
  where empresa_id = v_empresa_id
    and fecha = '2026-05-11'
    and coalesce(moneda, 'PEN') = 'USD'
    and abs(coalesce(monto, 0) - 162) <= 0.01
    and descripcion ilike '%Prepaid extra usage, Individual plan%'
  order by id
  limit 1;

  if not found then
    return;
  end if;

  if v_g.cxp_id is not null or exists (
    select 1 from public.cxp c where c.gasto_id = v_g.id and c.origen = 'auto_gasto'
  ) then
    return;
  end if;

  select *
  into v_cuenta
  from public.cuentas_bancarias
  where empresa_id = v_empresa_id
    and estado = 'activo'
    and moneda = 'USD'
    and (
      coalesce(nombre, '') ilike '%INTERBANK%'
      or coalesce(banco, '') ilike '%INTERBANK%'
    )
  order by coalesce(nombre, banco, id)
  limit 1;

  if not found then
    select *
    into v_cuenta
    from public.cuentas_bancarias
    where empresa_id = v_empresa_id
      and estado = 'activo'
    order by case when moneda = 'USD' then 0 else 1 end, coalesce(nombre, banco, id)
    limit 1;
  end if;

  if not found then
    return;
  end if;

  select id into v_ceco_id
  from public.centros_costo
  where empresa_id = v_empresa_id
    and (
      nombre ilike '%Desarrollo%Ingenier%'
      or nombre ilike '%Ingenier%'
    )
  order by nombre
  limit 1;

  v_cxp_id := 'cxp_auto_' || substr(md5(v_g.id), 1, 12);
  v_pago_id := 'cxpp_auto_' || substr(md5(v_g.id), 1, 12);
  v_mov_id := 'tes_auto_' || substr(md5(v_g.id), 1, 12);

  perform public.registrar_gasto_pagado_auto(jsonb_build_object(
    'gasto_id', v_g.id,
    'cxp', jsonb_build_object(
      'id', v_cxp_id,
      'empresa_id', v_g.empresa_id,
      'tipo_beneficiario', 'proveedor',
      'concepto', 'Prepaid extra usage, Individual plan',
      'monto_total', 162,
      'monto_pagado', 162,
      'saldo', 0,
      'moneda', 'USD',
      'fecha_emision', '2026-05-11',
      'fecha_vencimiento', '2026-05-11',
      'tipo_comprobante', 'Sin comprobante',
      'categoria_er', 'Licencias por proyecto',
      'centro_costo_id', coalesce(v_g.centro_costo_id, v_ceco_id),
      'ot_vinc_id', v_g.ot_vinc_id,
      'gasto_id', v_g.id,
      'origen', 'auto_gasto',
      'no_devengar_er', true,
      'estado', 'pagada',
      'created_at', now()
    ),
    'pago', jsonb_build_object(
      'id', v_pago_id,
      'empresa_id', v_g.empresa_id,
      'cxp_id', v_cxp_id,
      'fecha_pago', '2026-05-11',
      'monto', 162,
      'cuenta_bancaria', coalesce(v_cuenta.nombre, v_cuenta.banco, v_cuenta.id),
      'cuenta_bancaria_id', v_cuenta.id,
      'referencia', v_g.referencia_pago,
      'creado_en', now()
    ),
    'movimiento', jsonb_build_object(
      'id', v_mov_id,
      'empresa_id', v_g.empresa_id,
      'tipo', 'egreso',
      'descripcion', 'Prepaid extra usage, Individual plan',
      'monto', 162,
      'moneda', 'USD',
      'fecha', '2026-05-11',
      'cuenta_bancaria', coalesce(v_cuenta.nombre, v_cuenta.banco, v_cuenta.id),
      'cuenta_bancaria_id', v_cuenta.id,
      'tc_aplicado', 1,
      'monto_en_moneda_cuenta', 162,
      'referencia', coalesce(v_g.referencia_pago, ''),
      'vinculo_tipo', 'cxp',
      'vinculo_id', v_cxp_id,
      'gasto_id', v_g.id,
      'estado', 'registrado',
      'es_manual', false,
      'created_at', now()
    )
  ));
end $$;

select pg_notify('pgrst', 'reload schema');
