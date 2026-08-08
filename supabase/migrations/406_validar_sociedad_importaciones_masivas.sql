-- Impide que las importaciones masivas creen documentos sin sociedad en tenants multisociedad.
-- En tenants sin multisociedad se conserva el comportamiento previo.

create or replace function public.importar_cxp_masiva_fila(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id text := p_payload ->> 'empresa_id';
  v_multisociedad_habilitado boolean := false;
  v_proveedor_id text := nullif(btrim(p_payload ->> 'proveedor_id'), '');
  v_personal_id text := nullif(btrim(p_payload ->> 'personal_id'), '');
  v_ruc text := regexp_replace(coalesce(p_payload ->> 'ruc_emisor', ''), '\D', '', 'g');
  v_razon_social text := nullif(btrim(p_payload ->> 'razon_social'), '');
  v_tipo_comprobante text := nullif(btrim(p_payload ->> 'tipo_comprobante'), '');
  v_documento text := nullif(btrim(p_payload ->> 'factura_numero'), '');
  v_documento_normalizado text;
  v_concepto text := nullif(btrim(p_payload ->> 'concepto'), '');
  v_concepto_normalizado text;
  v_fecha_emision date := nullif(p_payload ->> 'fecha_emision', '')::date;
  v_fecha_vencimiento date := nullif(p_payload ->> 'fecha_vencimiento', '')::date;
  v_fecha_pago date := nullif(p_payload ->> 'fecha_pago', '')::date;
  v_moneda text := upper(coalesce(nullif(btrim(p_payload ->> 'moneda'), ''), 'PEN'));
  v_monto_total numeric(14,2) := coalesce(nullif(p_payload ->> 'monto_total', '')::numeric, 0);
  v_monto_pagado numeric(14,2) := coalesce(nullif(p_payload ->> 'monto_pagado', '')::numeric, 0);
  v_monto_bruto numeric(14,2) := nullif(p_payload ->> 'monto_bruto', '')::numeric;
  v_retencion_ir numeric(14,2) := 0;
  v_tasa_retencion numeric(10,6) := 0;
  v_saldo numeric(14,2);
  v_categoria_er text := nullif(btrim(p_payload ->> 'categoria_er'), '');
  v_categoria_auto text;
  v_centro_costo_id text := nullif(btrim(p_payload ->> 'centro_costo_id'), '');
  v_tipo_cambio numeric(10,6) := nullif(p_payload ->> 'tipo_cambio', '')::numeric;
  v_es_rhe boolean := upper(coalesce(nullif(btrim(p_payload ->> 'tipo_comprobante'), ''), '')) = 'RHE';
  v_trabajo_facturable_input text := lower(nullif(btrim(p_payload ->> 'trabajo_facturable'), ''));
  v_trabajo_facturable boolean;
  v_personal_nombre text;
  v_personal_ruc text;
  v_personal_tasa numeric;
  v_personal_suspension boolean;
  v_personal_vencimiento date;
  v_personal_elegible boolean := false;
  v_identidad_duplicado text;
  v_cxp_id text := 'cxp_imp_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20);
  v_gasto_id text := 'gasto_imp_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 18);
  v_pago_id text := 'cxpp_imp_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 19);
  v_cxp public.cxp%rowtype;
  v_gasto public.compras_gastos%rowtype;
  v_pago public.cxp_pagos%rowtype;
  v_ceco public.centros_costo%rowtype;
  v_proveedor public.proveedores%rowtype;
begin
  if v_empresa_id is null or not public.usuario_tiene_empresa(v_empresa_id) then
    raise exception 'No tienes acceso al tenant indicado.';
  end if;
  if not public.usuario_puede(v_empresa_id, 'cxp', 'crear') then
    raise exception 'No tienes permiso para crear CxP en este tenant.';
  end if;
  select coalesce(e.multisociedad_habilitado, false)
    into v_multisociedad_habilitado
  from public.empresas e
  where e.id = v_empresa_id;
  if not found then raise exception 'Tenant inexistente.'; end if;
  if v_concepto is null then raise exception 'Concepto obligatorio.'; end if;
  if v_fecha_emision is null or v_fecha_vencimiento is null then raise exception 'Fecha de emision y vencimiento obligatorias.'; end if;
  if v_fecha_vencimiento < v_fecha_emision then raise exception 'Fecha de vencimiento no puede ser anterior a emision.'; end if;
  if v_moneda not in ('PEN', 'USD') then raise exception 'Moneda invalida: usa PEN o USD.'; end if;
  if v_monto_pagado < 0 then raise exception 'Monto pagado invalido.'; end if;
  if v_monto_pagado > 0 and v_fecha_pago is null then raise exception 'Fecha de pago obligatoria para pago parcial.'; end if;
  if v_moneda = 'USD' and coalesce(v_tipo_cambio, 0) <= 0 then raise exception 'Tipo de cambio USD obligatorio.'; end if;
  if v_centro_costo_id is null then raise exception 'Centro de costo obligatorio.'; end if;
  select * into v_ceco from public.centros_costo where id = v_centro_costo_id and empresa_id = v_empresa_id;
  if not found then raise exception 'CECO inexistente en este tenant.'; end if;
  if v_ceco.estado <> 'activo' then raise exception 'CECO inactivo.'; end if;
  if (v_ceco.fecha_inicio is not null and v_fecha_emision < v_ceco.fecha_inicio)
     or (v_ceco.fecha_fin is not null and v_fecha_emision > v_ceco.fecha_fin) then
    raise exception 'CECO fuera de vigencia para la fecha de emision.';
  end if;
  if v_multisociedad_habilitado and v_ceco.sociedad_id is null then
    raise exception 'No se puede importar la CxP: la sociedad debia derivarse del CECO seleccionado, pero el CECO no tiene sociedad asignada.';
  end if;

  if v_es_rhe then
    if v_documento is null then raise exception 'Numero RHE obligatorio para carga masiva.'; end if;
    if coalesce(v_monto_bruto, 0) <= 0 then raise exception 'Monto bruto RHE debe ser mayor que cero.'; end if;

    if v_personal_id is not null then
      -- Misma elegibilidad del selector actual: administrativo activo u operativo no inactivo,
      -- y tipo_contrato exactamente Honorarios o ruc_colaborador presente.
      select x.nombre, x.ruc_colaborador, x.tasa, x.suspension_retenciones, x.vencimiento_suspension, x.elegible
      into v_personal_nombre, v_personal_ruc, v_personal_tasa, v_personal_suspension, v_personal_vencimiento, v_personal_elegible
      from (
        select pa.nombre, pa.ruc_colaborador, coalesce(pa.retencion_ir, pa.retencion_ir_comision, 8) as tasa,
          pa.suspension_retenciones, pa.vencimiento_suspension,
          (pa.estado = 'activo' and (pa.tipo_contrato = 'Honorarios' or nullif(btrim(pa.ruc_colaborador), '') is not null)) as elegible
        from public.personal_administrativo pa where pa.empresa_id = v_empresa_id and pa.id = v_personal_id
        union all
        select po.nombre, po.ruc_colaborador, coalesce(po.retencion_ir, 8) as tasa,
          po.suspension_retenciones, po.vencimiento_suspension,
          (po.estado <> 'inactivo' and (po.tipo_contrato = 'Honorarios' or nullif(btrim(po.ruc_colaborador), '') is not null)) as elegible
        from public.personal_operativo po where po.empresa_id = v_empresa_id and po.id = v_personal_id
      ) x limit 1;
      if not found then raise exception 'personal_id inexistente en el maestro del tenant.'; end if;
      if not v_personal_elegible then raise exception 'personal_id no es elegible para RHE segun el maestro vigente.'; end if;
      if v_ruc <> '' and v_ruc <> regexp_replace(coalesce(v_personal_ruc, ''), '\D', '', 'g') then
        raise exception 'RUC del RHE interno no coincide con el maestro de personal.';
      end if;
      if v_razon_social is not null and lower(btrim(v_razon_social)) <> lower(btrim(coalesce(v_personal_nombre, ''))) then
        raise exception 'Razon social del RHE interno no coincide con el maestro de personal.';
      end if;
      if v_trabajo_facturable_input in ('si', 'sí', 'true', '1') then v_trabajo_facturable := true;
      elsif v_trabajo_facturable_input in ('no', 'false', '0') then v_trabajo_facturable := false;
      else raise exception 'trabajo_facturable obligatorio para RHE interno: usa SI o NO.';
      end if;
      if coalesce(v_personal_suspension, false)
         and (v_personal_vencimiento is null or v_personal_vencimiento >= current_date) then
        v_tasa_retencion := 0;
      else
        v_tasa_retencion := coalesce(v_personal_tasa, 8) / 100;
      end if;
      select nombre into v_categoria_auto from public.er_categorias
      where empresa_id = v_empresa_id and activo = true and tipo_sistema = 'mano_obra'
        and seccion = case when v_trabajo_facturable then 'costo_ventas' else 'gastos_operativos' end
      order by orden nulls last, nombre limit 1;
      if v_categoria_auto is not null then
        if v_categoria_er is not null and v_categoria_er <> v_categoria_auto then
          raise exception 'La categoria ER del RHE interno no coincide con la categoria de mano de obra aplicable.';
        end if;
        v_categoria_er := v_categoria_auto;
      end if;
      v_ruc := regexp_replace(coalesce(v_personal_ruc, ''), '\D', '', 'g');
      v_razon_social := v_personal_nombre;
    else
      if v_ruc !~ '^\d{11}$' then raise exception 'RUC emisor obligatorio para RHE externo: debe tener 11 digitos.'; end if;
      if v_razon_social is null then raise exception 'Razon social obligatoria para RHE externo.'; end if;
      v_tasa_retencion := 0.08;
      if v_categoria_er is null then
        select nombre into v_categoria_er from public.er_categorias
        where empresa_id = v_empresa_id and activo = true and lower(nombre) = 'servicios terceros'
        order by orden nulls last, nombre limit 1;
      end if;
    end if;

    if v_categoria_er is null or not exists (
      select 1 from public.er_categorias where empresa_id = v_empresa_id and activo = true and nombre = v_categoria_er
    ) then raise exception 'Categoria ER invalida o inactiva para RHE.'; end if;
    v_retencion_ir := round(v_monto_bruto * v_tasa_retencion, 2);
    if v_monto_total <> round(v_monto_bruto - v_retencion_ir, 2) then
      raise exception 'Monto total RHE invalido: debe ser el neto calculado luego de la retencion.';
    end if;
    if v_monto_pagado >= v_monto_total then raise exception 'Solo se permiten saldos pendientes: monto_pagado debe ser menor que el neto RHE.'; end if;
    v_documento_normalizado := regexp_replace(lower(btrim(v_documento)), '\s+', ' ', 'g');
    v_identidad_duplicado := case when v_ruc <> '' then v_ruc else 'personal:' || v_personal_id end;
    perform pg_advisory_xact_lock(hashtext(v_empresa_id || '|RHE|' || v_identidad_duplicado || '|' || v_documento_normalizado));
    if exists (
      select 1 from public.cxp c
      where c.empresa_id = v_empresa_id and c.tipo_comprobante = 'RHE'
        and regexp_replace(lower(btrim(coalesce(c.factura_numero, ''))), '\s+', ' ', 'g') = v_documento_normalizado
        and ((v_ruc <> '' and regexp_replace(coalesce(c.ruc_emisor, ''), '\D', '', 'g') = v_ruc)
          or (v_ruc = '' and c.personal_id = v_personal_id))
    ) then raise exception 'Duplicado: ya existe un RHE con el mismo RUC/personal y numero RHE.'; end if;
  else
    if v_proveedor_id is null then raise exception 'Proveedor obligatorio.'; end if;
    select * into v_proveedor from public.proveedores where id = v_proveedor_id and empresa_id = v_empresa_id;
    if not found then raise exception 'Proveedor no encontrado en el tenant.'; end if;
    if v_ruc !~ '^\d{11}$' then raise exception 'RUC emisor invalido: debe tener 11 digitos.'; end if;
    if v_razon_social is null then raise exception 'Razon social obligatoria.'; end if;
    if v_tipo_comprobante not in ('Factura', 'Boleta', 'Nota de débito', 'Sin comprobante') then raise exception 'Tipo de comprobante invalido para carga masiva.'; end if;
    if v_monto_total <= 0 then raise exception 'Monto total debe ser mayor que cero.'; end if;
    if v_monto_pagado >= v_monto_total then raise exception 'Solo se permiten saldos pendientes: monto_pagado debe ser menor que monto_total.'; end if;
    if v_categoria_er is null or not exists (
      select 1 from public.er_categorias where empresa_id = v_empresa_id and activo = true and nombre = v_categoria_er
    ) then raise exception 'Categoria ER invalida o inactiva.'; end if;
    v_concepto_normalizado := regexp_replace(translate(lower(btrim(v_concepto)), 'áéíóúüñ', 'aeiouun'), '\s+', ' ', 'g');
    perform pg_advisory_xact_lock(hashtext(v_empresa_id || '|' || v_ruc || '|' || v_concepto_normalizado || '|' || v_fecha_emision || '|' || v_monto_total::text));
    if exists (
      select 1 from public.cxp c left join public.proveedores p on p.id = c.proveedor_id
      where c.empresa_id = v_empresa_id
        and regexp_replace(coalesce(c.ruc_emisor, p.ruc, ''), '\D', '', 'g') = v_ruc
        and regexp_replace(translate(lower(btrim(coalesce(c.concepto, ''))), 'áéíóúüñ', 'aeiouun'), '\s+', ' ', 'g') = v_concepto_normalizado
        and c.fecha_emision = v_fecha_emision and c.monto_total = v_monto_total
    ) then raise exception 'Duplicado: ya existe una CxP con el mismo RUC, concepto, fecha de emision y monto total.'; end if;
  end if;

  v_saldo := v_monto_total - v_monto_pagado;
  insert into public.cxp (
    id, empresa_id, sociedad_id, proveedor_id, tipo_beneficiario, personal_id, factura_numero, concepto,
    fecha_emision, fecha_vencimiento, monto_total, monto_bruto, retencion_ir, monto_pagado, saldo, moneda,
    estado, origen, tipo_comprobante, ruc_emisor, nombre_emisor, categoria_er, centro_costo_id,
    tipo_cambio, moneda_original, monto_original, no_devengar_er
  ) values (
    v_cxp_id, v_empresa_id, v_ceco.sociedad_id, case when v_es_rhe then null else v_proveedor_id end,
    case when v_es_rhe and v_personal_id is not null then 'personal' else 'proveedor' end,
    case when v_es_rhe then v_personal_id else null end, v_documento, v_concepto,
    v_fecha_emision, v_fecha_vencimiento, v_monto_total,
    case when v_es_rhe then v_monto_bruto else null end, case when v_es_rhe then v_retencion_ir else null end,
    v_monto_pagado, v_saldo, v_moneda, case when v_monto_pagado > 0 then 'pago_parcial' else 'por_pagar' end,
    case when v_es_rhe then 'rhe_externo' else 'carga_masiva' end, v_tipo_comprobante, v_ruc, v_razon_social,
    v_categoria_er, v_centro_costo_id, case when v_moneda = 'USD' then v_tipo_cambio else null end,
    case when v_moneda = 'USD' then 'USD' else null end, case when v_moneda = 'USD' then v_monto_total else null end, false
  ) returning * into v_cxp;

  insert into public.compras_gastos (
    id, empresa_id, sociedad_id, tipo, descripcion, categoria, monto, moneda, fecha,
    origen_registro, estado, estado_pago, cxp_id, centro_costo_id, personal_id
  ) values (
    v_gasto_id, v_empresa_id, v_ceco.sociedad_id, 'gasto', v_concepto, v_categoria_er,
    case when v_es_rhe then v_monto_bruto else v_monto_total end, v_moneda, v_fecha_emision,
    case when v_es_rhe then 'cxp_rhe_masiva' else 'cxp_carga_masiva' end,
    'registrado', 'pendiente', v_cxp_id, v_centro_costo_id, case when v_es_rhe then v_personal_id else null end
  ) returning * into v_gasto;

  update public.cxp set gasto_id = v_gasto_id, updated_at = now() where id = v_cxp_id returning * into v_cxp;
  if v_monto_pagado > 0 then
    insert into public.cxp_pagos (id, empresa_id, cxp_id, fecha_pago, monto, cuenta_bancaria, referencia, registrado_por)
    values (v_pago_id, v_empresa_id, v_cxp_id, v_fecha_pago, v_monto_pagado,
      nullif(btrim(p_payload ->> 'cuenta_bancaria'), ''), nullif(btrim(p_payload ->> 'referencia_pago'), ''), auth.uid()::text)
    returning * into v_pago;
  end if;
  return jsonb_build_object('cxp', to_jsonb(v_cxp), 'gasto', to_jsonb(v_gasto),
    'pago', case when v_monto_pagado > 0 then to_jsonb(v_pago) else null end);
end;
$$;

grant execute on function public.importar_cxp_masiva_fila(jsonb) to authenticated;

create or replace function public.importar_cxc_masiva_fila(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id text := nullif(btrim(p_payload ->> 'empresa_id'), '');
  v_multisociedad_habilitado boolean := false;
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
  v_sociedad_id uuid;
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
  select coalesce(e.multisociedad_habilitado, false)
    into v_multisociedad_habilitado
  from public.empresas e
  where e.id = v_empresa_id;
  if not found then raise exception 'Tenant inexistente.'; end if;
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

  v_sociedad_id := case
    when v_os_codigo is not null then v_os.sociedad_id
    else v_cebe.sociedad_id
  end;
  if v_multisociedad_habilitado and v_sociedad_id is null then
    if v_os_codigo is not null then
      raise exception 'No se puede importar la CxC: la sociedad debia derivarse de la OS Cliente seleccionada, pero la OS no tiene sociedad asignada.';
    else
      raise exception 'No se puede importar la CxC: la sociedad debia derivarse del CEBE seleccionado, pero el CEBE no tiene sociedad asignada.';
    end if;
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
    id, empresa_id, sociedad_id, cuenta_id, os_cliente_id, numero, tipo_documento,
    fecha_emision, fecha_vencimiento, subtotal, igv, total, moneda, estado,
    glosa, notas, condicion_pago, items, centro_beneficio_id,
    aplica_retencion, monto_retencion, monto_neto_cobrable, concepto
  ) values (
    v_factura_id, v_empresa_id, v_sociedad_id, v_cuenta.id, v_os.id, v_numero, v_tipo_documento,
    v_fecha_emision, v_fecha_vencimiento, v_subtotal, v_igv, v_total, v_moneda, 'emitida',
    v_glosa, v_notas, v_condicion_pago, coalesce(p_payload -> 'items', '[]'::jsonb), v_cebe.id,
    v_aplica_retencion, v_monto_retencion,
    case when v_aplica_retencion then v_monto_neto_cobrable else null end,
    v_glosa
  ) returning * into v_factura;

  insert into public.cxc (
    id, empresa_id, sociedad_id, cuenta_id, factura_id, os_cliente_id,
    fecha_emision, fecha_vencimiento, monto_total, monto_pagado, saldo, moneda, estado,
    glosa, notas, condicion_pago, monto_retencion, concepto
  ) values (
    v_cxc_id, v_empresa_id, v_sociedad_id, v_cuenta.id, v_factura.id, v_os.id,
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

select pg_notify('pgrst', 'reload schema');

