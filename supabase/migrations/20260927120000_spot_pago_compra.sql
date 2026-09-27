-- SPOT / Bloque 3b-2: pago neto al proveedor y deposito SPOT atomicos.
-- Las funciones existentes se reconstruyen desde pg_get_functiondef remoto y
-- cada reemplazo verifica que el diff se limite al bloque previsto.

do $guard$
begin
  if to_regclass('public.detracciones') is null
     or to_regclass('public.cxp') is null
     or to_regclass('public.cuentas_bancarias') is null
     or to_regclass('public.proveedor_cuentas_bancarias') is null
     or to_regclass('public.movimientos_tesoreria') is null then
    raise exception 'B3B2_GUARD|faltan tablas base';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'detracciones'
      and column_name in ('cuenta_origen_id', 'proveedor_cuenta_id')
  ) then
    raise exception 'B3B2_GUARD|una columna SPOT de compra ya existe';
  end if;
end;
$guard$;

alter table public.detracciones
  add column cuenta_origen_id text,
  add column proveedor_cuenta_id text;

alter table public.detracciones
  add constraint detracciones_cuenta_origen_id_fkey
    foreign key (cuenta_origen_id) references public.cuentas_bancarias(id),
  add constraint detracciones_proveedor_cuenta_id_fkey
    foreign key (proveedor_cuenta_id) references public.proveedor_cuentas_bancarias(id);

create or replace function pg_temp.b3b2_occurrences(
  p_text text,
  p_needle text
)
returns integer
language plpgsql
as $function$
begin
  if p_needle is null or p_needle = '' then
    raise exception 'B3B2|ancla vacia';
  end if;
  return (length(p_text) - length(replace(p_text, p_needle, ''))) / length(p_needle);
end;
$function$;

create or replace function pg_temp.b3b2_assert_exact_rewrite(
  p_etiqueta text,
  p_remota text,
  p_generada text,
  p_vieja text,
  p_nueva text
)
returns void
language plpgsql
as $function$
begin
  if pg_temp.b3b2_occurrences(p_remota, p_vieja) <> 1 then
    raise exception 'B3B2|ancla remota no coincide una sola vez|%', p_etiqueta;
  end if;
  if pg_temp.b3b2_occurrences(p_generada, p_nueva) <> 1 then
    raise exception 'B3B2|cambio generado no coincide una sola vez|%', p_etiqueta;
  end if;
  if replace(p_generada, p_nueva, p_vieja) <> p_remota then
    raise exception 'B3B2|diff fuera de lo previsto|%', p_etiqueta;
  end if;
end;
$function$;

do $rewrite_pago$
declare
  v_oid oid;
  v_before text;
  v_stage text;
  v_after text;
  v_old text;
  v_new text;
