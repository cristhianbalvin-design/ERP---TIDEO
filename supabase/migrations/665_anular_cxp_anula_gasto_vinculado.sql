-- Al anular una CxP cuyo gasto se creó junto con ella (wizard Nuevo Egreso,
-- carga masiva o RHE externo), el gasto vinculado también se anula para que
-- salga del Estado de Resultados. Otros orígenes conservan el comportamiento
-- anterior (solo se desvincula el gasto).
do $$
begin
  if (select md5(pg_get_functiondef(p.oid)) from pg_proc p where p.proname = 'anular_cxp_finanzas') <> 'ff78b52223db888bee89bc15da669b06' then
    raise exception 'anular_cxp_finanzas cambió respecto de la versión revisada; abortando';
  end if;
end $$;

CREATE OR REPLACE FUNCTION public.anular_cxp_finanzas(p_cxp_id text, p_motivo text, p_usuario_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    if lower(coalesce(v_cxp.origen, '')) in ('gasto', 'carga_masiva', 'rhe_externo') then
      -- El gasto se creó junto con esta CxP: al anularla, el gasto deja de existir
      -- y sale del Estado de Resultados.
      update public.compras_gastos
      set cxp_id = null,
          estado_pago = 'pendiente',
          estado = 'anulado'
      where id = v_cxp.gasto_id
        and empresa_id = v_cxp.empresa_id
        and coalesce(estado_pago, 'pendiente') <> 'pagado';

      update public.compras_gastos
      set cxp_id = null,
          estado_pago = 'pendiente'
      where cxp_id = v_cxp.id
        and id <> v_cxp.gasto_id
        and coalesce(estado_pago, 'pendiente') <> 'pagado';
    else
      update public.compras_gastos
      set cxp_id = null,
          estado_pago = 'pendiente'
      where (id = v_cxp.gasto_id or cxp_id = v_cxp.id)
        and coalesce(estado_pago, 'pendiente') <> 'pagado';
    end if;
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
$function$;

do $$
declare v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.proname = 'anular_cxp_finanzas';
  if position('estado = ''anulado''' in v_def) = 0
     or position('''carga_masiva''' in v_def) = 0
     or position('SECURITY DEFINER' in v_def) = 0
     or position('usuario_puede(v_cxp.empresa_id, ''cxp'', ''anular'')' in v_def) = 0 then
    raise exception 'anular_cxp_finanzas no quedó con la corrección o perdió validaciones';
  end if;
end $$;
