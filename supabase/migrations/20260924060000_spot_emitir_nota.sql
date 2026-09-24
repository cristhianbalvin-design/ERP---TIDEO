-- Paso 7: NC/ND y obligaciones SPOT.
-- La nota conserva los controles de tenant y los grants existentes.
-- Las obligaciones de ajuste usan documento_ajuste_id y quedan fuera del
-- indice unico de la obligacion principal de venta.

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
  v_factura_origen public.facturas%rowtype;
  v_factura_nota public.facturas%rowtype;
  v_cxc public.cxc%rowtype;
  v_nueva_cxc_saldo numeric(14,2);
  v_nueva_cxc_total numeric(14,2);
  v_nuevo_estado text;
  v_total_origen numeric(14,2);
  v_nc_acumuladas numeric(14,2);
  v_nd_acumuladas numeric(14,2);
  v_total_operacion numeric(14,2);
  v_corr public.correlativos_documentos%rowtype;
  v_os public.os_clientes%rowtype;
  v_obligacion public.detracciones%rowtype;
  v_pendiente_ajuste public.detracciones%rowtype;
  v_catalogo public.spot_catalogo%rowtype;
  v_codigo_spot text;
  v_spot_catalogo_id uuid;
  v_porcentaje numeric;
  v_tipo_cambio numeric;
  v_tipo_cambio_fuente text;
  v_base_soles numeric(18,2);
  v_monto_origen numeric(18,2);
  v_monto_soles numeric(18,2);
  v_aplica_nuevo boolean := false;
  v_tiene_principal boolean := false;
  v_depositada boolean := false;
  v_tiene_pendiente_ajuste boolean := false;
  v_ajuste_soles numeric(18,2);
  v_ajuste_origen numeric(18,2);
  v_payload_catalogo uuid;
