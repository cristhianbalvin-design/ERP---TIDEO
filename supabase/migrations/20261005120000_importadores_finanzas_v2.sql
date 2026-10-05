-- Importadores masivos v2: el contrato de las plantillas queda alineado con
-- las pantallas de CxC/CxP y con el motor SPOT vigente.

create or replace function public.importar_cxc_masiva_fila_v2(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_monto_pagado numeric(14,2) := coalesce(nullif(p_payload ->> 'monto_pagado', '')::numeric, 0);
  v_monto_detraccion numeric(14,2) := coalesce(nullif(p_payload ->> 'monto_detraccion', '')::numeric, 0);
  v_fecha_emision date := nullif(p_payload ->> 'fecha_emision', '')::date;
  v_fecha_cobro date := nullif(p_payload ->> 'fecha_cobro', '')::date;
  v_moneda text := upper(coalesce(nullif(btrim(p_payload ->> 'moneda'), ''), 'PEN'));
  v_estado text := lower(coalesce(nullif(btrim(p_payload ->> 'detraccion_estado'), ''), case when v_monto_detraccion > 0 then 'pendiente' else '' end));
  v_codigo_spot text := nullif(upper(btrim(p_payload ->> 'codigo_spot')), '');
  v_cuenta_det_id text := nullif(btrim(p_payload ->> 'cuenta_detraccion_id'), '');
  v_tc numeric := nullif(p_payload ->> 'tipo_cambio_detraccion', '')::numeric;
  v_tc_fuente text := nullif(lower(btrim(p_payload ->> 'tipo_cambio_fuente')), '');
  v_payload_base jsonb;
  v_resultado jsonb;
  v_factura public.facturas%rowtype;
  v_cxc public.cxc%rowtype;
  v_cobro_neto public.cobros_cxc%rowtype;
  v_cobro_detraccion public.cobros_cxc%rowtype;
  v_detraccion public.detracciones%rowtype;
  v_spot public.spot_catalogo%rowtype;
  v_cuenta_det public.cuentas_bancarias%rowtype;
  v_base_soles numeric(18,2);
  v_monto_soles numeric(18,2);
  v_monto_origen numeric(18,2);
  v_total numeric(18,2);
  v_sociedad_id uuid;
begin
  if v_monto_detraccion < 0 then raise exception 'Monto de detraccion invalido.'; end if;
  if v_monto_detraccion = 0 then
    return public.importar_cxc_masiva_fila_base(p_payload - 'detraccion_estado' - 'tipo_cambio_detraccion' - 'tipo_cambio_fuente' - 'porcentaje_detraccion');
  end if;
  if v_estado not in ('pendiente', 'depositada', 'por_autodetraer') then
    raise exception 'Estado de detraccion invalido: usa pendiente, depositada o por_autodetraer.';
  end if;
  if v_codigo_spot is not null then
    select s.* into v_spot
    from public.spot_catalogo s
    where s.codigo = v_codigo_spot and s.estado = 'activo'
      and s.vigencia_desde <= v_fecha_emision
      and (s.vigencia_hasta is null or s.vigencia_hasta >= v_fecha_emision)
    order by s.vigencia_desde desc limit 1;
    if not found then raise exception 'El codigo SPOT % no esta vigente para la fecha de emision.', v_codigo_spot; end if;
  end if;

  v_total := round(coalesce(nullif(p_payload ->> 'monto_total', '')::numeric, 0), 2);
  if v_total <= 0 then raise exception 'Monto total debe ser mayor que cero.'; end if;
  if v_codigo_spot is null then
    v_monto_origen := v_monto_detraccion;
    v_monto_soles := v_monto_detraccion;
    v_base_soles := case when v_moneda = 'USD' then round(v_total * coalesce(v_tc, 0), 2) else v_total end;
  elsif v_moneda = 'USD' then
    if coalesce(v_tc, 0) <= 0 or v_tc_fuente not in ('manual', 'referencial') then
      raise exception 'Para SPOT USD informa tipo de cambio positivo y fuente manual o referencial.';
    end if;
    v_base_soles := round(v_total * v_tc, 2);
    v_monto_origen := round(v_total * v_spot.porcentaje / 100, 2);
    v_monto_soles := round(v_base_soles * v_spot.porcentaje / 100, 0);
  else
    if v_tc is not null or v_tc_fuente is not null then raise exception 'Para SPOT PEN no se informa tipo de cambio.'; end if;
    v_tc := null; v_tc_fuente := null;
    v_base_soles := round(v_total, 2);
    v_monto_soles := round(v_base_soles * v_spot.porcentaje / 100, 0);
    v_monto_origen := v_monto_soles;
  end if;
  if v_spot.id is not null and not (
    (v_spot.umbral_operador = '>' and v_base_soles > v_spot.monto_minimo)
    or (v_spot.umbral_operador <> '>' and v_base_soles >= v_spot.monto_minimo)
  ) then raise exception 'La base SPOT no supera el minimo del codigo %.', v_codigo_spot; end if;
  if v_codigo_spot is not null and abs(v_monto_detraccion - v_monto_origen) > 0.01 then
    raise exception 'Monto de detraccion no coincide con el calculo del catalogo SPOT.';
  end if;
  if v_estado = 'depositada' then
    if v_monto_pagado <= 0 or v_fecha_cobro is null or v_cuenta_det_id is null then
      raise exception 'Una detraccion depositada requiere pago neto, fecha de cobro y cuenta de detracciones.';
    end if;
  end if;

  -- En estado pendiente/por_autodetraer el importe no es todavia un cobro.
  -- En estado depositada se conserva la semantica anterior: el base crea un
  -- cobro total y aqui se separa el neto de la detraccion.
  v_payload_base := p_payload - 'detraccion_estado' - 'tipo_cambio_detraccion' - 'tipo_cambio_fuente' - 'porcentaje_detraccion';
  if v_estado = 'depositada' then
    v_payload_base := jsonb_set(v_payload_base, '{monto_pagado}', to_jsonb(round(v_monto_pagado + v_monto_detraccion, 2)));
  else
    v_payload_base := jsonb_set(v_payload_base, '{monto_detraccion}', to_jsonb(0));
  end if;
  v_resultado := public.importar_cxc_masiva_fila_base(v_payload_base);
  v_factura := jsonb_populate_record(null::public.facturas, v_resultado -> 'factura');
  v_cxc := jsonb_populate_record(null::public.cxc, v_resultado -> 'cxc');
  if coalesce(v_factura.aplica_retencion, false) then raise exception 'La importacion no puede tener retencion y detraccion al mismo tiempo.'; end if;
  v_sociedad_id := coalesce(v_cxc.sociedad_id, v_factura.sociedad_id);
  if v_sociedad_id is null then raise exception 'No se pudo determinar la sociedad de la CxC para registrar SPOT.'; end if;
  if v_cuenta_det_id is not null then
    select * into v_cuenta_det from public.cuentas_bancarias where id = v_cuenta_det_id;
    if not found or v_cuenta_det.empresa_id is distinct from v_factura.empresa_id
       or v_cuenta_det.sociedad_id is distinct from v_sociedad_id
       or coalesce(v_cuenta_det.es_cuenta_detracciones, false) is not true
       or v_cuenta_det.moneda <> 'PEN' or v_cuenta_det.estado <> 'activo' then
      raise exception 'La cuenta de detracciones no es PEN, activa y de la misma empresa y sociedad.';
    end if;
  end if;

  if v_estado = 'depositada' then
    v_cobro_neto := jsonb_populate_record(null::public.cobros_cxc, v_resultado -> 'cobro');
    update public.cobros_cxc set monto_capital = v_monto_pagado where id = v_cobro_neto.id returning * into v_cobro_neto;
  end if;
  insert into public.detracciones(
    direccion, factura_id, cxc_id, empresa_id, sociedad_id, spot_catalogo_id, codigo_spot, porcentaje,
    base_soles, monto_detraccion_soles, monto_detraccion_origen, moneda_origen, tipo_cambio,
    tipo_cambio_fuente, origen, estado, cuenta_destino_id
  ) values (
    'venta', v_factura.id, v_cxc.id, v_factura.empresa_id, v_sociedad_id,
    nullif(v_spot.id::text, '')::uuid, v_spot.codigo, v_spot.porcentaje,
    v_base_soles, v_monto_soles, v_monto_origen, v_moneda, v_tc, v_tc_fuente,
    'importacion', v_estado, v_cuenta_det_id
  ) returning * into v_detraccion;
  if v_estado = 'depositada' then
    insert into public.cobros_cxc(
      id, empresa_id, cxc_id, factura_id, cuenta_id, monto_capital, monto_mora, medio_pago,
      cuenta_bancaria, numero_operacion, fecha_cobro, notas, registrado_por, detraccion_id
    ) values (
      'cob_imp_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20), v_factura.empresa_id,
      v_cxc.id, v_factura.id, v_cxc.cuenta_id, v_monto_detraccion, 0, 'Detraccion', null,
      nullif(btrim(p_payload ->> 'numero_operacion'), ''), v_fecha_cobro, 'Deposito por detraccion SPOT', auth.uid()::text, v_detraccion.id
    ) returning * into v_cobro_detraccion;
  end if;
  update public.facturas
  set aplica_detraccion = true, porcentaje_detraccion = v_spot.porcentaje, monto_detraccion = v_monto_detraccion
  where id = v_factura.id returning * into v_factura;
  return v_resultado || jsonb_build_object(
    'factura', to_jsonb(v_factura), 'detraccion', to_jsonb(v_detraccion),
    'cobro', case when v_estado = 'depositada' then to_jsonb(v_cobro_neto) else null end,
    'cobros', case when v_estado = 'depositada' then jsonb_build_array(to_jsonb(v_cobro_neto), to_jsonb(v_cobro_detraccion)) else '[]'::jsonb end
  );
end;
$function$;

create or replace function public.importar_cxp_masiva_fila_v2(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_tipo text := nullif(btrim(p_payload ->> 'tipo_comprobante'), '');
  v_es_tributo boolean := lower(coalesce(v_tipo, '')) = 'tributo';
  v_es_dividendo boolean := lower(coalesce(v_tipo, '')) = 'distribucion_utilidades';
  v_es_viatico boolean := lower(coalesce(v_tipo, '')) = 'viaticos';
  v_empresa_id text := nullif(btrim(p_payload ->> 'empresa_id'), '');
  v_centro_costo_id text := nullif(btrim(p_payload ->> 'centro_costo_id'), '');
  v_personal_id text := nullif(btrim(p_payload ->> 'personal_id'), '');
  v_proveedor_id text := nullif(btrim(p_payload ->> 'proveedor_id'), '');
  v_fecha_emision date := nullif(p_payload ->> 'fecha_emision', '')::date;
  v_fecha_vencimiento date := nullif(p_payload ->> 'fecha_vencimiento', '')::date;
  v_fecha_pago date := nullif(p_payload ->> 'fecha_pago', '')::date;
  v_moneda text := upper(coalesce(nullif(btrim(p_payload ->> 'moneda'), ''), 'PEN'));
  v_total numeric(14,2) := coalesce(nullif(p_payload ->> 'monto_total', '')::numeric, 0);
  v_pagado numeric(14,2) := coalesce(nullif(p_payload ->> 'monto_pagado', '')::numeric, 0);
  v_ceco public.centros_costo%rowtype;
  v_cxp public.cxp%rowtype;
  v_gasto public.compras_gastos%rowtype;
  v_pago public.cxp_pagos%rowtype;
  v_persona_nombre text;
  v_persona_ruc text;
  v_sociedad_id uuid;
  v_categoria text := nullif(btrim(p_payload ->> 'categoria_er'), '');
  v_concepto text := nullif(btrim(p_payload ->> 'concepto'), '');
  v_documento text := nullif(btrim(p_payload ->> 'factura_numero'), '');
  v_personal_nombre text;
  v_id text := 'cxp_imp_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20);
  v_gasto_id text := 'gasto_imp_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 18);
  v_pago_id text := 'cxpp_imp_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 19);
  v_spot_payload jsonb;
  v_det jsonb;
  v_import_result jsonb;
begin
  if not (v_es_tributo or v_es_dividendo or v_es_viatico) then
    v_spot_payload := p_payload;
    v_spot_payload := v_spot_payload - 'tipo_beneficiario' - 'origen' - 'no_devengar_er' - 'motivo_cxp' - 'ot_vinc_id';
    v_det := null;
    v_spot_payload := coalesce(v_spot_payload, '{}'::jsonb);
    if nullif(btrim(p_payload ->> 'codigo_spot'), '') is null then
      return public.importar_cxp_masiva_fila(p_payload);
    end if;
    -- El importador legado crea CxP + devengo + pago de forma atomica. Luego
    -- este wrapper añade la obligacion SPOT con el calculo centralizado.
    v_import_result := public.importar_cxp_masiva_fila(p_payload);
    if coalesce((v_import_result -> 'cxp' ->> 'monto_pagado')::numeric, 0) > 0 then
      raise exception 'Una CxP con detraccion SPOT no puede tener pagos previos.';
    end if;
    v_cxp := jsonb_populate_record(null::public.cxp, v_import_result -> 'cxp');
    v_spot_payload := jsonb_build_object(
      'codigo_spot', p_payload ->> 'codigo_spot',
      'tipo_cambio_detraccion', p_payload ->> 'tipo_cambio_detraccion',
      'tipo_cambio_fuente', p_payload ->> 'tipo_cambio_fuente',
      'porcentaje', p_payload ->> 'porcentaje_detraccion'
    );
    v_det := public.calcular_detraccion_compra(v_cxp.id, v_spot_payload);
    insert into public.detracciones(
      direccion, cxp_id, empresa_id, sociedad_id, spot_catalogo_id, codigo_spot, porcentaje,
      base_soles, monto_detraccion_soles, monto_detraccion_origen, moneda_origen, tipo_cambio,
      tipo_cambio_fuente, origen, estado
    ) values (
      'compra', v_cxp.id, v_cxp.empresa_id, v_cxp.sociedad_id,
      (v_det ->> 'spot_catalogo_id')::uuid, v_det ->> 'codigo_spot', (v_det ->> 'porcentaje')::numeric,
      (v_det ->> 'base_soles')::numeric, (v_det ->> 'monto_detraccion_soles')::numeric,
      (v_det ->> 'monto_detraccion_origen')::numeric, v_det ->> 'moneda_origen', nullif(v_det ->> 'tipo_cambio', '')::numeric,
      nullif(v_det ->> 'tipo_cambio_fuente', ''), 'registro_compra', 'pendiente'
    ) returning to_jsonb(detracciones) into v_det;
    return v_import_result || jsonb_build_object('detraccion', v_det);
  end if;

  if v_empresa_id is null or not public.usuario_tiene_empresa(v_empresa_id) then raise exception 'No tienes acceso al tenant indicado.'; end if;
  if not public.usuario_puede(v_empresa_id, 'cxp', 'crear') then raise exception 'No tienes permiso para crear CxP en este tenant.'; end if;
  if v_fecha_emision is null or v_fecha_vencimiento is null or v_fecha_vencimiento < v_fecha_emision then raise exception 'Fechas de emision/vencimiento invalidas.'; end if;
  if v_moneda not in ('PEN', 'USD') or v_total <= 0 or v_pagado < 0 or v_pagado >= v_total then raise exception 'Importes o moneda invalidos.'; end if;
  if v_pagado > 0 and v_fecha_pago is null then raise exception 'Fecha de pago obligatoria cuando existe monto pagado.'; end if;
  if v_moneda = 'USD' and coalesce(nullif(p_payload ->> 'tipo_cambio', '')::numeric, 0) <= 0 then raise exception 'Tipo de cambio USD obligatorio.'; end if;
  select * into v_ceco from public.centros_costo where id = v_centro_costo_id and empresa_id = v_empresa_id;
  if not found or v_ceco.estado <> 'activo' then raise exception 'CECO inexistente o inactivo en este tenant.'; end if;
  if (v_ceco.fecha_inicio is not null and v_fecha_emision < v_ceco.fecha_inicio) or (v_ceco.fecha_fin is not null and v_fecha_emision > v_ceco.fecha_fin) then raise exception 'CECO fuera de vigencia para la fecha de emision.'; end if;
  v_sociedad_id := v_ceco.sociedad_id;
  if v_sociedad_id is null and coalesce((select e.multisociedad_habilitado from public.empresas e where e.id = v_empresa_id), false) then raise exception 'El CECO no tiene sociedad asignada.'; end if;
  if v_es_tributo then
    if nullif(btrim(p_payload ->> 'tributo_tipo'), '') is null or (p_payload ->> 'tributo_periodo') !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Tributo requiere tipo y periodo AAAA-MM.'; end if;
    if v_documento is null then raise exception 'Formulario/documento obligatorio para tributo.'; end if;
    v_categoria := coalesce(v_categoria, 'Tributos');
  elsif v_es_dividendo then
    if nullif(btrim(p_payload ->> 'socio_nombre'), '') is null or (p_payload ->> 'periodo_utilidades') !~ '^\d{4}$' then raise exception 'Distribucion de utilidades requiere socio y periodo AAAA.'; end if;
    if nullif(btrim(p_payload ->> 'acta_referencia'), '') is null then raise exception 'Acta de referencia obligatoria para utilidades.'; end if;
  elsif v_es_viatico then
    if v_personal_id is null then raise exception 'personal_id obligatorio para viaticos.'; end if;
    select nombre, regexp_replace(coalesce(ruc_colaborador, ''), '\D', '', 'g') into v_persona_nombre, v_persona_ruc
    from public.personal_administrativo where id = v_personal_id and empresa_id = v_empresa_id and estado = 'activo';
    if not found then
      select nombre, regexp_replace(coalesce(ruc_colaborador, ''), '\D', '', 'g') into v_persona_nombre, v_persona_ruc
      from public.personal_operativo where id = v_personal_id and empresa_id = v_empresa_id and estado <> 'inactivo';
    end if;
    if not found then raise exception 'personal_id inexistente o inactivo para viaticos.'; end if;
    v_categoria := coalesce(v_categoria, 'Administrativos');
  end if;
  if v_concepto is null then raise exception 'Concepto obligatorio.'; end if;
  perform pg_advisory_xact_lock(hashtext(v_empresa_id || '|especial|' || v_tipo || '|' || coalesce(v_documento, v_concepto) || '|' || v_fecha_emision || '|' || v_total::text));
  if v_es_tributo and exists (select 1 from public.cxp c where c.empresa_id = v_empresa_id and c.tributo_tipo = p_payload ->> 'tributo_tipo' and c.tributo_periodo = p_payload ->> 'tributo_periodo' and c.monto_total = v_total and coalesce(c.estado, '') <> 'anulada') then raise exception 'Duplicado: ya existe este tributo para el periodo indicado.'; end if;
  if v_es_dividendo and exists (select 1 from public.cxp c where c.empresa_id = v_empresa_id and c.socio_nombre = p_payload ->> 'socio_nombre' and c.periodo_utilidades = p_payload ->> 'periodo_utilidades' and coalesce(c.estado, '') <> 'anulada') then raise exception 'Duplicado: ya existe una distribucion para este socio y periodo.'; end if;

  insert into public.cxp(
    id, empresa_id, sociedad_id, proveedor_id, tipo_beneficiario, personal_id, factura_numero, concepto,
    fecha_emision, fecha_vencimiento, monto_total, monto_pagado, saldo, moneda, estado, origen, tipo_comprobante,
    ruc_emisor, nombre_emisor, categoria_er, centro_costo_id, tipo_cambio, moneda_original, monto_original,
    tributo_tipo, tributo_periodo, tributo_formulario, socio_nombre, socio_participacion_pct, periodo_utilidades,
    acta_referencia, no_devengar_er, motivo_cxp, ot_vinc_id
  ) values (
    v_id, v_empresa_id, v_sociedad_id, null,
    case when v_es_dividendo then 'socio_accionista' when v_es_tributo then 'colectivo' else 'personal' end,
    case when v_es_viatico then v_personal_id else null end,
    v_documento, v_concepto, v_fecha_emision, v_fecha_vencimiento, v_total, v_pagado, v_total - v_pagado, v_moneda,
    case when v_pagado > 0 then 'pago_parcial' else 'por_pagar' end,
    case when v_es_dividendo then 'dividendos' when v_es_tributo then 'tributos' else 'viaticos' end,
    v_tipo, case when v_es_viatico then v_persona_ruc else null end,
    case when v_es_viatico then v_persona_nombre else coalesce(nullif(btrim(p_payload ->> 'socio_nombre'), ''), nullif(btrim(p_payload ->> 'tributo_tipo'), '')) end,
    v_categoria, v_centro_costo_id, nullif(p_payload ->> 'tipo_cambio', '')::numeric,
    case when v_moneda = 'USD' then 'USD' else null end, case when v_moneda = 'USD' then v_total else null end,
    p_payload ->> 'tributo_tipo', p_payload ->> 'tributo_periodo', p_payload ->> 'tributo_formulario',
    p_payload ->> 'socio_nombre', nullif(p_payload ->> 'socio_participacion_pct', '')::numeric, p_payload ->> 'periodo_utilidades',
    p_payload ->> 'acta_referencia', (v_es_tributo or v_es_dividendo), nullif(p_payload ->> 'motivo_cxp', ''), nullif(p_payload ->> 'ot_vinc_id', '')
  ) returning * into v_cxp;

  if v_es_viatico then
    insert into public.compras_gastos(
      id, empresa_id, sociedad_id, tipo, descripcion, categoria, monto, moneda, fecha, origen_registro,
      estado, estado_pago, cxp_id, centro_costo_id, personal_id, ot_vinc_id
    ) values (
      v_gasto_id, v_empresa_id, v_sociedad_id, 'gasto', v_concepto, v_categoria, v_total, v_moneda, v_fecha_emision,
      'cxp_viaticos_masiva', 'registrado', 'pendiente', v_cxp.id, v_centro_costo_id, v_personal_id, nullif(p_payload ->> 'ot_vinc_id', '')
    ) returning * into v_gasto;
    update public.cxp set gasto_id = v_gasto.id, updated_at = now() where id = v_cxp.id returning * into v_cxp;
  end if;
  if v_pagado > 0 then
    insert into public.cxp_pagos(id, empresa_id, cxp_id, fecha_pago, monto, cuenta_bancaria, referencia, registrado_por)
    values(v_pago_id, v_empresa_id, v_cxp.id, v_fecha_pago, v_pagado, nullif(p_payload ->> 'cuenta_bancaria', ''), nullif(p_payload ->> 'referencia_pago', ''), auth.uid()::text)
    returning * into v_pago;
  end if;
  return jsonb_build_object('cxp', to_jsonb(v_cxp), 'gasto', case when v_es_viatico then to_jsonb(v_gasto) else null end, 'pago', case when v_pagado > 0 then to_jsonb(v_pago) else null end);
end;
$function$;

revoke all on function public.importar_cxc_masiva_fila_v2(jsonb) from public, anon;
grant execute on function public.importar_cxc_masiva_fila_v2(jsonb) to authenticated, service_role;
revoke all on function public.importar_cxp_masiva_fila_v2(jsonb) from public, anon;
grant execute on function public.importar_cxp_masiva_fila_v2(jsonb) to authenticated, service_role;
select pg_notify('pgrst', 'reload schema');
