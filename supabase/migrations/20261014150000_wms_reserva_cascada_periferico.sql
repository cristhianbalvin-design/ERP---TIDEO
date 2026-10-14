-- WMS PR3: cascada de reserva periférico -> central -> SOLPE.
-- OT con proyecto (con mina): primero almacenes periféricos de SU mina, luego central, luego SOLPE.
-- OT sin proyecto: central y luego SOLPE. Un periférico nunca sirve a otra mina.
-- Lo reservado en central para una OT con mina queda reservado allí (sin traslado automático).
-- Aditiva: solo CREATE OR REPLACE partiendo de la definición remota vigente.

CREATE OR REPLACE FUNCTION public.procesar_reserva_repuestos_ot(p_ot_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ot public.ordenes_trabajo%rowtype;
  v_repuesto public.ot_segmento_repuestos%rowtype;
  v_stock record;
  v_pendiente numeric(14,2);
  v_reservado numeric(14,2);
  v_a_reservar numeric(14,2);
  v_faltante numeric(14,2);
  v_almacen_principal text;
  v_solpe_id text;
  v_solpe_codigo text;
  v_mina_id text;
begin
  -- El lock de la OT serializa invocaciones concurrentes de esta función para
  -- la misma OT. Las filas no estimadas quedan fuera, haciendo el reintento
  -- idempotente sin volver a reservar ni generar SOLPE.
  select *
    into v_ot
    from public.ordenes_trabajo
   where id = p_ot_id
   for update;

  if not found then
    raise exception 'La OT % no existe.', p_ot_id;
  end if;

  if v_ot.estado is distinct from 'programada'
     and not (v_ot.estado = 'ejecucion'
              and coalesce(current_setting('wms.permitir_ejecucion', true), '') = 'on') then
    return;
  end if;

  if auth.uid() is not null
     and coalesce(current_setting('wms.permitir_ejecucion', true), '') <> 'on'
     and (
       not public.usuario_tiene_empresa(v_ot.empresa_id)
       or not public.usuario_puede(v_ot.empresa_id, 'ot', 'editar')
     ) then
    raise exception 'No tienes permiso para procesar la reserva de repuestos de esta OT.';
  end if;

  -- Mina de la OT (null si no tiene proyecto o el proyecto no tiene mina).
  select pr.mina_id
    into v_mina_id
    from public.proyectos pr
   where pr.id = v_ot.proyecto_id
     and pr.empresa_id = v_ot.empresa_id;

  for v_repuesto in
    select *
      from public.ot_segmento_repuestos
     where ot_id = p_ot_id
       and estado = 'estimado'
     order by material_id, id
     for update
  loop
    v_pendiente := v_repuesto.cantidad_estimada;
    v_reservado := 0;
    v_almacen_principal := null;

    -- Cascada: periféricos de la mina de la OT primero (mayor disponible),
    -- luego almacenes centrales. Los periféricos de otra mina quedan fuera.
    for v_stock in
      select s.id, s.almacen_id, coalesce(s.disponible, 0) as disponible
        from public.stock s
        join public.almacenes a
          on a.id = s.almacen_id
         and a.empresa_id = s.empresa_id
       where s.empresa_id = v_repuesto.empresa_id
         and s.material_id = v_repuesto.material_id
         and s.sociedad_id is not distinct from v_repuesto.sociedad_id
         and s.lote is null
         and s.serie is null
         and coalesce(s.disponible, 0) > 0
         and (
           a.clase = 'central'
           or (a.clase = 'periferico' and v_mina_id is not null and a.mina_id = v_mina_id)
         )
       order by case when a.clase = 'periferico' then 0 else 1 end,
                coalesce(s.disponible, 0) desc, s.id
       for update of s
    loop
      exit when v_pendiente <= 0;

      v_a_reservar := least(v_pendiente, v_stock.disponible);
      if v_a_reservar <= 0 then
        continue;
      end if;

      update public.stock
         set disponible = coalesce(disponible, 0) - v_a_reservar,
             reservado = coalesce(reservado, 0) + v_a_reservar,
             updated_at = now()
       where id = v_stock.id;

      insert into public.ot_segmento_repuestos_reservas (
        empresa_id, sociedad_id, ot_id, ot_segmento_repuesto_id,
        material_id, stock_id, almacen_id, cantidad_reservada
      ) values (
        v_repuesto.empresa_id, v_repuesto.sociedad_id, p_ot_id, v_repuesto.id,
        v_repuesto.material_id, v_stock.id, v_stock.almacen_id, v_a_reservar
      );

      if v_almacen_principal is null then
        v_almacen_principal := v_stock.almacen_id;
      end if;

      v_reservado := v_reservado + v_a_reservar;
      v_pendiente := v_pendiente - v_a_reservar;
    end loop;

    v_faltante := greatest(v_repuesto.cantidad_estimada - v_reservado, 0);
    v_solpe_id := null;

    if v_faltante > 0 then
      v_solpe_codigo := 'SLP-OT-' || to_char(now(), 'YYYYMMDD') || '-'
        || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

      with existente as (
        select si.id
          from public.solpe_interna si
         where si.empresa_id = v_repuesto.empresa_id
           and si.ot_id = p_ot_id
           and si.material_id = v_repuesto.material_id
           and si.estado in ('borrador', 'solicitada', 'aprobada', 'oc_generada')
         order by si.created_at, si.id
         limit 1
         for update
      ), insertada as (
        insert into public.solpe_interna (
          id, empresa_id, codigo, descripcion, tipo, prioridad, urgencia,
          estado, origen, origen_tipo, origen_id, material_id,
          cantidad_solicitada, disponible_actual, fecha, items, ot_id
        )
        select
          'slp_ot_' || replace(gen_random_uuid()::text, '-', ''),
          v_repuesto.empresa_id,
          v_solpe_codigo,
          'Faltante de repuesto para OT ' || coalesce(v_ot.numero, p_ot_id),
          'bien',
          'alta',
          'alta',
          'solicitada',
          'ot',
          'ot',
          v_repuesto.id,
          v_repuesto.material_id,
          v_faltante,
          v_reservado,
          current_date,
          jsonb_build_array(jsonb_build_object(
            'material_id', v_repuesto.material_id,
            'cantidad', v_faltante,
            'ot_segmento_repuesto_id', v_repuesto.id,
            'cantidad_estimada', v_repuesto.cantidad_estimada,
            'cantidad_reservada', v_reservado
          )),
          p_ot_id
        where not exists (select 1 from existente)
        returning id
      )
      select coalesce(
        (select id from insertada),
        (select id from existente)
      ) into v_solpe_id;

      if v_solpe_id is null then
        raise exception 'No se pudo obtener ni crear la SOLPE para OT %, material %.',
          p_ot_id, v_repuesto.material_id;
      end if;
    end if;

    update public.ot_segmento_repuestos
       set almacen_id = v_almacen_principal,
           solpe_id = v_solpe_id,
           estado = case
             when v_faltante > 0 then 'reservado_parcial_solpe'
             else 'reservado'
           end,
           updated_at = now()
     where id = v_repuesto.id;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.wms_reservas_ot(p_empresa_id text, p_ot_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_alcance uuid[];
  v_out jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Se requiere una sesión autenticada.' USING ERRCODE='42501'; END IF;
  IF NOT public.usuario_tiene_empresa(p_empresa_id) THEN
    RAISE EXCEPTION 'No tienes acceso a esta empresa.' USING ERRCODE='42501';
  END IF;
  IF NOT public.usuario_puede(p_empresa_id,'inventario','ver') THEN
    RAISE EXCEPTION 'No tienes permiso para ver inventario.' USING ERRCODE='42501';
  END IF;
  v_alcance := public.usuario_alcance_sociedades(p_empresa_id);

  SELECT jsonb_build_object(
    'permisos', jsonb_build_object(
      'despachar', public.usuario_puede(p_empresa_id,'inventario','despachar'),
      'liberar', public.usuario_puede(p_empresa_id,'inventario','liberar')),
    'ordenes', coalesce(jsonb_agg(o.obj ORDER BY o.numero), '[]'::jsonb))
  INTO v_out
  FROM (
    SELECT ot.numero,
      jsonb_build_object(
        'id', ot.id, 'numero', ot.numero, 'estado', ot.estado, 'sociedad_id', ot.sociedad_id,
        'mina_id', mi.id, 'mina_nombre', mi.nombre,
        'lineas', (
          SELECT coalesce(jsonb_agg(jsonb_build_object(
            'id', l.id, 'material_id', l.material_id, 'codigo', m.codigo, 'descripcion', m.descripcion,
            'unidad', m.unidad, 'estado', l.estado, 'solpe_id', l.solpe_id,
            'cantidad_estimada', l.cantidad_estimada,
            'reservado', coalesce(rs.reservado,0), 'despachado', coalesce(rs.despachado,0),
            'liberado', coalesce(rs.liberado,0),
            'pendiente', coalesce(rs.reservado,0) - coalesce(rs.despachado,0) - coalesce(rs.liberado,0),
            'origenes', coalesce(rs.origenes,'[]'::jsonb)
          ) ORDER BY m.codigo, l.id), '[]'::jsonb)
          FROM public.ot_segmento_repuestos l
          JOIN public.materiales m ON m.id = l.material_id
          LEFT JOIN LATERAL (
            SELECT sum(r.cantidad_reservada) reservado, sum(r.cantidad_despachada) despachado,
                   sum(r.cantidad_liberada) liberado,
                   jsonb_agg(jsonb_build_object(
                     'stock_id', r.stock_id, 'almacen_id', r.almacen_id, 'almacen_codigo', a.codigo,
                     'almacen_nombre', a.nombre, 'almacen_clase', a.clase, 'almacen_mina_id', a.mina_id,
                     'ubicacion_id', s.ubicacion_id,
                     'ubicacion_codigo', u.codigo, 'ubicacion_nombre', u.nombre,
                     'pendiente', r.cantidad_reservada - r.cantidad_despachada - r.cantidad_liberada)
                     ORDER BY r.created_at, r.id) origenes
              FROM public.ot_segmento_repuestos_reservas r
              LEFT JOIN public.stock s ON s.id = r.stock_id
              LEFT JOIN public.almacenes a ON a.id = r.almacen_id
              LEFT JOIN public.ubicaciones u ON u.id = s.ubicacion_id
             WHERE r.ot_segmento_repuesto_id = l.id
          ) rs ON true
          WHERE l.ot_id = ot.id AND l.estado <> 'anulado'
        ),
        'acciones', (
          SELECT coalesce(jsonb_agg(jsonb_build_object(
            'id', ac.id, 'tipo', ac.tipo, 'cantidad', ac.cantidad, 'motivo', ac.motivo,
            'recibe_en_taller', ac.recibe_en_taller, 'observacion', ac.observacion,
            'kardex_ids', ac.kardex_ids, 'usuario_id', ac.usuario_id, 'linea_id', ac.ot_segmento_repuesto_id,
            'created_at', ac.created_at) ORDER BY ac.created_at DESC), '[]'::jsonb)
          FROM public.ot_segmento_repuestos_acciones ac WHERE ac.ot_id = ot.id
        )
      ) obj
    FROM public.ordenes_trabajo ot
    LEFT JOIN public.proyectos pr ON pr.id = ot.proyecto_id AND pr.empresa_id = ot.empresa_id
    LEFT JOIN public.minas mi ON mi.id = pr.mina_id AND mi.empresa_id = ot.empresa_id
    WHERE ot.empresa_id = p_empresa_id
      AND (p_ot_id IS NULL OR ot.id = p_ot_id)
      AND (v_alcance IS NULL OR ot.sociedad_id = ANY (v_alcance))
      AND EXISTS (SELECT 1 FROM public.ot_segmento_repuestos_reservas r WHERE r.ot_id = ot.id)
  ) o;
  RETURN v_out;
END
$function$;

DO $$
BEGIN
  IF position('periferico' in pg_get_functiondef('public.procesar_reserva_repuestos_ot(text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'procesar_reserva_repuestos_ot no contiene la cascada.';
  END IF;
  IF position('mina_nombre' in pg_get_functiondef('public.wms_reservas_ot(text,text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'wms_reservas_ot no devuelve mina.';
  END IF;
END $$;
