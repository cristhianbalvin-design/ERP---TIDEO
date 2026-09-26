-- SPOT Bloque 2: autodetraccion.
-- Las funciones existentes se reconstruyen desde pg_get_functiondef remoto.

do $$
declare
  v_aplicada boolean := false;
begin
  select
    exists (
      select 1
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace ns on ns.oid = rel.relnamespace
      where ns.nspname = 'public'
        and rel.relname = 'detracciones'
        and con.conname = 'detracciones_estado_ck'
        and pg_get_constraintdef(con.oid) like '%por_autodetraer%'
    )
    and exists (
      select 1
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
      where ns.nspname = 'public'
        and p.proname = 'spot_quinto_dia_habil'
    )
    and exists (
      select 1
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
      where ns.nspname = 'public'
        and p.proname = 'registrar_autodetraccion'
    )
    and exists (
      select 1
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
      where ns.nspname = 'public'
        and p.proname = 'validar_cobro_cxc_cuenta_detraccion'
        and position('new.tipo = ''egreso''' in pg_get_functiondef(p.oid)) > 0
        and position('new.vinculo_tipo = ''autodetraccion''' in pg_get_functiondef(p.oid)) > 0
    )
    and exists (
      select 1
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
      where ns.nspname = 'public'
        and p.proname = 'registrar_cobro_cxc_atomico'
        and position('cliente_pago_total_sin_detraer' in pg_get_functiondef(p.oid)) > 0
    )
    and exists (
      select 1
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
      where ns.nspname = 'public'
        and p.proname = 'emitir_nota_cxc_atomica'
        and position('La factura tiene una autodetracción pendiente; regístrala antes de emitir notas.' in pg_get_functiondef(p.oid)) > 0
    )
  into v_aplicada;

  if v_aplicada then
    raise exception 'SPOT2|ya aplicada';
  end if;
end;
$$;

create or replace function pg_temp.spot2_notice_diff(
  p_etiqueta text,
  p_remota text,
  p_generada text
)
returns void
language plpgsql
as $$
declare
  v_remotas text[] := string_to_array(p_remota, E'\n');
  v_generadas text[] := string_to_array(p_generada, E'\n');
  v_max integer := greatest(coalesce(array_length(v_remotas, 1), 0), coalesce(array_length(v_generadas, 1), 0));
  v_linea integer;
  v_remota text;
  v_generada text;
begin
  for v_linea in 1..v_max loop
    v_remota := case when v_linea <= coalesce(array_length(v_remotas, 1), 0) then v_remotas[v_linea] end;
    v_generada := case when v_linea <= coalesce(array_length(v_generadas, 1), 0) then v_generadas[v_linea] end;
    if v_remota is distinct from v_generada then
      raise notice 'SPOT2_DIFF|%|linea=%|remota=%|generada=%',
        p_etiqueta,
        v_linea,
        replace(replace(replace(coalesce(v_remota, '[LINEA_AUSENTE]'), E'\r', '<CR>'), E'\t', '<TAB>'), ' ', '·'),
        replace(replace(replace(coalesce(v_generada, '[LINEA_AUSENTE]'), E'\r', '<CR>'), E'\t', '<TAB>'), ' ', '·');
    end if;
  end loop;
end;
$$;

create or replace function public.spot_quinto_dia_habil(
  p_empresa_id text,
  p_fecha date
)
returns date
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_fecha date := p_fecha;
  v_contador integer := 0;
begin
  if p_empresa_id is null or p_fecha is null then
    raise exception 'SPOT2|empresa y fecha son obligatorias';
  end if;

  while v_contador < 5 loop
    v_fecha := v_fecha + 1;
    if extract(isodow from v_fecha) between 1 and 5
       and not exists (
         select 1
         from public.feriados f
         where f.empresa_id = p_empresa_id
           and f.fecha = v_fecha
           and f.ambito = 'nacional'
       ) then
      v_contador := v_contador + 1;
    end if;
  end loop;

  return v_fecha;
end;
$$;

