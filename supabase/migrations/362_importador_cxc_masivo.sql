-- Carga masiva de CxC.
-- Una llamada procesa una fila de manera atomica: factura + CxC + cobro parcial opcional.

create or replace function public.importar_cxc_masiva_fila(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id text := nullif(btrim(p_payload ->> 'empresa_id'), '');
  v_ruc text := regexp_replace(coalesce(p_payload ->> 'ruc_cliente', ''), '\D', '', 'g');
  v_razon_social text := nullif(btrim(p_payload ->> 'razon_social'), '');
  v_tipo_documento text := lower(nullif(btrim(p_payload ->> 'tipo_documento'), ''));
  v_numero text := nullif(btrim(p_payload ->> 'numero'), '');
  v_numero_normalizado text;
  v_fecha_emision date := nullif(p_payload ->> 'fecha_emision', '')::date;
  v_fecha_vencimiento date := nullif(p_payload ->> 'fecha_vencimiento', '')::date;
  v_fecha_cobro date := nullif(p_payload ->> 'fecha_cobro', '')::date;
  v_moneda text := upper(coalesce(nullif(btrim(p_payload ->> 'moneda'), ''), 'PEN'));
  v_subtotal numeric(14,2) := coalesce(nullif(p_payload ->> 'subtotal', '')::numeric, 0);
  v_igv numeric(14,2) := coalesce(nullif(p_payload ->> 'igv', '')::numeric, 0);
  v_total numeric(14,2) := coalesce(nullif(p_payload ->> 'monto_total', '')::numeric, 0);
  v_monto_pagado numeric(14,2) := coalesce(nullif(p_payload ->> 'monto_pagado', '')::numeric, 0);
  v_os_codigo text := nullif(btrim(p_payload ->> 'os_cliente_codigo'), '');
  v_cebe_codigo text := nullif(btrim(p_payload ->> 'centro_beneficio_codigo'), '');
  v_confirmar_exceso boolean := lower(coalesce(nullif(btrim(p_payload ->> 'confirmar_exceso'), ''), 'no')) in ('si', 'sí', 'true', '1');
  v_glosa text := nullif(btrim(p_payload ->> 'glosa'), '');
  v_notas text := nullif(btrim(p_payload ->> 'notas'), '');
  v_condicion_pago text := coalesce(nullif(btrim(p_payload ->> 'condicion_pago'), ''), 'Crédito');
  v_medio_pago text := coalesce(nullif(btrim(p_payload ->> 'medio_pago'), ''), 'Transferencia');
  v_cuenta_bancaria text := nullif(btrim(p_payload ->> 'cuenta_bancaria'), '');
  v_numero_operacion text := nullif(btrim(p_payload ->> 'numero_operacion'), '');
  v_cuenta public.cuentas%rowtype;
  v_os public.os_clientes%rowtype;
  v_cebe public.centros_beneficio%rowtype;
  v_factura public.facturas%rowtype;
  v_cxc public.cxc%rowtype;
  v_cobro public.cobros_cxc%rowtype;
  v_aplica_retencion boolean := false;
  v_tasa_retencion numeric(5,2) := 0;
  v_monto_retencion numeric(14,2) := 0;
  v_monto_neto_cobrable numeric(14,2);
  v_saldo numeric(14,2);
  v_centro_beneficio_id text;
  v_saldo_os_anterior numeric(14,2);
  v_factura_id text := 'fac_imp_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20);
  v_cxc_id text := 'cxc_imp_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20);
  v_cobro_id text := 'cob_imp_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20);
  v_cuenta_id text := 'cta_imp_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20);
  v_cuenta_creada boolean := false;
begin
  if v_empresa_id is null or not public.usuario_tiene_empresa(v_empresa_id) then
    raise exception 'No tienes acceso al tenant indicado.';
  end if;
  if not public.usuario_puede(v_empresa_id, 'facturacion', 'crear') then
    raise exception 'No tienes permiso para crear Facturacion en este tenant.';
  end if;
  if v_ruc !~ '^\d{11}$' then
    raise exception 'RUC del cliente invalido: debe tener 11 digitos.';
  end if;
  if v_razon_social is null then
    raise exception 'Razon social del cliente obligatoria.';
  end if;
  if v_tipo_documento not in ('factura', 'boleta') then
    raise exception 'Tipo de documento invalido: usa Factura o Boleta.';
  end if;
  if v_numero is null then
    raise exception 'Numero de comprobante obligatorio.';
  end if;
  if v_fecha_emision is null or v_fecha_vencimiento is null then
    raise exception 'Fecha de emision y vencimiento obligatorias.';
  end if;
  if v_fecha_vencimiento < v_fecha_emision then
    raise exception 'Fecha de vencimiento no puede ser anterior a emision.';
  end if;
  if v_moneda not in ('PEN', 'USD') then
    raise exception 'Moneda invalida: usa PEN o USD.';
  end if;
  if v_subtotal < 0 or v_igv < 0 or v_total <= 0 then
    raise exception 'Subtotal, IGV y monto total invalidos.';
  end if;
  if abs(round(v_subtotal + v_igv, 2) - round(v_total, 2)) > 0.01 then
    raise exception 'Monto total debe coincidir con subtotal mas IGV.';
  end if;
  if v_monto_pagado < 0 then
    raise exception 'Monto pagado invalido.';
  end if;
  if v_monto_pagado > 0 and v_fecha_cobro is null then
    raise exception 'Fecha de cobro obligatoria para pago parcial.';
  end if;

  -- Serializa la resolucion/creacion del cliente por RUC dentro del tenant.
  perform pg_advisory_xact_lock(hashtext(v_empresa_id || '|CUENTA|' || v_ruc));
  select * into v_cuenta
  from public.cuentas
  where empresa_id = v_empresa_id
    and regexp_replace(coalesce(ruc, ''), '\D', '', 'g') = v_ruc
  order by created_at nulls last, id
  limit 1
  for update;

  if not found then
    insert into public.cuentas (
      id, empresa_id, nombre_comercial, razon_social, ruc, tipo, moneda, estado, saldo_cxc
    ) values (
      v_cuenta_id, v_empresa_id, v_razon_social, v_razon_social, v_ruc, 'cliente', v_moneda, 'activo', 0
    ) returning * into v_cuenta;
    v_cuenta_creada := true;
  end if;

  v_aplica_retencion := coalesce(v_cuenta.agente_retencion_sunat, false);
  v_tasa_retencion := case when v_aplica_retencion then coalesce(v_cuenta.tasa_retencion_sunat, 3) else 0 end;
  if v_tasa_retencion < 0 or v_tasa_retencion > 100 then
    raise exception 'La tasa de retencion SUNAT configurada para el cliente es invalida.';
  end if;
  v_monto_retencion := case when v_aplica_retencion then round(v_total * v_tasa_retencion / 100, 2) else 0 end;
  v_monto_neto_cobrable := round(v_total - v_monto_retencion, 2);
  if v_monto_pagado >= v_monto_neto_cobrable then
    raise exception 'Solo se permiten saldos pendientes: monto_pagado debe ser menor que el neto cobrable.';
  end if;
  v_saldo := round(v_monto_neto_cobrable - v_monto_pagado, 2);

  if v_os_codigo is not null then
    select * into v_os
    from public.os_clientes
    where empresa_id = v_empresa_id and numero = v_os_codigo
    limit 1
    for update;
    if not found then
      raise exception 'OS Cliente inexistente en el tenant: %.', v_os_codigo;
    end if;
    if v_os.cuenta_id is distinct from v_cuenta.id then
      raise exception 'La OS Cliente indicada no pertenece al cliente del RUC cargado.';
    end if;
    if v_os.centro_beneficio_id is null then
      raise exception 'La OS Cliente indicada no tiene CEBE asociado.';
    end if;
    v_centro_beneficio_id := v_os.centro_beneficio_id;
    v_saldo_os_anterior := coalesce(v_os.saldo_por_facturar, 0);
    if v_total > v_saldo_os_anterior and not v_confirmar_exceso then
      raise exception 'El monto facturado excede el saldo pendiente de la OS. Usa confirmar_exceso=SI para continuar.';
    end if;
  else
    if v_cebe_codigo is null then
      raise exception 'Centro de beneficio obligatorio cuando no se vincula una OS Cliente.';
    end if;
    select id into v_centro_beneficio_id
    from public.centros_beneficio
    where empresa_id = v_empresa_id and upper(btrim(codigo)) = upper(btrim(v_cebe_codigo))
    limit 1;
    if not found then
      raise exception 'CEBE inexistente en el tenant: %.', v_cebe_codigo;
    end if;
  end if;

  select * into v_cebe
  from public.centros_beneficio
  where id = v_centro_beneficio_id and empresa_id = v_empresa_id;
  if not found then
    raise exception 'El CEBE asociado no existe en el tenant.';
  end if;
  if v_cebe.estado <> 'activo' then
    raise exception 'El CEBE asociado esta inactivo.';
  end if;
  if (v_cebe.fecha_inicio is not null and v_fecha_emision < v_cebe.fecha_inicio)
     or (v_cebe.fecha_fin is not null and v_fecha_emision > v_cebe.fecha_fin) then
    raise exception 'El CEBE asociado esta fuera de vigencia para la fecha de emision.';
  end if;

  v_numero_normalizado := regexp_replace(lower(btrim(v_numero)), '\s+', ' ', 'g');
  perform pg_advisory_xact_lock(hashtext(v_empresa_id || '|FACTURA|' || v_numero_normalizado));
  if exists (
    select 1 from public.facturas
    where empresa_id = v_empresa_id
      and regexp_replace(lower(btrim(numero)), '\s+', ' ', 'g') = v_numero_normalizado
  ) then
    raise exception 'Duplicado: ya existe una factura con el numero % en este tenant.', v_numero;
  end if;

  insert into public.facturas (
    id, empresa_id, cuenta_id, os_cliente_id, numero, tipo_documento,
    fecha_emision, fecha_vencimiento, subtotal, igv, total, moneda, estado,
    glosa, notas, condicion_pago, items, centro_beneficio_id,
    aplica_retencion, monto_retencion, monto_neto_cobrable, concepto
  ) values (
    v_factura_id, v_empresa_id, v_cuenta.id, v_os.id, v_numero, v_tipo_documento,
    v_fecha_emision, v_fecha_vencimiento, v_subtotal, v_igv, v_total, v_moneda, 'emitida',
    v_glosa, v_notas, v_condicion_pago, coalesce(p_payload -> 'items', '[]'::jsonb), v_cebe.id,
    v_aplica_retencion, v_monto_retencion,
    case when v_aplica_retencion then v_monto_neto_cobrable else null end,
    v_glosa
  ) returning * into v_factura;

  insert into public.cxc (
    id, empresa_id, cuenta_id, factura_id, os_cliente_id,
    fecha_emision, fecha_vencimiento, monto_total, monto_pagado, saldo, moneda, estado,
    glosa, notas, condicion_pago, monto_retencion, concepto
  ) values (
    v_cxc_id, v_empresa_id, v_cuenta.id, v_factura.id, v_os.id,
    v_fecha_emision, v_fecha_vencimiento, v_total, v_monto_pagado, v_saldo, v_moneda,
    case when v_monto_pagado > 0 then 'cobro_parcial' else 'por_cobrar' end,
    v_glosa, v_notas, v_condicion_pago, v_monto_retencion, v_glosa
  ) returning * into v_cxc;

  if v_monto_pagado > 0 then
    insert into public.cobros_cxc (
      id, empresa_id, cxc_id, factura_id, cuenta_id, monto_capital, monto_mora,
      medio_pago, cuenta_bancaria, numero_operacion, fecha_cobro, notas, registrado_por
    ) values (
      v_cobro_id, v_empresa_id, v_cxc.id, v_factura.id, v_cuenta.id, v_monto_pagado, 0,
      v_medio_pago, v_cuenta_bancaria, v_numero_operacion, v_fecha_cobro, v_notas, auth.uid()::text
    ) returning * into v_cobro;
  end if;

  if v_os_codigo is not null then
    -- Duplicacion intencional de emitirFacturaConCxC (src/context.jsx): la RPC no puede llamar
    -- codigo del frontend. Si esa regla cambia, debe actualizarse tambien aqui.
    update public.os_clientes
    set saldo_por_facturar = greatest(0, coalesce(saldo_por_facturar, 0) - v_total),
        monto_facturado = coalesce(monto_facturado, 0) + v_total
    where id = v_os.id and empresa_id = v_empresa_id;
  end if;

  return jsonb_build_object(
    'factura', to_jsonb(v_factura),
    'cxc', to_jsonb(v_cxc),
    'cobro', case when v_monto_pagado > 0 then to_jsonb(v_cobro) else null end,
    'cuenta_creada', v_cuenta_creada,
    'cuenta_id', v_cuenta.id,
    'centro_beneficio_id', v_cebe.id,
    'monto_neto_cobrable', v_monto_neto_cobrable
  );
end;
$$;

grant execute on function public.importar_cxc_masiva_fila(jsonb) to authenticated;

select pg_notify('pgrst', 'reload schema');