begin
  select p.oid, pg_get_functiondef(p.oid)
    into v_oid, v_before
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'registrar_pago_cxp_atomico'
    and pg_get_function_identity_arguments(p.oid) = 'p_cxp_id text, p_monto numeric, p_pago jsonb, p_movimiento jsonb';

  if v_oid is null or v_before is null then
    raise exception 'B3B2|registrar_pago_cxp_atomico ausente';
  end if;

  v_old := '  v_recibo public.recibos_honorarios%rowtype;';
  v_new := v_old || E'\n'
    || '  v_detraccion public.detracciones%rowtype;' || E'\n'
    || '  v_cuenta_pago public.cuentas_bancarias%rowtype;' || E'\n'
    || '  v_cuenta_spot public.cuentas_bancarias%rowtype;' || E'\n'
    || '  v_proveedor_cuenta public.proveedor_cuentas_bancarias%rowtype;' || E'\n'
    || '  v_movimiento_spot public.movimientos_tesoreria%rowtype;' || E'\n'
    || '  v_con_deposito_spot boolean := coalesce((v_pago ->> ''con_deposito_spot'')::boolean, false);' || E'\n'
    || '  v_saldo_pendiente numeric;' || E'\n'
    || '  v_monto_detraccion_cxp numeric;' || E'\n'
    || '  v_cuenta_pago_id text := nullif(btrim(v_movimiento ->> ''cuenta_bancaria_id''), '''');' || E'\n'
    || '  v_cuenta_origen_spot_id text := nullif(btrim(v_pago ->> ''cuenta_origen_spot_id''), '''');' || E'\n'
    || '  v_proveedor_cuenta_id text := nullif(btrim(v_pago ->> ''proveedor_cuenta_id''), '''');' || E'\n'
    || '  v_numero_constancia text := nullif(btrim(v_pago ->> ''numero_constancia''), '''');' || E'\n'
    || '  v_fecha_constancia date := nullif(v_pago ->> ''fecha_constancia'', '''')::date;';
  v_after := replace(v_before, v_old, v_new);
  perform pg_temp.b3b2_assert_exact_rewrite('registrar_pago.declaraciones', v_before, v_after, v_old, v_new);

  v_stage := v_after;
  v_old := $old$
  if not found then
    raise exception 'La CxP % no existe', p_cxp_id;
  end if;

  v_nuevo_monto := coalesce(v_cxp.monto_pagado, 0) + p_monto;
$old$;
  v_new := $new$
  if not found then
    raise exception 'La CxP % no existe', p_cxp_id;
  end if;
  if p_monto <= 0 then
    raise exception 'El monto del pago debe ser mayor que cero.';
  end if;

  v_saldo_pendiente := round(coalesce(v_cxp.saldo, coalesce(v_cxp.monto_total, 0) - coalesce(v_cxp.monto_pagado, 0)), 2);
  if v_saldo_pendiente <= 0 then
    raise exception 'La CxP ya no tiene saldo pendiente.';
  end if;
  if round(p_monto, 2) > v_saldo_pendiente + 0.005 then
    raise exception 'El monto del pago supera el saldo pendiente de %.', v_saldo_pendiente;
  end if;

  if v_con_deposito_spot then
    select * into v_detraccion
    from public.detracciones d
    where d.cxp_id = v_cxp.id
      and d.direccion = 'compra'
      and d.estado = 'pendiente'
    for update;

    if not found then
      raise exception 'No existe una obligacion SPOT de compra pendiente para esta CxP.';
    end if;
    if v_detraccion.empresa_id is distinct from v_cxp.empresa_id
       or v_detraccion.sociedad_id is distinct from v_cxp.sociedad_id then
      raise exception 'La obligacion SPOT no pertenece a la misma empresa y sociedad de la CxP.';
    end if;

    v_monto_detraccion_cxp := case
      when upper(coalesce(v_cxp.moneda, 'PEN')) = 'USD' then v_detraccion.monto_detraccion_origen
      else v_detraccion.monto_detraccion_soles
    end;
    if v_monto_detraccion_cxp <= 0
       or round(v_saldo_pendiente - v_monto_detraccion_cxp, 2) <= 0 then
      raise exception 'La detraccion no permite un neto positivo para esta CxP.';
    end if;
    if round(p_monto, 2) <> round(v_saldo_pendiente - v_monto_detraccion_cxp, 2) then
      raise exception 'El pago SPOT debe ser exactamente el neto pendiente de % en la moneda de la CxP.',
        round(v_saldo_pendiente - v_monto_detraccion_cxp, 2);
    end if;
    if v_cuenta_pago_id is null then
      raise exception 'El pago SPOT requiere la cuenta origen del pago neto.';
    end if;
    select * into v_cuenta_pago
    from public.cuentas_bancarias c
    where c.id = v_cuenta_pago_id;
    if not found
       or v_cuenta_pago.empresa_id is distinct from v_cxp.empresa_id
       or v_cuenta_pago.sociedad_id is distinct from v_cxp.sociedad_id
       or v_cuenta_pago.moneda <> 'PEN'
       or v_cuenta_pago.estado <> 'activo' then
      raise exception 'La cuenta origen del pago debe ser propia, PEN, activa y de la misma sociedad.';
    end if;
    if v_cuenta_origen_spot_id is null then
      raise exception 'El pago SPOT requiere cuenta_origen_spot_id.';
    end if;
    select * into v_cuenta_spot
    from public.cuentas_bancarias c
    where c.id = v_cuenta_origen_spot_id;
    if not found
       or v_cuenta_spot.empresa_id is distinct from v_cxp.empresa_id
       or v_cuenta_spot.sociedad_id is distinct from v_cxp.sociedad_id
       or v_cuenta_spot.moneda <> 'PEN'
       or v_cuenta_spot.estado <> 'activo' then
      raise exception 'La cuenta origen SPOT debe ser propia, PEN, activa y de la misma sociedad.';
    end if;
    if v_proveedor_cuenta_id is null then
      raise exception 'El pago SPOT requiere proveedor_cuenta_id.';
    end if;
    select * into v_proveedor_cuenta
    from public.proveedor_cuentas_bancarias c
    where c.id = v_proveedor_cuenta_id;
    if not found
       or v_proveedor_cuenta.empresa_id is distinct from v_cxp.empresa_id
       or v_proveedor_cuenta.proveedor_id is distinct from v_cxp.proveedor_id
       or v_proveedor_cuenta.moneda <> 'PEN'
       or v_proveedor_cuenta.estado <> 'activo'
       or v_proveedor_cuenta.es_cuenta_banco_nacion is not true then
      raise exception 'La cuenta del proveedor debe ser BN, PEN, activa y pertenecer al proveedor de la CxP.';
    end if;
    if v_numero_constancia is null or v_fecha_constancia is null then
      raise exception 'El numero y la fecha de constancia son obligatorios para el pago SPOT.';
    end if;
  end if;

  v_nuevo_monto := coalesce(v_cxp.monto_pagado, 0)
    + p_monto
    + case when v_con_deposito_spot then v_monto_detraccion_cxp else 0 end;
$new$;
  v_after := replace(v_stage, v_old, v_new);
  perform pg_temp.b3b2_assert_exact_rewrite('registrar_pago.validaciones', v_stage, v_after, v_old, v_new);

  v_stage := v_after;
  v_old := $old$
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
$old$;
  v_new := v_old || $new$

  if v_con_deposito_spot then
    insert into public.movimientos_tesoreria (
      id, empresa_id, tipo, descripcion, monto, moneda, fecha, cuenta_bancaria,
      referencia, vinculo_tipo, vinculo_id, estado, cuenta_bancaria_id,
      tc_aplicado, monto_en_moneda_cuenta, detraccion_id
    ) values (
      coalesce(nullif(v_pago ->> 'movimiento_spot_id', ''), 'tes_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20)),
      v_cxp.empresa_id, 'egreso', 'Deposito SPOT compra - ' || p_cxp_id,
      v_detraccion.monto_detraccion_soles, 'PEN', v_fecha_constancia,
      v_cuenta_spot.nombre, v_numero_constancia, 'pago_spot_compra', p_cxp_id,
      'registrado', v_cuenta_spot.id, 1, v_detraccion.monto_detraccion_soles,
      v_detraccion.id
    ) returning * into v_movimiento_spot;
  end if;$new$;
  v_after := replace(v_stage, v_old, v_new);
  perform pg_temp.b3b2_assert_exact_rewrite('registrar_pago.movimiento_spot', v_stage, v_after, v_old, v_new);

  v_stage := v_after;
  v_old := $old$
  if v_nuevo_estado = 'pagada' and v_cxp.gasto_id is not null then
$old$;
  v_new := $new$
  if v_con_deposito_spot then
    update public.detracciones
    set estado = 'depositada',
        cuenta_origen_id = v_cuenta_spot.id,
        proveedor_cuenta_id = v_proveedor_cuenta.id,
        numero_constancia = v_numero_constancia,
        fecha_constancia = v_fecha_constancia,
        actualizado_en = now()
    where id = v_detraccion.id
      and estado = 'pendiente'
    returning * into v_detraccion;
    if not found then
      raise exception 'La obligacion SPOT ya no esta pendiente.';
    end if;
  end if;

  if v_nuevo_estado = 'pagada' and v_cxp.gasto_id is not null then
$new$;
  v_after := replace(v_stage, v_old, v_new);
  perform pg_temp.b3b2_assert_exact_rewrite('registrar_pago.estado_spot', v_stage, v_after, v_old, v_new);

  v_stage := v_after;
  v_old := $old$
    'movimiento', to_jsonb(v_movimiento_guardado)
  );
$old$;
  v_new := $new$
    'movimiento', to_jsonb(v_movimiento_guardado),
    'movimiento_spot', case when v_movimiento_spot.id is null then null else to_jsonb(v_movimiento_spot) end,
    'detraccion', case when v_detraccion.id is null then null else to_jsonb(v_detraccion) end
  );
$new$;
  v_after := replace(v_stage, v_old, v_new);
  perform pg_temp.b3b2_assert_exact_rewrite('registrar_pago.retorno', v_stage, v_after, v_old, v_new);

  if not (v_after like '%v_con_deposito_spot%' and v_after like '%pago_spot_compra%') then
    raise exception 'B3B2|rewrite sin logica SPOT';
  end if;
  execute v_after;
end;
$rewrite_pago$;

do $rewrite_trigger$
declare
  v_oid oid;
  v_before text;
  v_after text;
  v_old text;
  v_new text;
begin
  select p.oid, pg_get_functiondef(p.oid)
    into v_oid, v_before
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'validar_cobro_cxc_cuenta_detraccion'
    and pg_get_function_identity_arguments(p.oid) = '';

  if v_oid is null or v_before is null then
    raise exception 'B3B2|trigger de cuentas ausente';
  end if;

  v_old := '    if new.tipo = ''egreso'' and new.vinculo_tipo = ''autodetraccion'' then';
  v_new := '    if new.tipo = ''egreso'' and new.vinculo_tipo in (''autodetraccion'', ''pago_spot_compra'') then';
  v_after := replace(v_before, v_old, v_new);
  perform pg_temp.b3b2_assert_exact_rewrite('trigger.vinculo_spot', v_before, v_after, v_old, v_new);
  execute v_after;
end;
$rewrite_trigger$;

revoke all on function public.registrar_pago_cxp_atomico(text, numeric, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.registrar_pago_cxp_atomico(text, numeric, jsonb, jsonb) to authenticated;

do $validate$
declare
  v_def text;
  v_prosecdef boolean;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'detracciones' and column_name = 'cuenta_origen_id'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'detracciones' and column_name = 'proveedor_cuenta_id'
  ) then
    raise exception 'B3B2_VALIDACION|columnas_ausentes';
  end if;

  select pg_get_functiondef(p.oid), p.prosecdef
    into v_def, v_prosecdef
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'registrar_pago_cxp_atomico'
    and pg_get_function_identity_arguments(p.oid) = 'p_cxp_id text, p_monto numeric, p_pago jsonb, p_movimiento jsonb';
  if not v_prosecdef or v_def is null or position('v_con_deposito_spot' in v_def) = 0
     or position('pago_spot_compra' in v_def) = 0
     or position('v_saldo_pendiente' in v_def) = 0 then
    raise exception 'B3B2_VALIDACION|funcion_pago_incompleta';
  end if;
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'validar_cobro_cxc_cuenta_detraccion';
  if position('pago_spot_compra' in v_def) = 0 then
    raise exception 'B3B2_VALIDACION|trigger_spot_ausente';
  end if;
  if not has_function_privilege('authenticated', 'public.registrar_pago_cxp_atomico(text,numeric,jsonb,jsonb)', 'EXECUTE')
     or has_function_privilege('anon', 'public.registrar_pago_cxp_atomico(text,numeric,jsonb,jsonb)', 'EXECUTE') then
    raise exception 'B3B2_VALIDACION|grants_incorrectos';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.detracciones'::regclass
      and conname = 'detracciones_cuenta_origen_id_fkey'
  ) or not exists (
    select 1 from pg_constraint
    where conrelid = 'public.detracciones'::regclass
      and conname = 'detracciones_proveedor_cuenta_id_fkey'
  ) then
    raise exception 'B3B2_VALIDACION|fks_ausentes';
  end if;
  raise notice 'B3B2_VALIDACION|columnas=true|rewrite_pago=true|trigger=true|grants=true|fks=true';
end;
$validate$;

select pg_notify('pgrst', 'reload schema');
