-- Demo PRUEBA · 14 Domingos sin operación en los partes de equipo y envío/aprobación de liquidaciones (2026-11-08)
-- Los partes demo no tenían domingos; la liquidación exige un parte por día. Se registran como "sin operación".
do $$
declare
  v_emp constant text := 'emp_2000000000';
  v_usr constant uuid := 'ae6bc722-85c7-4816-a830-c350d2a3d0b5';
  r record;
  n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_usr, 'role', 'authenticated')::text, true);

  insert into flota_partes_equipo (empresa_id, sociedad_id, contrato_alquiler_id, contrato_equipo_id, activo_id, fecha, turno,
    sin_operacion, horas_programadas, horas_operadas, paradas, horas_parada_proveedor, horas_parada_cliente, horas_parada_neutral,
    vb_cliente, observaciones, estado, created_at, updated_at)
  select v_emp, c.sociedad_id, c.id, e.id, e.equipo_id, d::date, 'dia', true, 0, 0, '[]'::jsonb, 0, 0, 0,
    'Supervisor del cliente', 'Domingo: equipo en standby, sin operación programada', 'registrado',
    d::date + time '20:00', d::date + time '20:00'
  from contratos_alquiler c
  join contratos_alquiler_equipos e on e.contrato_alquiler_id = c.id
  cross join generate_series(greatest(c.fecha_inicio, date '2026-08-01'), least(coalesce(c.fecha_fin, date '2026-11-07'), date '2026-11-07'), interval '1 day') d
  where c.empresa_id = v_emp
    and not exists (select 1 from flota_partes_equipo p where p.contrato_equipo_id = e.id and p.fecha = d::date and p.estado = 'registrado');
  get diagnostics n = row_count;
  raise notice 'partes agregados: %', n;

  for r in select id, periodo from flota_liquidaciones where empresa_id = v_emp and estado = 'borrador' order by periodo, numero loop
    perform public.flota_recalcular_liquidacion(r.id);
    if coalesce((select dias_faltantes from flota_liquidaciones where id = r.id), 0) = 0 then
      perform public.flota_enviar_liquidacion(r.id);
      if r.periodo = date '2026-09-01' then perform public.flota_aprobar_liquidacion(r.id); end if;
    end if;
  end loop;

  if exists (select 1 from flota_liquidaciones where empresa_id = v_emp and estado = 'borrador') then
    raise exception 'quedaron liquidaciones en borrador';
  end if;
  if (select count(*) from flota_liquidaciones where empresa_id = v_emp and estado = 'aprobada') < 4 then
    raise exception 'faltan liquidaciones aprobadas de setiembre';
  end if;
end $$;
