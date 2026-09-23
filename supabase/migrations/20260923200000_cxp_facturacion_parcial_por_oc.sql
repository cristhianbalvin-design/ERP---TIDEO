-- Permite CxP parciales por orden de compra y bloquea solo la sobre-facturacion.
-- Mantiene el bloqueo advisory existente para serializar altas concurrentes.

create or replace function public.generar_cxp_centralizado(
  p_payload jsonb,
  p_origen text,
  p_operacion text default 'crear'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_origen text := lower(nullif(btrim(coalesce(p_origen, '')), ''));
  v_operacion text := lower(nullif(btrim(coalesce(p_operacion, 'crear')), ''));
  v_empresa_id text;
  v_cxp_id text;
  v_recepcion_id text;
  v_orden_compra_id text;
  v_total_oc numeric;
  v_suma_cxp numeric;
  v_monto_nuevo numeric;
  v_saldo_facturar numeric;
  v_permitido boolean := false;
  v_ver_finanzas boolean := false;
  v_alcance uuid[];
  v_cxp public.cxp%rowtype;
begin
  if v_origen is null then raise exception 'El origen CxP es obligatorio'; end if;
  if v_operacion not in ('crear', 'actualizar') then raise exception 'Operacion CxP no soportada: %', v_operacion; end if;
  if v_operacion = 'actualizar' then
    v_cxp_id := nullif(btrim(v_payload ->> 'id'), '');
    if v_cxp_id is null then raise exception 'El id de CxP es obligatorio para actualizar'; end if;
    select * into v_cxp from public.cxp where id = v_cxp_id for update;
    if not found then raise exception 'La CxP % no existe', v_cxp_id; end if;
    v_empresa_id := v_cxp.empresa_id;
  else
    v_empresa_id := nullif(btrim(v_payload ->> 'empresa_id'), '');
    if v_empresa_id is null then raise exception 'empresa_id es obligatorio para crear CxP'; end if;
  end if;
  if not public.usuario_tiene_empresa(v_empresa_id) then raise exception 'No tienes acceso al tenant indicado'; end if;
  v_ver_finanzas := public.usuario_es_admin_empresa(v_empresa_id)
    or exists (select 1 from public.usuarios_empresas ue join public.permisos_roles pr on pr.rol_id=ue.rol_id
      where ue.user_id=auth.uid() and ue.empresa_id=v_empresa_id and ue.estado='activo' and pr.puede_ver_finanzas=true);
  v_permitido := case v_origen
    when 'recepcion_create' then public.usuario_puede(v_empresa_id, 'recepciones', 'crear')
    when 'recepcion_complete' then public.usuario_puede(v_empresa_id, 'recepciones', 'editar')
    when 'cxp_manual' then public.usuario_puede(v_empresa_id, 'cxp', 'crear')
    when 'nuevo_egreso' then public.usuario_puede(v_empresa_id, 'cxp', 'crear')
    when 'nc_devolucion' then public.usuario_puede(v_empresa_id, 'cxp', 'crear') or public.usuario_puede(v_empresa_id, 'facturacion', 'crear') or public.usuario_puede(v_empresa_id, 'facturacion', 'editar')
    when 'devolucion_proveedor' then public.usuario_puede(v_empresa_id, 'recepciones', 'crear')
    when 'compras_gastos' then public.usuario_puede(v_empresa_id, 'compras_gastos', 'crear')
    when 'gasto_movil' then public.usuario_es_superadmin_plataforma() or exists (select 1 from public.usuarios_empresas ue where ue.user_id=auth.uid() and ue.empresa_id=v_empresa_id and ue.estado='activo' and 'compras'=any(coalesce(ue.campo_modulos,array[]::text[])))
    when 'comisiones_rhe' then public.usuario_puede(v_empresa_id, 'cxp', 'crear') or public.usuario_puede(v_empresa_id, 'comisiones', 'crear')
    when 'nomina' then public.usuario_puede(v_empresa_id, 'nomina', 'crear') or v_ver_finanzas
    when 'liquidacion_create' then public.usuario_puede(v_empresa_id, 'liquidaciones_cese', 'crear') or v_ver_finanzas
    when 'liquidation_anular' then public.usuario_puede(v_empresa_id, 'liquidaciones_cese', 'editar') or v_ver_finanzas
    when 'cxp_clasificacion' then public.usuario_puede(v_empresa_id, 'cxp', 'editar')
    when 'cxp_pago' then public.usuario_puede(v_empresa_id, 'cxp', 'editar') or v_ver_finanzas
    else false
  end;
  if not v_permitido then raise exception 'No tienes permiso para operar CxP desde el origen %', v_origen; end if;
  v_alcance := public.usuario_alcance_sociedades(v_empresa_id);

  if v_operacion = 'actualizar' then
    if v_origen = 'cxp_clasificacion' then
      update public.cxp set categoria_er=case when v_payload?'categoria_er' then nullif(btrim(v_payload->>'categoria_er'),'') else categoria_er end,
        centro_costo_id=case when v_payload?'centro_costo_id' then nullif(btrim(v_payload->>'centro_costo_id'),'') else centro_costo_id end,updated_at=now() where id=v_cxp_id;
    elsif v_origen in ('devolucion_proveedor','cxp_pago') then
      update public.cxp set monto_pagado=coalesce(nullif(v_payload->>'monto_pagado','')::numeric,monto_pagado),
        saldo=coalesce(nullif(v_payload->>'saldo','')::numeric,saldo),estado=coalesce(nullif(v_payload->>'estado',''),estado),updated_at=now() where id=v_cxp_id;
    elsif v_origen = 'liquidation_anular' then
      update public.cxp set estado=coalesce(nullif(v_payload->>'estado',''),'anulada'),saldo=coalesce(nullif(v_payload->>'saldo','')::numeric,0),
        motivo_anulacion=nullif(btrim(v_payload->>'motivo_anulacion'),''),anulado_por=nullif(btrim(v_payload->>'anulado_por'),''),
        anulado_en=coalesce(nullif(v_payload->>'anulado_en','')::timestamptz,now()),updated_at=now() where id=v_cxp_id;
    else
      raise exception 'El origen % no admite actualizacion centralizada',v_origen;
    end if;
    select * into v_cxp from public.cxp where id=v_cxp_id;
    return to_jsonb(v_cxp);
  end if;

  v_recepcion_id := nullif(btrim(v_payload->>'recepcion_id'),'');
  if v_origen in ('recepcion_create','recepcion_complete') and v_recepcion_id is not null and exists(select 1 from public.cxp where empresa_id=v_empresa_id and recepcion_id=v_recepcion_id) then
    raise exception 'La recepcion % ya tiene una CxP vinculada',v_recepcion_id;
  end if;

  v_orden_compra_id := nullif(btrim(v_payload->>'orden_compra_id'),'');
  if v_orden_compra_id is not null then
    select oc.total
      into v_total_oc
      from public.ordenes_compra oc
     where oc.id = v_orden_compra_id
       and oc.empresa_id = v_empresa_id
     for share;

    if not found then
      raise exception 'La orden de compra % no existe en el tenant indicado', v_orden_compra_id;
    end if;

    perform pg_advisory_xact_lock(hashtext(v_empresa_id || '|CXP_OC|' || v_orden_compra_id));

    select coalesce(sum(c.monto_total), 0)
      into v_suma_cxp
      from public.cxp c
     where c.empresa_id = v_empresa_id
       and c.orden_compra_id = v_orden_compra_id
       and coalesce(c.estado, '') <> 'anulada';

    v_monto_nuevo := coalesce(nullif(v_payload->>'monto_total','')::numeric, 0);
    v_saldo_facturar := greatest(0, coalesce(v_total_oc, 0) - coalesce(v_suma_cxp, 0));

    if coalesce(v_suma_cxp, 0) + v_monto_nuevo > coalesce(v_total_oc, 0) then
      raise exception 'Esta OC tiene S/ % pendiente de facturar; el monto ingresado de S/ % excede el saldo disponible.',
        to_char(v_saldo_facturar, 'FM999999999990.00'),
        to_char(v_monto_nuevo, 'FM999999999990.00');
    end if;
  end if;

  if v_origen='recepcion_complete' then
    if v_recepcion_id is null then raise exception 'La recepcion es obligatoria para completar la factura'; end if;
    if nullif(btrim(coalesce(v_payload->>'factura_proveedor_numero','')),'') is null then raise exception 'El numero de factura del proveedor es obligatorio para completar la recepcion'; end if;
    update public.recepciones set factura_proveedor_numero=nullif(btrim(v_payload->>'factura_proveedor_numero'),''),factura_proveedor_fecha=nullif(v_payload->>'factura_proveedor_fecha','')::date,
      factura_proveedor_monto=nullif(v_payload->>'factura_proveedor_monto','')::numeric,archivo_factura_url=nullif(btrim(v_payload->>'archivo_factura_url'),'') where id=v_recepcion_id and empresa_id=v_empresa_id;
    if not found then raise exception 'La recepcion % no existe en el tenant indicado',v_recepcion_id; end if;
  end if;
  v_cxp := jsonb_populate_record(null::public.cxp,v_payload);
  v_cxp.id := coalesce(nullif(v_cxp.id,''),'cxp_'||substr(replace(gen_random_uuid()::text,'-',''),1,20));
  v_cxp.empresa_id:=v_empresa_id; v_cxp.creado_por:=auth.uid()::text; v_cxp.created_at:=coalesce(v_cxp.created_at,now()); v_cxp.updated_at:=coalesce(v_cxp.updated_at,now());
  v_cxp.monto_pagado:=coalesce(v_cxp.monto_pagado,0); v_cxp.saldo:=coalesce(v_cxp.saldo,coalesce(v_cxp.monto_total,0)-v_cxp.monto_pagado); v_cxp.moneda:=coalesce(v_cxp.moneda,'PEN');
  v_cxp.estado:=coalesce(v_cxp.estado,'por_pagar'); v_cxp.origen:=coalesce(v_cxp.origen,'manual'); v_cxp.tipo_comprobante:=coalesce(v_cxp.tipo_comprobante,'Factura'); v_cxp.no_devengar_er:=coalesce(v_cxp.no_devengar_er,false);
  if v_cxp.sociedad_id is not null and v_alcance is not null and not(v_cxp.sociedad_id=any(v_alcance)) then raise exception 'La sociedad de la CxP esta fuera del alcance del usuario'; end if;
  insert into public.cxp values(v_cxp.*);
  return to_jsonb(v_cxp);
end;
$$;

revoke execute on function public.generar_cxp_centralizado(jsonb,text,text) from public,anon;
grant execute on function public.generar_cxp_centralizado(jsonb,text,text) to authenticated;
