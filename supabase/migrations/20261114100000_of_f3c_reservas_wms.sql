-- F3c · Reservas WMS de la OF: al aprobar la OF (y al agregar un material no planificado de stock)
-- se crea o completa un pedido del canal «produccion» en wms_demandas, se reserva el stock y lo que
-- falta va a Compras como SOLPE (origen OF). El almacén lo entrega desde la Cola de despachos: el
-- despacho registra el consumo en el kárdex, la cantidad real del material en la OF y su costo real.
-- Cambios:
--   * wms_demandas_canal_check admite 'produccion' (se reemplaza el CHECK: amplía, no restringe).
--   * of_materiales.costo_despachado: costo del material despachado en la moneda de la OF.
--   * of_reservar (interna), of_reservas (lectura para la ficha).
--   * of_aprobar, of_guardar_material y wms_despachar_demanda: parten de pg_get_functiondef de la
--     versión vigente y se cambian solo los fragmentos indicados (cada reemplazo debe coincidir 1 vez).
--   * of_recalcular_avance: los materiales del costo real salen de costo_despachado (kárdex).

alter table public.wms_demandas drop constraint wms_demandas_canal_check;
alter table public.wms_demandas add constraint wms_demandas_canal_check
  check (canal = any (array['venta'::text, 'custodia'::text, 'produccion'::text]));
alter table public.of_materiales add column if not exists costo_despachado numeric(14,2) not null default 0;

create or replace function public.of_reservar(p_of_id uuid)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v      public.ordenes_fabricacion%rowtype;
  v_dem  public.wms_demandas%rowtype;
  v_alm  text;
  m      record;
  v_n    int := 0;
  v_pend numeric;
  v_solpe text;
  v_falt jsonb := '[]'::jsonb;
