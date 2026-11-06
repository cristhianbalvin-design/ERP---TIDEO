-- F2 · Crear OF: vista previa de lo que copiará crear_of_desde_os y lista de OS elegibles.
-- Solo lectura (STABLE). Misma regla de selección que crear_of_desde_os (F1).

set lock_timeout = '10s';

create or replace function public.vista_previa_of_desde_os(p_os_id text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare
  v_os    record;
  v_hoja  record;
  v_diag  text;
  v_of    record;
  v_ops   jsonb;
  v_mats  jsonb;
begin
  select o.*, coalesce(c.nombre_comercial, c.razon_social) as cliente, a.codigo as activo_codigo, a.nombre as activo_nombre
    into v_os
    from public.os_clientes o
    left join public.cuentas c on c.id = o.cuenta_id
    left join public.activos a on a.id = o.activo_id
   where o.id = p_os_id;
  if not found then
    raise exception 'La OS % no existe.', p_os_id;
  end if;
  if not public.usuario_tiene_empresa(v_os.empresa_id)
     or not (public.usuario_puede(v_os.empresa_id, 'of', 'crear') or public.usuario_puede(v_os.empresa_id, 'of', 'ver')) then
    raise exception 'No tiene permiso para ver órdenes de fabricación.' using errcode = '42501';
  end if;

  select h.id, h.numero, h.diagnostico_id into v_hoja
    from public.hojas_costeo h
   where h.id = coalesce(
           (select c.hoja_costeo_id from public.cotizaciones c where c.id = v_os.cotizacion_id),
           (select ce.hoja_costeo_id from public.cotizaciones_especiales ce where ce.id = v_os.cotizacion_especial_id));

  select f.id, f.numero into v_of
    from public.ordenes_fabricacion f
   where f.os_cliente_id = p_os_id and f.hoja_costeo_id is not null and f.estado <> 'anulada'
   order by f.created_at limit 1;

  if v_hoja.id is not null then
    select d.tipo into v_diag from public.diagnosticos_tecnicos d where d.id = v_hoja.diagnostico_id;

    with lineas as (
      select l.*,
             row_number() over (order by l.orden nulls last, l.creado_en, l.id) as secuencia,
             a.activo_id, a.horas_uso_estimadas, a.depreciacion_asignada, a.costo_hora_equipo
        from public.hoja_costeo_lineas_mano_obra l
        left join public.hoja_costeo_trabajos ht on ht.hoja_costeo_id = l.hoja_costeo_id and ht.familia_trabajo_id = l.familia_trabajo_id
        left join lateral (
               select la.activo_id, la.horas_uso_estimadas, la.depreciacion_asignada, la.costo_hora_equipo
                 from public.hoja_costeo_lineas_activos la
                where la.linea_mano_obra_id = l.id
                order by la.orden nulls last, la.creado_en
                limit 1) a on true
       where l.hoja_costeo_id = v_hoja.id
         and coalesce(ht.tipo_ejecucion, v_diag,
                      case when v_os.tipo_ejecucion = 'fabricacion' then 'fabricacion' end) = 'fabricacion'
    )
    select coalesce(jsonb_agg(jsonb_build_object(
             'secuencia', ln.secuencia,
             'linea_id', ln.id,
             'trabajo', ft.nombre,
             'actividad', ta.nombre,
             'tarea', coalesce(tt.nombre, ta.nombre, 'Tarea'),
             'cargo', ce.nombre,
             'horas', coalesce(ln.horas, 0),
             'horas_maquina', coalesce(ln.horas_uso_estimadas, 0),
             'equipo', case when ac.id is null then null else concat_ws(' · ', ac.codigo, ac.nombre) end,
             'bahia', (select b.nombre from public.planner_maquinas_taller m join public.planner_bahias b on b.id = m.bahia_id
                        where m.empresa_id = v_os.empresa_id and m.activo_id = ln.activo_id and m.estado <> 'baja' limit 1),
             'costo', round(coalesce(ln.subtotal, 0) + coalesce(ln.depreciacion_asignada, ln.costo_hora_equipo * ln.horas_uso_estimadas, 0), 2)
           ) order by ln.secuencia), '[]'::jsonb)
      into v_ops
      from lineas ln
      left join public.familia_trabajo ft on ft.id = ln.familia_trabajo_id
      left join public.tipos_servicio_interno tt on tt.id = ln.tarea_id
      left join public.tipos_servicio_interno ta on ta.id = coalesce(ln.actividad_receta_id, ln.actividad_id)
      left join public.cargos_empresa ce on ce.id = ln.cargo_id
      left join public.activos ac on ac.id = ln.activo_id;

    select coalesce(jsonb_agg(jsonb_build_object(
             'descripcion', coalesce(m.descripcion, mt.descripcion, 'Material'),
             'unidad', m.unidad,
             'cantidad', coalesce(m.cantidad, 0),
             'costo_unitario', coalesce(m.costo_unitario_snapshot, 0),
             'subtotal', round(coalesce(m.cantidad, 0) * coalesce(m.costo_unitario_snapshot, 0), 2)
           ) order by m.orden nulls last, m.creado_en), '[]'::jsonb)
      into v_mats
      from public.hoja_costeo_lineas_materiales m
      left join public.materiales mt on mt.id = m.material_id
     where m.hoja_costeo_id = v_hoja.id
       and ((m.linea_mano_obra_id is not null and m.linea_mano_obra_id in (select (o->>'linea_id')::uuid from jsonb_array_elements(v_ops) o))
            or (m.linea_mano_obra_id is null and v_os.tipo_ejecucion = 'fabricacion'));
  end if;

  return jsonb_build_object(
    'os', jsonb_build_object('id', v_os.id, 'numero', v_os.numero, 'nombre', v_os.nombre, 'cliente', v_os.cliente,
                             'tipo_ejecucion', v_os.tipo_ejecucion, 'fecha_compromiso', v_os.fecha_fin, 'moneda', coalesce(v_os.moneda, 'PEN'),
                             'componente', case when v_os.activo_id is null then null else concat_ws(' · ', v_os.activo_codigo, v_os.activo_nombre) end),
    'hoja', case when v_hoja.id is null then null else jsonb_build_object('id', v_hoja.id, 'numero', v_hoja.numero) end,
    'of_existente', case when v_of.id is null then null else jsonb_build_object('id', v_of.id, 'numero', v_of.numero) end,
    'operaciones', coalesce(v_ops, '[]'::jsonb),
    'materiales', coalesce(v_mats, '[]'::jsonb)
  );
end;
$function$;

-- OS que pueden tener OF: de fabricación o mixtas, no anuladas ni cerradas.
create or replace function public.os_elegibles_para_of(p_empresa_id text)
returns table (id text, numero text, nombre text, cliente text, tipo_ejecucion text, fecha_compromiso date,
               hoja_numero text, ofs integer)
language sql stable security definer set search_path to 'public' as $function$
  select o.id, o.numero, o.nombre, coalesce(c.nombre_comercial, c.razon_social), o.tipo_ejecucion, o.fecha_fin,
         h.numero,
         (select count(*)::int from public.ordenes_fabricacion f where f.os_cliente_id = o.id and f.estado <> 'anulada')
    from public.os_clientes o
    left join public.cuentas c on c.id = o.cuenta_id
    left join public.hojas_costeo h on h.id = coalesce(
           (select ct.hoja_costeo_id from public.cotizaciones ct where ct.id = o.cotizacion_id),
           (select ce.hoja_costeo_id from public.cotizaciones_especiales ce where ce.id = o.cotizacion_especial_id))
   where o.empresa_id = p_empresa_id
     and o.tipo_ejecucion in ('fabricacion', 'mixto')
     and coalesce(lower(o.estado), '') not in ('anulada', 'anulado', 'cerrada', 'cerrado')
     and public.usuario_tiene_empresa(p_empresa_id)
     and (public.usuario_puede(p_empresa_id, 'of', 'crear') or public.usuario_puede(p_empresa_id, 'of', 'ver'))
     and exists (select 1 from (select public.usuario_alcance_sociedades(p_empresa_id) as alcance) au
                 where au.alcance is null or o.sociedad_id = any (au.alcance))
   order by o.fecha_emision desc nulls last, o.numero desc;
$function$;

revoke all on function public.vista_previa_of_desde_os(text) from public, anon;
grant execute on function public.vista_previa_of_desde_os(text) to authenticated;
revoke all on function public.os_elegibles_para_of(text) from public, anon;
grant execute on function public.os_elegibles_para_of(text) to authenticated;

do $$ begin
  if to_regprocedure('public.vista_previa_of_desde_os(text)') is null
     or to_regprocedure('public.os_elegibles_para_of(text)') is null then
    raise exception 'F2: faltan funciones de vista previa';
  end if;
end $$;
