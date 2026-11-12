-- TIDEO ERP - Financiamiento: el cronograma rodante de "interés sobre saldo" siempre deja
-- un período impago por vencer (si se paga por adelantado el interés del mes, se proyecta el siguiente).

create or replace function public.fin_sincronizar_periodos(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fin public.financiamientos%rowtype;
  v_n integer;
  v_fecha date;
  v_saldo_corte numeric;
  v_hoy date := (now() at time zone 'America/Lima')::date;
  v_primera_pendiente integer;
  v_impagos integer;
begin
  select * into v_fin from public.financiamientos where id = p_id for update;
  if not found or v_fin.tipo_cuota <> 'interes_saldo' or v_fin.fecha_desembolso is null then
    return;
  end if;

  -- Generar períodos hasta que exista uno impago que vence después de hoy (mientras haya saldo).
  select coalesce(max(numero), 0) into v_n from public.tabla_amortizacion where financiamiento_id = p_id;
  loop
    exit when exists (
      select 1 from public.tabla_amortizacion
      where financiamiento_id = p_id and fecha > v_hoy and estado not in ('pagada', 'cancelada'));
    exit when v_n >= 600;
    v_n := v_n + 1;
    v_fecha := public.fin_fecha_periodo(v_fin.fecha_desembolso, v_fin.dia_pago, v_n);
    select v_fin.monto_original - coalesce(sum(p.capital), 0) into v_saldo_corte
    from public.pagos_financiamiento p where p.financiamiento_id = p_id and p.fecha_pago < v_fecha;
    exit when v_saldo_corte <= 0;
    insert into public.tabla_amortizacion (empresa_id, financiamiento_id, numero, fecha, tipo, capital, interes, total, saldo, saldo_base, estado)
    values (v_fin.empresa_id, p_id, v_n, v_fecha, 'interes', 0, 0, 0, 0, 0, 'futura')
    on conflict (financiamiento_id, numero) do nothing;
  end loop;

  -- Recalcular los períodos no pagados con el saldo de capital al corte.
  update public.tabla_amortizacion t
  set saldo_base = round(x.saldo_corte, 2),
      interes = round(x.saldo_corte * coalesce(v_fin.tasa_mensual, 0), 2),
      total = round(x.saldo_corte * coalesce(v_fin.tasa_mensual, 0), 2),
      capital = 0,
      saldo = round(x.saldo_corte, 2),
      estado = case when x.saldo_corte <= 0 then 'cancelada' else t.estado end,
      updated_at = now()
  from (
    select t2.id, v_fin.monto_original - coalesce((
      select sum(p.capital) from public.pagos_financiamiento p
      where p.financiamiento_id = p_id and p.fecha_pago < t2.fecha), 0) as saldo_corte
    from public.tabla_amortizacion t2
    where t2.financiamiento_id = p_id and t2.estado not in ('pagada', 'cancelada')
  ) x
  where t.id = x.id;

  -- La primera impaga queda 'pendiente'; las siguientes 'futura'.
  select min(numero) into v_primera_pendiente from public.tabla_amortizacion
  where financiamiento_id = p_id and estado not in ('pagada', 'cancelada');
  update public.tabla_amortizacion
  set estado = case when numero = v_primera_pendiente then 'pendiente' else 'futura' end
  where financiamiento_id = p_id and estado not in ('pagada', 'cancelada');

  select count(*) into v_impagos from public.tabla_amortizacion
  where financiamiento_id = p_id and estado not in ('pagada', 'cancelada') and fecha <= v_hoy;

  update public.financiamientos f
  set saldo_pendiente = round(f.monto_original - coalesce((select sum(capital) from public.pagos_financiamiento where financiamiento_id = p_id), 0), 2),
      cuota_mensual = coalesce((select interes from public.tabla_amortizacion where financiamiento_id = p_id and numero = v_primera_pendiente), 0),
      fecha_primer_pago = coalesce(f.fecha_primer_pago, public.fin_fecha_periodo(f.fecha_desembolso, f.dia_pago, 1)),
      fecha_ultimo_pago = null,
      plazo_meses = null,
      updated_at = now()
  where f.id = p_id;

  update public.financiamientos
  set estado = case when saldo_pendiente <= 0 and v_impagos = 0 then 'cancelado' else 'vigente' end
  where id = p_id and estado in ('vigente', 'cancelado', 'atrasado', 'en_gracia');
end;
$$;

revoke execute on function public.fin_sincronizar_periodos(text) from public, anon, authenticated;
grant execute on function public.fin_sincronizar_periodos(text) to service_role;
