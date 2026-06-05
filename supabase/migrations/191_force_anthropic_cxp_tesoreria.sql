-- Refuerzo idempotente para Anthropic: asegura CxP, pago y tesoreria.

do $$
declare
  v_empresa_id text;
  v_g record;
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
    and estado_pago = 'pagado'
    and (
      descripcion ilike '%Prepaid%'
      or descripcion ilike '%Individual plan%'
      or categoria ilike '%Licencias%'
    )
  order by id
  limit 1;

  if not found then
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

  v_cxp_id := v_g.cxp_id;

  if v_cxp_id is null then
    select c.id
    into v_cxp_id
    from public.cxp c
    where c.gasto_id = v_g.id
      and c.origen = 'auto_gasto'
    order by c.created_at desc
    limit 1;
  end if;

  v_cxp_id := coalesce(v_cxp_id, 'cxp_auto_' || substr(md5(v_g.id), 1, 12));
  v_pago_id := 'cxpp_auto_' || substr(md5(v_g.id), 1, 12);
  v_mov_id := 'tes_auto_' || substr(md5(v_g.id), 1, 12);

  insert into public.cxp (
    id, empresa_id, tipo_beneficiario, concepto, monto_total, monto_pagado, saldo,
    moneda, fecha_emision, fecha_vencimiento, tipo_comprobante, categoria_er,
    centro_costo_id, ot_vinc_id, gasto_id, origen, no_devengar_er, estado, created_at
  ) values (
    v_cxp_id, v_g.empresa_id, 'proveedor', 'Prepaid extra usage, Individual plan', 162, 162, 0,
    'USD', '2026-05-11', '2026-05-11', 'Sin comprobante', 'Licencias por proyecto',
    coalesce(v_g.centro_costo_id, v_ceco_id), v_g.ot_vinc_id, v_g.id, 'auto_gasto', true, 'pagada', now()
  )
  on conflict (id) do update
    set estado = 'pagada',
        monto_total = 162,
        monto_pagado = 162,
        saldo = 0,
        origen = 'auto_gasto',
        no_devengar_er = true,
        categoria_er = 'Licencias por proyecto',
        centro_costo_id = coalesce(excluded.centro_costo_id, public.cxp.centro_costo_id),
        updated_at = now();

  update public.compras_gastos
  set cxp_id = v_cxp_id,
      estado_pago = 'pagado',
      categoria = coalesce(categoria, 'Licencias por proyecto'),
      centro_costo_id = coalesce(centro_costo_id, v_ceco_id)
  where id = v_g.id;

  insert into public.cxp_pagos (
    id, empresa_id, cxp_id, fecha_pago, monto, cuenta_bancaria, cuenta_bancaria_id, referencia, creado_en
  ) values (
    v_pago_id, v_g.empresa_id, v_cxp_id, '2026-05-11', 162,
    coalesce(v_cuenta.nombre, v_cuenta.banco, v_cuenta.id), v_cuenta.id, v_g.referencia_pago, now()
  )
  on conflict (id) do nothing;

  insert into public.movimientos_tesoreria (
    id, empresa_id, tipo, descripcion, monto, moneda, fecha, cuenta_bancaria,
    cuenta_bancaria_id, tc_aplicado, monto_en_moneda_cuenta, referencia,
    vinculo_tipo, vinculo_id, gasto_id, estado, es_manual, created_at
  ) values (
    v_mov_id, v_g.empresa_id, 'egreso', 'Prepaid extra usage, Individual plan', 162, 'USD', '2026-05-11',
    coalesce(v_cuenta.nombre, v_cuenta.banco, v_cuenta.id), v_cuenta.id, 1, 162,
    coalesce(v_g.referencia_pago, ''), 'cxp', v_cxp_id, v_g.id, 'registrado', false, now()
  )
  on conflict (id) do update
    set cuenta_bancaria_id = excluded.cuenta_bancaria_id,
        cuenta_bancaria = excluded.cuenta_bancaria,
        tc_aplicado = 1,
        monto_en_moneda_cuenta = 162,
        vinculo_tipo = 'cxp',
        vinculo_id = v_cxp_id,
        estado = 'registrado',
        es_manual = false;
end $$;

select pg_notify('pgrst', 'reload schema');
