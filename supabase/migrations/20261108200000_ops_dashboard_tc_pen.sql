-- Dashboard Gerencial: el tipo de cambio se toma solo de filas con moneda_base PEN.
-- tipo_cambio = dólares por 1 sol (tipo_cambio_historico.usd); para pasar soles a dólares se multiplica.
create or replace function public.ops_dashboard_gerencial(
  p_empresa_id text,
  p_sociedad_id uuid default null,
  p_desde date default (date_trunc('month', current_date) - interval '2 months')::date,
  p_hasta date default current_date
) returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v jsonb;
  v_tc numeric;
begin
  if p_empresa_id is null or p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'PARAMETROS_INVALIDOS: empresa y rango de fechas son obligatorios';
  end if;

  select usd into v_tc from tipo_cambio_historico where moneda_base = 'PEN' and usd is not null and fecha <= p_hasta order by fecha desc limit 1;

  with
  ot_all as (
    select o.*, coalesce(c.total, o.costo_real, 0) as costo,
           coalesce(c.mano_obra,0) mo, coalesce(c.materiales,0) mat, coalesce(c.servicios_terceros,0) ter,
           coalesce(c.logistica,0) log, coalesce(c.otros,0) otr,
           coalesce(o.fecha_fin, o.fecha_programada, o.created_at::date) as fecha_ref
    from ordenes_trabajo o
    left join costos_ot c on c.orden_trabajo_id = o.id
    where o.empresa_id = p_empresa_id
      and (p_sociedad_id is null or o.sociedad_id = p_sociedad_id)
      and coalesce(o.estado,'') not in ('anulada','anulado')
  ),
  ot_ing as (
    select a.*,
      case when a.os_cliente_id is null then 0
           else round(coalesce(os.monto_aprobado,0) * a.costo / nullif(sum(a.costo) over (partition by a.os_cliente_id),0), 2) end as ingreso
    from ot_all a left join os_clientes os on os.id = a.os_cliente_id
  ),
  ot_per as (select * from ot_ing where fecha_ref between p_desde and p_hasta),
  meses as (select to_char(m,'YYYY-MM') mes from generate_series(date_trunc('month',p_desde), date_trunc('month',p_hasta), interval '1 month') m),
  partes as (
    select p.*, to_char(p.fecha,'YYYY-MM') mes from flota_partes_equipo p
    where p.empresa_id = p_empresa_id and coalesce(p.estado,'registrado') <> 'anulado'
      and (p_sociedad_id is null or p.sociedad_id = p_sociedad_id)
      and p.fecha between p_desde and p_hasta
  ),
  propios as (
    select a.* from activos a where a.empresa_id = p_empresa_id and a.propietario_tipo = 'propio' and coalesce(a.estado,'') <> 'dado_baja'
  ),
  en_uso as (
    select a.id from propios a
    where exists (select 1 from contratos_alquiler_equipos e join contratos_alquiler c on c.id = e.contrato_alquiler_id
                  where e.equipo_id = a.id and c.estado = 'vigente' and c.empresa_id = p_empresa_id)
       or exists (select 1 from ot_all o where o.estado = 'ejecucion' and (o.equipo_id = a.id or o.direccion_ejecucion like '%Equipo '||a.codigo||'%'))
  ),
  espera as (
    select o.id, o.costo_real,
      coalesce((select sum(greatest(r.cantidad_reservada - coalesce(r.cantidad_despachada,0) - coalesce(r.cantidad_liberada,0),0) * coalesce(m.costo_promedio,0))
                from ot_segmento_repuestos_reservas r left join materiales m on m.id = r.material_id where r.ot_id = o.id),0) as reservado
    from ot_all o
    where o.estado = 'ejecucion'
      and (exists (select 1 from ot_segmento_repuestos s where s.ot_id = o.id and coalesce(s.estado,'') not in ('despachado','entregado','consumido','cancelado','anulado'))
           or exists (select 1 from ot_segmento_repuestos_reservas r where r.ot_id = o.id))
  ),
  dmr_eq as (
    select a.codigo, c.numero contrato, c.meta_dmr meta,
      round(100*(sum(p.horas_programadas) - sum(coalesce(p.horas_parada_proveedor,0))) / nullif(sum(p.horas_programadas),0), 1) dmr
    from partes p join activos a on a.id = p.activo_id join contratos_alquiler c on c.id = p.contrato_alquiler_id
    group by 1,2,3
  )
  select jsonb_build_object(
    'periodo', jsonb_build_object('desde', p_desde, 'hasta', p_hasta),
    'tipo_cambio', v_tc,
    'kpi', jsonb_build_object(
      'ot_ejecucion', (select count(*) from ot_all where estado = 'ejecucion'),
      'ot_programadas', (select count(*) from ot_all where estado = 'programada'),
      'capital_detenido', (select coalesce(sum(coalesce(costo_real,0) + reservado),0) from espera),
      'capital_ots', (select count(*) from espera),
      'equipos_propios', (select count(*) from propios),
      'equipos_en_uso', (select count(*) from en_uso),
      'equipos_mantenimiento', (select count(*) from propios where estado = 'en_mantenimiento'),
      'contratos_vigentes', (select count(*) from contratos_alquiler where empresa_id = p_empresa_id and estado = 'vigente' and (p_sociedad_id is null or sociedad_id = p_sociedad_id)),
      'dmr', (select round(100*(sum(horas_programadas) - sum(coalesce(horas_parada_proveedor,0))) / nullif(sum(horas_programadas),0), 1) from partes),
      'dmr_meta', (select round(sum(c.meta_dmr * p.horas_programadas) / nullif(sum(p.horas_programadas),0), 1) from partes p join contratos_alquiler c on c.id = p.contrato_alquiler_id),
      'equipos_bajo_meta', (select count(*) from dmr_eq where dmr < meta),
      'ingreso', (select coalesce(sum(ingreso),0) from ot_per where cargo_financiero is distinct from 'Interno_Plataforma'),
      'costo', (select coalesce(sum(costo),0) from ot_per),
      'costo_clientes', (select coalesce(sum(costo),0) from ot_per where os_cliente_id is not null),
      'estimado_cerradas', (select coalesce(sum(costo_estimado),0) from ot_per where estado = 'cerrada' and coalesce(costo_estimado,0) > 0),
      'real_cerradas', (select coalesce(sum(costo_real),0) from ot_per where estado = 'cerrada' and coalesce(costo_estimado,0) > 0),
      'ots_sobre_estimado', (select count(*) from ot_per where estado = 'cerrada' and coalesce(costo_estimado,0) > 0 and costo_real > costo_estimado * 1.05),
      'retrabajo_costo', (select coalesce(sum(costo),0) from ot_per where cargo_financiero = 'Reclamo_Rework'),
      'ots_periodo', (select count(*) from ot_per),
      'preventivas_periodo', (select count(*) from ot_per where tipo_trabajo = 'Preventivo_PM'),
      'partes_por_aprobar', (select count(*) from partes_diarios pd where pd.empresa_id = p_empresa_id and pd.estado in ('en_revision','borrador') and (p_sociedad_id is null or pd.sociedad_id = p_sociedad_id)),
      'repuestos_bajo_reorden', (select count(*) from stock s join materiales m on m.id = s.material_id where s.empresa_id = p_empresa_id and m.punto_reorden is not null and s.disponible < m.punto_reorden and (p_sociedad_id is null or s.sociedad_id = p_sociedad_id))
    ),
    'por_mes', (select coalesce(jsonb_agg(jsonb_build_object('mes', m.mes,
                   'ingreso', coalesce((select sum(ingreso) from ot_per o where to_char(o.fecha_ref,'YYYY-MM') = m.mes and o.cargo_financiero is distinct from 'Interno_Plataforma'),0),
                   'costo', coalesce((select sum(costo) from ot_per o where to_char(o.fecha_ref,'YYYY-MM') = m.mes),0),
                   'ots', (select count(*) from ot_per o where to_char(o.fecha_ref,'YYYY-MM') = m.mes)) order by m.mes),'[]'::jsonb) from meses m),
    'composicion', (select jsonb_build_object('mano_obra', coalesce(sum(mo),0), 'materiales', coalesce(sum(mat),0), 'terceros', coalesce(sum(ter),0), 'logistica', coalesce(sum(log),0), 'otros', coalesce(sum(otr),0)) from ot_per),
    'ot_estado', (select coalesce(jsonb_agg(jsonb_build_object('estado', estado, 'n', n) order by n desc),'[]'::jsonb) from (select estado, count(*) n from ot_all group by 1) x),
    'ot_tipo', (select coalesce(jsonb_agg(jsonb_build_object('tipo', tipo_trabajo, 'n', n) order by n desc),'[]'::jsonb) from (select coalesce(tipo_trabajo,'Sin tipo') tipo_trabajo, count(*) n from ot_per group by 1) x),
    'backlog', (select coalesce(jsonb_agg(jsonb_build_object('prioridad', prioridad, 'n', n, 'max_dias', max_dias) order by max_dias desc),'[]'::jsonb)
                from (select coalesce(prioridad,'sin prioridad') prioridad, count(*) n, max(current_date - created_at::date) max_dias
                      from backlog where empresa_id = p_empresa_id and coalesce(estado,'') not in ('cerrado','cerrada','resuelto','cancelado') group by 1) x),
    'menor_margen', (select coalesce(jsonb_agg(x order by x.margen),'[]'::jsonb) from (
                      select o.id, o.numero, o.servicio, cu.nombre_comercial cliente, o.ingreso, o.costo, round(100*(o.ingreso - o.costo)/nullif(o.ingreso,0),1) margen
                      from ot_per o left join cuentas cu on cu.id = o.cuenta_id
                      where o.estado = 'cerrada' and o.ingreso > 0 order by (o.ingreso - o.costo)/nullif(o.ingreso,0) asc limit 5) x),
    'dmr_mes', (select coalesce(jsonb_agg(jsonb_build_object('mes', mes, 'dmr', dmr) order by mes),'[]'::jsonb)
                from (select mes, round(100*(sum(horas_programadas) - sum(coalesce(horas_parada_proveedor,0))) / nullif(sum(horas_programadas),0), 1) dmr from partes group by mes) x),
    'dmr_equipo', (select coalesce(jsonb_agg(jsonb_build_object('equipo', codigo, 'contrato', contrato, 'dmr', dmr, 'meta', meta) order by dmr),'[]'::jsonb) from dmr_eq)
  ) into v;

  return v;
end $$;


-- Comprobación: estructura y tipo de cambio coherente (USD por 1 PEN, menor que 1)
do $$ declare r jsonb; begin
  r := public.ops_dashboard_gerencial('emp_2000000000', null, date '2026-09-01', date '2026-11-08');
  if r is null or not (r ? 'kpi' and r ? 'por_mes' and r ? 'dmr_equipo') then
    raise exception 'ops_dashboard_gerencial no devolvió la estructura esperada';
  end if;
  if (r->>'tipo_cambio') is not null and (r->>'tipo_cambio')::numeric >= 1 then
    raise exception 'tipo_cambio inesperado: %', r->>'tipo_cambio';
  end if;
end $$;