begin
  -- Controles vigentes preservados: esta función valida tenant, no agrega
  -- usuario_puede ni otro permiso nuevo.
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

  select * into v_factura_origen
  from public.facturas
  where id = v_origen_id and empresa_id = v_empresa_id
  for update;
  if not found then
    raise exception 'FACTURA_ORIGEN_NO_ENCONTRADA: el comprobante no existe en el tenant.';
  end if;
  if v_factura_origen.tipo_documento not in ('factura', 'boleta') or v_factura_origen.estado = 'anulada' then
    raise exception 'FACTURA_ORIGEN_NO_AFECTABLE: el comprobante no puede recibir una nota.';
  end if;
  if v_factura_origen.sociedad_id is distinct from v_sociedad_id then
    raise exception 'SOCIEDAD_ORIGEN_INVALIDA: la sociedad no coincide con el comprobante origen.';
  end if;
  v_total_origen := coalesce(v_factura_origen.total, 0);

  select * into v_cxc
  from public.cxc
  where factura_id = v_origen_id and empresa_id = v_empresa_id
  for update;
  if not found then
    raise exception 'CXC_ORIGEN_NO_ENCONTRADA: la factura origen no tiene una CxC vinculada; no se creó una CxC nueva.';
  end if;
  -- Control vigente conservado literalmente: la versión anterior compara
  -- la NC con monto_total, no con saldo.
  if v_tipo = 'nota_credito' and v_total > coalesce(v_cxc.monto_total, 0) then
    raise exception 'MONTO_NC_EXCEDE_SALDO: el total de la Nota de Crédito (%) excede el monto restante de la CxC (%).', v_total, coalesce(v_cxc.monto_total, 0);
  end if;

  select coalesce(sum(case when tipo_documento = 'nota_credito' then total else 0 end), 0),
         coalesce(sum(case when tipo_documento = 'nota_debito' then total else 0 end), 0)
    into v_nc_acumuladas, v_nd_acumuladas
  from public.facturas
  where factura_origen_id = v_origen_id
    and empresa_id = v_empresa_id
    and tipo_documento in ('nota_credito', 'nota_debito')
    and estado <> 'anulada';
  v_total_operacion := case when v_tipo = 'nota_credito'
    then v_total_origen - v_nc_acumuladas - v_total + v_nd_acumuladas
    else v_total_origen - v_nc_acumuladas + v_nd_acumuladas + v_total end;
  if v_total_operacion < 0 then v_total_operacion := 0; end if;

  select * into v_obligacion
  from public.detracciones d
  where d.direccion = 'venta'
    and d.factura_id = v_origen_id
    and d.documento_ajuste_id is null
    and d.estado <> 'anulada'
  order by d.creado_en desc
  limit 1
  for update;
  v_tiene_principal := found;
  v_depositada := v_tiene_principal and v_obligacion.estado = 'depositada';
  if v_depositada then
    select * into v_pendiente_ajuste
    from public.detracciones d
    where d.direccion = 'venta'
      and d.cxc_id = v_cxc.id
      and d.estado = 'pendiente'
    order by d.creado_en
    limit 1
    for update;
    v_tiene_pendiente_ajuste := found;
  end if;

  if v_tiene_principal then
    v_codigo_spot := v_obligacion.codigo_spot;
    v_spot_catalogo_id := v_obligacion.spot_catalogo_id;
    v_porcentaje := v_obligacion.porcentaje;
    v_tipo_cambio := v_obligacion.tipo_cambio;
    v_tipo_cambio_fuente := v_obligacion.tipo_cambio_fuente;
    select * into v_catalogo
    from public.spot_catalogo c
    where c.codigo = v_codigo_spot
      and c.estado = 'activo'
      and c.vigencia_desde <= v_factura_origen.fecha_emision
      and (c.vigencia_hasta is null or c.vigencia_hasta >= v_factura_origen.fecha_emision)
    order by c.vigencia_desde desc
    limit 1;
    if not found then
      raise exception 'SPOT_VERSION_ORIGEN_NO_ENCONTRADA: no existe versión vigente para el código % en la fecha de la factura.', v_codigo_spot;
    end if;
    v_spot_catalogo_id := v_obligacion.spot_catalogo_id;
    v_porcentaje := v_obligacion.porcentaje;
    if v_moneda = 'USD' then
      v_base_soles := round(v_total_operacion * v_tipo_cambio, 2);
    else
      v_base_soles := round(v_total_operacion, 2);
    end if;
    v_aplica_nuevo := (v_catalogo.umbral_operador = '>' and v_base_soles > v_catalogo.monto_minimo)
      or (v_catalogo.umbral_operador = '>=' and v_base_soles >= v_catalogo.monto_minimo);
    if v_aplica_nuevo then
      v_monto_origen := round(v_total_operacion * v_porcentaje / 100, 2);
      v_monto_soles := round(v_base_soles * v_porcentaje / 100, 0);
    else
      v_monto_origen := 0;
      v_monto_soles := 0;
    end if;
    if v_tipo = 'nota_credito' and not v_depositada and v_aplica_nuevo
       and v_nueva_cxc_saldo is null then
      v_nueva_cxc_saldo := greatest(0, coalesce(v_cxc.saldo, 0) - v_total);
      if v_nueva_cxc_saldo + 0.005 < v_monto_origen then
        raise exception 'SPOT_NC_REQUIERE_REGULARIZACION: el saldo resultante de la CxC (%) es menor que la detracción pendiente (%); regulariza primero la detracción.', v_nueva_cxc_saldo, v_monto_origen;
      end if;
    end if;
  else
    -- Una ND puede crear una obligación nueva si el payload aporta el código.
    if v_tipo = 'nota_debito' then
      v_payload_catalogo := nullif(btrim(p_payload ->> 'spot_catalogo_id'), '')::uuid;
      if v_payload_catalogo is not null then
        select c.* into v_catalogo from public.spot_catalogo c where c.id = v_payload_catalogo;
      else
        v_codigo_spot := nullif(btrim(p_payload ->> 'codigo_spot'), '');
        if v_codigo_spot is not null then
          select c.* into v_catalogo
          from public.spot_catalogo c
          where c.codigo = v_codigo_spot and c.estado = 'activo'
            and c.vigencia_desde <= v_fecha
            and (c.vigencia_hasta is null or c.vigencia_hasta >= v_fecha)
          order by c.vigencia_desde desc limit 1;
        end if;
      end if;
      if v_catalogo.id is not null then
        v_codigo_spot := v_catalogo.codigo;
        v_spot_catalogo_id := v_catalogo.id;
        v_porcentaje := v_catalogo.porcentaje;
        if v_moneda = 'USD' then
          v_tipo_cambio := nullif(p_payload ->> 'tipo_cambio_detraccion', '')::numeric;
          v_tipo_cambio_fuente := nullif(lower(btrim(p_payload ->> 'tipo_cambio_fuente')), '');
          if v_tipo_cambio is null or v_tipo_cambio <= 0 or v_tipo_cambio_fuente not in ('manual', 'referencial') then
            raise exception 'Para una Nota de Débito USD con detracción debes informar tipo_cambio_detraccion > 0 y tipo_cambio_fuente manual o referencial.';
          end if;
          v_base_soles := round(v_total_operacion * v_tipo_cambio, 2);
        else
          v_tipo_cambio := null;
          v_tipo_cambio_fuente := null;
          v_base_soles := round(v_total_operacion, 2);
        end if;
        v_aplica_nuevo := (v_catalogo.umbral_operador = '>' and v_base_soles > v_catalogo.monto_minimo)
          or (v_catalogo.umbral_operador = '>=' and v_base_soles >= v_catalogo.monto_minimo);
        if v_aplica_nuevo then
          v_monto_origen := round(v_total_operacion * v_porcentaje / 100, 2);
          v_monto_soles := round(v_base_soles * v_porcentaje / 100, 0);
        end if;
      end if;
    end if;
  end if;

  v_serie := case when v_tipo = 'nota_credito' then 'NC01' else 'ND01' end;
  select * into v_corr from public.correlativos_documentos
  where empresa_id = v_empresa_id and tipo_documento = v_tipo and serie = v_serie
    and sociedad_id is not distinct from v_sociedad_id for update;
  if not found then
    insert into public.correlativos_documentos (id,empresa_id,tipo_documento,serie,ultimo_numero,sociedad_id)
    values ('corr_nota_' || md5(v_empresa_id || '|' || v_tipo || '|' || v_serie || '|' || coalesce(v_sociedad_id::text,'sin-sociedad')),
      v_empresa_id,v_tipo,v_serie,coalesce((select max(substring(numero from '[0-9]+$')::integer) from public.facturas where empresa_id=v_empresa_id and tipo_documento=v_tipo and numero ~ ('^'||v_serie||'-[0-9]+$') and sociedad_id is not distinct from v_sociedad_id),0),v_sociedad_id)
    returning * into v_corr;
  end if;
  v_numero := greatest(v_corr.ultimo_numero,coalesce((select max(substring(numero from '[0-9]+$')::integer) from public.facturas where empresa_id=v_empresa_id and tipo_documento=v_tipo and numero ~ ('^'||v_serie||'-[0-9]+$') and sociedad_id is not distinct from v_sociedad_id),0))+1;
  v_numero_completo := v_serie || '-' || lpad(v_numero::text,4,'0');
  update public.correlativos_documentos set ultimo_numero=v_numero,updated_at=now() where id=v_corr.id;
  v_factura_id := coalesce(v_factura_id,'fac_'||md5(v_empresa_id||'|'||v_numero_completo||'|'||clock_timestamp()::text));
  v_cuenta_id := v_factura_origen.cuenta_id;
  v_os_id := v_factura_origen.os_cliente_id;
  v_valorizacion_id := v_factura_origen.valorizacion_id;

  insert into public.facturas (id,empresa_id,cuenta_id,os_cliente_id,valorizacion_id,centro_beneficio_id,sociedad_id,
    numero,tipo_documento,fecha_emision,subtotal,igv,total,moneda,estado,items,factura_origen_id,motivo,motivo_codigo,notas,concepto)
  values (v_factura_id,v_empresa_id,v_cuenta_id,v_os_id,v_valorizacion_id,v_factura_origen.centro_beneficio_id,v_sociedad_id,
    v_numero_completo,v_tipo,v_fecha,v_subtotal,v_igv,v_total,v_moneda,'emitida',coalesce(p_payload->'items','[]'::jsonb),v_origen_id,v_motivo_codigo,v_motivo_codigo,nullif(btrim(p_payload->>'notas'),''),nullif(btrim(p_payload->>'concepto'),''))
  returning * into v_factura_nota;

  v_nueva_cxc_total := case when v_tipo='nota_credito' then greatest(0,coalesce(v_cxc.monto_total,0)-v_total) else coalesce(v_cxc.monto_total,0)+v_total end;
  v_nueva_cxc_saldo := case when v_tipo='nota_credito' then greatest(0,coalesce(v_cxc.saldo,0)-v_total) else coalesce(v_cxc.saldo,0)+v_total end;
  v_nuevo_estado := case when v_nueva_cxc_saldo <= 0 then 'cancelada' else v_cxc.estado end;
  update public.cxc set monto_total=v_nueva_cxc_total,saldo=v_nueva_cxc_saldo,estado=v_nuevo_estado,updated_at=now() where id=v_cxc.id;

  if v_tiene_principal and not v_depositada then
    if v_aplica_nuevo then
      update public.detracciones set base_soles=v_base_soles,monto_detraccion_soles=v_monto_soles,monto_detraccion_origen=v_monto_origen,actualizado_en=now() where id=v_obligacion.id;
      update public.facturas set aplica_detraccion=true,porcentaje_detraccion=v_porcentaje,monto_detraccion=v_monto_origen where id=v_origen_id;
    else
      update public.detracciones set base_soles=0,monto_detraccion_soles=0,monto_detraccion_origen=0,estado='anulada',actualizado_en=now() where id=v_obligacion.id;
      update public.facturas set aplica_detraccion=false,porcentaje_detraccion=null,monto_detraccion=null where id=v_origen_id;
    end if;
  elsif v_tiene_principal and v_depositada and v_tipo='nota_credito' then
    v_ajuste_soles := greatest(0, v_obligacion.monto_detraccion_soles - case when v_aplica_nuevo then v_monto_soles else 0 end);
    v_ajuste_origen := case when v_moneda='USD' and v_tipo_cambio is not null then round(v_ajuste_soles / v_tipo_cambio,2) else v_ajuste_soles end;
    if v_ajuste_soles > 0 then
      insert into public.detracciones(direccion,factura_id,cxc_id,documento_ajuste_id,empresa_id,sociedad_id,spot_catalogo_id,codigo_spot,porcentaje,base_soles,monto_detraccion_soles,monto_detraccion_origen,moneda_origen,tipo_cambio,tipo_cambio_fuente,origen,estado)
      values('venta',v_origen_id,v_cxc.id,v_factura_nota.id,v_empresa_id,v_sociedad_id,v_obligacion.spot_catalogo_id,v_obligacion.codigo_spot,v_obligacion.porcentaje,v_ajuste_soles,v_ajuste_soles,v_ajuste_origen,v_obligacion.moneda_origen,v_obligacion.tipo_cambio,v_obligacion.tipo_cambio_fuente,'emision','ajustada');
    end if;
  elsif v_tiene_principal and v_depositada and v_tipo='nota_debito' then
    v_ajuste_soles := greatest(0, v_monto_soles - v_obligacion.monto_detraccion_soles);
    v_ajuste_origen := greatest(0, v_monto_origen - v_obligacion.monto_detraccion_origen);
    if v_ajuste_soles > 0 then
      if v_tiene_pendiente_ajuste then
        update public.detracciones
        set documento_ajuste_id=v_factura_nota.id,
            base_soles=v_ajuste_soles,
            monto_detraccion_soles=v_ajuste_soles,
            monto_detraccion_origen=v_ajuste_origen,
            actualizado_en=now()
        where id=v_pendiente_ajuste.id;
      else
        insert into public.detracciones(direccion,factura_id,cxc_id,documento_ajuste_id,empresa_id,sociedad_id,spot_catalogo_id,codigo_spot,porcentaje,base_soles,monto_detraccion_soles,monto_detraccion_origen,moneda_origen,tipo_cambio,tipo_cambio_fuente,origen,estado)
        values('venta',v_origen_id,v_cxc.id,v_factura_nota.id,v_empresa_id,v_sociedad_id,v_obligacion.spot_catalogo_id,v_obligacion.codigo_spot,v_obligacion.porcentaje,v_ajuste_soles,v_ajuste_soles,v_ajuste_origen,v_obligacion.moneda_origen,v_obligacion.tipo_cambio,v_obligacion.tipo_cambio_fuente,'emision','pendiente');
      end if;
    elsif v_tiene_pendiente_ajuste then
      update public.detracciones
      set base_soles=0,monto_detraccion_soles=0,monto_detraccion_origen=0,estado='anulada',actualizado_en=now()
      where id=v_pendiente_ajuste.id;
    end if;
  elsif not v_tiene_principal and v_tipo='nota_debito' and v_aplica_nuevo then
    insert into public.detracciones(direccion,factura_id,cxc_id,documento_ajuste_id,empresa_id,sociedad_id,spot_catalogo_id,codigo_spot,porcentaje,base_soles,monto_detraccion_soles,monto_detraccion_origen,moneda_origen,tipo_cambio,tipo_cambio_fuente,origen,estado)
    values('venta',v_origen_id,v_cxc.id,v_factura_nota.id,v_empresa_id,v_sociedad_id,v_spot_catalogo_id,v_codigo_spot,v_porcentaje,v_base_soles,v_monto_soles,v_monto_origen,v_moneda,v_tipo_cambio,v_tipo_cambio_fuente,'emision','pendiente');
    update public.facturas set aplica_detraccion=true,porcentaje_detraccion=v_porcentaje,monto_detraccion=v_monto_origen where id=v_origen_id;
  end if;

  if v_tipo='nota_credito' and v_total >= v_total_origen then
    update public.facturas set estado='anulada',motivo_anulacion='NC emitida: '||v_numero_completo where id=v_origen_id;
    if v_valorizacion_id is not null then update public.valorizaciones set estado='aprobada' where id=v_valorizacion_id and empresa_id=v_empresa_id; end if;
    if v_os_id is not null then update public.os_clientes set monto_facturado=greatest(0,coalesce(monto_facturado,0)-v_total),saldo_por_facturar=least(coalesce(monto_aprobado,0),coalesce(saldo_por_facturar,0)+v_total) where id=v_os_id and empresa_id=v_empresa_id returning * into v_os; end if;
  elsif v_tipo='nota_debito' and v_os_id is not null then
    update public.os_clientes set monto_facturado=coalesce(monto_facturado,0)+v_total,saldo_por_facturar=greatest(0,coalesce(saldo_por_facturar,0)-v_total) where id=v_os_id and empresa_id=v_empresa_id returning * into v_os;
  end if;
  select * into v_cxc from public.cxc where id=v_cxc.id;
  select * into v_factura_nota from public.facturas where id=v_factura_nota.id;
  return jsonb_build_object('factura',to_jsonb(v_factura_nota),'cxc',to_jsonb(v_cxc),'os',case when v_os_id is null then null else to_jsonb(v_os) end,'numero',v_numero_completo);
end;
$$;

revoke all on function public.emitir_nota_cxc_atomica(jsonb) from public;
grant execute on function public.emitir_nota_cxc_atomica(jsonb) to authenticated;
select pg_notify('pgrst','reload schema');

do $$
begin
  if exists (
    select 1
    from public.detracciones
    where direccion='venta' and estado='pendiente'
    group by cxc_id
    having count(*) > 1
  ) then
    raise exception 'VALIDACION_PREVIA|detracciones_venta_pendiente_duplicadas';
  end if;
  raise notice 'VALIDACION_PREVIA|detracciones_venta_pendiente_duplicadas=0';
end;
$$;

create unique index if not exists detracciones_venta_cxc_pendiente_unq
  on public.detracciones(cxc_id)
  where direccion='venta' and estado='pendiente';