revoke all on function public.spot_quinto_dia_habil(text, date) from public, anon, authenticated;
grant execute on function public.spot_quinto_dia_habil(text, date) to authenticated, service_role;

do $$
declare
  v_oid oid;
  v_before text;
  v_after text;
  v_old text;
  v_new text;
  v_anchor text;
begin
  -- registrar_cobro_cxc_atomico: cada reemplazo exige una sola coincidencia.
  select p.oid, pg_get_functiondef(p.oid)
    into v_oid, v_before
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'registrar_cobro_cxc_atomico'
    and pg_get_function_identity_arguments(p.oid) = 'p_empresa_id text, p_cxc_id text, p_cobro jsonb, p_movimiento jsonb, p_comision jsonb';

  if v_oid is null or v_before is null then
    raise exception 'SPOT2|registrar_cobro_cxc_atomico ausente';
  end if;

  v_old := '  v_es_detraccion boolean := v_tipo_cobro = ''detraccion'';';
  v_new := v_old || E'\n' || '  v_cliente_pago_total_sin_detraer boolean := coalesce((p_cobro ->> ''cliente_pago_total_sin_detraer'')::boolean, false);';
  if length(v_before) - length(replace(v_before, v_old, '')) <> length(v_old) then
    raise exception 'SPOT2|ancla declaracion cobro no coincide una sola vez';
  end if;
  v_after := replace(v_before, v_old, v_new);

  v_old := $old$
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
  end if;$old$;
  v_new := $new$
  if not v_es_detraccion then
    if v_cliente_pago_total_sin_detraer then
      select * into v_detraccion
      from public.detracciones d
      where d.cxc_id = v_cxc.id
        and d.direccion = 'venta'
        and d.estado = 'pendiente'
      order by d.creado_en
      limit 1
      for update;

      if not found then
        raise exception 'El pago total sin detraccion requiere una obligacion SPOT pendiente.';
      end if;
      if abs(v_monto - coalesce(v_cxc.saldo, v_neto_cobrable - coalesce(v_cxc.monto_pagado, 0))) > 0.005 then
        raise exception 'El pago total sin detraccion debe cubrir exactamente el saldo completo de la CxC.';
      end if;
    else
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
  end if;$new$;
  if length(v_after) - length(replace(v_after, v_old, '')) <> 0 then
    raise exception 'SPOT2|bloque limite generado contiene el bloque anterior';
  end if;
  if length(v_before) - length(replace(v_before, v_old, '')) <> length(v_old) then
    raise exception 'SPOT2|bloque limite remoto no coincide una sola vez';
  end if;
  v_after := replace(v_after, v_old, v_new);

  v_anchor := E'\n  v_cobro_id := coalesce(nullif(btrim(p_cobro ->> ''id''), ''''), ''cob_'' || replace(gen_random_uuid()::text, ''-'', ''''));';
  v_new := E'\n  if v_cliente_pago_total_sin_detraer then\n    update public.detracciones\n    set estado = ''por_autodetraer'',\n        fecha_limite_deposito = public.spot_quinto_dia_habil(v_cxc.empresa_id, coalesce(nullif(p_cobro ->> ''fecha_cobro'', '''')::date, current_date)),\n        actualizado_en = now()\n    where id = v_detraccion.id\n      and estado = ''pendiente'';\n    if not found then\n      raise exception ''La obligacion SPOT ya no esta pendiente para autodetraccion.'';\n    end if;\n  end if;' || v_anchor;
  if length(v_after) - length(replace(v_after, v_anchor, '')) <> length(v_anchor) then
    raise exception 'SPOT2|ancla transicion autodetraccion no coincide una sola vez';
  end if;
  v_after := replace(v_after, v_anchor, v_new);

  perform pg_temp.spot2_notice_diff('registrar_cobro_cxc_atomico', v_before, v_after);
  execute v_after;
end;
$$;

do $$
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
    raise exception 'SPOT2|trigger de cuenta ausente';
  end if;

  v_old := $old$
  if new.detraccion_id is not null then
    if v_cuenta.empresa_id is distinct from new.empresa_id
       or coalesce(v_cuenta.es_cuenta_detracciones, false) is not true then
      raise exception 'La cuenta bancaria del movimiento no es una cuenta de detracciones de la misma empresa.';
    end if;
  elsif coalesce(v_cuenta.es_cuenta_detracciones, false) is true
        and new.tipo = 'ingreso'
        and new.vinculo_tipo = 'cxc' then
    raise exception 'Un cobro normal no puede registrarse en una cuenta de detracciones.';
  end if;$old$;
  v_new := $new$
  if new.detraccion_id is not null then
    if new.tipo = 'egreso' and new.vinculo_tipo = 'autodetraccion' then
      if v_cuenta.empresa_id is distinct from new.empresa_id then
        raise exception 'La cuenta bancaria del movimiento no pertenece a la misma empresa.';
      end if;
    elsif v_cuenta.empresa_id is distinct from new.empresa_id
          or coalesce(v_cuenta.es_cuenta_detracciones, false) is not true then
      raise exception 'La cuenta bancaria del movimiento no es una cuenta de detracciones de la misma empresa.';
    end if;
  elsif coalesce(v_cuenta.es_cuenta_detracciones, false) is true
        and new.tipo = 'ingreso'
        and new.vinculo_tipo = 'cxc' then
    raise exception 'Un cobro normal no puede registrarse en una cuenta de detracciones.';
  end if;$new$;
  if length(v_before) - length(replace(v_before, v_old, '')) <> length(v_old) then
    raise exception 'SPOT2|bloque trigger remoto no coincide una sola vez';
  end if;
  v_after := replace(v_before, v_old, v_new);
  perform pg_temp.spot2_notice_diff('validar_cobro_cxc_cuenta_detraccion', v_before, v_after);
  execute v_after;
end;
$$;

do $$
declare
  v_oid oid;
  v_before text;
  v_after text;
  v_anchor text := E'\n  v_tiene_principal := found;';
  v_insert text := E'\n  if v_tiene_principal and v_obligacion.estado = ''por_autodetraer'' then\n    raise exception ''La factura tiene una autodetracción pendiente; regístrala antes de emitir notas.'';\n  end if;';
begin
  select p.oid, pg_get_functiondef(p.oid)
    into v_oid, v_before
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'emitir_nota_cxc_atomica'
    and pg_get_function_identity_arguments(p.oid) = 'p_payload jsonb';

  if v_oid is null or v_before is null then
    raise exception 'SPOT2|emitir_nota_cxc_atomica ausente';
  end if;
  if length(v_before) - length(replace(v_before, v_anchor, '')) <> length(v_anchor) then
    raise exception 'SPOT2|ancla nota no coincide una sola vez';
  end if;
  v_after := replace(v_before, v_anchor, v_anchor || v_insert);
  perform pg_temp.spot2_notice_diff('emitir_nota_cxc_atomica', v_before, v_after);
  execute v_after;
end;
$$;

alter table public.detracciones drop constraint if exists detracciones_estado_ck;
alter table public.detracciones
  add constraint detracciones_estado_ck
  check (estado = any (array['pendiente','por_autodetraer','depositada','autodetraida','ajustada','anulada']));

create or replace function public.registrar_autodetraccion(
  p_empresa_id text,
  p_detraccion_id uuid,
  p_cuenta_origen_id text,
  p_cuenta_destino_id text,
  p_fecha_constancia date,
  p_numero_constancia text,
  p_referencia text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_detraccion public.detracciones%rowtype;
  v_cxc public.cxc%rowtype;
  v_origen public.cuentas_bancarias%rowtype;
  v_destino public.cuentas_bancarias%rowtype;
  v_mov_egreso public.movimientos_tesoreria%rowtype;
  v_mov_ingreso public.movimientos_tesoreria%rowtype;
  v_monto numeric(14,2);
  v_vinculo_id text := 'autodet_' || replace(gen_random_uuid()::text, '-', '');
  v_referencia text := nullif(btrim(p_referencia), '');
  v_constancia text := nullif(btrim(p_numero_constancia), '');
begin
  if p_empresa_id is null or p_detraccion_id is null then
    raise exception 'La empresa y la obligación SPOT son obligatorias.';
  end if;
  if auth.role() <> 'service_role' and not public.usuario_tiene_empresa(p_empresa_id) then
    raise exception 'No tienes acceso al tenant indicado.';
  end if;
  if auth.role() <> 'service_role' and not public.usuario_puede(p_empresa_id, 'tesoreria', 'crear') then
    raise exception 'No tienes permiso para registrar autodetracciones en este tenant.';
  end if;
  if p_fecha_constancia is null or v_constancia is null then
    raise exception 'La fecha y el número de constancia son obligatorios.';
  end if;

  select * into v_detraccion
  from public.detracciones d
  where d.id = p_detraccion_id
    and d.empresa_id = p_empresa_id
  for update;
  if not found then
    raise exception 'La obligación SPOT no existe o no pertenece a la empresa.';
  end if;
  if v_detraccion.direccion <> 'venta' or v_detraccion.estado <> 'por_autodetraer' then
    raise exception 'La obligación SPOT no está pendiente de autodetracción.';
  end if;

  select * into v_cxc
  from public.cxc c
  where c.id = v_detraccion.cxc_id
    and c.empresa_id = p_empresa_id
  for update;
  if not found or v_cxc.sociedad_id is distinct from v_detraccion.sociedad_id then
    raise exception 'La CxC no coincide con la obligación SPOT.';
  end if;

  select * into v_origen
  from public.cuentas_bancarias c
  where c.id = p_cuenta_origen_id;
  if not found
     or v_origen.empresa_id is distinct from p_empresa_id
     or v_origen.sociedad_id is distinct from v_detraccion.sociedad_id
     or v_origen.moneda <> 'PEN'
     or v_origen.estado <> 'activo'
     or coalesce(v_origen.es_cuenta_detracciones, false) then
    raise exception 'La cuenta origen debe ser una cuenta propia normal PEN activa de la misma sociedad.';
  end if;

  select * into v_destino
  from public.cuentas_bancarias c
  where c.id = p_cuenta_destino_id;
  if not found
     or v_destino.empresa_id is distinct from p_empresa_id
     or v_destino.sociedad_id is distinct from v_detraccion.sociedad_id
     or v_destino.moneda <> 'PEN'
     or v_destino.estado <> 'activo'
     or coalesce(v_destino.es_cuenta_detracciones, false) is not true then
    raise exception 'La cuenta destino debe ser una cuenta de detracciones PEN activa de la misma sociedad.';
  end if;

  v_monto := round(v_detraccion.monto_detraccion_soles, 2);
  if v_monto <= 0 then
    raise exception 'El monto de autodetracción debe ser mayor a cero.';
  end if;

  insert into public.movimientos_tesoreria (
    id, empresa_id, tipo, descripcion, monto, moneda, fecha, cuenta_bancaria,
    cuenta_bancaria_id, tc_aplicado, monto_en_moneda_cuenta, referencia,
    vinculo_tipo, vinculo_id, estado, created_at, detraccion_id
  ) values (
    'tes_' || replace(gen_random_uuid()::text, '-', ''), p_empresa_id, 'egreso',
    'Autodetracción SPOT - ' || p_detraccion_id::text, v_monto, 'PEN', p_fecha_constancia,
    v_origen.nombre, v_origen.id, 1, v_monto, v_referencia,
    'autodetraccion', v_vinculo_id, 'registrado', now(), p_detraccion_id
  ) returning * into v_mov_egreso;

  insert into public.movimientos_tesoreria (
    id, empresa_id, tipo, descripcion, monto, moneda, fecha, cuenta_bancaria,
    cuenta_bancaria_id, tc_aplicado, monto_en_moneda_cuenta, referencia,
    vinculo_tipo, vinculo_id, estado, created_at, detraccion_id
  ) values (
    'tes_' || replace(gen_random_uuid()::text, '-', ''), p_empresa_id, 'ingreso',
    'Autodetracción SPOT - ' || p_detraccion_id::text, v_monto, 'PEN', p_fecha_constancia,
    v_destino.nombre, v_destino.id, 1, v_monto, v_referencia,
    'autodetraccion', v_vinculo_id, 'registrado', now(), p_detraccion_id
  ) returning * into v_mov_ingreso;

  update public.detracciones
  set estado = 'autodetraida',
      cuenta_destino_id = v_destino.id,
      numero_constancia = v_constancia,
      fecha_constancia = p_fecha_constancia,
      actualizado_en = now()
  where id = v_detraccion.id
  returning * into v_detraccion;

  return jsonb_build_object(
    'detraccion', to_jsonb(v_detraccion),
    'movimiento_egreso', to_jsonb(v_mov_egreso),
    'movimiento_ingreso', to_jsonb(v_mov_ingreso)
  );
end;
$$;

revoke all on function public.registrar_autodetraccion(text, uuid, text, text, date, text, text) from public, anon, authenticated, service_role;
grant execute on function public.registrar_autodetraccion(text, uuid, text, text, date, text, text) to authenticated, service_role;

do $$
declare
  v_oid oid;
  v_def text;
begin
  select p.oid, pg_get_functiondef(p.oid)
    into v_oid, v_def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'registrar_cobro_cxc_atomico'
    and pg_get_function_identity_arguments(p.oid) = 'p_empresa_id text, p_cxc_id text, p_cobro jsonb, p_movimiento jsonb, p_comision jsonb';
  if v_oid is null or position('cliente_pago_total_sin_detraer' in v_def) = 0 then raise exception 'SPOT2_VALIDACION|cobro_autodetraccion=false'; end if;
  if not (select p.prosecdef from pg_proc p where p.oid = v_oid) then raise exception 'SPOT2_VALIDACION|cobro_security_definer=false'; end if;

  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'validar_cobro_cxc_cuenta_detraccion';
  if position('new.tipo = ''egreso''' in v_def) = 0 or position('new.vinculo_tipo = ''autodetraccion''' in v_def) = 0 then raise exception 'SPOT2_VALIDACION|trigger_autodetraccion=false'; end if;

  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'registrar_autodetraccion';
  if v_def is null or position('v_detraccion.estado <> ''por_autodetraer''' in v_def) = 0 then raise exception 'SPOT2_VALIDACION|rpc_autodetraccion=false'; end if;
  if not has_function_privilege('authenticated', 'public.registrar_autodetraccion(text,uuid,text,text,date,text,text)', 'EXECUTE') then raise exception 'SPOT2_VALIDACION|execute_authenticated=false'; end if;
  if not has_function_privilege('service_role', 'public.registrar_autodetraccion(text,uuid,text,text,date,text,text)', 'EXECUTE') then raise exception 'SPOT2_VALIDACION|execute_service_role=false'; end if;
  if has_function_privilege('anon', 'public.registrar_autodetraccion(text,uuid,text,text,date,text,text)', 'EXECUTE') then raise exception 'SPOT2_VALIDACION|execute_anon=true'; end if;

  if not exists (
    select 1 from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where ns.nspname = 'public' and rel.relname = 'detracciones'
      and con.conname = 'detracciones_estado_ck'
      and pg_get_constraintdef(con.oid) like '%por_autodetraer%'
  ) then raise exception 'SPOT2_VALIDACION|estado_por_autodetraer=false'; end if;
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'emitir_nota_cxc_atomica'
      and position('La factura tiene una autodetracción pendiente; regístrala antes de emitir notas.' in pg_get_functiondef(p.oid)) > 0
  ) then raise exception 'SPOT2_VALIDACION|nota_por_autodetraer=false'; end if;
  raise notice 'SPOT2_VALIDACION|cobro=true|rpc=true|trigger=true|nota=true|estado=true|grants=true';
end;
$$;

select pg_notify('pgrst', 'reload schema');
