-- Compras/Gastos pagados: CxP automatica + pago + movimiento de tesoreria.
-- En este esquema la tabla equivalente a flujo_caja es public.movimientos_tesoreria.

alter table public.cxp
  add column if not exists origen text default 'manual';

alter table public.movimientos_tesoreria
  add column if not exists gasto_id text references public.compras_gastos(id) on delete set null;

alter table public.cxp_pagos
  add column if not exists cuenta_bancaria_id text references public.cuentas_bancarias(id) on delete set null;

create index if not exists idx_movimientos_tesoreria_gasto_id
  on public.movimientos_tesoreria(empresa_id, gasto_id)
  where gasto_id is not null;

create unique index if not exists idx_cxp_auto_gasto_unique
  on public.cxp(gasto_id)
  where gasto_id is not null and origen = 'auto_gasto';

create or replace function public.registrar_gasto_pagado_auto(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gasto_id text;
  v_gasto public.compras_gastos%rowtype;
  v_existing public.cxp%rowtype;
  v_cxp public.cxp%rowtype;
  v_pago public.cxp_pagos%rowtype;
  v_mov public.movimientos_tesoreria%rowtype;
begin
  v_gasto_id := coalesce(
    p_payload->>'gasto_id',
    p_payload #>> '{cxp,gasto_id}',
    p_payload #>> '{movimiento,gasto_id}'
  );

  if v_gasto_id is null then
    raise exception 'gasto_id requerido';
  end if;

  select * into v_gasto
  from public.compras_gastos
  where id = v_gasto_id
  for update;

  if not found then
    raise exception 'compras_gastos % no existe', v_gasto_id;
  end if;

  if v_gasto.cxp_id is not null then
    select * into v_existing from public.cxp where id = v_gasto.cxp_id;
    return jsonb_build_object(
      'created', false,
      'cxp', to_jsonb(v_existing),
      'pago', null,
      'movimiento', null
    );
  end if;

  select * into v_existing
  from public.cxp
  where gasto_id = v_gasto_id
    and origen = 'auto_gasto'
  limit 1;

  if found then
    update public.compras_gastos
    set cxp_id = v_existing.id,
        estado_pago = 'pagado'
    where id = v_gasto_id
    returning * into v_gasto;

    return jsonb_build_object(
      'created', false,
      'cxp', to_jsonb(v_existing),
      'pago', null,
      'movimiento', null
    );
  end if;

  insert into public.cxp
  select * from jsonb_populate_record(null::public.cxp, p_payload->'cxp')
  returning * into v_cxp;

  insert into public.cxp_pagos
  select * from jsonb_populate_record(null::public.cxp_pagos, p_payload->'pago')
  returning * into v_pago;

  insert into public.movimientos_tesoreria
  select * from jsonb_populate_record(null::public.movimientos_tesoreria, p_payload->'movimiento')
  returning * into v_mov;

  update public.compras_gastos
  set cxp_id = v_cxp.id,
      estado_pago = 'pagado'
  where id = v_gasto_id;

  return jsonb_build_object(
    'created', true,
    'cxp', to_jsonb(v_cxp),
    'pago', to_jsonb(v_pago),
    'movimiento', to_jsonb(v_mov)
  );
end;
$$;

create or replace function public.revertir_gasto_pagado_auto(p_gasto_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cxp public.cxp%rowtype;
  v_auto boolean := false;
begin
  select * into v_cxp
  from public.cxp
  where gasto_id = p_gasto_id
  order by case when origen = 'auto_gasto' then 0 else 1 end, created_at desc
  limit 1
  for update;

  v_auto := found and v_cxp.origen = 'auto_gasto';

  delete from public.movimientos_tesoreria
  where gasto_id = p_gasto_id
     or (found and vinculo_tipo = 'cxp' and vinculo_id = v_cxp.id);

  if v_auto then
    delete from public.cxp_pagos where cxp_id = v_cxp.id;

    update public.cxp
    set estado = 'por_pagar',
        monto_pagado = 0,
        saldo = coalesce(monto_total, 0),
        updated_at = now()
    where id = v_cxp.id
    returning * into v_cxp;

    update public.compras_gastos
    set estado_pago = 'pendiente',
        cxp_id = v_cxp.id
    where id = p_gasto_id;
  else
    update public.compras_gastos
    set estado_pago = 'pendiente'
    where id = p_gasto_id;
  end if;

  return jsonb_build_object('ok', true, 'auto_gasto', v_auto, 'cxp', to_jsonb(v_cxp));
end;
$$;

grant execute on function public.registrar_gasto_pagado_auto(jsonb) to authenticated;
grant execute on function public.revertir_gasto_pagado_auto(text) to authenticated;

do $$
declare
  v_empresa_id text;
  v_cuenta record;
  v_g record;
  v_tc record;
  v_tc_factor numeric;
  v_monto_cuenta numeric;
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

  for v_g in
    select *
    from public.compras_gastos
    where empresa_id = v_empresa_id
      and estado_pago = 'pagado'
      and cxp_id is null
      and (
        descripcion ilike '%ChatGPT Plus Subscription%'
        or descripcion ilike '%Prepaid extra usage Anthropic%'
        or descripcion ilike '%Prepaid extra usage, Individual plan%'
        or descripcion ilike '%Materiales de limpieza%'
        or descripcion ilike '%Garant%Alquiler oficina%'
      )
      and not exists (
        select 1
        from public.cxp c
        where c.gasto_id = compras_gastos.id
          and c.origen = 'auto_gasto'
      )
  loop
    select *
    into v_tc
    from public.tipo_cambio_historico
    where moneda_base = 'PEN'
      and fecha <= v_g.fecha
    order by fecha desc
    limit 1;

    if not found then
      select *
      into v_tc
      from public.tipo_cambio_historico
      where moneda_base = 'PEN'
      order by fecha desc
      limit 1;
    end if;

    if coalesce(v_g.moneda, 'PEN') = coalesce(v_cuenta.moneda, v_g.moneda, 'PEN') then
      v_tc_factor := 1;
      v_monto_cuenta := v_g.monto;
    elsif v_g.moneda = 'PEN' and v_cuenta.moneda = 'USD' then
      v_tc_factor := v_tc.usd;
      v_monto_cuenta := round(v_g.monto * coalesce(v_tc.usd, 1), 2);
    elsif v_g.moneda = 'USD' and v_cuenta.moneda = 'PEN' then
      v_tc_factor := case when v_tc.usd is not null and v_tc.usd <> 0 then round(1 / v_tc.usd, 6) else null end;
      v_monto_cuenta := round(v_g.monto / nullif(coalesce(v_tc.usd, 1), 0), 2);
    else
      v_tc_factor := null;
      v_monto_cuenta := v_g.monto;
    end if;

    v_cxp_id := 'cxp_auto_' || substr(md5(v_g.id), 1, 12);
    v_pago_id := 'cxpp_auto_' || substr(md5(v_g.id), 1, 12);
    v_mov_id := 'tes_auto_' || substr(md5(v_g.id), 1, 12);

    perform public.registrar_gasto_pagado_auto(jsonb_build_object(
      'gasto_id', v_g.id,
      'cxp', jsonb_build_object(
        'id', v_cxp_id,
        'empresa_id', v_g.empresa_id,
        'tipo_beneficiario', 'proveedor',
        'concepto', v_g.descripcion,
        'monto_total', v_g.monto,
        'monto_pagado', v_g.monto,
        'saldo', 0,
        'moneda', coalesce(v_g.moneda, 'PEN'),
        'fecha_emision', v_g.fecha,
        'fecha_vencimiento', v_g.fecha,
        'tipo_comprobante', 'Sin comprobante',
        'categoria_er', v_g.categoria,
        'centro_costo_id', v_g.centro_costo_id,
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
        'fecha_pago', v_g.fecha,
        'monto', v_g.monto,
        'cuenta_bancaria', coalesce(v_cuenta.nombre, v_cuenta.banco, v_cuenta.id),
        'cuenta_bancaria_id', v_cuenta.id,
        'referencia', v_g.referencia_pago,
        'creado_en', now()
      ),
      'movimiento', jsonb_build_object(
        'id', v_mov_id,
        'empresa_id', v_g.empresa_id,
        'tipo', 'egreso',
        'descripcion', 'Pago ' || v_g.descripcion,
        'monto', v_g.monto,
        'moneda', coalesce(v_g.moneda, 'PEN'),
        'fecha', v_g.fecha,
        'cuenta_bancaria', coalesce(v_cuenta.nombre, v_cuenta.banco, v_cuenta.id),
        'cuenta_bancaria_id', v_cuenta.id,
        'tc_aplicado', v_tc_factor,
        'monto_en_moneda_cuenta', v_monto_cuenta,
        'referencia', coalesce(v_g.referencia_pago, ''),
        'vinculo_tipo', 'cxp',
        'vinculo_id', v_cxp_id,
        'gasto_id', v_g.id,
        'estado', 'registrado',
        'es_manual', false,
        'created_at', now()
      )
    ));
  end loop;
end $$;

with latest_tc as (
  select usd
  from public.tipo_cambio_historico
  where moneda_base = 'PEN'
  order by fecha desc
  limit 1
)
update public.movimientos_tesoreria m
set tc_aplicado = latest_tc.usd,
    monto_en_moneda_cuenta = round(m.monto * latest_tc.usd, 2)
from public.compras_gastos g, public.cuentas_bancarias cb, latest_tc
where m.gasto_id = g.id
  and m.cuenta_bancaria_id = cb.id
  and g.empresa_id = cb.empresa_id
  and m.vinculo_tipo = 'cxp'
  and m.moneda = 'PEN'
  and cb.moneda = 'USD'
  and latest_tc.usd is not null
  and (
    g.descripcion ilike '%ChatGPT Plus Subscription%'
    or g.descripcion ilike '%Prepaid extra usage Anthropic%'
    or g.descripcion ilike '%Prepaid extra usage, Individual plan%'
    or g.descripcion ilike '%Materiales de limpieza%'
    or g.descripcion ilike '%Garant%Alquiler oficina%'
  );

select pg_notify('pgrst', 'reload schema');
