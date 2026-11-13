-- Lecturas sujetas a las políticas RLS de cada tabla.
create function public.conf_disponibilidad(
  p_empresa_id text, p_sociedad_id uuid, p_desde date, p_hasta date, p_segmento text
) returns jsonb
language plpgsql stable security invoker set search_path = public
as $$
-- {periodo:{desde,hasta}, segmento, nota, flota:[{activo_id,codigo,nombre,
-- mes,contrato_id,contrato,cliente,horas_programadas,parada_proveedor,
-- parada_cliente,parada_neutral,dmr,meta_dmr,penalidad,estado_liquidacion}],
-- taller:[{activo_id,codigo,nombre,horas_posibles,horas_falla,disponibilidad_pct}]}.
declare v jsonb;
begin
  if p_empresa_id is null or p_desde is null or p_hasta is null or p_hasta < p_desde
     or p_segmento is null or p_segmento not in ('todos','flota','taller','cliente') then
    raise exception 'Empresa, periodo y segmento válidos son obligatorios.';
  end if;
  with partes as (
    select p.activo_id, p.contrato_alquiler_id, p.contrato_equipo_id,
      date_trunc('month', p.fecha)::date mes,
      sum(p.horas_programadas) horas_programadas,
      sum(coalesce(p.horas_parada_proveedor,0)) parada_proveedor,
      sum(coalesce(p.horas_parada_cliente,0)) parada_cliente,
      sum(coalesce(p.horas_parada_neutral,0)) parada_neutral
    from flota_partes_equipo p
    where p.empresa_id = p_empresa_id and (p_sociedad_id is null or p.sociedad_id = p_sociedad_id)
      and p.estado <> 'anulado' and p.fecha between p_desde and p_hasta
      and p_segmento in ('todos','flota')
    group by 1,2,3,4
  ), fallas as (
    select e.activo_id, coalesce(e.ot_id, e.id::text) grupo,
      case when bool_or(e.origen = 'parte_flota') then sum(e.horas_parada) filter (where e.origen = 'parte_flota')
           else max(e.horas_parada) end horas
    from conf_eventos_falla e
    where e.empresa_id = p_empresa_id and (p_sociedad_id is null or e.sociedad_id = p_sociedad_id)
      and e.estado <> 'anulada' and e.fecha_inicio::date between p_desde and p_hasta
    group by 1,2
  ), taller as (
    select m.activo_id, a.codigo, a.nombre, m.horas_dia * (p_hasta - p_desde + 1) horas_posibles,
      coalesce((select sum(f.horas) from fallas f where f.activo_id = m.activo_id),0) horas_falla
    from planner_maquinas_taller m join activos a on a.id = m.activo_id and a.empresa_id = m.empresa_id
    where m.empresa_id = p_empresa_id and (p_sociedad_id is null or m.sociedad_id = p_sociedad_id)
      and m.estado <> 'baja' and p_segmento in ('todos','taller')
  )
  select jsonb_build_object(
    'periodo', jsonb_build_object('desde',p_desde,'hasta',p_hasta), 'segmento',p_segmento,
    'nota', case when p_segmento = 'cliente' then 'La disponibilidad no aplica a equipos de cliente.' else null end,
    'flota', coalesce((select jsonb_agg(jsonb_build_object(
      'activo_id',p.activo_id,'codigo',a.codigo,'nombre',a.nombre,'mes',p.mes,
      'contrato_id',c.id,'contrato',c.numero,'cliente',coalesce(cu.nombre_comercial,cu.razon_social),
      'horas_programadas',p.horas_programadas,'parada_proveedor',p.parada_proveedor,
      'parada_cliente',p.parada_cliente,'parada_neutral',p.parada_neutral,
      'dmr',100*(p.horas_programadas-p.parada_proveedor)/nullif(p.horas_programadas,0),
      'meta_dmr',c.meta_dmr,'penalidad',ll.penalidad,'estado_liquidacion',coalesce(l.estado,'ausente')) order by p.mes,a.codigo)
      from partes p join activos a on a.id = p.activo_id and a.empresa_id = p_empresa_id
      join contratos_alquiler c on c.id = p.contrato_alquiler_id and c.empresa_id = p_empresa_id
      left join cuentas cu on cu.id = c.cuenta_id and cu.empresa_id = p_empresa_id
      left join flota_liquidaciones l on l.contrato_alquiler_id = c.id and l.periodo = p.mes and l.estado <> 'anulada' and l.empresa_id = p_empresa_id
      left join flota_liquidacion_lineas ll on ll.liquidacion_id = l.id and ll.contrato_equipo_id = p.contrato_equipo_id), '[]'::jsonb),
    'taller', coalesce((select jsonb_agg(jsonb_build_object('activo_id',activo_id,'codigo',codigo,'nombre',nombre,
      'horas_posibles',horas_posibles,'horas_falla',horas_falla,
      'disponibilidad_pct',100*(horas_posibles-horas_falla)/nullif(horas_posibles,0)) order by codigo) from taller), '[]'::jsonb)
  ) into v;
  return v;
