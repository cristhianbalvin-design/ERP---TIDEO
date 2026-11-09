-- Demo PRUEBA · 15 Planner: OT abiertas con trabajo pendiente, técnico, puesto y días programados (2026-11-08)
do $$
declare
  v_emp constant text := 'emp_2000000000';
  v_ais constant uuid := '609a2f33-d057-411f-a001-4e3e83f700d0';
  o record; t record;
  v_tec record;
  v_puestos uuid[];
  v_i int := 0;
  v_dia date;
  v_rest numeric;
  v_n int := 0;
begin
  set local session_replication_role = replica;

  -- Nombres de OT legibles (antes "Ejecución según OS-…")
  update ordenes_trabajo set descripcion = servicio
  where empresa_id = v_emp and (descripcion like 'Ejecución según OS-%' or descripcion = 'Mantenimiento programado de flota propia')
    and servicio is not null;

  -- Tareas para las OT de flota propia que no tenían
  insert into ot_tareas (id, empresa_id, ot_id, titulo, estado, horas_estimadas, avance_pct, completada, orden, creado_en, actualizado_en)
  select 'ott_demo_' || ow.id || '_' || x.orden, v_emp, ow.id, x.titulo, 'pendiente', x.horas, 0, false, x.orden, now(), now()
  from ordenes_trabajo ow
  cross join (values (1, 'Inspección inicial y diagnóstico en sitio', 6), (2, 'Cambio de filtros, aceite y ajustes', 10),
                     (3, 'Prueba operativa y liberación del equipo', 4)) x(orden, titulo, horas)
  where ow.empresa_id = v_emp and ow.estado in ('ejecucion', 'programada')
    and not exists (select 1 from ot_tareas tt where tt.ot_id = ow.id)
  on conflict (id) do nothing;

  select array_agg(id order by nombre, id) into v_puestos from planner_puestos where empresa_id = v_emp;
  delete from planner_asignaciones where empresa_id = v_emp and fecha >= date '2026-11-09';

  for o in select id, numero, estado, fecha_programada from ordenes_trabajo
           where empresa_id = v_emp and estado in ('ejecucion', 'programada') order by numero loop
    v_i := v_i + 1;
    -- Un técnico (mecánico o electricista) por OT
    select id, nombre, cargo_id into v_tec from personal_operativo
    where empresa_id = v_emp and cargo in ('Técnico Mecánico', 'Electricista Industrial')
    order by id offset (v_i - 1) limit 1;
    v_dia := greatest(date '2026-11-09', coalesce(o.fecha_programada, date '2026-11-09'));

    for t in select id, horas_estimadas from ot_tareas where ot_id = o.id and estado = 'pendiente' order by orden loop
      -- Trabajo pendiente realista: +16 h a las tareas de OT en ejecución que ya consumieron su estimado
      update ot_tareas set
        horas_estimadas = case when o.estado = 'ejecucion' and o.numero <> 'OT-26-0740' then horas_estimadas + 16 else horas_estimadas end,
        tecnico_id = v_tec.id, tecnico_nombre = v_tec.nombre, tecnico_tipo = 'operativo', cargo_id = v_tec.cargo_id,
        actualizado_en = now()
      where id = t.id returning horas_estimadas into v_rest;

      while v_rest > 0 loop
        if extract(dow from v_dia) in (0, 6) then v_dia := v_dia + 1; continue; end if;
        v_n := v_n + 1;
        insert into planner_asignaciones (id, empresa_id, ot_id, tecnico_id, fecha, estado, hora_inicio_estimada, hora_fin_estimada,
          sociedad_id, puesto_id, tarea_id, horas_estimadas, created_at, updated_at)
        values ('pa_demo_' || lpad(v_n::text, 4, '0'), v_emp, o.id, v_tec.id, v_dia, 'programado', time '08:00',
          time '08:00' + make_interval(hours => least(v_rest, 8)::int), v_ais,
          v_puestos[1 + (v_i - 1) % array_length(v_puestos, 1)], t.id, least(v_rest, 8), now(), now());
        v_rest := v_rest - 8;
        v_dia := v_dia + 1;
      end loop;
    end loop;
  end loop;

  if v_n < 20 then raise exception 'pocas asignaciones futuras: %', v_n; end if;
  if exists (select 1 from ordenes_trabajo where empresa_id = v_emp and descripcion like 'Ejecución según OS-%') then
    raise exception 'quedan OT con nombre genérico';
  end if;
end $$;
