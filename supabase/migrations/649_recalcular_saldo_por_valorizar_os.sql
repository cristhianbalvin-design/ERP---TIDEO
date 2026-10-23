-- 648: recalcula os_clientes.saldo_por_valorizar en las 12 OS que quedaron desfasadas (aplicada en remoto como 642_recalcular_saldo_por_valorizar_os).
-- Causa: la app calculaba el saldo dentro del actualizador de estado de React y nunca lo guardaba
-- (corregido en fix/os-saldos-y-estados). Saldo = monto aprobado - total de valorizaciones
-- aprobadas o facturadas, con mínimo 0. Afecta los tenants emp_2000000000 (PRUEBA) y emp_20609996464.
-- Aprobado por Cristhian el 2026-10-21 tras revisar el listado.
do $$
declare
  v_ids text[] := array[
    'osc_978726','osc_957355','osc_200377','osc_096709','osc_191746','osc_514320',
    'osc_321482','osc_745017','osc_430684','osc_418051','osc_802513','osc_165058'
  ];
  v_filas integer;
  v_pendientes integer;
begin
  with v as (
    select os_cliente_id, sum(total) as valorizado
    from public.valorizaciones
    where estado in ('aprobada', 'facturada') and os_cliente_id = any(v_ids)
    group by os_cliente_id
  )
  update public.os_clientes o
     set saldo_por_valorizar = round(greatest(0, o.monto_aprobado - v.valorizado), 2),
         updated_at = now()
    from v
   where o.id = v.os_cliente_id
     and o.id = any(v_ids);
  get diagnostics v_filas = row_count;
  if v_filas <> 12 then
    raise exception 'Se esperaban 12 OS actualizadas y fueron %', v_filas;
  end if;

  select count(*) into v_pendientes
  from public.os_clientes o
  join (
    select os_cliente_id, sum(total) as valorizado
    from public.valorizaciones
    where estado in ('aprobada', 'facturada')
    group by os_cliente_id
  ) v on v.os_cliente_id = o.id
  where o.id = any(v_ids)
    and abs(o.saldo_por_valorizar - round(greatest(0, o.monto_aprobado - v.valorizado), 2)) > 0.01;
  if v_pendientes <> 0 then
    raise exception 'Quedaron % OS sin alinear', v_pendientes;
  end if;
end $$;
