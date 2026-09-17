-- Emite NC/ND, reserva su correlativo y ajusta la CxC original en una transacción.

create or replace function public.emitir_nota_cxc_atomica(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id text := nullif(btrim(p_payload ->> 'empresa_id'), '');
  v_factura_id text := nullif(btrim(p_payload ->> 'factura_id'), '');
  v_origen_id text := nullif(btrim(p_payload ->> 'factura_origen_id'), '');
  v_tipo text := lower(nullif(btrim(p_payload ->> 'tipo_documento'), ''));
  v_motivo_codigo text := nullif(btrim(p_payload ->> 'motivo_codigo'), '');
  v_sociedad_id uuid := nullif(btrim(p_payload ->> 'sociedad_id'), '')::uuid;
  v_cuenta_id text;
  v_os_id text;
  v_valorizacion_id text;
  v_serie text;
  v_numero integer;
  v_numero_completo text;
  v_total numeric(14,2) := coalesce(nullif(p_payload ->> 'total', '')::numeric, 0);
  v_subtotal numeric(14,2) := coalesce(nullif(p_payload ->> 'subtotal', '')::numeric, 0);
  v_igv numeric(14,2) := coalesce(nullif(p_payload ->> 'igv', '')::numeric, 0);
  v_fecha date := coalesce(nullif(p_payload ->> 'fecha_emision', '')::date, current_date);
  v_moneda text := upper(coalesce(nullif(btrim(p_payload ->> 'moneda'), ''), 'PEN'));
  v_factura public.facturas%rowtype;
  v_cxc public.cxc%rowtype;
  v_nueva_cxc_saldo numeric(14,2);
  v_nueva_cxc_total numeric(14,2);
  v_nuevo_estado text;
  v_total_origen numeric(14,2);
  v_corr public.correlativos_documentos%rowtype;
  v_os public.os_clientes%rowtype;
begin
  if v_empresa_id is null or not public.usuario_tiene_empresa(v_empresa_id) then
    raise exception 'No tienes acceso al tenant indicado.';
  end if;
  if v_tipo not in ('nota_credito', 'nota_debito') then
    raise exception 'TIPO_NOTA_INVALIDO: solo se permite nota_credito o nota_debito.';
  end if;
  if v_origen_id is null then
    raise exception 'FACTURA_ORIGEN_OBLIGATORIA: selecciona el comprobante afectado.';
  end if;
  if v_motivo_codigo is null then
    raise exception 'MOTIVO_SUNAT_OBLIGATORIO: selecciona un motivo oficial.';
  end if;
  if v_total <= 0 or v_subtotal < 0 or v_igv < 0 then
    raise exception 'IMPORTES_NOTA_INVALIDOS: el total debe ser mayor que cero.';
  end if;
  if abs(round(v_subtotal + v_igv, 2) - round(v_total, 2)) > 0.01 then
    raise exception 'IMPORTES_NOTA_INVALIDOS: subtotal más IGV no coincide con total.';
  end if;
  if not exists (
    select 1 from public.catalogo_motivos_comprobante
    where tipo_documento = v_tipo and codigo_sunat = v_motivo_codigo and activo
  ) then
    raise exception 'MOTIVO_SUNAT_INVALIDO: código no pertenece al catálogo del tipo de nota.';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_empresa_id || '|NOTA|' || v_tipo || '|' || coalesce(v_sociedad_id::text, 'sin-sociedad')));

  select * into v_factura
  from public.facturas
  where id = v_origen_id and empresa_id = v_empresa_id
  for update;
  if not found then
    raise exception 'FACTURA_ORIGEN_NO_ENCONTRADA: el comprobante no existe en el tenant.';
  end if;
  if v_factura.tipo_documento not in ('factura', 'boleta') or v_factura.estado = 'anulada' then
    raise exception 'FACTURA_ORIGEN_NO_AFECTABLE: el comprobante no puede recibir una nota.';
  end if;
  if v_factura.sociedad_id is distinct from v_sociedad_id then
    raise exception 'SOCIEDAD_ORIGEN_INVALIDA: la sociedad no coincide con el comprobante origen.';
  end if;
  v_total_origen := coalesce(v_factura.total, 0);
  if v_tipo = 'nota_credito' and v_total > v_total_origen then
    raise exception 'MONTO_NC_EXCEDE_ORIGEN: el total de la Nota de Crédito (%) excede el total del comprobante origen (%).', v_total, v_total_origen;
  end if;

  select * into v_cxc
  from public.cxc
  where factura_id = v_origen_id and empresa_id = v_empresa_id
  for update;
  if not found then
    raise exception 'CXC_ORIGEN_NO_ENCONTRADA: la factura origen no tiene una CxC vinculada; no se creó una CxC nueva.';
  end if;

  v_serie := case when v_tipo = 'nota_credito' then 'NC01' else 'ND01' end;
  select * into v_corr
  from public.correlativos_documentos
  where empresa_id = v_empresa_id
    and tipo_documento = v_tipo
    and serie = v_serie
    and sociedad_id is not distinct from v_sociedad_id
  for update;
  if not found then
    insert into public.correlativos_documentos (id, empresa_id, tipo_documento, serie, ultimo_numero, sociedad_id)
    values (
      'corr_nota_' || md5(v_empresa_id || '|' || v_tipo || '|' || v_serie || '|' || coalesce(v_sociedad_id::text, 'sin-sociedad')),
      v_empresa_id, v_tipo, v_serie,
      coalesce((select max(substring(numero from '[0-9]+$')::integer) from public.facturas where empresa_id=v_empresa_id and tipo_documento=v_tipo and numero ~ ('^' || v_serie || '-[0-9]+$') and sociedad_id is not distinct from v_sociedad_id), 0),
      v_sociedad_id
    ) returning * into v_corr;
  end if;
  v_numero := greatest(v_corr.ultimo_numero, coalesce((select max(substring(numero from '[0-9]+$')::integer) from public.facturas where empresa_id=v_empresa_id and tipo_documento=v_tipo and numero ~ ('^' || v_serie || '-[0-9]+$') and sociedad_id is not distinct from v_sociedad_id), 0)) + 1;
  v_numero_completo := v_serie || '-' || lpad(v_numero::text, 4, '0');
  update public.correlativos_documentos
  set ultimo_numero = v_numero, updated_at = now()
  where id = v_corr.id;

  v_factura_id := coalesce(v_factura_id, 'fac_' || md5(v_empresa_id || '|' || v_numero_completo || '|' || clock_timestamp()::text));
  v_cuenta_id := v_factura.cuenta_id;
  v_os_id := v_factura.os_cliente_id;
  v_valorizacion_id := v_factura.valorizacion_id;

  insert into public.facturas (
    id, empresa_id, cuenta_id, os_cliente_id, valorizacion_id, centro_beneficio_id, sociedad_id,
    numero, tipo_documento, fecha_emision, subtotal, igv, total, moneda, estado,
    items, factura_origen_id, motivo, motivo_codigo, notas, concepto
  ) values (
    v_factura_id, v_empresa_id, v_cuenta_id, v_os_id, v_valorizacion_id, v_factura.centro_beneficio_id, v_sociedad_id,
    v_numero_completo, v_tipo, v_fecha, v_subtotal, v_igv, v_total, v_moneda, 'emitida',
    coalesce(p_payload -> 'items', '[]'::jsonb), v_origen_id, v_motivo_codigo, v_motivo_codigo,
    nullif(btrim(p_payload ->> 'notas'), ''), nullif(btrim(p_payload ->> 'concepto'), '')
  ) returning * into v_factura;

  if v_tipo = 'nota_credito' then
    v_nueva_cxc_total := greatest(0, coalesce(v_cxc.monto_total, 0) - v_total);
    v_nueva_cxc_saldo := greatest(0, coalesce(v_cxc.saldo, 0) - v_total);
    v_nuevo_estado := case when v_nueva_cxc_saldo <= 0 then 'cancelada' else v_cxc.estado end;
    update public.cxc
    set monto_total = v_nueva_cxc_total, saldo = v_nueva_cxc_saldo, estado = v_nuevo_estado, updated_at = now()
    where id = v_cxc.id;
    if v_total >= v_total_origen then
      update public.facturas
      set estado = 'anulada', motivo_anulacion = 'NC emitida: ' || v_numero_completo
      where id = v_origen_id;
    end if;
    if v_valorizacion_id is not null and v_total >= v_total_origen then
      update public.valorizaciones
      set estado = 'aprobada'
      where id = v_valorizacion_id and empresa_id = v_empresa_id;
    end if;
    if v_os_id is not null then
      update public.os_clientes
      set monto_facturado = greatest(0, coalesce(monto_facturado, 0) - v_total),
          saldo_por_facturar = least(coalesce(monto_aprobado, 0), coalesce(saldo_por_facturar, 0) + v_total)
      where id = v_os_id and empresa_id = v_empresa_id
      returning * into v_os;
    end if;
  else
    update public.cxc
    set monto_total = coalesce(monto_total, 0) + v_total,
        saldo = coalesce(saldo, 0) + v_total,
        updated_at = now()
    where id = v_cxc.id;
  end if;

  select * into v_cxc from public.cxc where id = v_cxc.id;
  select * into v_factura from public.facturas where id = v_factura_id;
  return jsonb_build_object('factura', to_jsonb(v_factura), 'cxc', to_jsonb(v_cxc), 'os', case when v_os_id is null then null else to_jsonb(v_os) end, 'numero', v_numero_completo);
end;
$$;

revoke all on function public.emitir_nota_cxc_atomica(jsonb) from public;
grant execute on function public.emitir_nota_cxc_atomica(jsonb) to authenticated;
select pg_notify('pgrst', 'reload schema');
