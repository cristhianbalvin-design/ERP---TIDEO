-- Emite la factura y su cuenta por cobrar en una unica transaccion.
-- Evita que la CxC intente referenciar una factura que aun no fue persistida.

create or replace function public.emitir_factura_cxc_atomico(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id text := nullif(btrim(p_payload ->> 'empresa_id'), '');
  v_factura_id text := nullif(btrim(p_payload ->> 'factura_id'), '');
  v_cxc_id text := nullif(btrim(p_payload ->> 'cxc_id'), '');
  v_cuenta_id text := nullif(btrim(p_payload ->> 'cuenta_id'), '');
  v_os_id text := nullif(btrim(p_payload ->> 'os_cliente_id'), '');
  v_valorizacion_id text := nullif(btrim(p_payload ->> 'valorizacion_id'), '');
  v_cebe_id text := nullif(btrim(p_payload ->> 'centro_beneficio_id'), '');
  v_sociedad_id uuid := nullif(btrim(p_payload ->> 'sociedad_id'), '')::uuid;
  v_numero text := nullif(btrim(p_payload ->> 'numero'), '');
  v_tipo_documento text := lower(coalesce(nullif(btrim(p_payload ->> 'tipo_documento'), ''), 'factura'));
  v_fecha_emision date := nullif(p_payload ->> 'fecha_emision', '')::date;
  v_fecha_vencimiento date := nullif(p_payload ->> 'fecha_vencimiento', '')::date;
  v_subtotal numeric(14,2) := coalesce(nullif(p_payload ->> 'subtotal', '')::numeric, 0);
  v_igv numeric(14,2) := coalesce(nullif(p_payload ->> 'igv', '')::numeric, 0);
  v_total numeric(14,2) := coalesce(nullif(p_payload ->> 'total', '')::numeric, 0);
  v_moneda text := upper(coalesce(nullif(btrim(p_payload ->> 'moneda'), ''), 'PEN'));
  v_aplica_retencion boolean := coalesce((p_payload ->> 'aplica_retencion')::boolean, false);
  v_monto_retencion numeric(14,2) := coalesce(nullif(p_payload ->> 'monto_retencion', '')::numeric, 0);
  v_monto_neto numeric(14,2);
  v_saldo numeric(14,2);
  v_multisociedad boolean := false;
  v_factura public.facturas%rowtype;
  v_cxc public.cxc%rowtype;
  v_os public.os_clientes%rowtype;
begin
  if v_empresa_id is null or not public.usuario_tiene_empresa(v_empresa_id) then
    raise exception 'No tienes acceso al tenant indicado.';
  end if;
  if v_factura_id is null or v_cxc_id is null then
    raise exception 'Identificadores de factura y CxC obligatorios.';
  end if;
  if v_cuenta_id is null or not exists (select 1 from public.cuentas where id = v_cuenta_id and empresa_id = v_empresa_id) then
    raise exception 'Cliente inválido para la factura.';
  end if;
  if v_numero is null or v_fecha_emision is null or v_fecha_vencimiento is null then
    raise exception 'Número y fechas de la factura son obligatorios.';
  end if;
  if v_fecha_vencimiento < v_fecha_emision then
    raise exception 'La fecha de vencimiento no puede ser anterior a la emisión.';
  end if;
  if v_moneda not in ('PEN', 'USD') or v_subtotal < 0 or v_igv < 0 or v_total <= 0 then
    raise exception 'Los importes o la moneda de la factura son inválidos.';
  end if;
  if abs(round(v_subtotal + v_igv, 2) - round(v_total, 2)) > 0.01 then
    raise exception 'El total debe coincidir con subtotal más IGV.';
  end if;

  select coalesce(multisociedad_habilitado, false) into v_multisociedad
  from public.empresas where id = v_empresa_id;
  if v_multisociedad and v_sociedad_id is null then
    raise exception 'Debe seleccionar una sociedad para emitir la factura.';
  end if;
  if v_sociedad_id is not null and not exists (
    select 1 from public.sociedades s
    where s.id = v_sociedad_id and s.empresa_id = v_empresa_id and coalesce(s.activa, true)
  ) then
    raise exception 'La sociedad indicada no es válida para este tenant.';
  end if;
  if v_cebe_id is null or not exists (
    select 1 from public.centros_beneficio c
    where c.id = v_cebe_id and c.empresa_id = v_empresa_id and c.estado = 'activo'
      and (c.fecha_inicio is null or c.fecha_inicio <= v_fecha_emision)
      and (c.fecha_fin is null or c.fecha_fin >= v_fecha_emision)
  ) then
    raise exception 'El CEBE debe existir, estar activo y vigente para la fecha de emisión.';
  end if;
  if v_os_id is not null then
    select * into v_os from public.os_clientes
    where id = v_os_id and empresa_id = v_empresa_id
    for update;
    if not found then raise exception 'La OS Cliente indicada no existe.'; end if;
    if v_os.cuenta_id is distinct from v_cuenta_id then raise exception 'La OS no pertenece al cliente seleccionado.'; end if;
    if v_sociedad_id is distinct from v_os.sociedad_id then raise exception 'La sociedad de la factura debe coincidir con la sociedad de la OS.'; end if;
  end if;

  perform pg_advisory_xact_lock(hashtext(v_empresa_id || '|FACTURA|' || lower(v_numero)));
  if exists (select 1 from public.facturas where empresa_id = v_empresa_id and lower(numero) = lower(v_numero)) then
    raise exception 'Ya existe una factura con el número % en este tenant.', v_numero;
  end if;

  v_monto_neto := case when v_aplica_retencion then round(v_total - v_monto_retencion, 2) else v_total end;
  if v_monto_retencion < 0 or v_monto_neto < 0 then raise exception 'La retención es inválida.'; end if;
  v_saldo := v_monto_neto;

  insert into public.facturas (
    id, empresa_id, cuenta_id, os_cliente_id, valorizacion_id, centro_beneficio_id, sociedad_id,
    numero, tipo_documento, fecha_emision, fecha_vencimiento, subtotal, igv, total, moneda,
    estado, condicion_pago, items, glosa, notas, aplica_retencion, monto_retencion, monto_neto_cobrable, concepto
  ) values (
    v_factura_id, v_empresa_id, v_cuenta_id, v_os_id, v_valorizacion_id, v_cebe_id, v_sociedad_id,
    v_numero, v_tipo_documento, v_fecha_emision, v_fecha_vencimiento, v_subtotal, v_igv, v_total, v_moneda,
    'emitida', nullif(btrim(p_payload ->> 'condicion_pago'), ''), coalesce(p_payload -> 'items', '[]'::jsonb),
    nullif(btrim(p_payload ->> 'glosa'), ''), nullif(btrim(p_payload ->> 'notas'), ''), v_aplica_retencion, v_monto_retencion,
    case when v_aplica_retencion then v_monto_neto else null end, nullif(btrim(p_payload ->> 'glosa'), '')
  ) returning * into v_factura;

  insert into public.cxc (
    id, empresa_id, cuenta_id, factura_id, os_cliente_id, sociedad_id, fecha_emision, fecha_vencimiento,
    monto_total, monto_pagado, saldo, moneda, estado, condicion_pago, monto_retencion, glosa, notas, concepto
  ) values (
    v_cxc_id, v_empresa_id, v_cuenta_id, v_factura.id, v_os_id, v_sociedad_id, v_fecha_emision, v_fecha_vencimiento,
    v_total, 0, v_saldo, v_moneda, 'por_cobrar', nullif(btrim(p_payload ->> 'condicion_pago'), ''), v_monto_retencion,
    nullif(btrim(p_payload ->> 'glosa'), ''), nullif(btrim(p_payload ->> 'notas'), ''), nullif(btrim(p_payload ->> 'glosa'), '')
  ) returning * into v_cxc;

  if v_valorizacion_id is not null then
    update public.valorizaciones set estado = 'facturada' where id = v_valorizacion_id and empresa_id = v_empresa_id;
  end if;
  if v_os_id is not null then
    update public.os_clientes
    set saldo_por_facturar = greatest(0, coalesce(saldo_por_facturar, 0) - v_total),
        monto_facturado = coalesce(monto_facturado, 0) + v_total
    where id = v_os_id and empresa_id = v_empresa_id
    returning * into v_os;
  end if;

  return jsonb_build_object('factura', to_jsonb(v_factura), 'cxc', to_jsonb(v_cxc), 'os', case when v_os_id is null then null else to_jsonb(v_os) end);
end;
$$;

revoke all on function public.emitir_factura_cxc_atomico(jsonb) from public;
grant execute on function public.emitir_factura_cxc_atomico(jsonb) to authenticated;
select pg_notify('pgrst', 'reload schema');
