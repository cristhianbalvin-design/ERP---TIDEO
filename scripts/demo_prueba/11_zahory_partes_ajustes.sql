-- Demo PRUEBA · 11 Geocerca de ZAHORY, partes diarios y ajustes (ejecutado el 2026-11-08, opción A aprobada por Cristhian)
-- La geocerca "Geocerca prueba ZAHORY" (creada el 2026-07-03 en PRUEBA, con sede y asignación de ZAHORY) pasa a ZAHORY
do $$ begin
update rrhh_geocercas set empresa_id='emp_20541435833', updated_at=now() where id='geo_7fe550669d92' and empresa_id='emp_2000000000';
if exists (select 1 from rrhh_geocerca_asignaciones a join rrhh_geocercas g on g.id=a.geocerca_id where a.empresa_id<>g.empresa_id) then raise exception 'quedan asignaciones cruzadas entre empresas'; end if;
end $$;

-- Partes diarios coherentes con las OT (reemplazan a los clonados)
do $$ declare o record; d date; n int := 0; tec record; k int; begin
set local session_replication_role = replica;
delete from partes_diarios where empresa_id='emp_2000000000' and id like 'demo_partes_dia%';
for o in select * from ordenes_trabajo where empresa_id='emp_2000000000' and estado in ('ejecucion','cerrada') and fecha_programada is not null order by fecha_programada loop
  k := 0;
  for d in select generate_series(o.fecha_programada, least(coalesce(o.fecha_fin, date '2026-11-07'), date '2026-11-07', o.fecha_programada + 20), interval '1 day')::date loop
    if extract(dow from d) = 0 then continue; end if;
    k := k+1; if o.estado='cerrada' and k > 4 then exit; end if;
    if o.estado='ejecucion' and d < date '2026-11-07' - 10 then continue; end if;
    n := n+1;
    select p.id, p.nombre into tec from personal_operativo p where p.id = coalesce(o.tecnico_responsable_id,'po_demo_001');
    insert into partes_diarios(id,empresa_id,orden_trabajo_id,tecnico_id,tecnico_nombre,fecha,hora_inicio,hora_fin,horas_normales,horas_extra,actividad,avance_pct,origen_registro,estado,created_at,updated_at,numero,sociedad_id)
    values ('pd_demo_'||lpad(n::text,4,'0'),'emp_2000000000',o.id,tec.id,tec.nombre,d,'07:30','17:30',8,case when n%3=0 then 1.5 else 0 end,
      (array['Desmontaje de bomba hidráulica','Cambio de filtros y lubricación','Prueba de presión del sistema hidráulico','Soldadura de recargue en cucharón','Inspección de tren de rodamiento','Armado y torqueo de componentes'])[1+n%6],
      least(100, k*20),case when o.direccion_ejecucion like 'Taller%' then 'operativo_taller' else 'mina' end,
      case when d < date '2026-11-06' then 'aprobado' else 'en_revision' end,d::timestamp + interval '18 hours',d::timestamp + interval '18 hours','PD-'||lpad((5000+n)::text,6,'0'),'609a2f33-d057-411f-a001-4e3e83f700d0');
  end loop;
end loop;
for o in select ot.* from ordenes_trabajo ot where ot.empresa_id='emp_2000000000' and ot.estado='ejecucion'
   and not exists (select 1 from partes_diarios p where p.orden_trabajo_id=ot.id and p.fecha >= date '2026-11-03') loop
  for d in select generate_series(greatest(o.fecha_programada, date '2026-11-03'), date '2026-11-07', interval '1 day')::date loop
    if extract(dow from d)=0 then continue; end if;
    n := n+1;
    insert into partes_diarios(id,empresa_id,orden_trabajo_id,tecnico_id,tecnico_nombre,fecha,hora_inicio,hora_fin,horas_normales,horas_extra,actividad,avance_pct,origen_registro,estado,created_at,updated_at,numero,sociedad_id)
    select 'pd_demo_'||lpad(n::text,4,'0'),'emp_2000000000',o.id,p.id,p.nombre,d,'07:30','17:30',8,0,'Avance de trabajos según programa',50,'operativo_taller',
      case when d < date '2026-11-06' then 'aprobado' else 'en_revision' end,d::timestamp + interval '18 hours',d::timestamp + interval '18 hours','PD-'||lpad((5000+n)::text,6,'0'),'609a2f33-d057-411f-a001-4e3e83f700d0'
    from personal_operativo p where p.id=coalesce(o.tecnico_responsable_id,'po_demo_001');
  end loop;
end loop;
-- OT con fecha futura pasa a programada; nombres sin etiquetas internas
update ordenes_trabajo set estado='programada', avance_pct=0, costo_real=0, fecha_inicio_real=null where empresa_id='emp_2000000000' and numero='OT-26-0741' and fecha_programada > date '2026-11-08';
update activos set nombre='Excavadora CAT 336' where empresa_id='emp_2000000000' and codigo='EX-07';
update ordenes_trabajo set servicio=replace(servicio,' (alta falla)','') where empresa_id='emp_2000000000' and servicio like '%(alta falla)%';
end $$;
