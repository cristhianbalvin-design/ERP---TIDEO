-- Fase 1b-2: consulta aislada de las compras de campo del usuario actual.
-- No modifica datos ni sustituye registrar_compra_campo.
create or replace function public.obtener_mis_compras_campo(p_empresa_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Debes iniciar sesión para consultar tus compras de campo.' using errcode = '42501';
  end if;

  if nullif(btrim(coalesce(p_empresa_id, '')), '') is null then
    raise exception 'La empresa es obligatoria.' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.usuarios_empresas ue
    where ue.user_id = v_user_id
      and ue.empresa_id = p_empresa_id
      and ue.estado = 'activo'
      and ue.acceso_campo = true
      and 'compras' = any(coalesce(ue.campo_modulos, array[]::text[]))
  ) and not public.usuario_es_superadmin_plataforma() then
    raise exception 'No tienes acceso de campo al módulo Compras.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(q.row_data order by q.fecha desc nulls last, q.created_at desc nulls last), '[]'::jsonb)
    into v_result
  from (
    select
      g.fecha,
      g.created_at,
      jsonb_build_object(
        'gasto', jsonb_build_object(
          'id', g.id,
          'empresa_id', g.empresa_id,
          'descripcion', g.descripcion,
          'monto', g.monto,
          'moneda', g.moneda,
          'fecha', g.fecha,
          'proveedor_referencia', g.proveedor_referencia,
          'ruc_proveedor', g.ruc_proveedor,
          'num_comprobante', g.num_comprobante,
          'metodo_pago', g.metodo_pago,
          'origen_registro', g.origen_registro,
          'estado', g.estado,
          'estado_pago', g.estado_pago,
          'archivo_url', g.archivo_url,
          'cxp_id', g.cxp_id,
          'orden_compra_id', g.orden_compra_id,
          'excluir_de_er', g.excluir_de_er,
          'creado_por', g.creado_por
        ),
        'cxp', case when c.id is null then null else jsonb_build_object(
          'id', c.id,
          'estado', c.estado,
          'origen', c.origen,
          'concepto', c.concepto,
          'monto_total', c.monto_total,
          'monto_pagado', c.monto_pagado,
          'saldo', c.saldo,
          'factura_numero', c.factura_numero,
          'ruc_emisor', c.ruc_emisor,
          'nombre_emisor', c.nombre_emisor,
          'archivo_factura_url', c.archivo_factura_url,
          'orden_compra_id', c.orden_compra_id,
          'gasto_id', c.gasto_id
        ) end,
        'orden_compra', case when oc.id is null then null else jsonb_build_object(
          'id', oc.id,
          'codigo', oc.codigo,
          'estado', oc.estado,
          'origen_tipo', oc.origen_tipo,
          'fecha_emision', oc.fecha_emision,
          'total', oc.total,
          'moneda', oc.moneda,
          'items', oc.items,
          'porcentaje_recibido', coalesce(oc.porcentaje_recibido, 0)
        ) end,
        'recepciones', coalesce(r.recepciones, '[]'::jsonb)
      ) as row_data
    from public.compras_gastos g
    left join lateral (
      select c1.*
      from public.cxp c1
      where c1.empresa_id = p_empresa_id
        and (c1.gasto_id = g.id or c1.id = g.cxp_id)
      order by c1.created_at desc nulls last, c1.id
      limit 1
    ) c on true
    left join lateral (
      select oc1.*
      from public.ordenes_compra oc1
      where oc1.empresa_id = p_empresa_id
        and oc1.id = g.orden_compra_id
      limit 1
    ) oc on true
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'id', rec.id,
          'fecha', rec.fecha,
          'estado', rec.estado,
          'items_recibidos', rec.items_recibidos,
          'created_at', rec.created_at
        ) order by rec.fecha desc nulls last, rec.created_at desc nulls last
      ) as recepciones
      from public.recepciones rec
      where rec.empresa_id = p_empresa_id
        and rec.orden_compra_id = g.orden_compra_id
    ) r on true
    where g.empresa_id = p_empresa_id
      and g.creado_por = v_user_id
      and lower(coalesce(g.origen_registro, '')) = 'campo'
  ) q;

  return v_result;
end;
$$;

revoke all on function public.obtener_mis_compras_campo(text) from public, anon;
grant execute on function public.obtener_mis_compras_campo(text) to authenticated;