begin
  select * into v from public.ordenes_fabricacion where id = p_of_id;
  if not found then raise exception 'La OF no existe.'; end if;
  if not exists (select 1 from public.of_materiales
                  where of_id = v.id and origen = 'stock' and material_id is not null and cantidad_plan > 0) then
    return jsonb_build_object('lineas', 0, 'faltantes', '[]'::jsonb);
  end if;

  select * into v_dem from public.wms_demandas
   where empresa_id = v.empresa_id and canal = 'produccion' and origen_tipo = 'orden_fabricacion'
     and origen_id = v.id::text and estado <> 'anulada'
   order by created_at limit 1 for update;
  if not found then
    -- Almacén central de consumo interno (o mixto) con más stock de los materiales de la OF.
    select a.id into v_alm from public.almacenes a
     where a.empresa_id = v.empresa_id and a.clase = 'central'
       and coalesce(a.proposito, 'consumo_interno') in ('consumo_interno', 'mixto')
       and lower(coalesce(a.estado, 'activo')) = 'activo'
     order by (select coalesce(sum(s.disponible), 0) from public.stock s
                 join public.of_materiales om on om.material_id = s.material_id and om.of_id = v.id and om.origen = 'stock'
                where s.almacen_id = a.id and s.sociedad_id is not distinct from v.sociedad_id) desc, a.codigo, a.id
     limit 1;
    if v_alm is null then
      return jsonb_build_object('lineas', 0, 'sin_almacen', true, 'faltantes', '[]'::jsonb);
    end if;
    insert into public.wms_demandas (empresa_id, sociedad_id, almacen_id, canal, numero, origen_tipo, origen_id, destino, fecha_requerida, created_by)
    values (v.empresa_id, v.sociedad_id, v_alm, 'produccion', v.numero, 'orden_fabricacion', v.id::text,
            'Taller · ' || v.numero, coalesce(v.fecha_compromiso, current_date), auth.uid())
    returning * into v_dem;
  end if;

  insert into public.wms_demanda_lineas (demanda_id, empresa_id, material_id, origen_linea_id, descripcion, precio_unitario, cantidad, orden)
  select v_dem.id, v.empresa_id, om.material_id, om.id::text, om.descripcion, 0, om.cantidad_plan,
         (select coalesce(max(x.orden), 0) from public.wms_demanda_lineas x where x.demanda_id = v_dem.id)
           + row_number() over (order by om.created_at, om.id)
    from public.of_materiales om
   where om.of_id = v.id and om.origen = 'stock' and om.material_id is not null and om.cantidad_plan > 0
     and not exists (select 1 from public.wms_demanda_lineas x where x.demanda_id = v_dem.id and x.origen_linea_id = om.id::text);
  if v_dem.estado = 'despachada' then
    update public.wms_demandas set estado = 'parcial', updated_at = now() where id = v_dem.id;
  end if;

  perform public.wms_reservar_demanda(v_dem.id);

  for m in select l.*, om.id as om_id from public.wms_demanda_lineas l
             join public.of_materiales om on om.id::text = l.origen_linea_id
            where l.demanda_id = v_dem.id order by l.orden, l.id loop
    v_n := v_n + 1;
    v_pend := m.cantidad - m.cantidad_reservada - m.cantidad_despachada;
    if v_pend > 0 then
      v_solpe := null;
      select si.codigo into v_solpe from public.solpe_interna si
       where si.empresa_id = v.empresa_id and si.origen_tipo = 'orden_fabricacion' and si.origen_id = m.om_id::text
         and coalesce(si.estado, '') not in ('anulada', 'rechazada')
       order by si.created_at limit 1;
      if v_solpe is null then
        v_solpe := 'SLP-OF-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
        insert into public.solpe_interna (id, empresa_id, codigo, descripcion, tipo, prioridad, urgencia, estado, origen, origen_tipo,
                                          origen_id, material_id, cantidad_solicitada, disponible_actual, fecha, fecha_requerida, items, creado_por)
        values ('slp_of_' || replace(gen_random_uuid()::text, '-', ''), v.empresa_id, v_solpe,
                'Faltante de material para OF ' || v.numero, 'bien', 'alta', 'alta', 'solicitada', 'of', 'orden_fabricacion',
                m.om_id::text, m.material_id, v_pend, m.cantidad_reservada, current_date, v.fecha_compromiso,
                jsonb_build_array(jsonb_build_object('material_id', m.material_id, 'cantidad', v_pend, 'of_id', v.id,
                  'of_material_id', m.om_id, 'cantidad_plan', m.cantidad, 'cantidad_reservada', m.cantidad_reservada)),
                auth.uid());
      end if;
      v_falt := v_falt || jsonb_build_object('of_material_id', m.om_id, 'descripcion', m.descripcion, 'faltante', v_pend, 'solpe', v_solpe);
    end if;
  end loop;
  return jsonb_build_object('demanda_id', v_dem.id, 'lineas', v_n, 'faltantes', v_falt);
end;
$$;

-- Reserva, despacho y SOLPE por material de la OF (franja de reservas de la ficha).
create or replace function public.of_reservas(p_of_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v public.ordenes_fabricacion%rowtype;
  v_alc uuid[];
  v_dem public.wms_demandas%rowtype;
begin
  select * into v from public.ordenes_fabricacion where id = p_of_id;
  if not found then raise exception 'La OF no existe.'; end if;
  if not public.usuario_tiene_empresa(v.empresa_id) or not public.usuario_puede(v.empresa_id, 'of', 'ver') then
    raise exception 'No tienes permiso para ver esta OF.' using errcode = '42501';
  end if;
  v_alc := public.usuario_alcance_sociedades(v.empresa_id);
  if v_alc is not null and v.sociedad_id is not null and not (v.sociedad_id = any (v_alc)) then
    raise exception 'La sociedad de la OF está fuera de tu alcance.' using errcode = '42501';
  end if;
  select * into v_dem from public.wms_demandas
   where empresa_id = v.empresa_id and canal = 'produccion' and origen_tipo = 'orden_fabricacion'
     and origen_id = v.id::text and estado <> 'anulada'
   order by created_at limit 1;
  return jsonb_build_object(
    'demanda_id', v_dem.id,
    'estado', v_dem.estado,
    'almacen', (select a.nombre from public.almacenes a where a.id = v_dem.almacen_id),
    'lineas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'of_material_id', om.id,
               'cantidad', coalesce(l.cantidad, om.cantidad_plan),
               'reservada', coalesce(l.cantidad_reservada, 0),
               'despachada', coalesce(l.cantidad_despachada, 0),
               'faltante', greatest(coalesce(l.cantidad - l.cantidad_reservada - l.cantidad_despachada, 0), 0),
               'en_pedido', l.id is not null,
               'solpe', si.codigo, 'solpe_estado', si.estado))
        from public.of_materiales om
        left join public.wms_demanda_lineas l on l.demanda_id = v_dem.id and l.origen_linea_id = om.id::text
        left join lateral (select s.codigo, s.estado from public.solpe_interna s
                            where s.empresa_id = v.empresa_id and s.origen_tipo = 'orden_fabricacion' and s.origen_id = om.id::text
                              and coalesce(s.estado, '') not in ('anulada', 'rechazada')
                            order by s.created_at limit 1) si on true
       where om.of_id = v.id and om.origen = 'stock'), '[]'::jsonb));
