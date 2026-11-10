-- TIDEO ERP - Financiamiento y Deuda: editar y eliminar financiamientos.
--
-- editar_financiamiento: actualiza la cabecera (todos los campos) y regenera las cuotas
--   no pagadas con la tabla que calcula el frontend. Las cuotas pagadas no se tocan.
--   Si el prestamo ya tiene pagos, la moneda no puede cambiar (los pagos y egresos de
--   Tesoreria quedaron en esa moneda). Si cambia la sociedad, se propaga a los gastos
--   de intereses generados por el prestamo.
--
-- eliminar_financiamiento: con p_ejecutar = false solo devuelve el impacto (cuotas, pagos,
--   egresos de Tesoreria por cuenta y gastos de intereses) para mostrarlo en la segunda
--   confirmacion. Con p_ejecutar = true borra en cascada: gastos de intereses, egresos de
--   Tesoreria vinculados, pagos, tabla de amortizacion y el financiamiento.

create or replace function public.editar_financiamiento(
  p_empresa_id text,
  p_id text,
  p_datos jsonb,
  p_cuotas jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actual public.financiamientos%rowtype;
  v_row public.financiamientos%rowtype;
  v_alcance uuid[];
  v_nueva_sociedad uuid;
  v_pagos integer;
  v_max_pagada integer;
  v_cuotas jsonb;
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tienes acceso al tenant %.', p_empresa_id;
  end if;
  if not public.usuario_puede(p_empresa_id, 'financiamiento', 'editar') then
    raise exception 'No tienes permiso para editar financiamientos en este tenant.';
  end if;

  select * into v_actual from public.financiamientos
  where id = p_id and empresa_id = p_empresa_id
  for update;
  if not found then
    raise exception 'Financiamiento % no encontrado en el tenant %.', p_id, p_empresa_id;
  end if;

  v_alcance := public.usuario_alcance_sociedades(p_empresa_id);
  v_nueva_sociedad := case when p_datos ? 'sociedad_id'
    then nullif(p_datos ->> 'sociedad_id', '')::uuid else v_actual.sociedad_id end;
  if v_alcance is not null and (
       not (v_actual.sociedad_id = any (v_alcance))
    or not (v_nueva_sociedad = any (v_alcance))
  ) then
    raise exception 'El financiamiento o la sociedad elegida esta fuera de tu alcance de sociedades.';
  end if;

  select count(*) into v_pagos from public.pagos_financiamiento where financiamiento_id = p_id;
  if v_pagos > 0 and coalesce(p_datos ->> 'moneda', v_actual.moneda) is distinct from v_actual.moneda then
    raise exception 'No se puede cambiar la moneda: el financiamiento ya tiene % pago(s) registrados en %.', v_pagos, v_actual.moneda;
  end if;

  select max(numero) into v_max_pagada from public.tabla_amortizacion
  where financiamiento_id = p_id and estado = 'pagada';
  if v_max_pagada is not null and coalesce((p_datos ->> 'plazo_meses')::integer, v_actual.plazo_meses) < v_max_pagada then
    raise exception 'El plazo no puede ser menor a % meses: la cuota % ya esta pagada.', v_max_pagada, v_max_pagada;
  end if;

  update public.financiamientos set
    tipo = coalesce(p_datos ->> 'tipo', tipo),
    entidad = coalesce(nullif(p_datos ->> 'entidad', ''), entidad),
    contacto_nombre = case when p_datos ? 'contacto_nombre' then p_datos ->> 'contacto_nombre' else contacto_nombre end,
    cuenta_bancaria_destino = case when p_datos ? 'cuenta_bancaria_destino' then p_datos ->> 'cuenta_bancaria_destino' else cuenta_bancaria_destino end,
    proposito = case when p_datos ? 'proposito' then p_datos ->> 'proposito' else proposito end,
    notas = case when p_datos ? 'notas' then p_datos ->> 'notas' else notas end,
    moneda = coalesce(p_datos ->> 'moneda', moneda),
    sociedad_id = v_nueva_sociedad,
    monto_original = coalesce((p_datos ->> 'monto_original')::numeric, monto_original),
    tasa_anual = coalesce((p_datos ->> 'tasa_anual')::numeric, tasa_anual),
    plazo_meses = coalesce((p_datos ->> 'plazo_meses')::integer, plazo_meses),
    meses_gracia = coalesce((p_datos ->> 'meses_gracia')::integer, meses_gracia),
    dia_pago = coalesce((p_datos ->> 'dia_pago')::integer, dia_pago),
    tipo_cuota = coalesce(p_datos ->> 'tipo_cuota', tipo_cuota),
    fecha_desembolso = coalesce((p_datos ->> 'fecha_desembolso')::date, fecha_desembolso),
    cuota_mensual = coalesce((p_datos ->> 'cuota_mensual')::numeric, cuota_mensual),
    fecha_primer_pago = coalesce((p_datos ->> 'fecha_primer_pago')::date, fecha_primer_pago),
    fecha_ultimo_pago = coalesce((p_datos ->> 'fecha_ultimo_pago')::date, fecha_ultimo_pago),
    saldo_pendiente = coalesce((p_datos ->> 'saldo_pendiente')::numeric, saldo_pendiente),
    estado = coalesce(p_datos ->> 'estado', estado),
    updated_at = now()
  where id = p_id and empresa_id = p_empresa_id
  returning * into v_row;

  if v_row.saldo_pendiente < 0 then
    raise exception 'El monto no puede ser menor al capital ya pagado.';
  end if;

  if v_nueva_sociedad is distinct from v_actual.sociedad_id then
    update public.compras_gastos set sociedad_id = v_nueva_sociedad, updated_at = now()
    where empresa_id = p_empresa_id and financiamiento_id = p_id;
  end if;

  delete from public.tabla_amortizacion
  where financiamiento_id = p_id and estado <> 'pagada';

  insert into public.tabla_amortizacion (
    empresa_id, financiamiento_id, numero, fecha, capital, interes, total, saldo, estado
  )
  select
    p_empresa_id, p_id,
    (c ->> 'numero')::integer,
    (c ->> 'fecha')::date,
    coalesce((c ->> 'capital')::numeric, 0),
    coalesce((c ->> 'interes')::numeric, 0),
    coalesce((c ->> 'total')::numeric, 0),
    coalesce((c ->> 'saldo')::numeric, 0),
    coalesce(c ->> 'estado', 'futura')
  from jsonb_array_elements(coalesce(p_cuotas, '[]'::jsonb)) as c
  where coalesce(c ->> 'estado', '') <> 'pagada'
    and not exists (
      select 1 from public.tabla_amortizacion t
      where t.financiamiento_id = p_id and t.numero = (c ->> 'numero')::integer
    );

  select coalesce(jsonb_agg(t order by t.numero), '[]'::jsonb)
  into v_cuotas
  from public.tabla_amortizacion t
  where t.financiamiento_id = p_id;

  return to_jsonb(v_row) || jsonb_build_object('tabla_amortizacion', v_cuotas);
end;
$$;

create or replace function public.eliminar_financiamiento(
  p_empresa_id text,
  p_id text,
  p_ejecutar boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fin public.financiamientos%rowtype;
  v_alcance uuid[];
  v_impacto jsonb;
  v_restantes integer;
begin
  if not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tienes acceso al tenant %.', p_empresa_id;
  end if;
  if not public.usuario_puede(p_empresa_id, 'financiamiento', 'eliminar') then
    raise exception 'No tienes permiso para eliminar financiamientos en este tenant.';
  end if;

  select * into v_fin from public.financiamientos
  where id = p_id and empresa_id = p_empresa_id
  for update;
  if not found then
    raise exception 'Financiamiento % no encontrado en el tenant %.', p_id, p_empresa_id;
  end if;

  v_alcance := public.usuario_alcance_sociedades(p_empresa_id);
  if v_alcance is not null and not (v_fin.sociedad_id = any (v_alcance)) then
    raise exception 'El financiamiento esta fuera de tu alcance de sociedades.';
  end if;

  select jsonb_build_object(
    'id', v_fin.id,
    'codigo', v_fin.codigo,
    'entidad', v_fin.entidad,
    'moneda', coalesce(v_fin.moneda, 'PEN'),
    'monto_original', v_fin.monto_original,
    'saldo_pendiente', v_fin.saldo_pendiente,
    'cuotas', (select count(*) from public.tabla_amortizacion where financiamiento_id = p_id),
    'cuotas_pagadas', (select count(*) from public.tabla_amortizacion where financiamiento_id = p_id and estado = 'pagada'),
    'pagos', (select count(*) from public.pagos_financiamiento where financiamiento_id = p_id),
    'pagos_total', (select coalesce(sum(total), 0) from public.pagos_financiamiento where financiamiento_id = p_id),
    'pagos_capital', (select coalesce(sum(capital), 0) from public.pagos_financiamiento where financiamiento_id = p_id),
    'pagos_interes', (select coalesce(sum(interes), 0) from public.pagos_financiamiento where financiamiento_id = p_id),
    'movimientos', (select count(*) from public.movimientos_tesoreria where empresa_id = p_empresa_id and vinculo_tipo = 'financiamiento' and vinculo_id = p_id),
    'movimientos_total', (select coalesce(sum(monto), 0) from public.movimientos_tesoreria where empresa_id = p_empresa_id and vinculo_tipo = 'financiamiento' and vinculo_id = p_id),
    'movimientos_por_cuenta', (
      select coalesce(jsonb_agg(jsonb_build_object('cuenta', cuenta, 'moneda', moneda, 'cantidad', cantidad, 'total', total) order by cuenta), '[]'::jsonb)
      from (
        select coalesce(nullif(cuenta_bancaria, ''), 'Sin cuenta') cuenta, coalesce(moneda, 'PEN') moneda, count(*) cantidad, sum(monto) total
        from public.movimientos_tesoreria
        where empresa_id = p_empresa_id and vinculo_tipo = 'financiamiento' and vinculo_id = p_id
        group by 1, 2
      ) x
    ),
    'gastos', (select count(*) from public.compras_gastos where empresa_id = p_empresa_id and financiamiento_id = p_id),
    'gastos_total', (select coalesce(sum(monto), 0) from public.compras_gastos where empresa_id = p_empresa_id and financiamiento_id = p_id)
  ) into v_impacto;

  if not coalesce(p_ejecutar, false) then
    return v_impacto;
  end if;

  delete from public.movimientos_tesoreria
  where empresa_id = p_empresa_id and vinculo_tipo = 'financiamiento' and vinculo_id = p_id;
  delete from public.compras_gastos
  where empresa_id = p_empresa_id and financiamiento_id = p_id;
  delete from public.pagos_financiamiento where financiamiento_id = p_id;
  delete from public.tabla_amortizacion where financiamiento_id = p_id;
  delete from public.financiamientos where id = p_id and empresa_id = p_empresa_id;

  select (select count(*) from public.financiamientos where id = p_id)
       + (select count(*) from public.tabla_amortizacion where financiamiento_id = p_id)
       + (select count(*) from public.pagos_financiamiento where financiamiento_id = p_id)
       + (select count(*) from public.movimientos_tesoreria where vinculo_tipo = 'financiamiento' and vinculo_id = p_id)
       + (select count(*) from public.compras_gastos where financiamiento_id = p_id)
  into v_restantes;
  if v_restantes <> 0 then
    raise exception 'La eliminacion del financiamiento % quedo incompleta (% registros restantes); se revierte.', v_fin.codigo, v_restantes;
  end if;

  return v_impacto || jsonb_build_object('eliminado', true);
end;
$$;

revoke execute on function public.editar_financiamiento(text, text, jsonb, jsonb) from public;
revoke execute on function public.editar_financiamiento(text, text, jsonb, jsonb) from anon;
grant execute on function public.editar_financiamiento(text, text, jsonb, jsonb) to authenticated, service_role;
revoke execute on function public.eliminar_financiamiento(text, text, boolean) from public;
revoke execute on function public.eliminar_financiamiento(text, text, boolean) from anon;
grant execute on function public.eliminar_financiamiento(text, text, boolean) to authenticated, service_role;

do $$
begin
  if to_regprocedure('public.editar_financiamiento(text,text,jsonb,jsonb)') is null
     or to_regprocedure('public.eliminar_financiamiento(text,text,boolean)') is null then
    raise exception 'Las funciones de editar/eliminar financiamiento no quedaron creadas.';
  end if;
  if has_function_privilege('anon', 'public.eliminar_financiamiento(text,text,boolean)', 'execute') then
    raise exception 'anon no debe poder ejecutar eliminar_financiamiento.';
  end if;
end;
$$;

select pg_notify('pgrst', 'reload schema');
