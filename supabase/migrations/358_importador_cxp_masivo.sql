-- Carga masiva de CxP de proveedores.
-- Una llamada procesa una sola fila de manera atómica: CxP + devengo + pago parcial.

create or replace function public.importar_cxp_masiva_fila(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_empresa_id text := p_payload ->> 'empresa_id';
  v_proveedor_id text := p_payload ->> 'proveedor_id';
  v_ruc text := regexp_replace(coalesce(p_payload ->> 'ruc_emisor', ''), '\D', '', 'g');
  v_razon_social text := nullif(btrim(p_payload ->> 'razon_social'), '');
  v_tipo_comprobante text := nullif(btrim(p_payload ->> 'tipo_comprobante'), '');
  v_documento text := nullif(btrim(p_payload ->> 'factura_numero'), '');
  v_concepto text := nullif(btrim(p_payload ->> 'concepto'), '');
  v_concepto_normalizado text;
  v_fecha_emision date := nullif(p_payload ->> 'fecha_emision', '')::date;
  v_fecha_vencimiento date := nullif(p_payload ->> 'fecha_vencimiento', '')::date;
  v_fecha_pago date := nullif(p_payload ->> 'fecha_pago', '')::date;
  v_moneda text := upper(coalesce(nullif(btrim(p_payload ->> 'moneda'), ''), 'PEN'));
  v_monto_total numeric(14,2) := coalesce(nullif(p_payload ->> 'monto_total', '')::numeric, 0);
  v_monto_pagado numeric(14,2) := coalesce(nullif(p_payload ->> 'monto_pagado', '')::numeric, 0);
  v_saldo numeric(14,2);
  v_categoria_er text := nullif(btrim(p_payload ->> 'categoria_er'), '');
  v_centro_costo_id text := nullif(btrim(p_payload ->> 'centro_costo_id'), '');
  v_tipo_cambio numeric(10,6) := nullif(p_payload ->> 'tipo_cambio', '')::numeric;
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
  if v_proveedor_id is null then raise exception 'Proveedor obligatorio.'; end if;
  select * into v_proveedor from public.proveedores where id = v_proveedor_id and empresa_id = v_empresa_id;
  if not found then raise exception 'Proveedor no encontrado en el tenant.'; end if;
  if v_ruc !~ '^\d{11}$' then raise exception 'RUC emisor inválido: debe tener 11 dígitos.'; end if;
  if v_razon_social is null then raise exception 'Razón social obligatoria.'; end if;
  if v_tipo_comprobante not in ('Factura', 'Boleta', 'Nota de débito', 'Sin comprobante') then
    raise exception 'Tipo de comprobante inválido para carga masiva.';
  end if;
  if v_concepto is null then raise exception 'Concepto obligatorio.'; end if;
  if v_fecha_emision is null or v_fecha_vencimiento is null then raise exception 'Fecha de emisión y vencimiento obligatorias.'; end if;
  if v_fecha_vencimiento < v_fecha_emision then raise exception 'Fecha de vencimiento no puede ser anterior a emisión.'; end if;
  if v_moneda not in ('PEN', 'USD') then raise exception 'Moneda inválida: usa PEN o USD.'; end if;
  if v_monto_total <= 0 then raise exception 'Monto total debe ser mayor que cero.'; end if;
  if v_monto_pagado < 0 or v_monto_pagado >= v_monto_total then
    raise exception 'Solo se permiten saldos pendientes: monto_pagado debe ser menor que monto_total.';
  end if;
  if v_monto_pagado > 0 and v_fecha_pago is null then raise exception 'Fecha de pago obligatoria para pago parcial.'; end if;
  if v_moneda = 'USD' and coalesce(v_tipo_cambio, 0) <= 0 then raise exception 'Tipo de cambio USD obligatorio.'; end if;
  if v_categoria_er is null or not exists (
    select 1 from public.er_categorias
    where empresa_id = v_empresa_id and activo = true and nombre = v_categoria_er
  ) then raise exception 'Categoría ER inválida o inactiva.'; end if;
  if v_centro_costo_id is null then raise exception 'Centro de costo obligatorio.'; end if;
  select * into v_ceco from public.centros_costo where id = v_centro_costo_id and empresa_id = v_empresa_id;
  if not found then raise exception 'CECO inexistente en este tenant.'; end if;
  if v_ceco.estado <> 'activo' then raise exception 'CECO inactivo.'; end if;
  if (v_ceco.fecha_inicio is not null and v_fecha_emision < v_ceco.fecha_inicio)
     or (v_ceco.fecha_fin is not null and v_fecha_emision > v_ceco.fecha_fin) then
    raise exception 'CECO fuera de vigencia para la fecha de emisión.';
  end if;

  v_concepto_normalizado := regexp_replace(
    translate(lower(btrim(v_concepto)), 'áéíóúüñ', 'aeiouun'), '\s+', ' ', 'g'
  );
  perform pg_advisory_xact_lock(hashtext(v_empresa_id || '|' || v_ruc || '|' || v_concepto_normalizado || '|' || v_fecha_emision || '|' || v_monto_total::text));
  if exists (
    select 1
    from public.cxp c
    left join public.proveedores p on p.id = c.proveedor_id
    where c.empresa_id = v_empresa_id
      and regexp_replace(coalesce(c.ruc_emisor, p.ruc, ''), '\D', '', 'g') = v_ruc
      and regexp_replace(translate(lower(btrim(coalesce(c.concepto, ''))), 'áéíóúüñ', 'aeiouun'), '\s+', ' ', 'g') = v_concepto_normalizado
      and c.fecha_emision = v_fecha_emision
      and c.monto_total = v_monto_total
  ) then raise exception 'Duplicado: ya existe una CxP con el mismo RUC, concepto, fecha de emisión y monto total.'; end if;

  v_saldo := v_monto_total - v_monto_pagado;
  insert into public.cxp (
    id, empresa_id, proveedor_id, tipo_beneficiario, factura_numero, concepto,
    fecha_emision, fecha_vencimiento, monto_total, monto_pagado, saldo, moneda,
    estado, origen, tipo_comprobante, ruc_emisor, nombre_emisor, categoria_er,
    centro_costo_id, tipo_cambio, moneda_original, monto_original, no_devengar_er
  ) values (
    v_cxp_id, v_empresa_id, v_proveedor_id, 'proveedor', v_documento, v_concepto,
    v_fecha_emision, v_fecha_vencimiento, v_monto_total, v_monto_pagado, v_saldo, v_moneda,
    case when v_monto_pagado > 0 then 'pago_parcial' else 'por_pagar' end,
    'carga_masiva', v_tipo_comprobante, v_ruc, v_razon_social, v_categoria_er,
    v_centro_costo_id, case when v_moneda = 'USD' then v_tipo_cambio else null end,
    case when v_moneda = 'USD' then 'USD' else null end,
    case when v_moneda = 'USD' then v_monto_total else null end, false
  ) returning * into v_cxp;

  insert into public.compras_gastos (
    id, empresa_id, tipo, descripcion, categoria, monto, moneda, fecha,
    origen_registro, estado, estado_pago, cxp_id, centro_costo_id
  ) values (
    v_gasto_id, v_empresa_id, 'gasto', v_concepto, v_categoria_er, v_monto_total, v_moneda,
    v_fecha_emision, 'cxp_carga_masiva', 'registrado', 'pendiente', v_cxp_id, v_centro_costo_id
  ) returning * into v_gasto;

  update public.cxp set gasto_id = v_gasto_id, updated_at = now() where id = v_cxp_id returning * into v_cxp;

  if v_monto_pagado > 0 then
    insert into public.cxp_pagos (
      id, empresa_id, cxp_id, fecha_pago, monto, cuenta_bancaria, referencia, registrado_por
    ) values (
      v_pago_id, v_empresa_id, v_cxp_id, v_fecha_pago, v_monto_pagado,
      nullif(btrim(p_payload ->> 'cuenta_bancaria'), ''), nullif(btrim(p_payload ->> 'referencia_pago'), ''), auth.uid()::text
    ) returning * into v_pago;
  end if;

  return jsonb_build_object(
    'cxp', to_jsonb(v_cxp),
    'gasto', to_jsonb(v_gasto),
    'pago', case when v_monto_pagado > 0 then to_jsonb(v_pago) else null end
  );
end;
$$;

grant execute on function public.importar_cxp_masiva_fila(jsonb) to authenticated;

select pg_notify('pgrst', 'reload schema');