end;
$$;

-- Funciones existentes: se reemplazan fragmentos sobre la definición vigente.
do $mig$
declare
  d text;
begin
  -- of_aprobar: reserva al aprobar.
  d := pg_get_functiondef('public.of_aprobar(uuid)'::regprocedure);
  if (length(d) - length(replace(d, $a$'costo_estimado', public.of_recalcular_costo_estimado(v.id));$a$, ''))) / length($a$'costo_estimado', public.of_recalcular_costo_estimado(v.id));$a$) <> 1 then
    raise exception 'F3c: of_aprobar no coincide con la versión esperada';
  end if;
  execute replace(d, $a$'costo_estimado', public.of_recalcular_costo_estimado(v.id));$a$,
                     $a$'costo_estimado', public.of_recalcular_costo_estimado(v.id), 'reserva', public.of_reservar(v.id));$a$);

  -- of_guardar_material: un material no planificado de stock se reserva al guardarlo.
  d := pg_get_functiondef('public.of_guardar_material(uuid, uuid, jsonb)'::regprocedure);
  if (length(d) - length(replace(d, $a$'of_costo_estimado', public.of_recalcular_costo_estimado(v.id));$a$, ''))) / length($a$'of_costo_estimado', public.of_recalcular_costo_estimado(v.id));$a$) <> 1 then
    raise exception 'F3c: of_guardar_material no coincide con la versión esperada';
  end if;
  execute replace(d, $a$'of_costo_estimado', public.of_recalcular_costo_estimado(v.id));$a$,
                     $a$'of_costo_estimado', public.of_recalcular_costo_estimado(v.id),
                            'reserva', case when v_no_plan and v_origen = 'stock' then public.of_reservar(v.id) end);$a$);

  -- wms_despachar_demanda: canal produccion (consumo en taller, cantidad y costo real en la OF).
  d := pg_get_functiondef('public.wms_despachar_demanda(text, text, jsonb, jsonb)'::regprocedure);
  if position($a$v_motivo := CASE d.canal WHEN 'venta' THEN 'venta' ELSE 'salida_custodia' END;$a$ in d) = 0
     or position($a$p_referencia_tipo := CASE d.canal WHEN 'venta' THEN 'orden_venta' ELSE 'custodia' END,$a$ in d) = 0
     or position($a$coalesce(d.destino, '') ELSE 'Entrega de custodia '$a$ in d) = 0
     or (length(d) - length(replace(d, 'v_orden := v_orden + 1;', ''))) / length('v_orden := v_orden + 1;') <> 1
     or position($a$UPDATE public.wms_demandas SET estado = CASE WHEN v_pend_total = 0 THEN 'despachada' ELSE 'parcial' END, updated_at = now() WHERE id = d.id;$a$ in d) = 0 then
    raise exception 'F3c: wms_despachar_demanda no coincide con la versión esperada';
  end if;
  d := replace(d, $a$v_motivo := CASE d.canal WHEN 'venta' THEN 'venta' ELSE 'salida_custodia' END;$a$,
                  $a$v_motivo := CASE d.canal WHEN 'venta' THEN 'venta' WHEN 'produccion' THEN 'despacho_taller' ELSE 'salida_custodia' END;$a$);
  d := replace(d, $a$p_referencia_tipo := CASE d.canal WHEN 'venta' THEN 'orden_venta' ELSE 'custodia' END,$a$,
                  $a$p_referencia_tipo := CASE d.canal WHEN 'venta' THEN 'orden_venta' WHEN 'produccion' THEN 'orden_fabricacion' ELSE 'custodia' END,$a$);
  d := replace(d, $a$coalesce(d.destino, '') ELSE 'Entrega de custodia '$a$,
                  $a$coalesce(d.destino, '') WHEN 'produccion' THEN 'Entrega a taller · OF ' || d.numero ELSE 'Entrega de custodia '$a$);
  d := replace(d, 'v_orden := v_orden + 1;',
                  $a$IF d.canal = 'produccion' AND l.origen_linea_id IS NOT NULL THEN
      UPDATE public.of_materiales om SET cantidad_real = coalesce(om.cantidad_real, 0) + v_cant,
             costo_despachado = om.costo_despachado + round(v_cant * coalesce(public.of_convertir_moneda(v_costo, 'PEN', f.moneda), 0), 2),
             updated_at = now()
        FROM public.ordenes_fabricacion f WHERE om.id = l.origen_linea_id::uuid AND f.id = om.of_id;
    END IF;
    v_orden := v_orden + 1;$a$);
  d := replace(d, $a$UPDATE public.wms_demandas SET estado = CASE WHEN v_pend_total = 0 THEN 'despachada' ELSE 'parcial' END, updated_at = now() WHERE id = d.id;$a$,
                  $a$UPDATE public.wms_demandas SET estado = CASE WHEN v_pend_total = 0 THEN 'despachada' ELSE 'parcial' END, updated_at = now() WHERE id = d.id;
  IF d.canal = 'produccion' AND d.origen_id IS NOT NULL THEN PERFORM public.of_recalcular_avance(d.origen_id::uuid); END IF;$a$);
  execute d;
