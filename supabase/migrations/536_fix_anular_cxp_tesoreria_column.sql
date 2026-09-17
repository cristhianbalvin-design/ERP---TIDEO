-- 536: Corregir la RPC de anulacion de CxP.
-- movimientos_tesoreria usa vinculo_id; vinculado_id pertenece a movimientos_banco.

create or replace function public.anular_cxp_finanzas(
  p_cxp_id text,
  p_motivo text,
  p_usuario_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cxp public.cxp%rowtype;
  v_alcance uuid[];
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
  v_usuario text := coalesce(p_usuario_id, auth.uid()::text);
  v_now timestamptz := now();
begin
  select * into v_cxp
  from public.cxp
  where id = p_cxp_id
    and public.usuario_tiene_empresa(empresa_id)
  for update;

  if not found then
    raise exception 'La CxP no existe o no pertenece al tenant activo';
  end if;
  if not public.usuario_puede(v_cxp.empresa_id, 'cxp', 'anular') then
    raise exception 'No tienes permiso para anular CxP';
  end if;
  v_alcance := public.usuario_alcance_sociedades(v_cxp.empresa_id);
  if v_cxp.sociedad_id is not null
     and v_alcance is not null
     and not (v_cxp.sociedad_id = any(v_alcance)) then
    raise exception 'La CxP esta fuera del alcance societario del usuario';
  end if;
  if v_motivo is null then
    raise exception 'El motivo de anulacion es obligatorio';
  end if;
  if lower(coalesce(v_cxp.estado, '')) = 'anulada' then
    raise exception 'La CxP ya esta anulada';
  end if;
  if coalesce(v_cxp.monto_pagado, 0) > 0
     or lower(coalesce(v_cxp.estado, '')) in ('pagada', 'pago_parcial')
     or exists (select 1 from public.cxp_pagos p where p.cxp_id = v_cxp.id)
     or exists (
       select 1 from public.movimientos_tesoreria m
       where m.empresa_id = v_cxp.empresa_id
         and m.vinculo_id = v_cxp.id
     ) then
    raise exception 'No se puede anular una CxP con pagos o movimientos registrados';
  end if;

  if v_cxp.gasto_id is not null then
    update public.compras_gastos
    set cxp_id = null,
        estado_pago = 'pendiente'
    where (id = v_cxp.gasto_id or cxp_id = v_cxp.id)
      and coalesce(estado_pago, 'pendiente') <> 'pagado';
  end if;

  update public.cxp
  set estado = 'anulada',
      saldo = 0,
      motivo_anulacion = v_motivo,
      anulado_por = v_usuario,
      anulado_en = v_now,
      updated_at = v_now
  where id = v_cxp.id;

  insert into public.auditoria (
    empresa_id, user_id, modulo, entidad, entidad_id, accion,
    valor_anterior, valor_nuevo
  ) values (
    v_cxp.empresa_id, auth.uid(), 'finanzas', 'cxp', v_cxp.id, 'anular',
    to_jsonb(v_cxp),
    jsonb_build_object('estado', 'anulada', 'motivo', v_motivo)
  );

  return jsonb_build_object('ok', true, 'cxp_id', v_cxp.id, 'estado', 'anulada');
end;
$$;

create or replace function public.eliminar_cxp_preliminar(
  p_cxp_id text,
  p_motivo text,
  p_usuario_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cxp public.cxp%rowtype;
  v_alcance uuid[];
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
  v_tiene_detalle boolean := false;
begin
  select * into v_cxp
  from public.cxp
  where id = p_cxp_id
    and public.usuario_tiene_empresa(empresa_id)
  for update;

  if not found then
    raise exception 'La CxP no existe o no pertenece al tenant activo';
  end if;
  if not public.usuario_es_admin_empresa(v_cxp.empresa_id) then
    raise exception 'Solo un administrador de empresa puede eliminar CxP preliminares';
  end if;
  v_alcance := public.usuario_alcance_sociedades(v_cxp.empresa_id);
  if v_cxp.sociedad_id is not null
     and v_alcance is not null
     and not (v_cxp.sociedad_id = any(v_alcance)) then
    raise exception 'La CxP esta fuera del alcance societario del usuario';
  end if;
  if v_motivo is null then
    raise exception 'El motivo de eliminacion es obligatorio';
  end if;
  if lower(coalesce(v_cxp.estado, '')) = 'anulada' then
    raise exception 'Una CxP anulada debe conservarse como historial';
  end if;
  if coalesce(v_cxp.monto_pagado, 0) > 0
     or exists (select 1 from public.cxp_pagos p where p.cxp_id = v_cxp.id) then
    raise exception 'La CxP tiene pagos registrados';
  end if;
  if v_cxp.gasto_id is not null
     or v_cxp.recibo_honorarios_id is not null
     or v_cxp.recepcion_id is not null then
    raise exception 'La CxP tiene un origen o documento vinculado';
  end if;
  if to_regclass('public.estado_resultados_detalle') is not null then
    execute 'select exists (select 1 from public.estado_resultados_detalle where cxp_id = $1)'
      into v_tiene_detalle
      using v_cxp.id;
  end if;
  if exists (select 1 from public.compras_gastos g where g.cxp_id = v_cxp.id)
     or exists (
       select 1 from public.movimientos_tesoreria m
       where m.empresa_id = v_cxp.empresa_id
         and m.vinculo_id = v_cxp.id
     )
     or exists (select 1 from public.devoluciones_proveedor d where d.cxp_ajuste_id = v_cxp.id)
     or v_tiene_detalle
     or exists (select 1 from public.operaciones_intercompania i where i.cxp_id = v_cxp.id) then
    raise exception 'La CxP tiene registros financieros vinculados';
  end if;

  insert into public.auditoria (
    empresa_id, user_id, modulo, entidad, entidad_id, accion,
    valor_anterior, valor_nuevo
  ) values (
    v_cxp.empresa_id, auth.uid(), 'finanzas', 'cxp', v_cxp.id, 'eliminar_preliminar',
    to_jsonb(v_cxp),
    jsonb_build_object('motivo', v_motivo)
  );

  delete from public.cxp where id = v_cxp.id;
  return jsonb_build_object('ok', true, 'cxp_id', v_cxp.id, 'eliminada', true);
end;
$$;

grant execute on function public.anular_cxp_finanzas(text, text, text) to authenticated;
grant execute on function public.eliminar_cxp_preliminar(text, text, text) to authenticated;
