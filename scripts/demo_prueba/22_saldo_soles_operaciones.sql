-- Demo PRUEBA · 22 Saldo inicial de "Soles Operaciones" para que no quede negativo (2026-11-09)
-- Decisión de Cristhian: corregir subiendo el saldo inicial. Saldo final esperado: S/ 170,711.14.
do $$ declare v numeric; begin
  update cuentas_bancarias set saldo_inicial = 690000 where id = 'cb_demo_bcp_pen' and empresa_id = 'emp_2000000000' and saldo_inicial = 385000;
  if not found then raise exception 'no se actualizó la cuenta Soles Operaciones'; end if;
  select c.saldo_inicial + coalesce(sum(case when m.tipo='ingreso' then m.monto when m.tipo='egreso' then -m.monto end),0) into v
  from cuentas_bancarias c left join movimientos_tesoreria m on m.cuenta_bancaria_id=c.id and m.estado<>'anulado'
  where c.id='cb_demo_bcp_pen' group by c.saldo_inicial;
  if v <= 0 then raise exception 'saldo sigue negativo: %', v; end if;
end $$;