end $mig$;

-- of_recalcular_avance (F3b): los materiales del costo real son los despachados según el kárdex.
do $mig$
declare d text;
begin
  d := pg_get_functiondef('public.of_recalcular_avance(uuid)'::regprocedure);
  if position('select coalesce(sum(coalesce(cantidad_real, 0) * costo_unitario), 0) into v_mat' in d) = 0 then
    raise exception 'F3c: of_recalcular_avance no coincide con la versión esperada';
  end if;
  execute replace(d, 'select coalesce(sum(coalesce(cantidad_real, 0) * costo_unitario), 0) into v_mat',
                     'select coalesce(sum(costo_despachado), 0) into v_mat');
end $mig$;

revoke all on function public.of_reservar(uuid) from public, anon, authenticated;
revoke all on function public.of_reservas(uuid) from public, anon;
grant execute on function public.of_reservas(uuid) to authenticated;

do $$
begin
  if position('produccion' in (select pg_get_constraintdef(oid) from pg_constraint where conname = 'wms_demandas_canal_check')) = 0 then
    raise exception 'F3c: el canal produccion no quedó habilitado';
  end if;
  if position('of_reservar' in pg_get_functiondef('public.of_aprobar(uuid)'::regprocedure)) = 0
     or position('of_reservar' in pg_get_functiondef('public.of_guardar_material(uuid, uuid, jsonb)'::regprocedure)) = 0
     or position('orden_fabricacion' in pg_get_functiondef('public.wms_despachar_demanda(text, text, jsonb, jsonb)'::regprocedure)) = 0
     or position('costo_despachado' in pg_get_functiondef('public.of_recalcular_avance(uuid)'::regprocedure)) = 0 then
    raise exception 'F3c: alguna función no quedó actualizada';
  end if;
  if has_function_privilege('authenticated', 'public.of_reservar(uuid)', 'execute') then
    raise exception 'F3c: of_reservar debe ser interna';
  end if;
end $$;
