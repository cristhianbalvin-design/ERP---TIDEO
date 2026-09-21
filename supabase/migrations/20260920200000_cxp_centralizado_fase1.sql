-- CxP centralizada: infraestructura y permisos para las fases iniciales.
-- No cierra cxp_insert/cxp_update; ese cierre queda bloqueado hasta Fase 6.

alter table public.cxp
  add column if not exists creado_por text;

create index if not exists idx_cxp_creado_por
  on public.cxp(creado_por)
  where creado_por is not null;

-- El catalogo no tiene una columna puede_eliminar; el permiso operativo
-- equivalente para usuario_puede es la capacidad de anular del modulo.
create or replace function public.usuario_puede(target_empresa_id text, target_pantalla text, target_accion text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.usuario_es_superadmin_plataforma()
  or exists (
    select 1
    from public.usuarios_empresas ue
    join public.roles r on r.id = ue.rol_id
    where ue.user_id = auth.uid()
      and ue.empresa_id = target_empresa_id
      and ue.estado = 'activo'
      and r.es_admin_empresa = true
  )
  or exists (
    select 1
    from public.usuarios_empresas ue
    join public.permisos_roles pr on pr.rol_id = ue.rol_id
    where ue.user_id = auth.uid()
      and ue.empresa_id = target_empresa_id
      and ue.estado = 'activo'
      and pr.pantalla = target_pantalla
      and (
        case target_accion
          when 'ver' then pr.puede_ver
          when 'crear' then pr.puede_crear
          when 'editar' then pr.puede_editar
          when 'anular' then pr.puede_anular
          when 'eliminar' then pr.puede_anular
          when 'aprobar' then pr.puede_aprobar
          when 'exportar' then pr.puede_exportar
          when 'ver_costos' then pr.puede_ver_costos
          when 'ver_finanzas' then pr.puede_ver_finanzas
          else false
        end
      )
  );
$$;

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
  v_permitido boolean := false;
  v_ver_finanzas boolean := false;
  v_alcance uuid[];
  v_cxp public.cxp%rowtype;
begin
  if v_origen is null then
    raise exception 'El origen CxP es obligatorio';
  end if;
  if v_operacion not in ('crear', 'actualizar') then
    raise exception 'Operacion CxP no soportada: %', v_operacion;
  end if;

  if v_operacion = 'actualizar' then
    v_cxp_id := nullif(btrim(v_payload ->> 'id'), '');
    if v_cxp_id is null then
      raise exception 'El id de CxP es obligatorio para actualizar';
    end if;
    select * into v_cxp
    from public.cxp
    where id = v_cxp_id
    for update;
    if not found then
      raise exception 'La CxP % no existe', v_cxp_id;
    end if;
    v_empresa_id := v_cxp.empresa_id;
  else
    v_empresa_id := nullif(btrim(v_payload ->> 'empresa_id'), '');
    if v_empresa_id is null then
      raise exception 'empresa_id es obligatorio para crear CxP';
    end if;
  end if;

  if not public.usuario_tiene_empresa(v_empresa_id) then
    raise exception 'No tienes acceso al tenant indicado';
  end if;

  -- ver_finanzas es la capacidad transversal que ya usa el frontend.
  v_ver_finanzas := public.usuario_es_admin_empresa(v_empresa_id)
    or exists (
      select 1
      from public.usuarios_empresas ue
      join public.permisos_roles pr on pr.rol_id = ue.rol_id
      where ue.user_id = auth.uid()
        and ue.empresa_id = v_empresa_id
        and ue.estado = 'activo'
        and pr.puede_ver_finanzas = true
    );

  v_permitido := case v_origen
    when 'recepcion_create' then public.usuario_puede(v_empresa_id, 'recepciones', 'crear')
    when 'recepcion_complete' then public.usuario_puede(v_empresa_id, 'recepciones', 'editar')
    when 'cxp_manual' then public.usuario_puede(v_empresa_id, 'cxp', 'crear')
    when 'nuevo_egreso' then public.usuario_puede(v_empresa_id, 'cxp', 'crear')
    when 'nc_devolucion' then
      public.usuario_puede(v_empresa_id, 'cxp', 'crear')
      or public.usuario_puede(v_empresa_id, 'facturacion', 'crear')
      or public.usuario_puede(v_empresa_id, 'facturacion', 'editar')
    when 'devolucion_proveedor' then public.usuario_puede(v_empresa_id, 'recepciones', 'crear')
    when 'compras_gastos' then public.usuario_puede(v_empresa_id, 'compras_gastos', 'crear')
    when 'gasto_movil' then
      public.usuario_es_superadmin_plataforma()
      or exists (
        select 1
        from public.usuarios_empresas ue
        where ue.user_id = auth.uid()
          and ue.empresa_id = v_empresa_id
          and ue.estado = 'activo'
          and 'compras' = any(coalesce(ue.campo_modulos, array[]::text[]))
      )
    when 'comisiones_rhe' then
      public.usuario_puede(v_empresa_id, 'cxp', 'crear')
      or public.usuario_puede(v_empresa_id, 'comisiones', 'crear')
    when 'nomina' then
      public.usuario_puede(v_empresa_id, 'nomina', 'crear') or v_ver_finanzas
    when 'liquidacion_create' then
      public.usuario_puede(v_empresa_id, 'liquidaciones_cese', 'crear') or v_ver_finanzas
    when 'liquidacion_anular' then
      public.usuario_puede(v_empresa_id, 'liquidaciones_cese', 'editar') or v_ver_finanzas
    when 'cxp_clasificacion' then public.usuario_puede(v_empresa_id, 'cxp', 'editar')
    else false
  end;

  if not v_permitido then
    raise exception 'No tienes permiso para operar CxP desde el origen %', v_origen;
  end if;

  v_alcance := public.usuario_alcance_sociedades(v_empresa_id);

  if v_operacion = 'actualizar' then
    if v_origen = 'cxp_clasificacion' then
      update public.cxp
      set categoria_er = case when v_payload ? 'categoria_er' then nullif(btrim(v_payload ->> 'categoria_er'), '') else categoria_er end,
          centro_costo_id = case when v_payload ? 'centro_costo_id' then nullif(btrim(v_payload ->> 'centro_costo_id'), '') else centro_costo_id end,
          updated_at = now()
      where id = v_cxp_id;
    elsif v_origen = 'devolucion_proveedor' then
      update public.cxp
      set monto_pagado = coalesce(nullif(v_payload ->> 'monto_pagado', '')::numeric, monto_pagado),
          saldo = coalesce(nullif(v_payload ->> 'saldo', '')::numeric, saldo),
          estado = coalesce(nullif(v_payload ->> 'estado', ''), estado),
          updated_at = now()
      where id = v_cxp_id;
    else
      raise exception 'El origen % no admite actualizacion centralizada', v_origen;
    end if;

    select * into v_cxp from public.cxp where id = v_cxp_id;
    return to_jsonb(v_cxp);
  end if;

  v_cxp := jsonb_populate_record(null::public.cxp, v_payload);
  v_cxp.id := coalesce(nullif(v_cxp.id, ''), 'cxp_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 20));
  v_cxp.empresa_id := v_empresa_id;
  v_cxp.creado_por := auth.uid()::text;
  v_cxp.created_at := coalesce(v_cxp.created_at, now());
  v_cxp.updated_at := coalesce(v_cxp.updated_at, now());
  v_cxp.monto_pagado := coalesce(v_cxp.monto_pagado, 0);
  v_cxp.saldo := coalesce(v_cxp.saldo, coalesce(v_cxp.monto_total, 0) - v_cxp.monto_pagado);
  v_cxp.moneda := coalesce(v_cxp.moneda, 'PEN');
  v_cxp.estado := coalesce(v_cxp.estado, 'por_pagar');
  v_cxp.origen := coalesce(v_cxp.origen, 'manual');
  v_cxp.tipo_comprobante := coalesce(v_cxp.tipo_comprobante, 'Factura');
  v_cxp.no_devengar_er := coalesce(v_cxp.no_devengar_er, false);

  if v_cxp.sociedad_id is not null
     and v_alcance is not null
     and not (v_cxp.sociedad_id = any(v_alcance)) then
    raise exception 'La sociedad de la CxP esta fuera del alcance del usuario';
  end if;

  insert into public.cxp values (v_cxp.*);
  return to_jsonb(v_cxp);
end;
$$;

revoke execute on function public.generar_cxp_centralizado(jsonb, text, text) from public, anon;
grant execute on function public.generar_cxp_centralizado(jsonb, text, text) to authenticated;

-- La ruta de Nuevo Egreso pagado conserva su transaccion atomica, pero la CxP
-- ahora pasa por el mismo autorizador centralizado.
create or replace function public.registrar_gasto_pagado_auto(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gasto_id text := coalesce(p_payload->>'gasto_id', p_payload #>> '{cxp,gasto_id}', p_payload #>> '{movimiento,gasto_id}');
  v_gasto public.compras_gastos%rowtype;
  v_existing public.cxp%rowtype;
  v_cxp public.cxp%rowtype;
  v_pago public.cxp_pagos%rowtype;
  v_mov public.movimientos_tesoreria%rowtype;
  v_cxp_json jsonb;
begin
  if v_gasto_id is null then raise exception 'gasto_id requerido'; end if;
  select * into v_gasto from public.compras_gastos where id = v_gasto_id for update;
  if not found then raise exception 'compras_gastos % no existe', v_gasto_id; end if;
  if not public.usuario_tiene_empresa(v_gasto.empresa_id) then raise exception 'El gasto no pertenece al tenant activo'; end if;
  if not public.usuario_puede(v_gasto.empresa_id, 'cxp', 'crear') then raise exception 'No tienes permiso para crear CxP desde Nuevo Egreso'; end if;

  if v_gasto.cxp_id is not null then
    select * into v_existing from public.cxp where id = v_gasto.cxp_id;
    return jsonb_build_object('created', false, 'cxp', to_jsonb(v_existing), 'pago', null, 'movimiento', null);
  end if;

  select * into v_existing from public.cxp where gasto_id = v_gasto_id and origen = 'auto_gasto' limit 1;
  if found then
    update public.compras_gastos set cxp_id = v_existing.id, estado_pago = 'pagado' where id = v_gasto_id;
    return jsonb_build_object('created', false, 'cxp', to_jsonb(v_existing), 'pago', null, 'movimiento', null);
  end if;

  v_cxp_json := public.generar_cxp_centralizado(p_payload->'cxp', 'nuevo_egreso', 'crear');
  v_cxp := jsonb_populate_record(null::public.cxp, v_cxp_json);
  insert into public.cxp_pagos
  select * from jsonb_populate_record(null::public.cxp_pagos, p_payload->'pago')
  returning * into v_pago;
  insert into public.movimientos_tesoreria
  select * from jsonb_populate_record(null::public.movimientos_tesoreria, p_payload->'movimiento')
  returning * into v_mov;
  update public.compras_gastos set cxp_id = v_cxp.id, estado_pago = 'pagado' where id = v_gasto_id;

  return jsonb_build_object('created', true, 'cxp', to_jsonb(v_cxp), 'pago', to_jsonb(v_pago), 'movimiento', to_jsonb(v_mov));
end;
$$;

create or replace function public.revertir_gasto_pagado_auto(p_gasto_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gasto public.compras_gastos%rowtype;
  v_cxp public.cxp%rowtype;
  v_cxp_id text;
  v_auto boolean := false;
begin
  select * into v_gasto from public.compras_gastos where id = p_gasto_id for update;
  if not found then raise exception 'El gasto no existe'; end if;
  if not public.usuario_tiene_empresa(v_gasto.empresa_id) then raise exception 'El gasto no pertenece al tenant activo'; end if;
  if not public.usuario_puede(v_gasto.empresa_id, 'cxp', 'editar') then raise exception 'No tienes permiso para revertir el gasto pagado'; end if;

  select * into v_cxp
  from public.cxp
  where gasto_id = p_gasto_id
  order by case when origen = 'auto_gasto' then 0 else 1 end, created_at desc
  limit 1 for update;
  v_cxp_id := v_cxp.id;
  v_auto := v_cxp_id is not null and v_cxp.origen = 'auto_gasto';

  delete from public.movimientos_tesoreria
  where gasto_id = p_gasto_id
     or (v_cxp_id is not null and vinculo_tipo = 'cxp' and vinculo_id = v_cxp_id);

  if v_auto then
    delete from public.cxp_pagos where cxp_id = v_cxp_id;
    update public.cxp
    set estado = 'por_pagar', monto_pagado = 0, saldo = coalesce(monto_total, 0), updated_at = now()
    where id = v_cxp_id returning * into v_cxp;
    update public.compras_gastos set estado_pago = 'pendiente', cxp_id = v_cxp_id where id = p_gasto_id;
  else
    update public.compras_gastos set estado_pago = 'pendiente' where id = p_gasto_id;
  end if;

  return jsonb_build_object('ok', true, 'auto_gasto', v_auto, 'cxp', to_jsonb(v_cxp));
end;
$$;

grant execute on function public.registrar_gasto_pagado_auto(jsonb) to authenticated;
grant execute on function public.revertir_gasto_pagado_auto(text) to authenticated;

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
  select * into v_cxp from public.cxp where id = p_cxp_id and public.usuario_tiene_empresa(empresa_id) for update;
  if not found then raise exception 'La CxP no existe o no pertenece al tenant activo'; end if;
  if not public.usuario_es_admin_empresa(v_cxp.empresa_id) then raise exception 'Solo un administrador de empresa puede eliminar CxP preliminares'; end if;
  if not public.usuario_puede(v_cxp.empresa_id, 'cxp', 'eliminar') then raise exception 'No tienes permiso para eliminar CxP preliminares'; end if;
  v_alcance := public.usuario_alcance_sociedades(v_cxp.empresa_id);
  if v_cxp.sociedad_id is not null and v_alcance is not null and not (v_cxp.sociedad_id = any(v_alcance)) then raise exception 'La CxP esta fuera del alcance societario del usuario'; end if;
  if v_motivo is null then raise exception 'El motivo de eliminacion es obligatorio'; end if;
  if lower(coalesce(v_cxp.estado, '')) = 'anulada' then raise exception 'Una CxP anulada debe conservarse como historial'; end if;
  if coalesce(v_cxp.monto_pagado, 0) > 0 or exists (select 1 from public.cxp_pagos p where p.cxp_id = v_cxp.id) then raise exception 'La CxP tiene pagos registrados'; end if;
  if v_cxp.gasto_id is not null or v_cxp.recibo_honorarios_id is not null or v_cxp.recepcion_id is not null then raise exception 'La CxP tiene un origen o documento vinculado'; end if;
  if to_regclass('public.estado_resultados_detalle') is not null then
    execute 'select exists (select 1 from public.estado_resultados_detalle where cxp_id = $1)' into v_tiene_detalle using v_cxp.id;
  end if;
  if exists (select 1 from public.compras_gastos g where g.cxp_id = v_cxp.id)
     or exists (select 1 from public.movimientos_tesoreria m where m.empresa_id = v_cxp.empresa_id and m.vinculo_id = v_cxp.id)
     or exists (select 1 from public.devoluciones_proveedor d where d.cxp_ajuste_id = v_cxp.id)
     or v_tiene_detalle
     or exists (select 1 from public.operaciones_intercompania i where i.cxp_id = v_cxp.id) then
    raise exception 'La CxP tiene registros financieros vinculados';
  end if;
  insert into public.auditoria (empresa_id,user_id,modulo,entidad,entidad_id,accion,valor_anterior,valor_nuevo)
  values (v_cxp.empresa_id,auth.uid(),'finanzas','cxp',v_cxp.id,'eliminar_preliminar',to_jsonb(v_cxp),jsonb_build_object('motivo',v_motivo));
  delete from public.cxp where id = v_cxp.id;
  return jsonb_build_object('ok', true, 'cxp_id', v_cxp.id, 'eliminada', true);
end;
$$;

grant execute on function public.eliminar_cxp_preliminar(text, text, text) to authenticated;
