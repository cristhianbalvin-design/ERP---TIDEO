-- Repara exclusivamente la factura F001-776, emitida cuando la CxC se intentaba
-- crear antes de que la factura fuera persistida. No existen cobros persistidos.

do $$
declare
  v_total numeric(14,2);
  v_empresa text;
  v_cuenta text;
  v_os text;
  v_moneda text;
  v_fecha_emision date;
  v_fecha_vencimiento date;
  v_condicion text;
  v_sociedad uuid;
  v_retencion numeric(14,2);
begin
  select empresa_id, cuenta_id, os_cliente_id, total, moneda, fecha_emision,
         fecha_vencimiento, condicion_pago, sociedad_id, monto_retencion
  into v_empresa, v_cuenta, v_os, v_total, v_moneda, v_fecha_emision,
       v_fecha_vencimiento, v_condicion, v_sociedad, v_retencion
  from public.facturas
  where id = 'fac_828908' and empresa_id = 'emp_20541435833'
  for update;

  if not found then
    raise exception 'Factura objetivo F001-776 no encontrada.';
  end if;
  if exists (select 1 from public.cxc where factura_id = 'fac_828908') then
    raise exception 'F001-776 ya tiene una CxC; no se aplica reparación.';
  end if;
  if exists (select 1 from public.cobros_cxc where factura_id = 'fac_828908') then
    raise exception 'F001-776 tiene cobros persistidos; se requiere conciliación manual.';
  end if;

  insert into public.cxc (
    id, empresa_id, cuenta_id, factura_id, os_cliente_id, sociedad_id,
    fecha_emision, fecha_vencimiento, monto_total, monto_pagado, saldo,
    moneda, estado, condicion_pago, monto_retencion, glosa
  ) values (
    'cxc_reparada_fac_828908', v_empresa, v_cuenta, 'fac_828908', v_os, v_sociedad,
    v_fecha_emision, v_fecha_vencimiento, v_total, 0, v_total - coalesce(v_retencion, 0),
    v_moneda, 'por_cobrar', v_condicion, coalesce(v_retencion, 0),
    'CxC reparada tras emisión sin persistencia de CxC'
  );

  update public.facturas
  set estado = 'emitida', updated_at = now()
  where id = 'fac_828908';

  if v_os is not null then
    update public.os_clientes
    set saldo_por_facturar = greatest(0, coalesce(saldo_por_facturar, 0) - v_total),
        monto_facturado = coalesce(monto_facturado, 0) + v_total,
        updated_at = now()
    where id = v_os and empresa_id = v_empresa;
  end if;
end;
$$;

select pg_notify('pgrst', 'reload schema');
