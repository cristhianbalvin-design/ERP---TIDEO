-- TIDEO ERP - Financiamiento: recálculo de cuotas no pagadas con la tasa efectiva mensual correcta.
-- Autorizado por Cristhian el 2026-11-12 para 5 préstamos de cuota fija (TEA) que se habían calculado
-- con TEA/12: WHYNCO FIN-001 y FIN-002, ZAHORY FIN-001 y FIN-002, INGETEC FIN-001.
-- Mismo algoritmo que recalcularTabla (src/services/financiamientosService.js): sobre el saldo pendiente,
-- cuota francesa con tasa_mensual y el número de cuotas no pagadas; la última cierra el saldo.
-- Las cuotas pagadas, las fechas y el saldo pendiente no cambian.

do $$
declare
  v_fin record;
  v_row record;
  v_r numeric;
  v_n integer;
  v_k integer;
  v_saldo numeric;
  v_cuota numeric;
  v_interes numeric;
  v_capital numeric;
  v_total numeric;
  v_actualizadas integer := 0;
  v_suma_capital numeric;
begin
  for v_fin in
    select f.* from public.financiamientos f
    where (f.empresa_id, f.codigo) in (
      ('emp_20513453711','FIN-001'), ('emp_20513453711','FIN-002'),
      ('emp_20541435833','FIN-001'), ('emp_20541435833','FIN-002'),
      ('emp_20606120487','FIN-001'))
      and f.tipo_cuota = 'frances' and f.tipo_tasa = 'TEA'
    for update
  loop
    v_r := v_fin.tasa_mensual;
    select count(*) into v_n from public.tabla_amortizacion
    where financiamiento_id = v_fin.id and estado not in ('pagada', 'cancelada');
    if v_n = 0 then continue; end if;
    v_saldo := v_fin.saldo_pendiente;
    v_cuota := v_saldo * (v_r * power(1 + v_r, v_n)) / (power(1 + v_r, v_n) - 1);
    v_k := 0;
    for v_row in
      select id, numero from public.tabla_amortizacion
      where financiamiento_id = v_fin.id and estado not in ('pagada', 'cancelada')
      order by numero
    loop
      v_k := v_k + 1;
      v_interes := v_saldo * v_r;
      if v_k = v_n then
        v_capital := v_saldo;
        v_total := v_capital + v_interes;
      else
        v_capital := least(v_saldo, greatest(0, v_cuota - v_interes));
        v_total := v_cuota;
      end if;
      v_saldo := greatest(0, v_saldo - v_capital);
      update public.tabla_amortizacion
      set capital = round(v_capital, 2), interes = round(v_interes, 2), total = round(v_total, 2),
          saldo = round(v_saldo, 2), estado = case when v_k = 1 then 'pendiente' else 'futura' end,
          updated_at = now()
      where id = v_row.id;
      v_actualizadas := v_actualizadas + 1;
    end loop;

    select sum(capital) into v_suma_capital from public.tabla_amortizacion
    where financiamiento_id = v_fin.id and estado not in ('pagada', 'cancelada');
    if abs(v_suma_capital - v_fin.saldo_pendiente) > 0.05 then
      raise exception '% %: el capital recalculado (%) no cuadra con el saldo (%)', v_fin.empresa_id, v_fin.codigo, v_suma_capital, v_fin.saldo_pendiente;
    end if;

    update public.financiamientos
    set cuota_mensual = round(v_cuota, 2), updated_at = now()
    where id = v_fin.id;
  end loop;

  if v_actualizadas <> 132 then
    raise exception 'Se esperaban 132 cuotas recalculadas y fueron %; se revierte.', v_actualizadas;
  end if;
end $$;