end $$;

revoke all on function public.conf_disponibilidad(text, uuid, date, date, text) from public, anon;
grant execute on function public.conf_disponibilidad(text, uuid, date, date, text) to authenticated;

-- JSON: {globales:{fallas,horas_operadas,horas_parada,mtbf_horas,mttr_horas,
-- disponibilidad_pct,ot_correctivas,ot_preventivas,costo_correctivo,costo_preventivo,
-- ratio_mantenimiento,cumplimiento_pm_pct,backlog_abierto,backlog_edad_promedio_dias,
-- dias_entre_fallas},periodo_anterior:{las mismas claves de globales},
-- por_equipo:[{activo_id,codigo,nombre,segmento,fallas,horas_operadas,horas_parada,
-- mtbf_horas,mttr_horas,disponibilidad_pct,estado,tendencia}],
-- pareto_sistemas:[{sistema,fallas,horas_parada,porcentaje_acumulado}],
-- serie_mensual:[{mes,fallas,horas_parada,disponibilidad_pct,ot_correctivas,ot_preventivas}],
-- calidad_datos:{ot_correctivas_sin_equipo,ot_pm_sin_equipo,activos_sin_horometro,
-- maquinas_taller_sin_activo}}. Arreglos vacios cuando no hay datos; divisiones
-- sin denominador y horas/disponibilidad no calculables se devuelven como null.
create function public.conf_kpis(
  p_empresa_id text, p_sociedad_id uuid, p_desde date, p_hasta date, p_segmento text
) returns jsonb
language plpgsql stable security invoker set search_path = public, pg_temp
as $$
declare v_resultado jsonb;
begin
  if p_empresa_id is null or p_desde is null or p_hasta is null or p_hasta < p_desde
     or p_segmento is null or p_segmento not in ('todos','flota','taller','cliente') then
    raise exception 'Empresa, periodo y segmento válidos son obligatorios.';
  end if;

  with
  periodos as (
    select 'actual'::text clave, p_desde desde, p_hasta hasta, null::date mes
    union all select 'anterior', p_desde - (p_hasta - p_desde + 1), p_desde - 1, null::date
    union all
    select 'mes', greatest(p_desde, m::date), least(p_hasta, (m + interval '1 month - 1 day')::date), m::date
    from generate_series(date_trunc('month', p_desde::timestamp), date_trunc('month', p_hasta::timestamp), interval '1 month') m
  ),
  activos_segmentados as materialized (
    select a.id, a.codigo, a.nombre, a.propietario_tipo, a.horometro_actual,
      public.conf_segmento_activo(a.id) segmento
    from public.activos a where a.empresa_id = p_empresa_id
  ),
  activos_filtrados as materialized (
    select * from activos_segmentados where p_segmento = 'todos' or segmento = p_segmento
  ),
  eventos as materialized (
    select e.*, a.segmento from public.conf_eventos_falla e
    join activos_filtrados a on a.id = e.activo_id
    where e.empresa_id = p_empresa_id and (p_sociedad_id is null or e.sociedad_id = p_sociedad_id)
      and e.estado <> 'anulada' and e.fecha_inicio::date between p_desde - (p_hasta - p_desde + 1) and p_hasta
  ),
  -- Una falla por OT o evento independiente; los partes prevalecen sobre OT/manual.
  fallas as (
    select p.clave, p.mes, e.activo_id, coalesce(e.ot_id, e.id::text) grupo,
      min(e.fecha_inicio) fecha_inicio,
      coalesce((array_agg(coalesce(nullif(e.sistema,''),nullif(e.modo_falla,''))
        order by e.fecha_inicio, e.id) filter (where coalesce(nullif(e.sistema,''),nullif(e.modo_falla,'')) is not null))[1], 'Sin sistema') sistema,
      case when bool_or(e.origen = 'parte_flota')
        then coalesce(sum(e.horas_parada) filter (where e.origen = 'parte_flota'),0)
        else coalesce(max(e.horas_parada) filter (where e.origen in ('ot','manual')),0) end horas
    from periodos p join eventos e on e.fecha_inicio::date between p.desde and p.hasta
    group by p.clave, p.mes, e.activo_id, coalesce(e.ot_id, e.id::text)
  ),
  fallas_equipo as (
    select clave, mes, activo_id, count(*) fallas, sum(horas) horas_parada
    from fallas group by clave, mes, activo_id
  ),
  partes as (
    select p.clave, p.mes, f.activo_id, sum(coalesce(f.horas_operadas,0)) horas_operadas,
      sum(coalesce(f.horas_programadas,0)) programadas,
      sum(coalesce(f.horas_parada_proveedor,0)) parada_proveedor
    from periodos p join public.flota_partes_equipo f on f.fecha between p.desde and p.hasta
    join activos_filtrados a on a.id = f.activo_id and a.segmento = 'flota'
    where f.empresa_id = p_empresa_id and (p_sociedad_id is null or f.sociedad_id = p_sociedad_id)
      and f.estado <> 'anulado'
    group by p.clave, p.mes, f.activo_id
  ),
  maquinas as materialized (
    select m.activo_id, sum(m.horas_dia) horas_dia
    from public.planner_maquinas_taller m join activos_filtrados a on a.id = m.activo_id and a.segmento = 'taller'
    where m.empresa_id = p_empresa_id and m.estado <> 'baja'
    group by m.activo_id
  ),
  ots as materialized (
    select o.*, a.segmento from public.ordenes_trabajo o
    left join activos_filtrados a on a.id = o.equipo_id
    where o.empresa_id = p_empresa_id and (p_sociedad_id is null or o.sociedad_id = p_sociedad_id)
      and (a.id is not null or (p_segmento = 'todos' and o.equipo_id is null))
      and o.tipo_trabajo in ('Correctivo','Preventivo_PM')
  ),
  ot_periodo as (
    select p.clave, p.mes, o.equipo_id, o.tipo_trabajo, o.costo_real, o.estado,
      o.fecha_programada, o.fecha_fin
    from periodos p join ots o on coalesce(o.fecha_programada, o.created_at::date) between p.desde and p.hasta
  ),
  -- Horas de taller: capacidad diaria por dias menos paradas agrupadas.
  equipo_base as (
    select p.clave, p.mes, a.id, a.codigo, a.nombre, a.segmento,
      coalesce(f.fallas,0) fallas, coalesce(f.horas_parada,0) horas_parada,
      case when a.segmento = 'flota' then pa.horas_operadas
        when a.segmento = 'taller' and m.activo_id is not null
          then m.horas_dia * (p.hasta-p.desde+1) - coalesce(f.horas_parada,0) end horas_operadas,
      case when a.segmento = 'flota' then pa.programadas
        when a.segmento = 'taller' then m.horas_dia * (p.hasta-p.desde+1) end posibles,
      case when a.segmento = 'flota' then pa.programadas-pa.parada_proveedor
        when a.segmento = 'taller' then m.horas_dia * (p.hasta-p.desde+1)-coalesce(f.horas_parada,0) end disponibles
    from periodos p cross join activos_filtrados a
    left join fallas_equipo f on f.clave=p.clave and f.mes is not distinct from p.mes and f.activo_id=a.id
    left join partes pa on pa.clave=p.clave and pa.mes is not distinct from p.mes and pa.activo_id=a.id
    left join maquinas m on m.activo_id=a.id
    where f.activo_id is not null or pa.activo_id is not null or m.activo_id is not null
      or exists (select 1 from ot_periodo o where o.clave=p.clave and o.mes is not distinct from p.mes and o.equipo_id=a.id)
      or exists (select 1 from public.backlog b where b.empresa_id=p_empresa_id and b.activo_id=a.id
        and (p_sociedad_id is null or b.sociedad_id=p_sociedad_id)
        and coalesce(b.ciclo,'nuevo') not in ('cerrado','descartado') and coalesce(b.fecha_deteccion,b.created_at::date)<=p.hasta)
  ),
  equipo as (
    select b.*, round(b.horas_operadas/nullif(b.fallas,0),2) mtbf_horas,
      round(b.horas_parada/nullif(b.fallas,0),2) mttr_horas,
      round(100*b.disponibles/nullif(b.posibles,0),2) disponibilidad_pct
    from equipo_base b
  ),
  brechas as (
    select clave, mes, activo_id, fecha_inicio::date - lag(fecha_inicio::date) over
      (partition by clave, mes, activo_id order by fecha_inicio, grupo) dias
    from fallas
  ),
  globales as (
    select p.clave, p.mes, jsonb_build_object(
      'fallas', coalesce((select sum(e.fallas) from equipo e where e.clave=p.clave and e.mes is not distinct from p.mes),0),
      'horas_operadas', (select round(sum(e.horas_operadas),2) from equipo e where e.clave=p.clave and e.mes is not distinct from p.mes),
      'horas_parada', coalesce((select round(sum(e.horas_parada),2) from equipo e where e.clave=p.clave and e.mes is not distinct from p.mes),0),
      'mtbf_horas', (select round(sum(e.horas_operadas)/nullif(sum(e.fallas),0),2) from equipo e where e.clave=p.clave and e.mes is not distinct from p.mes),
      'mttr_horas', (select round(sum(e.horas_parada)/nullif(sum(e.fallas),0),2) from equipo e where e.clave=p.clave and e.mes is not distinct from p.mes),
      -- Disponibilidad global ponderada por horas posibles, no promedio de porcentajes.
      'disponibilidad_pct', (select round(100*sum(e.disponibles)/nullif(sum(e.posibles),0),2) from equipo e where e.clave=p.clave and e.mes is not distinct from p.mes),
      'ot_correctivas', (select count(*) from ot_periodo o where o.clave=p.clave and o.mes is not distinct from p.mes and o.tipo_trabajo='Correctivo'),
      'ot_preventivas', (select count(*) from ot_periodo o where o.clave=p.clave and o.mes is not distinct from p.mes and o.tipo_trabajo='Preventivo_PM'),
      'costo_correctivo', (select round(coalesce(sum(o.costo_real),0),2) from ot_periodo o where o.clave=p.clave and o.mes is not distinct from p.mes and o.tipo_trabajo='Correctivo'),
      'costo_preventivo', (select round(coalesce(sum(o.costo_real),0),2) from ot_periodo o where o.clave=p.clave and o.mes is not distinct from p.mes and o.tipo_trabajo='Preventivo_PM'),
      'ratio_mantenimiento', (select round(coalesce(sum(coalesce(o.costo_real,0)) filter (where o.tipo_trabajo='Preventivo_PM'),0) / nullif(sum(coalesce(o.costo_real,0)),0),2) from ot_periodo o where o.clave=p.clave and o.mes is not distinct from p.mes),
      'cumplimiento_pm_pct', (select round(100.0*count(*) filter (where o.estado='cerrada' and o.fecha_fin <= o.fecha_programada+3)/nullif(count(*),0),2) from ot_periodo o where o.clave=p.clave and o.mes is not distinct from p.mes and o.tipo_trabajo='Preventivo_PM' and o.fecha_programada between p.desde and p.hasta),
      'backlog_abierto', (select count(*) from public.backlog b left join activos_filtrados a on a.id=b.activo_id where b.empresa_id=p_empresa_id and (p_sociedad_id is null or b.sociedad_id=p_sociedad_id) and coalesce(b.ciclo,'nuevo') not in ('cerrado','descartado') and coalesce(b.fecha_deteccion,b.created_at::date)<=p.hasta and (a.id is not null or (p_segmento='todos' and b.activo_id is null))),
      'backlog_edad_promedio_dias', (select round(avg(p.hasta-coalesce(b.fecha_deteccion,b.created_at::date)),2) from public.backlog b left join activos_filtrados a on a.id=b.activo_id where b.empresa_id=p_empresa_id and (p_sociedad_id is null or b.sociedad_id=p_sociedad_id) and coalesce(b.ciclo,'nuevo') not in ('cerrado','descartado') and coalesce(b.fecha_deteccion,b.created_at::date)<=p.hasta and (a.id is not null or (p_segmento='todos' and b.activo_id is null))),
      'dias_entre_fallas', (select round(avg(b.dias),2) from brechas b where b.clave=p.clave and b.mes is not distinct from p.mes)
    ) datos from periodos p
  ),
  equipo_estado as (
    select e.*, case when e.disponibilidad_pct < 85 or e.fallas >= 3 then 'critico'
      when e.disponibilidad_pct < 92 or e.fallas = 2 then 'alerta' else 'ok' end estado,
      -- Una mejora exige al menos una mejora y ninguna metrica peor; deterioro es simetrico.
      case when (e.fallas < coalesce(ant.fallas,0) or e.disponibilidad_pct > ant.disponibilidad_pct)
          and e.fallas <= coalesce(ant.fallas,0) and (e.disponibilidad_pct >= ant.disponibilidad_pct or e.disponibilidad_pct is null or ant.disponibilidad_pct is null) then 'mejora'
        when (e.fallas > coalesce(ant.fallas,0) or e.disponibilidad_pct < ant.disponibilidad_pct)
          and e.fallas >= coalesce(ant.fallas,0) and (e.disponibilidad_pct <= ant.disponibilidad_pct or e.disponibilidad_pct is null or ant.disponibilidad_pct is null) then 'deterioro'
        else 'estable' end tendencia
    from equipo e left join equipo ant on ant.clave='anterior' and ant.id=e.id
    where e.clave='actual'
  ),
  pareto as (
    select sistema, count(*) fallas, sum(horas) horas_parada from fallas where clave='actual' group by sistema
  ),
  pareto_acumulado as (
    select *, round(100.0*sum(fallas) over (order by fallas desc, horas_parada desc, sistema rows unbounded preceding)/nullif(sum(fallas) over (),0),2) porcentaje_acumulado from pareto
  )
  select jsonb_build_object(
    'globales', (select datos from globales where clave='actual'),
    'periodo_anterior', (select datos from globales where clave='anterior'),
    'por_equipo', coalesce((select jsonb_agg(jsonb_build_object('activo_id',id,'codigo',codigo,'nombre',nombre,'segmento',segmento,'fallas',fallas,'horas_operadas',round(horas_operadas,2),'horas_parada',round(horas_parada,2),'mtbf_horas',mtbf_horas,'mttr_horas',mttr_horas,'disponibilidad_pct',disponibilidad_pct,'estado',estado,'tendencia',tendencia) order by case estado when 'critico' then 1 when 'alerta' then 2 else 3 end, fallas desc, codigo, id) from equipo_estado), '[]'::jsonb),
    'pareto_sistemas', coalesce((select jsonb_agg(jsonb_build_object('sistema',sistema,'fallas',fallas,'horas_parada',round(horas_parada,2),'porcentaje_acumulado',porcentaje_acumulado) order by fallas desc, horas_parada desc, sistema) from pareto_acumulado), '[]'::jsonb),
    'serie_mensual', coalesce((select jsonb_agg(jsonb_build_object('mes',mes,'fallas',datos->'fallas','horas_parada',datos->'horas_parada','disponibilidad_pct',datos->'disponibilidad_pct','ot_correctivas',datos->'ot_correctivas','ot_preventivas',datos->'ot_preventivas') order by mes) from globales where clave='mes'), '[]'::jsonb),
    'calidad_datos', jsonb_build_object(
      'ot_correctivas_sin_equipo', (select count(*) from ot_periodo where clave='actual' and equipo_id is null and tipo_trabajo='Correctivo'),
      'ot_pm_sin_equipo', (select count(*) from ot_periodo where clave='actual' and equipo_id is null and tipo_trabajo='Preventivo_PM'),
      'activos_sin_horometro', (select count(*) from activos_filtrados where segmento in ('flota','taller') and propietario_tipo = 'propio' and horometro_actual is null),
      'maquinas_taller_sin_activo', (select count(*) from public.planner_maquinas_taller where empresa_id=p_empresa_id and activo_id is null and estado <> 'baja' and p_segmento in ('todos','taller'))
    )
  ) into v_resultado;
  return v_resultado;
end $$;

revoke all on function public.conf_kpis(text, uuid, date, date, text) from public, anon;
grant execute on function public.conf_kpis(text, uuid, date, date, text) to authenticated;

do $$
begin
  if to_regprocedure('public.conf_disponibilidad(text,uuid,date,date,text)') is null then
    raise exception 'Falta conf_disponibilidad.';
  end if;
  if to_regprocedure('public.conf_kpis(text,uuid,date,date,text)') is null then
    raise exception 'Falta conf_kpis; la migración está incompleta.';
  end if;
  if not has_function_privilege('authenticated', 'public.conf_disponibilidad(text,uuid,date,date,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.conf_disponibilidad(text,uuid,date,date,text)', 'EXECUTE') then
    raise exception 'Privilegios incorrectos de conf_disponibilidad.';
  end if;
  if not has_function_privilege('authenticated', 'public.conf_kpis(text,uuid,date,date,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.conf_kpis(text,uuid,date,date,text)', 'EXECUTE') then
    raise exception 'Privilegios incorrectos de conf_kpis.';
  end if;
end $$;
