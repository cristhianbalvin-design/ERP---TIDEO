-- Registro atómico de compras de campo.
-- La carga del objeto en Storage ocurre fuera de PostgreSQL; esta RPC registra
-- metadatos, gasto, CxP y vínculo en una sola transacción.

create or replace function public.registrar_compra_campo(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_gasto jsonb := coalesce(v_payload -> 'gasto', '{}'::jsonb);
  v_adjunto jsonb := coalesce(v_payload -> 'adjunto', '{}'::jsonb);
  v_cxp_input jsonb := coalesce(v_payload -> 'cxp', '{}'::jsonb);
  v_cxp_payload jsonb;
  v_user_id uuid := auth.uid();
  v_empresa_id text := nullif(btrim(coalesce(v_payload ->> 'empresa_id', '')), '');
  v_gasto_id text := nullif(btrim(coalesce(v_gasto ->> 'id', '')), '');
  v_centro_costo_id text := nullif(btrim(coalesce(v_gasto ->> 'centro_costo_id', v_payload ->> 'centro_costo_id', '')), '');
  v_ot_id text := nullif(btrim(coalesce(v_gasto ->> 'ot_vinc_id', v_gasto ->> 'ot_id', '')), '');
  v_sociedad_text text := nullif(btrim(coalesce(v_payload ->> 'sociedad_id', v_gasto ->> 'sociedad_id', '')), '');
  v_sociedad_id uuid;
  v_alcance uuid[];
  v_monto numeric;
  v_fecha date;
  v_crear_cxp boolean := coalesce(nullif(v_payload ->> 'crear_cxp', '')::boolean, false);
  v_ruc text;
  v_factura text;
  v_adjunto_id uuid;
  v_cxp jsonb;
  v_gasto_row jsonb;
  v_multisociedad boolean;
  v_adjunto_bucket text := nullif(btrim(coalesce(v_adjunto ->> 'bucket', '')), '');
  v_storage_path text := nullif(btrim(coalesce(v_adjunto ->> 'storage_path', '')), '');
  v_adjunto_url text := nullif(btrim(coalesce(v_adjunto ->> 'url', '')), '');
  v_concepto text;
  v_fecha_vencimiento text;
begin
  if v_user_id is null then
    raise exception 'Debes iniciar sesión para registrar una compra de campo.';
  end if;

  if v_empresa_id is null then
    raise exception 'La empresa es obligatoria.';
  end if;

  if not exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = v_user_id
      and ue.empresa_id = v_empresa_id
      and ue.estado = 'activo'
      and ue.acceso_campo = true
      and 'compras' = any(coalesce(ue.campo_modulos, array[]::text[]))
  ) and not public.usuario_es_superadmin_plataforma() then
    raise exception 'No tienes acceso de campo al módulo Compras.';
  end if;

  if v_gasto_id is null or v_gasto_id !~ '^gasto_[a-z0-9]{24,64}$' then
    raise exception 'El identificador del gasto no tiene un formato válido.';
  end if;

  if exists (select 1 from public.compras_gastos where id = v_gasto_id) then
    raise exception 'El identificador del gasto ya existe.';
  end if;

  select coalesce(e.multisociedad_habilitado, false)
    into v_multisociedad
  from public.empresas e
  where e.id = v_empresa_id;

  if not found then
    raise exception 'La empresa indicada no existe.';
  end if;

  if v_sociedad_text is not null then
    begin
      v_sociedad_id := v_sociedad_text::uuid;
    exception when invalid_text_representation then
      raise exception 'La sociedad indicada no es válida.';
    end;
  elsif v_centro_costo_id is not null then
    select cc.sociedad_id
      into v_sociedad_id
    from public.centros_costo cc
    where cc.id = v_centro_costo_id
      and cc.empresa_id = v_empresa_id
      and cc.estado = 'activo';
  end if;

  if v_multisociedad and v_sociedad_id is null then
    raise exception 'La sociedad es obligatoria para registrar el gasto.';
  end if;

  if v_centro_costo_id is null or not exists (
    select 1
    from public.centros_costo cc
    where cc.id = v_centro_costo_id
      and cc.empresa_id = v_empresa_id
      and cc.estado = 'activo'
      and (v_sociedad_id is null or cc.sociedad_id = v_sociedad_id)
  ) then
    raise exception 'El centro de costo no pertenece a la empresa o sociedad indicada.';
  end if;

  v_alcance := public.usuario_alcance_sociedades(v_empresa_id);
  if v_sociedad_id is not null and v_alcance is not null and not (v_sociedad_id = any(v_alcance)) then
    raise exception 'La sociedad está fuera del alcance del usuario.';
  end if;

  if v_adjunto_bucket <> 'documentos-generales' then
    raise exception 'El comprobante debe estar en el bucket documentos-generales.';
  end if;

  if v_storage_path is null
     or left(v_storage_path, length(v_empresa_id || '/compras_gastos/' || v_gasto_id || '/'))
          <> v_empresa_id || '/compras_gastos/' || v_gasto_id || '/'
     or length(v_storage_path) <= length(v_empresa_id || '/compras_gastos/' || v_gasto_id || '/') then
    raise exception 'La ruta del comprobante no corresponde al gasto y empresa indicados.';
  end if;

  if v_adjunto_url is null then
    raise exception 'La URL del comprobante es obligatoria.';
  end if;

  begin
    v_monto := nullif(btrim(coalesce(v_gasto ->> 'monto', '')), '')::numeric;
    v_fecha := nullif(btrim(coalesce(v_gasto ->> 'fecha', '')), '')::date;
  exception when invalid_text_representation then
    raise exception 'El monto o la fecha del gasto no son válidos.';
  end;

  if v_monto is null or v_monto <= 0 then
    raise exception 'El monto debe ser mayor que cero.';
  end if;

  if v_fecha is null then
    raise exception 'La fecha del gasto es obligatoria.';
  end if;

  if nullif(btrim(coalesce(v_gasto ->> 'metodo_pago', '')), '') is null then
    raise exception 'El método de pago es obligatorio.';
  end if;

  v_ruc := regexp_replace(
    coalesce(nullif(btrim(v_gasto ->> 'ruc_proveedor'), ''), nullif(btrim(v_cxp_input ->> 'ruc_emisor'), ''), ''),
    '\D', '', 'g'
  );
  v_factura := public.normalizar_numero_comprobante(
    coalesce(nullif(btrim(v_gasto ->> 'num_comprobante'), ''), nullif(btrim(v_cxp_input ->> 'factura_numero'), ''), '')
  );

  if v_crear_cxp and (v_ruc = '' or v_factura = '') then
    raise exception 'El RUC y número de comprobante son obligatorios para generar una CxP.';
  end if;

  if v_ruc <> '' and v_factura <> '' then
    perform pg_advisory_xact_lock(hashtext(v_empresa_id || '|CXP_CAMPO|' || v_ruc || '|' || v_factura));

    if exists (
      select 1
      from public.compras_gastos g
      where g.empresa_id = v_empresa_id
        and lower(coalesce(g.estado, '')) <> 'anulada'
        and regexp_replace(coalesce(g.ruc_proveedor, ''), '\D', '', 'g') = v_ruc
        and public.normalizar_numero_comprobante(g.num_comprobante) = v_factura
    ) or exists (
      select 1
      from public.cxp c
      where c.empresa_id = v_empresa_id
        and lower(coalesce(c.estado, '')) <> 'anulada'
        and regexp_replace(coalesce(c.ruc_emisor, ''), '\D', '', 'g') = v_ruc
        and public.normalizar_numero_comprobante(c.factura_numero) = v_factura
    ) then
      raise exception 'Esta factura ya fue registrada';
    end if;
  end if;

  insert into public.compras_gastos (
    id, empresa_id, tipo, descripcion, categoria, monto, moneda, fecha,
    origen_registro, estado, estado_pago, proveedor_referencia, ruc_proveedor,
    num_comprobante, archivo_url, metodo_pago, cxp_id, centro_costo_id,
    sociedad_id, ot_vinc_id, created_at, updated_at, es_activo_fijo
  ) values (
    v_gasto_id,
    v_empresa_id,
    'gasto',
    coalesce(nullif(btrim(v_gasto ->> 'descripcion'), ''), 'Compra en campo'),
    coalesce(nullif(btrim(v_gasto ->> 'categoria'), ''), 'Materiales'),
    v_monto,
    coalesce(nullif(btrim(v_gasto ->> 'moneda'), ''), 'PEN'),
    v_fecha,
    'campo',
    'pendiente_revision',
    case when v_crear_cxp then 'pendiente' else 'pagado' end,
    nullif(btrim(v_gasto ->> 'proveedor_referencia'), ''),
    nullif(btrim(v_gasto ->> 'ruc_proveedor'), ''),
    nullif(btrim(v_gasto ->> 'num_comprobante'), ''),
    v_adjunto_url,
    nullif(btrim(v_gasto ->> 'metodo_pago'), ''),
    null,
    v_centro_costo_id,
    v_sociedad_id,
    v_ot_id,
    now(),
    now(),
    false
  );

  select to_jsonb(g)
    into v_gasto_row
  from public.compras_gastos g
  where g.id = v_gasto_id;

  insert into public.adjuntos (
    empresa_id, entidad_tipo, entidad_id, categoria, nombre_original,
    bucket, storage_path, url, mime_type, tamano_bytes, descripcion,
    subido_por
  ) values (
    v_empresa_id,
    'compras_gastos',
    v_gasto_id,
    coalesce(nullif(btrim(v_adjunto ->> 'categoria'), ''), 'comprobante'),
    coalesce(nullif(btrim(v_adjunto ->> 'nombre_original'), ''), 'comprobante'),
    v_adjunto_bucket,
    v_storage_path,
    v_adjunto_url,
    nullif(btrim(v_adjunto ->> 'mime_type'), ''),
    nullif(btrim(v_adjunto ->> 'tamano_bytes'), '')::bigint,
    nullif(btrim(v_adjunto ->> 'descripcion'), ''),
    v_user_id
  ) returning id into v_adjunto_id;

  if v_crear_cxp then
    v_concepto := coalesce(nullif(btrim(v_cxp_input ->> 'concepto'), ''), v_gasto ->> 'descripcion', 'Compra en campo');
    v_fecha_vencimiento := nullif(btrim(v_cxp_input ->> 'fecha_vencimiento'), '');
    if v_fecha_vencimiento is null then
      raise exception 'La fecha de vencimiento es obligatoria para generar una CxP.';
    end if;

    v_cxp_payload := (v_cxp_input - 'id' - 'estado' - 'origen' - 'no_devengar_er' - 'gasto_id') || jsonb_build_object(
      'empresa_id', v_empresa_id,
      'sociedad_id', v_sociedad_id,
      'estado', 'por_pagar',
      'origen', 'gasto_movil',
      'no_devengar_er', true,
      'gasto_id', v_gasto_id,
      'tipo_beneficiario', 'proveedor',
      'factura_numero', coalesce(nullif(btrim(v_cxp_input ->> 'factura_numero'), ''), v_gasto ->> 'num_comprobante'),
      'concepto', v_concepto,
      'monto_total', v_monto,
      'monto_pagado', 0,
      'saldo', v_monto,
      'fecha_emision', coalesce(nullif(btrim(v_cxp_input ->> 'fecha_emision'), ''), v_fecha::text),
      'ruc_emisor', coalesce(nullif(btrim(v_cxp_input ->> 'ruc_emisor'), ''), v_gasto ->> 'ruc_proveedor'),
      'archivo_factura_url', v_adjunto_url,
      'centro_costo_id', v_centro_costo_id
    );

    select public.generar_cxp_centralizado(v_cxp_payload, 'gasto_movil', 'crear')
      into v_cxp;

    update public.compras_gastos
    set cxp_id = v_cxp ->> 'id', updated_at = now()
    where id = v_gasto_id
      and empresa_id = v_empresa_id;

    if not found then
      raise exception 'No se pudo vincular el gasto con la CxP creada.';
    end if;

    v_gasto_row := v_gasto_row || jsonb_build_object('cxp_id', v_cxp ->> 'id');
  end if;

  return jsonb_build_object(
    'ok', true,
    'gasto_id', v_gasto_id,
    'cxp_id', case when v_crear_cxp then v_cxp ->> 'id' else null end,
    'adjunto_id', v_adjunto_id,
    'gasto', v_gasto_row,
    'cxp', case when v_crear_cxp then v_cxp else null end,
    'lineas_solpe_ignoradas', jsonb_array_length(coalesce(v_payload -> 'lineas_solpe', '[]'::jsonb))
  );
end;
$$;

revoke execute on function public.registrar_compra_campo(jsonb) from public, anon;
grant execute on function public.registrar_compra_campo(jsonb) to authenticated;

create unique index uq_cxp_factura_ruc_activa
  on public.cxp (
    empresa_id,
    regexp_replace(coalesce(ruc_emisor, ''), '\D', '', 'g'),
    public.normalizar_numero_comprobante(factura_numero)
  )
  where lower(coalesce(estado, '')) <> 'anulada'
    and nullif(regexp_replace(coalesce(ruc_emisor, ''), '\D', '', 'g'), '') is not null
    and public.normalizar_numero_comprobante(factura_numero) <> '';
